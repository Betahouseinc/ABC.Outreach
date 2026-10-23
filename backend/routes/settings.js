// Organization settings: business address, sending domains, suppression list.
const express = require('express');
const router = express.Router();
const db = require('../db');
const config = require('../config');
const mailer = require('../lib/mailer');
const { requireAdmin, isAdminUser } = require('../adminMiddleware');
const { EMAIL_RE } = require('../lib/csv');
const accounts = require('../lib/awsAccounts');

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

router.get('/', async (req, res) => {
  const { data: org, error } = await db.from('organizations').select('name, business_address').eq('id', req.orgId).single();
  if (error) return res.status(500).json({ error: error.message });
  const house = accounts.isHouse(req.orgId);
  const conn = house ? null : await accounts.getConnection(req.orgId).catch(() => null);
  const connected = house || (conn && conn.status === 'connected');
  res.json({
    org_name: org.name,
    business_address: org.business_address || '',
    default_business_address: config.defaultBusinessAddress,
    is_admin: isAdminUser(req.user),
    provider: config.provider,
    dry_run: config.dryRun,
    send_rate_per_sec: connected && conn && conn.max_send_rate ? Math.min(config.sendRatePerSec, Number(conn.max_send_rate)) : config.sendRatePerSec,
    aws_house: house,
    aws_connected: !!connected,
  });
});

// ---- Customer's own Amazon SES account (house companies use ours and never see this) ----

function awsView(conn) {
  return {
    status: conn.status,
    external_id: conn.external_id,
    role_arn: conn.role_arn,
    region: conn.region,
    production_access: conn.production_access,
    max_send_rate: conn.max_send_rate == null ? null : Number(conn.max_send_rate),
    max_24h_send: conn.max_24h_send == null ? null : Number(conn.max_24h_send),
    last_error: conn.last_error,
    checked_at: conn.checked_at,
    template_url: config.cfnTemplateUrl || null,
    stack_name: 'eXomail-SES',
  };
}

router.get('/aws', async (req, res) => {
  if (accounts.isHouse(req.orgId)) return res.json({ house: true });
  try {
    res.json(awsView(await accounts.ensureConnection(req.orgId)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connect, or re-check after changes (e.g. after SES production access is granted).
router.post('/aws', requireAdmin, async (req, res) => {
  if (accounts.isHouse(req.orgId)) return res.status(400).json({ error: 'This company sends through eXommerce\'s own SES account.' });
  try {
    res.json(awsView(await accounts.connect(req.orgId, { roleArn: req.body.role_arn, region: req.body.region })));
  } catch (err) {
    if (err.userFacing) return res.status(400).json({ error: err.message });
    console.error('[exo-mail] AWS connect failed:', err.message);
    res.status(500).json({ error: 'Could not connect. Try again shortly.' });
  }
});

router.delete('/aws', requireAdmin, async (req, res) => {
  if (accounts.isHouse(req.orgId)) return res.status(400).json({ error: 'Nothing to disconnect' });
  try {
    await accounts.disconnect(req.orgId);
    res.json(awsView(await accounts.ensureConnection(req.orgId)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Company name (fills {{company_name}}) and business address (email footer).
router.put('/', requireAdmin, async (req, res) => {
  const patch = {};
  if (req.body.business_address !== undefined) patch.business_address = String(req.body.business_address).trim().slice(0, 500);
  if (req.body.org_name !== undefined) {
    const name = String(req.body.org_name).trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "Company name can't be empty" });
    patch.name = name;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  const { data, error } = await db.from('organizations').update(patch).eq('id', req.orgId).select('name, business_address').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ org_name: data.name, business_address: data.business_address || '' });
});

// ---- Sending domains ----

router.get('/domains', async (req, res) => {
  const { data, error } = await db.from('sender_domains').select('*').eq('org_id', req.orgId).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/domains', requireAdmin, async (req, res) => {
  const domain = String(req.body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!DOMAIN_RE.test(domain)) return res.status(400).json({ error: 'Enter a domain like example.com' });
  const { data, error } = await db.from('sender_domains').insert({ org_id: req.orgId, domain, status: 'pending' }).select().single();
  if (error) return res.status(400).json({ error: /duplicate|unique/i.test(error.message) ? 'That domain has already been added' : error.message });
  res.json(data);
});

// Asks SES whether the domain is verified for sending (DKIM + MAIL FROM status too).
router.post('/domains/:id/verify', async (req, res) => {
  const { data: row } = await db.from('sender_domains').select('*').eq('id', req.params.id).eq('org_id', req.orgId).maybeSingle();
  if (!row) return res.status(404).json({ error: 'Not found' });
  let s;
  try {
    s = await mailer.getDomainStatus(row.domain, req.orgId);
  } catch (err) {
    return res.status(502).json({ error: err.name === 'NotConnectedException' ? err.message : `Could not reach SES: ${err.message}` });
  }
  const patch = {
    status: s.verified ? 'verified' : s.exists ? 'pending' : 'not_found',
    dkim_status: s.dkim,
    mail_from_status: s.mailFrom,
    last_checked_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('sender_domains').update(patch).eq('id', row.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ...data, note: s.note || (s.exists ? null : 'This domain is not set up in your Amazon SES account yet. Create it under SES → Identities, add the DNS records, then Verify again.') });
});

router.delete('/domains/:id', requireAdmin, async (req, res) => {
  const { error } = await db.from('sender_domains').delete().eq('id', req.params.id).eq('org_id', req.orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ---- Suppression list ----

router.get('/suppressions', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 50;
  let q = db.from('suppressions').select('*', { count: 'exact' }).eq('org_id', req.orgId)
    .order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
  const search = String(req.query.search || '').trim().toLowerCase();
  if (search) q = q.ilike('email', `%${search.replace(/[%_]/g, '')}%`);
  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ suppressions: data, total: count || 0, page, limit });
});

router.post('/suppressions', requireAdmin, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  const { error } = await db.from('suppressions').upsert({ org_id: req.orgId, email, reason: 'manual' }, { onConflict: 'org_id,email', ignoreDuplicates: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete('/suppressions/:id', requireAdmin, async (req, res) => {
  const { error } = await db.from('suppressions').delete().eq('id', req.params.id).eq('org_id', req.orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
