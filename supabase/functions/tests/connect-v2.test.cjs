const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('../../../frontend/node_modules/typescript');
const helpers = require('../_shared/connect-account.ts');
const routing = require('../_shared/stripe-webhook-routing.ts');
const active = { id: 'acct_test', configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } } };
function compile(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/^import .*$/gm, '');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
}
function onboarding(options = {}) {
  let handler;
  const calls = { create: [], links: [], updates: [], retrieve: [] };
  const chain = {
    select() { return this; }, eq() { return this; },
    update(value) { calls.updates.push(value); return this; },
    single: async () => ({ data: { stripe_account_id: options.accountId || null }, error: options.profileError }),
    throwOnError: async () => { if (options.writeError) throw Error('database offline'); },
  };
  const connectStripe = { v2: { core: {
    accounts: {
      create: async (...args) => { calls.create.push(args); if (options.stripeError) throw Error('Secret technical error sk_test_DO_NOT_DISPLAY'); return { id: 'acct_test' }; },
      retrieve: async (...args) => { calls.retrieve.push(args); return options.active ? active : { id: 'acct_test' }; },
    },
    accountLinks: { create: async params => { calls.links.push(params); return { url: 'https://accounts.stripe.com/test-onboarding' }; } },
  } } };
  compile('create-connect-account/index.ts', {
    serve: fn => handler = fn, ...helpers, connectStripe, Response, console: { log() {}, error() {} },
    handleCors: () => null, corsHeaders: {}, ValidationError: class extends Error {},
    requireActiveSession: async () => { if (options.inactiveSession) throw Error("Session inactive"); },
    checkRateLimit: async () => {},
    Deno: { env: { get: () => 'https://example.supabase.co' } },
    createClient: () => ({ from: () => chain, auth: { getUser: async () => ({ data: { user: options.invalidAuth ? null : { id: 'provider_test', email: 'test@example.invalid' } } }) } }),
  });
  return async () => {
    const response = await handler(new Request('https://local.invalid', { method: 'POST', headers: options.noAuth ? {} : { Authorization: 'Bearer test' } }));
    return { body: await response.json(), calls };
  };
}
test('onboarding creates an idempotent v2 recipient and generates a v2 account link', async () => {
  const { body, calls } = await onboarding()();
  assert.equal(body.url, 'https://accounts.stripe.com/test-onboarding');
  assert.equal(body.onboarding_complete, false);
  const [params, opts] = calls.create[0];
  assert.equal(params.dashboard, 'express');
  assert.equal(params.identity.country, 'FR');
  assert.equal(params.type, undefined);
  assert.equal(params.configuration.merchant, undefined);
  assert.equal(params.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested, true);
  assert.equal(opts.idempotencyKey, 'altio-connect-v2:provider_test');
  // Pin the actual request contract, independently of the helper under test.
  assert.deepEqual(calls.links[0], {
    account: 'acct_test',
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        refresh_url: 'https://example.supabase.co/functions/v1/stripe-redirect?type=refresh',
        return_url: 'https://example.supabase.co/functions/v1/stripe-redirect?type=success',
      },
    },
  });
  assert.equal(calls.updates[0].stripe_account_id, 'acct_test');
  assert.equal(calls.updates[1].stripe_onboarding_complete, false);
});
test('existing incomplete account is reused, never recreated', async () => {
  const { calls } = await onboarding({ accountId: 'acct_test' })();
  assert.equal(calls.create.length, 0); assert.equal(calls.links.length, 1);
});
test('active v2 recipient syncs readiness without another onboarding link', async () => {
  const { body, calls } = await onboarding({ accountId: 'acct_test', active: true })();
  assert.deepEqual(body, { url: null, onboarding_complete: true });
  assert.equal(calls.links.length, 0);
  assert.equal(calls.updates[0].stripe_onboarding_complete, true);
});
for (const options of [{ noAuth: true }, { invalidAuth: true }, { profileError: { message: 'not found' } }]) {
  test('onboarding refuses unauthorized or non-provider callers ' + JSON.stringify(options), async () => {
    const { body, calls } = await onboarding(options)();
    assert.ok(body.error); assert.equal(calls.create.length, 0); assert.equal(calls.links.length, 0);
  });
}
test('onboarding never exposes raw Stripe errors', async () => {
  const { body } = await onboarding({ stripeError: true })();
  assert.match(body.error, /Impossible de configurer/);
  assert.doesNotMatch(body.error, /sk_test|technical/);
});
test('database failure prevents handing out an onboarding link', async () => {
  const { body, calls } = await onboarding({ writeError: true })();
  assert.ok(body.error); assert.equal(calls.links.length, 0);
});

for (const eventType of routing.connectV2Events) test('webhook handles ' + eventType, async () => {
  let handler, retrieved = 0, claimed = 0, released = false;
  const writes = [];
  const chain = { update(value) { writes.push(value); return this; }, eq() { return this; },
    delete() { released = true; return this; }, throwOnError: async () => {} };
  class StripeMock {
    static createFetchHttpClient() { return {}; }
    static createSubtleCryptoProvider() { return {}; }
    webhooks = { constructEventAsync: async () => ({ id: 'evt_test', type: eventType, livemode: false,
      related_object: { id: 'acct_test', type: 'v2.core.account', url: 'https://untrusted.invalid' } }) };
  }
  compile('stripe-webhook/index.ts', {
    serve: fn => handler = fn, ...helpers, ...routing, Stripe: StripeMock, Response, crypto: require('node:crypto').webcrypto,
    connectStripe: { v2: { core: { accounts: { retrieve: async id => { retrieved++; assert.equal(id, 'acct_test'); return active; } } } } },
    console: { log() {}, error() {} }, handleCors: () => null, corsHeaders: {},
    Deno: { env: { get: name => name.endsWith('WEBHOOK_SECRET') ? 'whsec_test' : name === 'STRIPE_SECRET_KEY' ? 'sk_test_example' : 'local' } },
    createClient: () => ({ rpc: async () => { claimed++; return { data: 'claimed' }; }, from: () => chain }),
  });
  const response = await handler(new Request('https://local.invalid?source=connect-v2', { method: 'POST', headers: { 'stripe-signature': 'test' }, body: '{}' }));
  assert.equal(response.status, 200); assert.equal(claimed, 1); assert.equal(released, false);
  const closed = eventType === 'v2.core.account.closed';
  assert.equal(retrieved, closed ? 0 : 1);
  assert.equal(writes[0].stripe_onboarding_complete, !closed);
  assert.equal(writes[1].processing_state, 'completed');
});

test('revoked session cannot create, update or access a Connect account', async () => {
 const {body,calls}=await onboarding({inactiveSession:true})();assert.ok(body.error);
 for(const operations of Object.values(calls)) assert.equal(operations.length,0);
});
