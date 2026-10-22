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

module.exports = { signUnsubscribe, verifyUnsubscribe, signClick, verifyClick };
