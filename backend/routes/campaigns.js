const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  const { data, error } = await db.from('campaigns').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await db.from('campaigns').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

router.get('/:id/recipients', async (req, res) => {
  const { page = 1, limit = 50, status } = req.query;
  const from = (Number(page) - 1) * Number(limit);
  const to = from + Number(limit) - 1;

  let query = db.from('recipients').select('*', { count: 'exact' }).eq('campaign_id', req.params.id);
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
  const { data, error } = await db.from('campaigns').insert({ id, name, subject, from_name, from_email, template_id: template_id || null, html_body }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/:id', async (req, res) => {
  const { name, subject, from_name, from_email, html_body } = req.body;
  const { error } = await db.from('campaigns').update({ name, subject, from_name, from_email, html_body }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.post('/:id/upload-recipients', upload.single('file'), async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { data: campaign } = await db.from('campaigns').select('id').eq('id', campaignId).single();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const records = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
    if (!records.length) return res.status(400).json({ error: 'CSV is empty' });

    const emailColRaw = Object.keys(records[0]).find(k => ['email', 'email address', 'e-mail'].includes(k.toLowerCase()));
    const nameColRaw = Object.keys(records[0]).find(k => ['name', 'first_name', 'full_name'].includes(k.toLowerCase()));
    if (!emailColRaw) return res.status(400).json({ error: 'CSV must have an "email" column' });

    const rows = [];
    for (const row of records) {
      const email = (row[emailColRaw] || '').trim();
      const name = nameColRaw ? (row[nameColRaw] || '').trim() : '';
      if (email && email.includes('@')) rows.push({ id: uuidv4(), campaign_id: campaignId, email, name });
    }

    const { error } = await db.from('recipients').upsert(rows, { onConflict: 'id' });
    if (error) return res.status(500).json({ error: error.message });

    const { count } = await db.from('recipients').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId);
    await db.from('campaigns').update({ total_recipients: count }).eq('id', campaignId);

    res.json({ added: rows.length, total: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  await db.from('campaigns').delete().eq('id', req.params.id);
  res.json({ success: true });
});

module.exports = router;
