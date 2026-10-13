const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webhookSecretName, webhookScopeMatches } = require('../_shared/stripe-webhook-routing.ts');
const url = 'https://example.com/stripe-webhook';
const event = { type: 'payment_intent.succeeded', livemode: false, data: { object: { id: 'pi_test' } } };
test('each endpoint selects its own secret', () => {
  assert.equal(webhookSecretName(url), 'STRIPE_WEBHOOK_SECRET');
  assert.equal(webhookSecretName(url + '?source=connect'), 'STRIPE_CONNECT_WEBHOOK_SECRET');
  assert.equal(webhookSecretName(url + '?source=connect-v2'), 'STRIPE_CONNECT_V2_WEBHOOK_SECRET');
});
test('v2 Connect events are isolated and require a signed account resource and matching mode', () => {
  const thin = { type: 'v2.core.account[requirements].updated', livemode: false,
    related_object: { id: 'acct_test', type: 'v2.core.account' } };
  const target = url + '?source=connect-v2';
  assert.equal(webhookScopeMatches(target, thin, 'sk_test_example'), true);
  assert.equal(webhookScopeMatches(target, thin, 'sk_live_example'), false);
  assert.equal(webhookScopeMatches(url, thin, 'sk_test_example'), false);
  assert.equal(webhookScopeMatches(url + '?source=connect', thin, 'sk_test_example'), false);
  assert.equal(webhookScopeMatches(target, { ...thin, related_object: undefined }, 'sk_test_example'), false);
  assert.equal(webhookScopeMatches(target, { ...thin, related_object: { id: 'acct_test', type: 'customer' } }, 'sk_test_example'), false);
  assert.equal(webhookScopeMatches(target, event, 'sk_test_example'), false);
});
test('platform accepts only matching mode and platform payment events', () => {
  assert.equal(webhookScopeMatches(url, event, 'rk_test_example'), true);
  assert.equal(webhookScopeMatches(url, event, 'sk_live_example'), false);
  assert.equal(webhookScopeMatches(url, event, ''), false);
  assert.equal(webhookScopeMatches(url, { ...event, account: 'acct_test' }, 'sk_test_example'), false);
  assert.equal(webhookScopeMatches(url, { ...event, type: 'customer.created' }, 'sk_test_example'), false);
});
test('Connect accepts only an account update for the signed account', () => {
  const connect = { type: 'account.updated', account: 'acct_test', livemode: false, data: { object: { id: 'acct_test' } } };
  assert.equal(webhookScopeMatches(url + '?source=connect', connect, 'sk_test_example'), true);
  assert.equal(webhookScopeMatches(url + '?source=connect', event, 'sk_test_example'), false);
  assert.equal(webhookScopeMatches(url + '?source=connect', { ...connect, account: 'acct_other' }, 'sk_test_example'), false);
  assert.equal(webhookScopeMatches(url, connect, 'sk_test_example'), false);
});
