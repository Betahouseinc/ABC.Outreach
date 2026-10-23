// PUBLIC self-service sign-up: email → confirmation link → choose a password → a new company with this person as its admin.
// No account exists until the link is used, so nobody can sign up with an address they don't control.
const express = require('express');
const router = express.Router();
const db = require('../db');
const config = require('../config');
const mailer = require('../lib/mailer');
const { EMAIL_RE } = require('../lib/csv');
const { escapeHtml } = require('../lib/render');
const { signSignup, verifySignup } = require('../lib/tokens');

const LINK_TTL_MS = 24 * 60 * 60 * 1000;

async function findAuthUser(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find(u => (u.email || '').toLowerCase() === email);
    if (hit || data.users.length < 1000) return hit || null;
  }
}

router.post('/start', async (req, res) => {
  if (!config.signupFromEmail) return res.status(503).json({ error: 'Sign-up is not open yet.' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const company = String(req.body.company || '').trim().slice(0, 120);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!company) return res.status(400).json({ error: 'Enter your company name' });

  const token = signSignup(config.appSecret, { email, company, exp: Date.now() + LINK_TTL_MS });
  const link = `${config.frontendUrls[0]}/signup?token=${encodeURIComponent(token)}`;
  try {
    await mailer.send({
      fromName: 'eXomail', fromEmail: config.signupFromEmail, to: email,
      subject: 'Confirm your email to finish signing up to eXomail',
      html: `<p>Hi,</p><p>Confirm your email to finish creating the eXomail account for <strong>${escapeHtml(company)}</strong>:</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#109840;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Confirm and choose a password</a></p>
<p style="color:#666;font-size:13px">The link works for 24 hours. If you didn't ask for this, you can ignore this email.</p>`,
      text: `Confirm your email to finish creating the eXomail account for ${company}:\n\n${link}\n\nThe link works for 24 hours. If you didn't ask for this, you can ignore this email.`,
    });
  } catch (err) {
    console.error('[exo-mail] sign-up email failed:', err.message);
    return res.status(502).json({ error: 'Could not send the confirmation email. Try again shortly.' });
  }
  res.json({ ok: true });
});

router.post('/complete', async (req, res) => {
  const t = verifySignup(config.appSecret, req.body.token);
  if (!t) return res.status(400).json({ error: 'This link is invalid or has expired. Please sign up again.' });
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Use at least 8 characters.' });

  let org = null, createdUserId = null;
  try {
    const existing = await findAuthUser(t.email);
    if (existing) {
      const { data: profile } = await db.from('profiles').select('id').eq('id', existing.id).maybeSingle();
      if (profile) return res.status(409).json({ error: 'This email already has an account. Sign in instead.' });
    }

    const o = await db.from('organizations').insert({ name: t.company }).select('id').single();
    if (o.error) throw o.error;
    org = o.data;

    let userId;
    if (existing) {
      // A login with no company (e.g. removed from another team): the link proves they own the address.
      const u = await db.auth.admin.updateUserById(existing.id, { password, email_confirm: true, app_metadata: { ...existing.app_metadata, is_admin: true } });
      if (u.error) throw u.error;
      userId = existing.id;
    } else {
      const u = await db.auth.admin.createUser({ email: t.email, password, email_confirm: true, app_metadata: { is_admin: true } });
      if (u.error) throw u.error;
      userId = createdUserId = u.data.user.id;
    }

    const p = await db.from('profiles').insert({ id: userId, org_id: org.id, role: 'admin' });
    if (p.error) throw p.error;
    res.json({ ok: true, email: t.email });
  } catch (err) {
    console.error('[exo-mail] sign-up failed:', err.message);
    if (createdUserId) await db.auth.admin.deleteUser(createdUserId).catch(() => {});
    if (org) await db.from('organizations').delete().eq('id', org.id).then(() => {}, () => {});
    res.status(500).json({ error: 'Could not create the account. Try again shortly.' });
  }
});

module.exports = router;
