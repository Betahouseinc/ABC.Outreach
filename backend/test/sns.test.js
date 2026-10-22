const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { stringToSign, isValidCertUrl, verify } = require('../lib/sns');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const CERT_URL = 'https://sns.ap-southeast-2.amazonaws.com/SimpleNotificationService-abc.pem';

function signed(msg, version = '2') {
  const m = { ...msg, SignatureVersion: version, SigningCertURL: CERT_URL };
  m.Signature = crypto.sign(version === '2' ? 'sha256' : 'sha1', Buffer.from(stringToSign(m)), privateKey).toString('base64');
  return m;
}

const notification = { Type: 'Notification', MessageId: 'm1', TopicArn: 'arn:aws:sns:ap-southeast-2:1:t', Message: '{"a":1}', Timestamp: '2026-10-22T00:00:00.000Z' };

test('string-to-sign follows the documented key order and skips a missing Subject', () => {
  assert.equal(stringToSign(notification),
    'Message\n{"a":1}\nMessageId\nm1\nTimestamp\n2026-10-22T00:00:00.000Z\nTopicArn\narn:aws:sns:ap-southeast-2:1:t\nType\nNotification\n');
  const sub = { Type: 'SubscriptionConfirmation', MessageId: 'm', Token: 't', TopicArn: 'a', Message: 'x', SubscribeURL: 'u', Timestamp: 'ts' };
  assert.equal(stringToSign(sub), 'Message\nx\nMessageId\nm\nSubscribeURL\nu\nTimestamp\nts\nToken\nt\nTopicArn\na\nType\nSubscriptionConfirmation\n');
});

test('valid SignatureVersion 1 and 2 messages verify; tampered ones do not', async () => {
  const getCert = async () => pem;
  assert.equal(await verify(signed(notification, '2'), { getCert }), true);
  assert.equal(await verify(signed(notification, '1'), { getCert }), true);
  const bad = signed(notification, '2');
  bad.Message = '{"a":2}';
  assert.equal(await verify(bad, { getCert }), false);
});

test('certificates are only trusted from https SNS hosts', async () => {
  assert.ok(isValidCertUrl(CERT_URL));
  assert.ok(!isValidCertUrl('http://sns.ap-southeast-2.amazonaws.com/x.pem'));
  assert.ok(!isValidCertUrl('https://sns.ap-southeast-2.amazonaws.com.evil.com/x.pem'));
  assert.ok(!isValidCertUrl('https://evil.com/sns.ap-southeast-2.amazonaws.com/x.pem'));
  const m = signed(notification);
  m.SigningCertURL = 'https://evil.com/cert.pem';
  let fetched = false;
  assert.equal(await verify(m, { getCert: async () => { fetched = true; return pem; } }), false);
  assert.equal(fetched, false);
});
