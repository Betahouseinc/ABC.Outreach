// "Bring your own SES": each customer company sends through its own AWS account.
// eXomail assumes eXomailSendingRole in their account, which trusts only our sending identity and only
// with that company's external ID. Our own (house) companies keep using this server's SES credentials.
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');

// Names created by deploy/exomail-ses-setup.yaml in the customer's account.
const CONFIG_SET_NAME = 'exomail';
const TOPIC_NAME = 'exomail-ses-events';

const ROLE_ARN_RE = /^arn:aws:iam::(\d{12}):role\/[\w+=,.@/-]{1,512}$/;
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
const NOT_CONNECTED = 'Connect your own Amazon SES account in Settings before sending.';

const userError = message => Object.assign(new Error(message), { userFacing: true });

function isHouse(orgId) {
  return !config.houseOrgIds.length || config.houseOrgIds.includes(orgId);
}

async function getConnection(orgId) {
  const { data, error } = await db.from('org_aws_connections').select('*').eq('org_id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Creates the row (and its external ID) the first time a company opens the AWS settings.
async function ensureConnection(orgId) {
  const existing = await getConnection(orgId);
  if (existing) return existing;
  const { data, error } = await db.from('org_aws_connections')
    .upsert({ org_id: orgId, external_id: crypto.randomBytes(16).toString('hex') }, { onConflict: 'org_id', ignoreDuplicates: true })
    .select().maybeSingle();
  if (error) throw new Error(error.message);
  return data || getConnection(orgId);
}

// Assumed-role clients, cached per company; the credentials refresh themselves before they expire.
const clients = new Map();
function clientsFor(conn) {
  const key = `${conn.role_arn}|${conn.external_id}|${conn.region}`;
  let c = clients.get(conn.org_id);
  if (!c || c.key !== key) {
    const { fromTemporaryCredentials } = require('@aws-sdk/credential-providers');
    const { SESv2Client } = require('@aws-sdk/client-sesv2');
    const { SNSClient } = require('@aws-sdk/client-sns');
    const credentials = fromTemporaryCredentials({
      params: { RoleArn: conn.role_arn, ExternalId: conn.external_id, RoleSessionName: `exomail-${String(conn.org_id).slice(0, 8)}`, DurationSeconds: 3600 },
      clientConfig: { region: config.awsRegion },
    });
    c = { key, ses: new SESv2Client({ region: conn.region, credentials }), sns: new SNSClient({ region: conn.region, credentials }) };
    clients.set(conn.org_id, c);
  }
  return c;
}

// SES client + configuration set for sending. null = this server's own SES account (house companies).
async function sesFor(orgId) {
  if (!orgId || isHouse(orgId)) return null;
  const conn = await getConnection(orgId);
  if (!conn || conn.status !== 'connected') throw Object.assign(new Error(NOT_CONNECTED), { name: 'NotConnectedException' });
  return { client: clientsFor(conn).ses, configSet: conn.config_set };
}

// For the send pre-flight: blocks unconnected companies, warns about the SES sandbox, caps the send rate.
async function sendingStatus(orgId) {
  if (config.provider !== 'ses' || isHouse(orgId)) return { house: true };
  const conn = await getConnection(orgId);
  if (!conn || conn.status !== 'connected') return { error: NOT_CONNECTED };
  return { maxSendRate: Number(conn.max_send_rate) || null, sandbox: conn.production_access === false };
}

function explainAwsError(err) {
  const name = err && (err.name || err.Code);
  if (name === 'AccessDenied' || name === 'AccessDeniedException' || /not authorized to perform: sts:AssumeRole/i.test(err.message)) {
    return "eXomail couldn't use that role. Make sure the stack finished creating, that you launched it from this page (the external ID must match), and that the region is right.";
  }
  if (name === 'NotFoundException' || name === 'NotFound') return `No ${TOPIC_NAME} topic found in that region. Choose the region you created the stack in.`;
  return `AWS said: ${err.message}`;
}

// Checks the role works, records the SES account's limits, and subscribes our webhook to its event topic.
async function connect(orgId, { roleArn, region }) {
  const m = ROLE_ARN_RE.exec(String(roleArn || '').trim());
  if (!m) throw userError("Paste the RoleArn from the stack's Outputs tab. It starts with arn:aws:iam::");
  if (!REGION_RE.test(String(region || ''))) throw userError('Choose the region your SES account sends from.');

  const conn = await ensureConnection(orgId);
  const draft = { ...conn, role_arn: m[0], region, config_set: CONFIG_SET_NAME };
  const topicArn = `arn:aws:sns:${region}:${m[1]}:${TOPIC_NAME}`;
  const c = clientsFor(draft);

  let account;
  try {
    const { GetAccountCommand } = require('@aws-sdk/client-sesv2');
    account = await c.ses.send(new GetAccountCommand({}));
  } catch (err) {
    await save(orgId, { status: 'error', last_error: explainAwsError(err), checked_at: new Date().toISOString() });
    throw userError(explainAwsError(err));
  }

  // Register the topic before subscribing: the confirmation request arrives at our webhook straight away.
  const saved = await db.from('org_aws_connections').update({
    role_arn: draft.role_arn, region, config_set: CONFIG_SET_NAME, sns_topic_arn: topicArn, status: 'connected',
    production_access: !!account.ProductionAccessEnabled,
    max_send_rate: account.SendQuota ? account.SendQuota.MaxSendRate : null,
    max_24h_send: account.SendQuota ? account.SendQuota.Max24HourSend : null,
    last_error: null, checked_at: new Date().toISOString(),
  }).eq('org_id', orgId);
  if (saved.error) {
    if (/duplicate|unique/i.test(saved.error.message)) throw userError('This AWS account is already connected to another eXomail company.');
    throw new Error(saved.error.message);
  }

  try {
    const { SubscribeCommand } = require('@aws-sdk/client-sns');
    await c.sns.send(new SubscribeCommand({ TopicArn: topicArn, Protocol: 'https', Endpoint: `${config.baseUrl}/webhooks/ses` }));
  } catch (err) {
    await save(orgId, { status: 'error', last_error: explainAwsError(err) });
    throw userError(explainAwsError(err));
  }
  return getConnection(orgId);
}

async function disconnect(orgId) {
  clients.delete(orgId);
  await save(orgId, { status: 'not_connected', role_arn: null, region: null, config_set: null, sns_topic_arn: null, production_access: null, max_send_rate: null, max_24h_send: null, last_error: null });
}

async function save(orgId, patch) {
  const { error } = await db.from('org_aws_connections').update(patch).eq('org_id', orgId);
  if (error) throw new Error(error.message);
}

// Which companies an SNS topic may affect: [orgId] for a customer topic, house companies for ours, null if unknown.
async function orgsForTopic(topicArn) {
  if (config.snsTopicArn && topicArn === config.snsTopicArn) return config.houseOrgIds.length ? config.houseOrgIds : ['*'];
  const { data } = await db.from('org_aws_connections').select('org_id').eq('sns_topic_arn', topicArn).eq('status', 'connected').maybeSingle();
  return data ? [data.org_id] : null;
}

module.exports = {
  CONFIG_SET_NAME, TOPIC_NAME, ROLE_ARN_RE, REGION_RE,
  isHouse, getConnection, ensureConnection, sesFor, sendingStatus, connect, disconnect, orgsForTopic, explainAwsError,
};
