const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('../../../frontend/node_modules/typescript');
function load(name) {
  const filename = path.resolve(__dirname, '../_shared', name);
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: load, Date, Number, Error }, { filename });
  return module.exports;
}
const { resolvePaymentOrder: resolve } = load('payment-order.ts');
const { verifyCaptureOrder: verify } = load('capture-order.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), provider = id(2), missionId = id(3), quoteId = id(4), emergencyId = id(5), bidId = id(6);
const mission = { owner_id: owner, assigned_provider_id: provider, status: 'validated', fixed_rate: 100 };
const emergency = { owner_id: owner, accepted_provider_id: provider, status: 'quote_pending' };
const quote = { provider_id: provider, emergency_request_id: emergencyId, status: 'pending', repair_cost: 100, tva_rate: 0.2 };
// VAT-exempt provider: HT equals TTC, so the legacy fixtures keep their amounts.
const rows = { missions: mission, emergency_requests: emergency, mission_quotes: quote, users: { is_vat_exempt: true } };
const read = async table => rows[table] || null;
test('mission uses stored rate and strips hostile metadata', async () => {
  const result = await resolve(owner, { amount: 11000, metadata: { missionId, ownerId: 'attacker', needs_manual_transfer: 'true' } }, read);
  assert.equal(result.amount, 11000); assert.equal(result.metadata.ownerId, owner); assert.equal(result.metadata.needs_manual_transfer, undefined);
});
for (const [name, input, reader] of [
  ['underpayment', { amount: 50, metadata: { missionId } }, read],
  ['missing order', { amount: 11000, metadata: { missionId } }, async () => null],
  ['no reference', { amount: 50 }, read],
  ['wrong owner', { amount: 11000, metadata: { missionId } }, async () => ({ ...mission, owner_id: provider })],
  ['already paid', { amount: 11000, metadata: { missionId } }, async () => ({ ...mission, paid_at: '2026-01-01' })],
  ['wrong capture mode', { amount: 11000, captureMethod: 'manual', metadata: { missionId } }, read],
  ['ambiguous references', { amount: 50, metadata: { quoteId, bidId } }, read],
  ['unrelated quote', { amount: 13200, metadata: { quoteId, emergencyId: id(99) } }, read],
  ['wrong provider', { amount: 13000, metadata: { quoteId } }, async t => t === 'emergency_requests' ? { ...emergency, accepted_provider_id: id(99) } : rows[t]],
  ['expired quote', { amount: 13000, metadata: { quoteId } }, async t => t === 'mission_quotes' ? { ...quote, valid_until: '2020-01-01' } : rows[t]],
  ['invalid rate', { amount: 50, metadata: { missionId } }, async () => ({ ...mission, fixed_rate: -1 })],
  ['generic intervention bypass', { amount: 50, metadata: { interventionId: id(8) } }, read],
]) test(`rejects ${name}`, async () => assert.rejects(resolve(owner, input, reader)));
test('quote includes saved VAT and uses manual capture', async () => {
  const result = await resolve(owner, { amount: 13000, metadata: { quoteId } }, read);
  assert.equal(result.captureMethod, 'manual'); assert.equal(result.metadata.emergencyId, emergencyId);
});
test('commission is 10 % of the HT price on each side', async () => {
  const quoted = await resolve(owner, { amount: 13000, metadata: { quoteId } }, read);
  assert.equal(quoted.applicationFee, 2000); assert.equal(quoted.metadata.htCents, '10000'); assert.equal(quoted.metadata.feeCents, '1000');
  const subject = async t => t === 'users' ? { is_vat_exempt: false } : rows[t];
  const missionOrder = await resolve(owner, { amount: 10833, metadata: { missionId } }, subject);
  assert.equal(missionOrder.metadata.htCents, '8333'); assert.equal(missionOrder.applicationFee, 1666);
  await assert.rejects(resolve(owner, { amount: 11000, metadata: { missionId } }, subject));
});
test('VAT exemption and quote lines are authoritative', async () => {
  const result = await resolve(owner, { amount: 4400, metadata: { quoteId } }, async t => t === 'mission_quotes' ? { ...quote, is_vat_exempt: true, line_items: [{ quantity: 2, unit_price_ht: 20 }] } : rows[t]);
  assert.equal(result.amount, 4400);
});
test('bid uses stored displacement and diagnostic', async () => {
  const result = await resolve(owner, { amount: 5500, metadata: { bidId, emergencyId } }, async t => t === 'emergency_bids' ? { provider_id: provider, emergency_request_id: emergencyId, status: 'pending', travel_cost: 20, diagnostic_cost: 30 } : t === 'users' ? rows.users : { ...emergency, accepted_provider_id: null });
  assert.equal(result.amount, 5500); assert.equal(result.captureMethod, 'manual');
  assert.equal(result.metadata.completionFlow, 'v1');
});
const hold = { id: 'pi_LOCAL_TEST', amount: 11000, amount_capturable: 11000, currency: 'eur', status: 'requires_capture', metadata: { missionId, ownerId: owner } };
test('capture accepts the matching validated mission', () => verify(owner, mission, hold, { missionId }));
for (const [label, who, source, intent, refs, amount] of [
  ['missing reference', owner, mission, hold, {}],
  ['ambiguous reference', owner, mission, hold, { missionId, emergencyId }],
  ['foreign caller', id(99), mission, hold, { missionId }],
  ['foreign payment', owner, mission, { ...hold, metadata: { missionId: id(99) } }, { missionId }],
  ['unvalidated mission', owner, { ...mission, status: 'in_progress' }, hold, { missionId }],
  ['different stored payment', owner, { ...mission, payment_intent_id: 'pi_OTHER' }, hold, { missionId }],
  ['partial override', owner, mission, hold, { missionId }, 50],
  ['wrong currency', owner, mission, { ...hold, currency: 'usd' }, { missionId }],
  ['incomplete received amount', owner, mission, { ...hold, status: 'succeeded', amount_received: 50 }, { missionId }],
  ['wrong agreed price', owner, { ...mission, fixed_rate: 200 }, hold, { missionId }],
]) test(`capture refuses ${label}`, () => assert.throws(() => verify(who, source, intent, refs, amount)));

const { missionInvoiceAmounts: invoiceAmounts } = load('mission-invoice-amounts.ts');
test('mission service invoices do not add VAT again to the already charged TTC price', () => {
  const result = invoiceAmounts(100, 'service', false);
  assert.equal(result.amountTtc, 100);
  assert.equal(result.amountHt, 83.33);
  assert.equal(result.vatRate, 20);
  assert.equal(invoiceAmounts(100, 'service', true).amountHt, 100);
});
test('mission invoices reconcile owner total and Stripe fee despite whole-euro rounding', () => {
  for (const rate of [99.99, 100, 100.50, 125.99]) {
    const service = invoiceAmounts(rate, 'service', false);
    const ownerFee = invoiceAmounts(rate, 'service_fee', false);
    const commission = invoiceAmounts(rate, 'commission', false);
    const charged = Math.round(rate * 1.1) * 100;
    assert.equal(Math.round((service.amountTtc + ownerFee.amountTtc) * 100), charged);
    assert.equal(Math.round((commission.amountTtc + ownerFee.amountTtc) * 100), Math.round(charged * 2 / 11));
  }
});
test('new mission charges preserve cents and carry the HT pricing version',async()=>{
 const source={...mission,fixed_rate:100.55};const order=await resolve(owner,{amount:11061,metadata:{missionId}},async t=>t==='users'?rows.users:source);
 assert.equal(order.amount,11061);assert.equal(order.metadata.pricingVersion,'ht-v1');assert.equal(order.applicationFee,2012);
 verify(owner,source,{id:'pi_new',metadata:order.metadata,currency:'eur',status:'succeeded',amount:11061,amount_received:11061},{missionId});
 assert.throws(()=>verify(owner,source,{id:'pi_new',metadata:{...order.metadata,feeCents:'2000'},currency:'eur',status:'succeeded',amount:12055,amount_received:12055},{missionId}));
 const ownerFee=invoiceAmounts(100.55,'service_fee',false,11061,2012),commission=invoiceAmounts(100.55,'commission',false,11061,2012);
 assert.equal(ownerFee.amountTtc,10.06);assert.equal(commission.amountTtc,10.06);
});
test('actual quoted VAT and HT are retained rather than inferred from profile',()=>{const result=invoiceAmounts(110,'service',false,12100,2200,10,10000);assert.equal(result.amountTtc,110);assert.equal(result.amountHt,100);assert.equal(result.vatRate,10)});
