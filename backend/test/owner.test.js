const test = require('node:test');
const assert = require('node:assert');
const { isOwnerUser, isAdminUser } = require('../adminMiddleware');

test('isOwnerUser only matches OWNER_EMAILS', () => {
  process.env.OWNER_EMAILS = 'Owner@Example.com, second@example.com';
  assert.ok(isOwnerUser({ email: 'owner@example.com' }));
  assert.ok(isOwnerUser({ email: 'second@example.com' }));
  assert.ok(!isOwnerUser({ email: 'admin@customer.com', app_metadata: { is_admin: true } }));
  assert.ok(!isOwnerUser(null));
});

test('an org admin is not an owner', () => {
  process.env.OWNER_EMAILS = 'owner@example.com';
  const customerAdmin = { email: 'boss@customer.com', app_metadata: { is_admin: true } };
  assert.ok(isAdminUser(customerAdmin));
  assert.ok(!isOwnerUser(customerAdmin));
});

test('isOwnerUser is false when OWNER_EMAILS is unset', () => {
  delete process.env.OWNER_EMAILS;
  assert.ok(!isOwnerUser({ email: 'owner@example.com' }));
});
