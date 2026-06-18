const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  res.json(campaigns);
});

router.get('/:id', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  res.json(campaign);
});

router.get('/:id/recipients', (req, res) => {
  const { page = 1, limit = 50, status } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  let rows, total;
  if (status) {
    rows = db.prepare('SELECT * FROM recipients WHERE campaign_id = ? AND status = ? ORDER BY rowid LIMIT ? OFFSET ?').all(req.params.id, status, Number(limit), offset);
    total = db.prepare('SELECT COUNT(*) as c FROM recipients WHERE campaign_id = ? AND status = ?').get(req.params.id, status).c;
  } else {
    rows = db.prepare('SELECT * FROM recipients WHERE campaign_id = ? ORDER BY rowid LIMIT ? OFFSET ?').all(req.params.id, Number(limit), offset);
    total = db.prepare('SELECT COUNT(*) as c FROM recipients WHERE campaign_id = ?').get(req.params.id).c;
  }
  res.json({ recipients: rows, total, page: Number(page), limit: Number(limit) });
});

router.post('/', (req, res) => {
  const { name, subject, from_name, from_email, template_id, html_body } = req.body;
  if (!name || !subject || !from_name || !from_email || !html_body) {
    return res.status(400).json({ error: 'name, subject, from_name, from_email, html_body required' });
  }
  const id = uuidv4();
  db.prepare('INSERT INTO campaigns (id, name, subject, from_name, from_email, template_id, html_body) VALUES (?,?,?,?,?,?,?)')
    .run(id, name, subject, from_name, from_email, template_id || null, html_body);
  res.json({ id, name, subject, from_name, from_email, status: 'draft' });
});

router.put('/:id', (req, res) => {
  const { name, subject, from_name, from_email, html_body } = req.body;
  db.prepare('UPDATE campaigns SET name=?, subject=?, from_name=?, from_email=?, html_body=? WHERE id=?')
    .run(name, subject, from_name, from_email, html_body, req.params.id);
  res.json({ success: true });
});

router.post('/:id/upload-recipients', upload.single('file'), (req, res) => {
  try {
    const campaignId = req.params.id;
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const fileContent = req.file.buffer.toString('utf-8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
    if (!records.length) return res.status(400).json({ error: 'CSV is empty' });

    const cols = Object.keys(records[0]).map(k => k.toLowerCase());
    const emailColRaw = Object.keys(records[0]).find(k => ['email','email address','e-mail'].includes(k.toLowerCase()));
    const nameColRaw = Object.keys(records[0]).find(k => ['name','first_name','full_name'].includes(k.toLowerCase()));

    if (!emailColRaw) return res.status(400).json({ error: 'CSV must have an "email" column' });

    const insert = db.prepare('INSERT OR IGNORE INTO recipients (id, campaign_id, email, name) VALUES (?,?,?,?)');
    let added = 0;
    for (const row of records) {
      const email = (row[emailColRaw] || '').trim();
      const name = nameColRaw ? (row[nameColRaw] || '').trim() : '';
      if (email && email.includes('@')) {
        insert.run(uuidv4(), campaignId, email, name);
        added++;
      }
    }

    const total = db.prepare('SELECT COUNT(*) as c FROM recipients WHERE campaign_id = ?').get(campaignId).c;
    db.prepare('UPDATE campaigns SET total_recipients = ? WHERE id = ?').run(total, campaignId);
    res.json({ added, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM recipients WHERE campaign_id = ?').run(req.params.id);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
