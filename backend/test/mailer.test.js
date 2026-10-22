const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyError, formatFrom } = require('../lib/mailer');
const config = require('../config');

test('SES errors are classified as retry / fatal / per-recipient', () => {
  assert.equal(classifyError({ name: 'TooManyRequestsException', message: '' }), 'retry');
  assert.equal(classifyError({ name: 'Unknown', message: 'Maximum sending rate exceeded.' }), 'retry');
  assert.equal(classifyError({ name: 'LimitExceededException', message: '' }), 'fatal');
  assert.equal(classifyError({ name: 'SendingPausedException', message: '' }), 'fatal');
  assert.equal(classifyError({ name: 'MessageRejected', message: 'Email address is not verified.' }), 'recipient');
});

test('From header display names are quoted or RFC 2047 encoded', () => {
  assert.equal(formatFrom('Acme "News"', 'news@x.com'), '"Acme News" <news@x.com>');
  assert.equal(formatFrom('', 'news@x.com'), 'news@x.com');
  assert.equal(formatFrom('Café', 'a@x.com'), `=?UTF-8?B?${Buffer.from('Café').toString('base64')}?= <a@x.com>`);
});

test('defaults: SES in Sydney, dry run on, 1 email/sec', () => {
  assert.equal(config.provider, process.env.EMAIL_PROVIDER ? process.env.EMAIL_PROVIDER.toLowerCase() : 'ses');
  if (!process.env.AWS_REGION) assert.equal(config.awsRegion, 'ap-southeast-2');
  if (!process.env.EMAIL_DRY_RUN) assert.equal(config.dryRun, true);
  if (!process.env.SEND_RATE_PER_SEC) assert.equal(config.sendRatePerSec, 1);
});
