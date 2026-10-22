// Email provider wrapper: Amazon SES (default) or Resend (fallback), plus a dry-run mode.
const config = require('../config');

// Errors that mean "stop the whole campaign" rather than "this one address failed".
const FATAL_ERRORS = new Set([
  'LimitExceededException', 'SendingPausedException', 'AccountSuspendedException',
  'MailFromDomainNotVerifiedException', 'AccessDeniedException', 'UnrecognizedClientException',
  'InvalidClientTokenId', 'SignatureDoesNotMatch', 'ExpiredTokenException',
]);
const RETRYABLE_ERRORS = new Set(['TooManyRequestsException', 'ThrottlingException', 'Throttling', 'ServiceUnavailable', 'InternalFailure']);

function classifyError(err) {
  const name = err && (err.name || err.code);
  if (RETRYABLE_ERRORS.has(name) || /rate exceeded/i.test(err && err.message)) return 'retry';
  if (FATAL_ERRORS.has(name) || /quota exceeded/i.test(err && err.message)) return 'fatal';
  return 'recipient';
}

// Display names may contain quotes or non-ASCII characters; encode them safely (RFC 5322 / RFC 2047).
function formatFrom(name, email) {
  const clean = String(name || '').replace(/[\r\n"]/g, '').trim();
  if (!clean) return email;
  const display = /^[\x20-\x7e]*$/.test(clean) ? `"${clean}"` : `=?UTF-8?B?${Buffer.from(clean).toString('base64')}?=`;
  return `${display} <${email}>`;
}

let sesClient = null;
function ses() {
  if (!sesClient) {
    const { SESv2Client } = require('@aws-sdk/client-sesv2');
    sesClient = new SESv2Client({ region: config.awsRegion });
  }
  return sesClient;
}

async function sendViaSes({ from, to, subject, html, text, headers }) {
  const { SendEmailCommand } = require('@aws-sdk/client-sesv2');
  const out = await ses().send(new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    ConfigurationSetName: config.sesConfigurationSet || undefined,
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } },
        Headers: Object.entries(headers || {}).map(([Name, Value]) => ({ Name, Value })),
      },
    },
  }));
  return { messageId: out.MessageId };
}

async function sendViaResend({ from, to, subject, html, text, headers }) {
  const { Resend } = require('resend');
  const { data, error } = await new Resend(config.resendApiKey).emails.send({ from, to, subject, html, text, headers });
  if (error) throw Object.assign(new Error(error.message), { name: error.name });
  return { messageId: data && data.id };
}

// msg: { fromName, fromEmail, to, subject, html, text, unsubscribeUrl }
async function send(msg) {
  const payload = {
    from: formatFrom(msg.fromName, msg.fromEmail),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    headers: msg.unsubscribeUrl ? {
      'List-Unsubscribe': `<${msg.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    } : {},
  };
  if (config.dryRun) {
    console.log(`[exo-mail][dry-run] would send -> ${msg.to} | ${msg.subject}`);
    return { messageId: null, dryRun: true };
  }
  if (!config.appSecretIsSet) throw Object.assign(new Error('APP_SECRET is not set'), { name: 'AccessDeniedException' });
  if (config.provider === 'resend') return sendViaResend(payload);
  return sendViaSes(payload);
}

// SES verification state for a sending domain. Needs ses:GetEmailIdentity.
async function getDomainStatus(domain) {
  if (config.provider !== 'ses') return { exists: true, verified: true, dkim: 'N/A', mailFrom: 'N/A', note: `Provider is ${config.provider}; SES check skipped` };
  const { GetEmailIdentityCommand } = require('@aws-sdk/client-sesv2');
  try {
    const out = await ses().send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
    return {
      exists: true,
      verified: !!out.VerifiedForSendingStatus,
      dkim: (out.DkimAttributes && out.DkimAttributes.Status) || 'NOT_STARTED',
      mailFrom: (out.MailFromAttributes && out.MailFromAttributes.MailFromDomainStatus) || 'NONE',
    };
  } catch (err) {
    if (err.name === 'NotFoundException') return { exists: false, verified: false, dkim: 'NOT_FOUND', mailFrom: 'NOT_FOUND' };
    throw err;
  }
}

module.exports = { send, getDomainStatus, classifyError, formatFrom };
