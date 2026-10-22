const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRecipients } = require('../lib/csv');

test('CSV: finds email/name columns, keeps other columns as fields, dedupes and drops invalid rows', () => {
  const csv = '﻿E-mail,Full Name,Company\nJo@X.com,Jo Smith,Acme\njo@x.com,Dup,Acme\nnot-an-email,Bad,\nsam@y.org,Sam,Beta\n';
  const out = parseRecipients(csv);
  assert.equal(out.invalid, 1);
  assert.equal(out.duplicates, 1);
  assert.deepEqual(out.rows, [
    { email: 'jo@x.com', name: 'Jo Smith', fields: { full_name: 'Jo Smith', company: 'Acme' } },
    { email: 'sam@y.org', name: 'Sam', fields: { full_name: 'Sam', company: 'Beta' } },
  ]);
});

test('CSV without an email column is rejected', () => {
  assert.equal(parseRecipients('name,phone\nJo,123\n').error, 'CSV must have an "email" column');
});
