const test = require('node:test');
const assert = require('node:assert');
const { EMAIL_RE } = require('../lib/csv');

test('EMAIL_RE accepts normal addresses', () => {
  for (const e of ['ok.name+tag@sub.example.co.in', "o'brien@ex.com", 'A1@B.IO']) assert.ok(EMAIL_RE.test(e), e);
});

test('EMAIL_RE rejects malformed addresses', () => {
  for (const e of ["'-blendvidya@gmail.com", 'a..b@x.com', 'x@y', '-a@x.com', 'a@-x.com', 'a b@x.com']) assert.ok(!EMAIL_RE.test(e), e);
});
