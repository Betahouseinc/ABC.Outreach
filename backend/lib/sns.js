// Amazon SNS HTTPS message signature verification.
// https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
const crypto = require('crypto');
const https = require('https');

const NOTIFICATION_KEYS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
const SUBSCRIPTION_KEYS = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

function stringToSign(msg) {
  const keys = msg.Type === 'Notification' ? NOTIFICATION_KEYS : SUBSCRIPTION_KEYS;
  let out = '';
  for (const k of keys) {
    if (msg[k] === undefined || msg[k] === null) continue; // Subject is optional
    out += `${k}\n${msg[k]}\n`;
  }
  return out;
}

// Only certificates served over HTTPS from an SNS endpoint are trusted.
function isValidCertUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname) && u.pathname.endsWith('.pem');
  } catch (_) {
    return false;
  }
}

const certCache = new Map();
function fetchCert(url) {
  if (certCache.has(url)) return Promise.resolve(certCache.get(url));
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Cert fetch failed: ${res.statusCode}`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => { certCache.set(url, body); resolve(body); });
    }).on('error', reject);
  });
}

async function verify(msg, { getCert = fetchCert } = {}) {
  if (!msg || !msg.Signature || !msg.SigningCertURL || !msg.Type) return false;
  if (!isValidCertUrl(msg.SigningCertURL)) return false;
  const algo = msg.SignatureVersion === '2' ? 'RSA-SHA256' : msg.SignatureVersion === '1' ? 'RSA-SHA1' : null;
  if (!algo) return false;
  const cert = await getCert(msg.SigningCertURL);
  const v = crypto.createVerify(algo);
  v.update(stringToSign(msg), 'utf8');
  return v.verify(cert, msg.Signature, 'base64');
}

function confirmSubscription(subscribeUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(subscribeUrl);
    if (u.protocol !== 'https:' || !/^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname)) return reject(new Error('Unexpected SubscribeURL'));
    https.get(subscribeUrl, res => { res.resume(); res.statusCode === 200 ? resolve() : reject(new Error(`Confirm failed: ${res.statusCode}`)); }).on('error', reject);
  });
}

module.exports = { stringToSign, isValidCertUrl, verify, confirmSubscription };
