const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin, isAdminUser, requireOwner, isOwnerUser } = require('../adminMiddleware');

// Any authenticated user: lets the frontend know whether to show the Team page.
router.get('/check', (req, res) => {
  res.json({ is_admin: isAdminUser(req.user), is_owner: isOwnerUser(req.user) });
});

// "2026-10" → UTC start/end of that month; null if malformed.
function monthRange(month) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month || '');
  if (!m) return null;
  const start = new Date(Date.UTC(+m[1], +m[2] - 1, 1));
  const end = new Date(Date.UTC(+m[1], +m[2], 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

// Owner only: emails sent per company in a month (for invoicing). ?month=YYYY-MM, default this month (UTC).
router.get('/usage', requireOwner, async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const range = monthRange(month);
  if (!range) return res.status(400).json({ error: 'month must look like 2026-10' });
  try {
    const { data: orgs, error } = await db.from('organizations').select('id, name, created_at').order('name');
    if (error) return res.status(500).json({ error: error.message });

    const rows = await Promise.all(orgs.map(async o => {
      const sent = db.from('recipients').select('id', { count: 'exact', head: true })
        .eq('org_id', o.id).eq('status', 'sent').gte('sent_at', range.start).lt('sent_at', range.end);
      const campaigns = db.from('campaigns').select('id', { count: 'exact', head: true })
        .eq('org_id', o.id).gte('sent_at', range.start).lt('sent_at', range.end);
      const [s, c] = await Promise.all([sent, campaigns]);
      if (s.error || c.error) throw s.error || c.error;
      return { id: o.id, name: o.name, created_at: o.created_at, emails_sent: s.count || 0, campaigns_sent: c.count || 0 };
    }));

    res.json({ month, orgs: rows, total_emails_sent: rows.reduce((n, r) => n + r.emails_sent, 0) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin only: list internal users in the same organization.
router.get('/users', requireAdmin, async (req, res) => {
  try {
    // Get all profiles in this organization (id IS the auth user id)
    const { data: profiles, error: profileError } = await db
      .from('profiles')
      .select('id, role')
      .eq('org_id', req.orgId);
    
    if (profileError) return res.status(500).json({ error: profileError.message });
    
    if (!profiles?.length) {
      return res.json([]);
    }
    
    const profileIds = profiles.map(p => p.id);
    
    // Fetch user details from Supabase Auth
    const { data, error } = await db.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
    
    // Filter to only users in this org and join with profile data
    const orgUsers = (data.users || [])
      .filter(u => profileIds.includes(u.id))
      .map(u => {
        const profile = profiles.find(p => p.id === u.id);
        return {
          id: u.id,
          email: u.email,
          is_admin: profile?.role === 'admin',
          last_sign_in_at: u.last_sign_in_at,
          created_at: u.created_at
        };
      });
    
    res.json(orgUsers);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin only: create an internal user in the same organization.
router.post('/users', requireAdmin, async (req, res) => {
  const { email, password, is_admin } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  
  try {
    // Create user in Supabase Auth
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { is_admin: !!is_admin }
    });
    
    if (error) return res.status(400).json({ error: error.message });
    
    // Create profile linking user to this organization
    // Note: profiles.id IS the auth user id (not a separate user_id column)
    const { error: profileError } = await db
      .from('profiles')
      .insert({
        id: data.user.id,
        org_id: req.orgId,
        role: is_admin ? 'admin' : 'member'
      });
    
    if (profileError) {
      // If profile creation fails, clean up the auth user
      await db.auth.admin.deleteUser(data.user.id);
      return res.status(500).json({ error: profileError.message });
    }
    
    res.json({ id: data.user.id, email: data.user.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin only: remove a user from the organization.
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Verify user is in the same organization
    // Note: profiles.id IS the auth user id
    const { error: profileError } = await db
      .from('profiles')
      .delete()
      .eq('id', userId)
      .eq('org_id', req.orgId);
    
    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }
    
    // Note: We don't delete the auth user, just remove them from the org
    // This preserves email history and allows re-invitation
    
    res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
