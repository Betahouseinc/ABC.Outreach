const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const db = require('../db');
const { parseRecipients } = require('../lib/csv');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  const { data, error } = await db.from('campaigns').select('*').eq('org_id', req.orgId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await db.from('campaigns').select('*').eq('id', req.params.id).eq('org_id', req.orgId).single();
  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

router.get('/:id/recipients', async (req, res) => {
  const { page = 1, limit = 50, status } = req.query;
  const from = (Number(page) - 1) * Number(limit);
  const to = from + Number(limit) - 1;

  let query = db.from('recipients').select('*', { count: 'exact' }).eq('campaign_id', req.params.id).eq('org_id', req.orgId);
  if (status) query = query.eq('status', status);
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ recipients: data, total: count, page: Number(page), limit: Number(limit) });
});

router.post('/', async (req, res) => {
  const { name, subject, from_name, from_email, template_id, html_body } = req.body;
  if (!name || !subject || !from_name || !from_email || !html_body)
    return res.status(400).json({ error: 'name, subject, from_name, from_email, html_body required' });

  const id = uuidv4();
  const { data, error } = await db.from('campaigns').insert({ id, org_id: req.orgId, name, subject, from_name, from_email, template_id: template_id || null, status: 'draft', html_body }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/:id', async (req, res) => {
  const { name, subject, from_name, from_email, html_body } = req.body;
  const { error } = await db.from('campaigns').update({ name, subject, from_name, from_email, html_body }).eq('id', req.params.id).eq('org_id', req.orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.post('/:id/upload-recipients', upload.single('file'), async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { data: campaign } = await db.from('campaigns').select('id, status').eq('id', campaignId).eq('org_id', req.orgId).single();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!['draft', 'paused'].includes(campaign.status)) return res.status(400).json({ error: `Campaign is ${campaign.status}` });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const parsed = parseRecipients(req.file.buffer.toString('utf-8'));
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // Skip addresses already in this campaign (paged: Supabase caps a select at 1000 rows).
    const existing = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('recipients').select('email').eq('campaign_id', campaignId).eq('org_id', req.orgId).range(from, from + 999);
      if (error) return res.status(500).json({ error: error.message });
      data.forEach(r => existing.add(r.email.toLowerCase()));
      if (data.length < 1000) break;
    }
    const rows = parsed.rows.filter(r => !existing.has(r.email))
      .map(r => ({ id: uuidv4(), campaign_id: campaignId, org_id: req.orgId, email: r.email, name: r.name, fields: r.fields }));

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('recipients').insert(rows.slice(i, i + 500));
      if (error) return res.status(500).json({ error: error.message });
    }

    const { count } = await db.from('recipients').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('org_id', req.orgId);
    await db.from('campaigns').update({ total_recipients: count }).eq('id', campaignId).eq('org_id', req.orgId);

    res.json({
      added: rows.length,
      total: count,
      skipped: { invalid: parsed.invalid, duplicates: parsed.duplicates + (parsed.rows.length - rows.length) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const { data: campaign } = await db.from('campaigns').select('status').eq('id', req.params.id).eq('org_id', req.orgId).maybeSingle();
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'sending') return res.status(409).json({ error: 'This campaign is sending. Wait until it finishes or pauses.' });
  const { error } = await db.from('campaigns').delete().eq('id', req.params.id).eq('org_id', req.orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
