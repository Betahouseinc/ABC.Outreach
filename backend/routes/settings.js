// Organization settings: business address, sending domains, suppression list.
const express = require('express');
const router = express.Router();
const db = require('../db');
const config = require('../config');
const mailer = require('../lib/mailer');
const { requireAdmin, isAdminUser } = require('../adminMiddleware');
const { EMAIL_RE } = require('../lib/csv');

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

router.get('/', async (req, res) => {
  const { data: org, error } = await db.from('organizations').select('name, business_address').eq('id', req.orgId).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    org_name: org.name,
    business_address: org.business_address || '',
    default_business_address: config.defaultBusinessAddress,
    is_admin: isAdminUser(req.user),
    provider: config.provider,
    dry_run: config.dryRun,
    send_rate_per_sec: config.sendRatePerSec,
  });
});

router.put('/', requireAdmin, async (req, res) => {
  const business_address = String(req.body.business_address || '').trim().slice(0, 500);
  const { error } = await db.from('organizations').update({ business_address }).eq('id', req.orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ business_address });
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
    s = await mailer.getDomainStatus(row.domain);
  } catch (err) {
    return res.status(502).json({ error: `Could not reach SES: ${err.message}` });
  }
  const patch = {
    status: s.verified ? 'verified' : s.exists ? 'pending' : 'not_found',
    dkim_status: s.dkim,
    mail_from_status: s.mailFrom,
    last_checked_at: new Date().toISOString(),
  };
  const { data, error } = await db.from('sender_domains').update(patch).eq('id', row.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ...data, note: s.note || (s.exists ? null : 'This domain has not been set up in Amazon SES yet. Ask your admin to add it.') });
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
