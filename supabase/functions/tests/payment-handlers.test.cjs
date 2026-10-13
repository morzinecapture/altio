const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('../../../frontend/node_modules/typescript');
const { webhookSecretName, webhookScopeMatches } = require('../_shared/stripe-webhook-routing.ts');
const { connectProfileStatus, retrieveConnectAccount } = require('../_shared/connect-account.ts');
const { recordEarlyExecutionConsent } = require('../_shared/early-execution-consent.ts');
const { recordRefundEvent } = require('../_shared/refund-events.ts');
function compile(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/^import .*$/gm, '');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
}
function webhook(options = {}) {
  let handler, completed = false, deleted = false, verified = false;
  const event = options.event || { id: 'evt_LOCAL_TEST', type: 'charge.refunded', created: 1791532800, livemode: false,
    data: { object: { id: 'ch_LOCAL_TEST', payment_intent: 'pi_LOCAL_TEST', amount: 11000, amount_refunded: 11000, currency: 'eur', refunded: true } } };
  const chain = {
    update() { return this; }, eq() { return this; },
    upsert: async () => ({ error: options.writeError ? { message: 'database offline' } : null }),
    delete() { deleted = true; return this; },
    throwOnError: async () => { if (options.writeError) throw new Error('database offline'); completed = true; },
  };
  class StripeMock {
    static createFetchHttpClient() { return {}; }
    static createSubtleCryptoProvider() { return {}; }
    webhooks = { constructEventAsync: async () => { verified = true; if (options.invalidSignature) throw new Error('bad signature'); return event; } };
  }
  compile('stripe-webhook/index.ts', {
    serve: fn => handler = fn, Stripe: StripeMock, Response, crypto: require('node:crypto').webcrypto,
    console: { log() {}, error() {} }, handleCors: () => null, corsHeaders: {}, getFrenchServiceLabel: x => x,
    webhookSecretName, webhookScopeMatches, connectProfileStatus, retrieveConnectAccount, recordRefundEvent,
    connectStripe: { v2: { core: { accounts: { retrieve: async id => ({ id }) } } } },
    Deno: { env: { get: name => name.endsWith('WEBHOOK_SECRET') ? options.noSecret ? undefined : 'whsec_LOCAL_TEST' : name === 'STRIPE_SECRET_KEY' ? 'sk_test_LOCAL_TEST' : 'LOCAL_TEST' } },
    createClient: () => ({ rpc: async () => ({ data: options.claim || 'claimed', error: options.claimError }), from: () => chain }),
  });
  return async () => {
    const response = await handler(new Request('https://local.invalid' + (options.source ? '?source=' + options.source : ''), { method: 'POST', headers: options.noSignature ? {} : { 'stripe-signature': 'LOCAL_TEST' }, body: '{}' }));
    return { status: response.status, completed, deleted, verified };
  };
}
for (const [name, options, expected] of [
  ['missing signature', { noSignature: true }, 400],
  ['missing secret', { noSecret: true }, 503],
  ['invalid signature', { invalidSignature: true }, 400],
  ['claim database failure', { claimError: { code: '08006' } }, 503],
  ['concurrent worker', { claim: 'busy' }, 503],
  ['completed duplicate', { claim: 'completed' }, 200],
]) test(`webhook: ${name}`, async () => {
  const result = await webhook(options)();
  assert.equal(result.status, expected); assert.equal(result.completed, false);
});
test('webhook acknowledges after persisting completion', async () => {
  const result = await webhook()(); assert.equal(result.status, 200); assert.equal(result.completed, true); assert.equal(result.verified, true);
});
test('webhook database write failure releases the claim and asks Stripe to retry', async () => {
  const result = await webhook({ writeError: true, source: 'connect', event: { id: 'evt_LOCAL_TEST', type: 'account.updated', livemode: false, account: 'acct_LOCAL_TEST', data: { object: { id: 'acct_LOCAL_TEST' } } } })();
  assert.equal(result.status, 500); assert.equal(result.deleted, true);
});
test('payment creation is disabled when webhook secret is missing', async () => {
  let handler, charged = false;
  class StripeMock { static createFetchHttpClient() { return {}; } paymentIntents = { create: async () => { charged = true; } }; }
  compile('create-payment-intent/index.ts', {
    serve: fn => handler = fn, Stripe: StripeMock, Response, console,
    Deno: { env: { get: name => name === 'STRIPE_WEBHOOK_SECRET' ? undefined : 'LOCAL_TEST' } },
    requireAuth: async () => ({ user: { id: 'LOCAL_TEST' } }), checkRateLimit: async () => {},
    recordEarlyExecutionConsent, resolvePaymentOrder: async () => ({ amount: 11000, providerId: 'LOCAL_TEST', metadata: {} }),
    createClient: () => ({}), handleCors: () => null, corsHeaders: {}, ValidationError: Error,
  });
  const response = await handler(new Request('https://local.invalid', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503); assert.equal(charged, false);
});
test('emergency bid authorization is recorded for accept_emergency_bid', async () => {
  let handler; const upserts = [];
  class StripeMock { static createFetchHttpClient() { return {}; } paymentIntents = { create: async () => ({ id: 'pi_bid', client_secret: 'secret' }) }; }
  const db = { from: table => table === 'provider_profiles'
    ? { select() { return this; }, eq() { return this; }, single: async () => ({ data: { stripe_account_id: 'acct_LOCAL' }, error: null }) }
    : { upsert: async (row, options) => { upserts.push({ table, row, options }); return { error: null }; } } };
  compile('create-payment-intent/index.ts', {
    serve: fn => handler = fn, Stripe: StripeMock, Response, console, connectStripe: {},
    Deno: { env: { get: name => name === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_LOCAL' : 'LOCAL_TEST' } },
    requireAuth: async () => ({ user: { id: 'owner' } }), checkRateLimit: async () => {},
    recordEarlyExecutionConsent: async () => null, requireConnectSplit: async () => ({}),
    resolvePaymentOrder: async () => ({ amount: 10833, applicationFee: 1666, providerId: 'provider', captureMethod: 'manual', metadata: { emergencyId: 'em', bidId: 'bid' } }),
    createClient: () => db, handleCors: () => null, corsHeaders: {}, ValidationError: Error,
  });
  const response = await handler(new Request('https://local.invalid', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(upserts)), [{ table: 'emergency_bid_payments', options: { onConflict: 'payment_intent_id' },
    row: { payment_intent_id: 'pi_bid', emergency_id: 'em', bid_id: 'bid', owner_id: 'owner', amount_cents: 10833 } }]);
});

for (const [label, userId, state, expected] of [
  ['foreign caller', 'stranger', 'paid', 403],
  ['unpaid source', 'owner', 'validated', 400],
]) test(`invoice rejects ${label} before reading or writing any invoice`, async () => {
  let handler; const tables = [];
  const chain = { select(){return this}, eq(){return this}, single: async()=>({data:{owner_id:'owner',assigned_provider_id:'provider',status:state}}) };
  compile('generate-invoice/index.ts', {
    serve:fn=>handler=fn, Response, console, handleCors:()=>null,corsHeaders:{},
    Deno:{env:{get:()=> 'local'}}, requireAuthOrServiceKey:async()=>({user:{id:userId},isServiceCall:false}),
    createClient:()=>({from:t=>{tables.push(t);return chain}}),
    assertUUID:x=>x,assertOneOf:x=>x,assertOptionalString:x=>x,ValidationError:class extends Error{},
  });
  const response=await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify({missionId:'local',invoiceType:'service'})}));
  assert.equal(response.status,expected);assert.deepEqual(tables,['missions']);
});

