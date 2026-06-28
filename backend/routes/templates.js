const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { seedTemplates } = require('../templates');

router.get('/', async (req, res) => {
  await seedTemplates(db, req.orgId);
  const { data, error } = await db.from('templates').select('*').eq('org_id', req.orgId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await db.from('templates').select('*').eq('id', req.params.id).eq('org_id', req.orgId).single();
  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, category, subject, html_body } = req.body;
  if (!name || !subject || !html_body) return res.status(400).json({ error: 'name, subject, html_body required' });
  const id = uuidv4();
  const { data, error } = await db.from('templates').insert({ id, org_id: req.orgId, name, category: category || '', subject, html_body }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/:id', async (req, res) => {
  const { name, category, subject, html_body } = req.body;
  const { error } = await db.from('templates').update({ name, category, subject, html_body }).eq('id', req.params.id).eq('org_id', req.orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  await db.from('templates').delete().eq('id', req.params.id).eq('org_id', req.orgId);
  res.json({ success: true });
});

module.exports = router;
