// Local reproduction only: no network, no real Stripe objects, no transactions.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../../frontend/node_modules/typescript');
const response = JSON.parse(fs.readFileSync(__dirname + '/remote-payment-function.json', 'utf8'));
const deployed = JSON.parse(response.value.content[0].text);
let source = deployed.files.find(f => f.name === 'functions/create-payment-intent/index.ts').content;
source = source.replace(/^import .*$/gm, '');
let handler;
let created;
class StripeMock {
  static createFetchHttpClient() { return {}; }
  paymentIntents = { create: async params => { created = params; return { id: 'pi_FAKE_LOCAL_ONLY', client_secret: 'FAKE' }; } };
}
class ValidationError extends Error {}
const context = {
  serve: fn => { handler = fn; }, Stripe: StripeMock, Response, console,
  Deno: { env: { get: () => 'FAKE_LOCAL_ONLY' } },
  requireAuth: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }),
  checkRateLimit: async () => {}, handleCors: () => null, corsHeaders: {}, ValidationError,
  assertPositiveInt: value => { if (!Number.isInteger(value) || value <= 0) throw new ValidationError(); return value; },
  assertOneOf: value => value, assertUUID: value => value,
  createClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, async single() { return { data: null, error: { message: 'Object not found' } }; } }) }),
};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
(async () => {
  const result = await handler(new Request('https://local.invalid', { method: 'POST', headers: { Authorization: 'Bearer FAKE' }, body: JSON.stringify({ amount: 50, metadata: { missionId: '22222222-2222-4222-8222-222222222222' } }) }));
  console.log(JSON.stringify({ deployedVersion: deployed.version, networkUsed: false, scenario: 'Authenticated caller supplies 50 cents and nonexistent mission; database lookup returns an error', expected: 'Reject before Stripe creation', observedStatus: result.status, stripeCalled: !!created, amountAccepted: created?.amount, verdict: result.status === 200 && created ? 'FAIL: invalid mission accepted and amount trusted' : 'Not reproduced' }, null, 2));
})();
