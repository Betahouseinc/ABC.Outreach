const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

router.get('/', (req, res) => {
  const templates = db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all();
  res.json(templates);
});

router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json(t);
});

router.post('/', (req, res) => {
  const { name, category, subject, html_body } = req.body;
  if (!name || !subject || !html_body) return res.status(400).json({ error: 'name, subject, html_body required' });
  const id = uuidv4();
  db.prepare('INSERT INTO templates (id, name, category, subject, html_body) VALUES (?, ?, ?, ?, ?)').run(id, name, category || '', subject, html_body);
  res.json({ id, name, category, subject, html_body });
});

router.put('/:id', (req, res) => {
  const { name, category, subject, html_body } = req.body;
  db.prepare('UPDATE templates SET name=?, category=?, subject=?, html_body=? WHERE id=?').run(name, category, subject, html_body, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