test('calendar denies foreign caller before accessing Google tokens', async()=>{
  let handler;const tables=[];
  const chain={select(){return this},eq(){return this},single:async()=>({data:{owner_id:'owner',assigned_provider_id:'provider'}})};
  compile('sync-google-calendar/index.ts',{
    Deno:{env:{get:()=> 'local'},serve:fn=>handler=fn},Response,console,handleCors:()=>null,corsHeaders:{},
    requireAuthOrServiceKey:async()=>({user:{id:'stranger'},isServiceCall:false}),
    createClient:()=>({from:t=>{tables.push(t);return chain}}),
  });
  const response=await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify({mission_id:'local',action:'delete'})}));
  assert.equal(response.status,403);assert.deepEqual(tables,['missions']);
});

test('push denies unrelated recipient before any outbound request', async()=>{
 let handler,outbound=false;
 compile('send-push/index.ts',{
  serve:fn=>handler=fn,Response,console,handleCors:()=>null,corsHeaders:{},
  Deno:{env:{get:()=> 'local'}},requireAuthOrServiceKey:async()=>({user:{id:'caller'},token:'local',isServiceCall:false}),
  createClient:()=>({rpc:async()=>({data:false,error:null})}),
  assertUUID:x=>x,assertString:x=>x,ValidationError:Error,
  fetch:async()=>{outbound=true;throw new Error('should not send')},
 });
 const response=await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify({userId:'stranger',title:'x',body:'x'})}));
 assert.equal(response.status,403);assert.equal(outbound,false);
});

test('credit notes require admin access before invoice lookup', async()=>{
 let handler;const tables=[];const chain={select(){return this},eq(){return this},single:async()=>({data:{is_admin:false},error:null})};
 compile('generate-credit-note/index.ts',{
  serve:fn=>handler=fn,Response,console,handleCors:()=>null,corsHeaders:{},Deno:{env:{get:()=> 'local'}},
  requireAuthOrServiceKey:async()=>({user:{id:'ordinary'},isServiceCall:false}),
  createClient:()=>({from:t=>{tables.push(t);return chain}}),
 });
 const response=await handler(new Request('https://local.invalid',{method:'POST',body:'{}'}));
 assert.equal(response.status,403);assert.deepEqual(tables,['users']);
});

