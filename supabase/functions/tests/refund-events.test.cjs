const { test } = require('node:test');
const assert = require('node:assert/strict');
const { refundReceipt, recordRefundEvent } = require('../_shared/refund-events.ts');
const event = (patch = {}) => ({ id: 'evt_fixture', created: 1791532800, livemode: false,
  data: { object: { id: 'ch_fixture', payment_intent: 'pi_fixture', amount: 11000,
    amount_refunded: 2000, currency: 'eur', refunded: false, ...patch } } });

test('partial and full refunds keep cumulative snapshots, not incremental amounts', () => {
  assert.equal(refundReceipt(event()).amount_refunded_cents, 2000);
  const full = refundReceipt(event({ amount_refunded: 11000, refunded: true }));
  assert.equal(full.amount_refunded_cents, 11000);
  assert.equal(full.fully_refunded, true);
  assert.equal(full.payment_intent_id, 'pi_fixture');
});
test('expanded and legacy null PaymentIntents remain attributable to the charge', () => {
  assert.equal(refundReceipt(event({ payment_intent: { id: 'pi_expanded' } })).payment_intent_id, 'pi_expanded');
  assert.equal(refundReceipt(event({ payment_intent: null })).payment_intent_id, null);
});
for (const patch of [{ amount_refunded: -1 }, { amount_refunded: 11001 }, { amount: 1.5 }, { currency: 'EURO' }]) {
  test('rejects malformed refund amounts or currency ' + JSON.stringify(patch), () => assert.throws(() => refundReceipt(event(patch))));
}
test('duplicate notifications preserve an already reconciled receipt', async () => {
  const rows = new Map(); let options;
  const db = { from: table => { assert.equal(table, 'stripe_refund_events'); return {
    upsert: async (row, opts) => { options = opts; if (!rows.has(row.event_id)) rows.set(row.event_id, row); return { error: null }; },
  }; } };
  await recordRefundEvent(db, event());
  rows.get('evt_fixture').reconciliation_state = 'completed';
  await recordRefundEvent(db, event());
  assert.equal(rows.size, 1);
  assert.equal(rows.get('evt_fixture').reconciliation_state, 'completed');
  assert.deepEqual(options, { onConflict: 'event_id', ignoreDuplicates: true });
});
test('database failure rejects receipt so the webhook can retry', async () => {
  const db = { from: () => ({ upsert: async () => ({ error: { message: 'unavailable' } }) }) };
  await assert.rejects(recordRefundEvent(db, event()), /could not be persisted/);
});

function webhook({ failed = false, signatureInvalid = false } = {}) {
  const fs = require('node:fs'); const vm = require('node:vm');
  const ts = require('../../../frontend/node_modules/typescript');
  let handler; const calls = { receipt: 0, complete: 0, release: 0 };
  const db = {
    rpc: async () => ({ data: 'claimed', error: null }),
    from: table => table === 'stripe_refund_events' ? {
      upsert: async () => { calls.receipt++; return { error: failed ? { message: 'failed' } : null }; },
    } : {
      update() { calls.complete++; return this; }, delete() { calls.release++; return this; },
      eq() { return this; }, throwOnError: async () => ({}),
    },
  };
  class Stripe {
    static createFetchHttpClient() { return {}; }
    static createSubtleCryptoProvider() { return {}; }
    webhooks = { constructEventAsync: async () => {
      if (signatureInvalid) throw new Error('signature');
      return { ...event(), type: 'charge.refunded' };
    } };
  }
  const source = fs.readFileSync(require('node:path').join(__dirname, '../stripe-webhook/index.ts'), 'utf8').replace(/^import .*$/gm, '');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, console: { log() {}, error() {} }, Response, JSON, Date, crypto: require('node:crypto').webcrypto,
    Deno: { env: { get: () => 'whsec_fixture' } }, Stripe, createClient: () => db,
    serve: fn => handler = fn, handleCors: () => null, webhookSecretName: () => 'STRIPE_WEBHOOK_SECRET',
    webhookScopeMatches: () => true, recordRefundEvent,
  });
  return { calls, run: () => handler(new Request('https://fixture.invalid/webhook', {
    method: 'POST', headers: { 'stripe-signature': 'fixture' }, body: '{}',
  })) };
}
test('webhook acknowledges a partial refund only after durable receipt', async () => {
  const h = webhook(); assert.equal((await h.run()).status, 200);
  assert.deepEqual(h.calls, { receipt: 1, complete: 1, release: 0 });
});
test('webhook returns retryable failure and releases claim if receipt persistence fails', async () => {
  const h = webhook({ failed: true }); assert.equal((await h.run()).status, 500);
  assert.deepEqual(h.calls, { receipt: 1, complete: 0, release: 1 });
});
test('invalid Stripe signature cannot create a refund receipt', async () => {
  const h = webhook({ signatureInvalid: true }); assert.equal((await h.run()).status, 400);
  assert.deepEqual(h.calls, { receipt: 0, complete: 0, release: 0 });
});
