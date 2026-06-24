const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin, isAdminUser } = require('../adminMiddleware');

// Any authenticated user: lets the frontend know whether to show the Team page.
router.get('/check', (req, res) => {
  res.json({ is_admin: isAdminUser(req.user) });
});

// Admin only: list internal users.
router.get('/users', requireAdmin, async (req, res) => {
  const { data, error } = await db.auth.admin.listUsers();
  if (error) return res.status(500).json({ error: error.message });
  const users = (data.users || []).map(u => ({
    id: u.id,
    email: u.email,
    is_admin: isAdminUser(u),
    last_sign_in_at: u.last_sign_in_at,
    created_at: u.created_at
  }));
  res.json(users);
});

// Admin only: create an internal user.
router.post('/users', requireAdmin, async (req, res) => {
  const { email, password, is_admin } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { is_admin: !!is_admin }
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ id: data.user.id, email: data.user.email });
});

// Admin only: remove a user.
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const { error } = await db.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