test('document text escapes markup while preserving fiscal booleans and numbers',()=>{
 const context={exports:{}};compile('_shared/document-text.ts',context);
 const {escapeDocumentText,escapePartyFields}=context.exports;
 assert.equal(escapeDocumentText('<script>"A&B"</script>'), '&lt;script&gt;&quot;A&amp;B&quot;&lt;/script&gt;');
 const escaped=escapePartyFields({name:'<img src=x>',is_vat_exempt:false,total:100});
 assert.equal(escaped.name,'&lt;img src=x&gt;');assert.equal(escaped.is_vat_exempt,false);assert.equal(escaped.total,100);
});

async function retryEmergencyInvoice(options = {}) {
  let handler; const retrieved = []; const tables = [];
  const source = { owner_id: 'owner', assigned_provider_id: 'provider', status: 'completed', displacement_payment_id: 'pi_visit', ...options.source };
  class StripeMock {
    static createFetchHttpClient() { return {}; }
    paymentIntents = { retrieve: async id => { retrieved.push(id); return { status: 'succeeded', currency: 'eur', metadata: { emergencyId: 'emergency' }, ...options.payment }; } };
  }
  compile('generate-invoice/index.ts', {
    serve: fn => handler = fn, Response, console, Stripe: StripeMock,
    handleCors: () => null, corsHeaders: {}, Deno: { env: { get: () => 'local' } },
    requireAuthOrServiceKey: async () => ({ user: { id: options.user || 'provider' }, isServiceCall: false }),
    assertUUID: x => x, assertOneOf: x => x, assertOptionalString: x => x, ValidationError: class extends Error {},
    createClient: () => ({ from: table => {
      tables.push(table);
      return { select() { return this; }, eq() { return this; }, is() { return this; },
        single: async () => ({ data: source }),
        limit: async () => table === 'emergency_completion_steps' ? { data: [] } : table === 'mission_quotes'
          ? { data: options.quotes === undefined ? [] : options.quotes, error: options.quoteError }
          : { data: [{ id: 'existing_invoice' }] },
      };
    } }),
  });
  const response = await handler(new Request('https://local.invalid', { method: 'POST', body: JSON.stringify({ emergencyId: 'emergency', invoiceType: options.type || 'service', stripePaymentIntentId: options.reference === undefined ? 'pi_visit' : options.reference }) }));
  return { status: response.status, body: await response.json(), retrieved, tables };
}
for (const type of ['service', 'service_fee', 'commission', 'displacement']) {
  test(`completed visit without quote: ${type} verifies payment and skips existing document`, async () => {
    const result = await retryEmergencyInvoice({ type });
    assert.equal(result.status, 200); assert.equal(result.body.skipped, true);
    assert.deepEqual(result.retrieved, ['pi_visit']);
  });
}
for (const [label, options, status] of [
  ['accepted unpaid quote', { quotes: [{ id: 'quote' }] }, 400],
  ['unknown quote state', { quotes: null }, 400],
  ['quote lookup failure', { quoteError: { message: 'offline' } }, 400],
  ['wrong reference', { reference: 'pi_other' }, 400],
  ['missing visit payment', { source: { displacement_payment_id: null } }, 400],
  ['uncaptured payment', { payment: { status: 'requires_capture' } }, 400],
  ['different emergency', { payment: { metadata: { emergencyId: 'other' } } }, 400],
  ['different currency', { payment: { currency: 'usd' } }, 400],
  ['unfinished visit', { source: { status: 'paid' } }, 400],
  ['foreign user', { user: 'stranger' }, 403],
]) test(`visit invoice rejects ${label} before document access`, async () => {
  const result = await retryEmergencyInvoice(options);
  assert.equal(result.status, status); assert.equal(result.tables.includes('invoices'), false);
});
test('paid repair uses the quote payment instead of the visit payment', async () => {
  const result = await retryEmergencyInvoice({ source: { quote_payment_id: 'pi_quote' }, reference: 'pi_quote' });
  assert.equal(result.status, 200); assert.deepEqual(result.retrieved, ['pi_quote']);
  assert.equal(result.tables.includes('mission_quotes'), false);
});

for (const [label, expoBody, httpStatus, expected] of [
  ['accepted ticket', { data: { status: 'ok', id: 'ticket' } }, 200, 200],
  ['unregistered device', { data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }, 200, 502],
  ['provider unavailable', { errors: [{ code: 'UNAVAILABLE' }] }, 503, 502],
  ['malformed response', {}, 200, 502],
]) test(`push reports ${label} accurately`, async () => {
  let handler;
  compile('send-push/index.ts', {
    serve: fn => handler = fn, Response, console: { error() {} }, handleCors: () => null, corsHeaders: {},
    Deno: { env: { get: () => 'local' } }, requireAuthOrServiceKey: async () => ({ isServiceCall: true }),
    assertUUID: x => x, assertString: x => x, ValidationError: class extends Error {},
    fetch: async url => url.startsWith('https://exp.host/')
      ? new Response(JSON.stringify(expoBody), { status: httpStatus })
      : new Response(JSON.stringify([{ expo_push_token: 'ExponentPushToken[local]' }])),
  });
  const response = await handler(new Request('https://local.invalid', { method: 'POST', body: JSON.stringify({ userId: 'provider', title: 'Test', body: 'Test', skipDbInsert: true }) }));
  assert.equal(response.status, expected);
  assert.equal((await response.json()).success, expected === 200);
});
