const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../../frontend/node_modules/typescript');
function load(name) {
  const context = { exports: {}, require: name => load(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../_shared', name), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}
const { requireConnectSplit, assertConnectIntent } = load('connect-split.ts');
const { requireLegalEntity } = load('legal-entity.ts');
const stripe = account => ({ v2: { core: { accounts: { retrieve: async (_id, params) => {
  assert.deepEqual(Array.from(params.include), ['configuration.recipient', 'requirements']);
  return { id: 'acct_test', ...account };
} } } } });
const active = { configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } } };
test('Connect split reconciles the 10% + 10% model', async () => {
  const split = await requireConnectSplit(stripe(active), 'acct_test', 11000);
  assert.equal(split.application_fee_amount, 2000);
  assert.equal(split.transfer_data.destination, 'acct_test');
});
for (const account of [{}, { ...active, closed: true }, { charges_enabled: true, payouts_enabled: true },
  { configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'restricted' } } } } } },
  { ...active, id: 'acct_foreign' }]) {
  test(`Connect rejects unavailable recipient ${JSON.stringify(account)}`, async () => {
    await assert.rejects(requireConnectSplit(stripe(account), 'acct_test', 11000));
  });
}
test('Connect rejects missing account, invalid amounts and lookup failures', async () => {
  await assert.rejects(requireConnectSplit(stripe({}), null, 11000));
  for (const amount of [0, 49, -1, 100.5, NaN, Infinity]) await assert.rejects(requireConnectSplit(stripe({}), 'acct_test', amount));
  await assert.rejects(requireConnectSplit({ v2: { core: { accounts: { retrieve: async () => { throw Error('offline'); } } } } }, 'acct_test', 11000));
});
test('capture refuses legacy, foreign and incorrectly split intents', () => {
  const intent = { amount: 11000, application_fee_amount: 2000, transfer_data: { destination: 'acct_test' } };
  assert.doesNotThrow(() => assertConnectIntent(intent, 'acct_test'));
  assert.throws(() => assertConnectIntent(intent, 'acct_foreign'));
  assert.throws(() => assertConnectIntent({ ...intent, transfer_data: null }, 'acct_test'));
  assert.throws(() => assertConnectIntent({ ...intent, application_fee_amount: 2200 }, 'acct_test'));
});
const base = {
  ALTIO_COMPANY_NAME: 'Exploitant test EI', ALTIO_COMPANY_FORM: 'EI',
  ALTIO_SIREN: '123456789', ALTIO_SIRET: '12345678900012', ALTIO_ADDRESS: 'Adresse test',
  ALTIO_EMAIL: 'test@example.invalid', ALTIO_RCS: 'Registre test', ALTIO_VAT_REGIME: 'franchise',
  ALTIO_MEDIATOR_NAME: 'Médiateur test', ALTIO_MEDIATOR_ADDRESS: 'Adresse test', ALTIO_MEDIATOR_URL: 'https://example.invalid',
};
test('franchise EI does not require capital or a VAT number', () => {
  const entity = requireLegalEntity(key => base[key]);
  assert.equal(entity.vatExempt, true); assert.equal(entity.vat, ''); assert.equal(entity.capital, '');
});
test('legacy capital setting is never printed for an individual entrepreneur', () => {
  assert.equal(requireLegalEntity(key => ({ ...base, ALTIO_CAPITAL: '1000' })[key]).capital, '');
});
test('VAT-liable entity requires a VAT number', () => {
  assert.throws(() => requireLegalEntity(key => ({ ...base, ALTIO_VAT_REGIME: 'liable' })[key]));
  assert.equal(requireLegalEntity(key => ({ ...base, ALTIO_VAT_REGIME: 'liable', ALTIO_TVA_NUMBER: 'FRTEST' })[key]).vatExempt, false);
});
test('legal entity fails closed for each missing mandatory field', () => {
  for (const key of Object.keys(base)) assert.throws(() => requireLegalEntity(name => name === key ? undefined : base[name]));
  assert.throws(() => requireLegalEntity(key => ({ ...base, ALTIO_SIRET: '99999999900012' })[key]));
});

test('invoice identity permits missing mediation but preserves tax and identity guards', () => {
  const get = key => key.startsWith('ALTIO_MEDIATOR_') ? undefined : base[key];
  const entity = requireLegalEntity(get, { requireMediator: false });
  assert.equal(entity.mediatorName, '');
  assert.equal(entity.vatExempt, true);
  assert.throws(() => requireLegalEntity(get));
  for (const key of Object.keys(base).filter(k => !k.startsWith('ALTIO_MEDIATOR_'))) {
    assert.throws(() => requireLegalEntity(name => name === key ? undefined : get(name), { requireMediator: false }));
  }
});
