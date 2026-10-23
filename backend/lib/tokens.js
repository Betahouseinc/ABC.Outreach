// HMAC-signed tokens for unsubscribe links and click-tracking redirects.
const crypto = require('crypto');

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Unsubscribe token: base64url(JSON payload) + "." + signature.
function signUnsubscribe(secret, { orgId, email, campaignId = null, recipientId = null }) {
  const body = Buffer.from(JSON.stringify({ o: orgId, e: email.toLowerCase(), c: campaignId, r: recipientId })).toString('base64url');
  return `${body}.${hmac(secret, `u.${body}`)}`;
}

function verifyUnsubscribe(secret, token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, hmac(secret, `u.${body}`))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.o || !p.e) return null;
    return { orgId: p.o, email: p.e, campaignId: p.c || null, recipientId: p.r || null };
  } catch (_) {
    return null;
  }
}

// Click links are signed so /track/click can't be used as an open redirect.
function signClick(secret, campaignId, recipientId, url) {
  return hmac(secret, `c.${campaignId}.${recipientId}.${url}`);
}

function verifyClick(secret, campaignId, recipientId, url, sig) {
  if (!url || !sig) return false;
  return safeEqual(sig, signClick(secret, campaignId, recipientId, url));
}

// Sign-up confirmation token: proves the person controls the email address. Expires (exp, ms epoch).
function signSignup(secret, { email, company, exp }) {
  const body = Buffer.from(JSON.stringify({ e: email.toLowerCase(), n: company, x: exp })).toString('base64url');
  return `${body}.${hmac(secret, `s.${body}`)}`;
}

function verifySignup(secret, token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, hmac(secret, `s.${body}`))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.e || !p.n || !(p.x > now)) return null;
    return { email: p.e, company: p.n };
  } catch (_) {
    return null;
  }
}

module.exports = { signUnsubscribe, verifyUnsubscribe, signClick, verifyClick, signSignup, verifySignup };
