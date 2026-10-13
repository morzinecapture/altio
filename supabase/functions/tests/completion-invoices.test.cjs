const { test } = require('node:test');
const assert = require('node:assert/strict');
const { completionInvoiceAmounts, generateCompletionInvoices } = require('../_shared/completion-invoices.ts');
const step={ id:'s',phase:'visit',paid_at:'2026-10-08',payment_intent_id:'pi_visit',amount_cents:8250,emergency_id:'e',owner_id:'owner',provider_id:'provider' };
const pi={ id:'pi_visit',status:'succeeded',currency:'eur',amount:8250,amount_received:8250,application_fee_amount:1500,metadata:{completionFlow:'v1',emergencyId:'e',ownerId:'owner',bidId:'bid'} };
const bid={ id:'bid',provider_id:'provider',emergency_request_id:'e',travel_cost:25,diagnostic_cost:50 };
test('visit invoices exactly reconcile owner charge and provider payout',()=>{
 const a=t=>completionInvoiceAmounts(step,pi,bid,t,false);
 assert.equal(a('displacement').amountTtc,75);
 assert.equal(a('displacement').amountHt,62.5);
 assert.equal(a('service_fee').amountTtc,7.5);
 assert.equal(a('commission').amountTtc,7.5);
 assert.equal(a('displacement').amountTtc+a('service_fee').amountTtc,pi.amount_received/100);
 assert.equal(a('displacement').amountTtc-a('commission').amountTtc,(pi.amount_received-pi.application_fee_amount)/100);
});
test('repair invoice uses the accepted quote VAT and never includes the visit again',()=>{
 const s={...step,phase:'repair',payment_intent_id:'pi_repair',amount_cents:13200};
 const p={...pi,id:'pi_repair',amount:13200,amount_received:13200,application_fee_amount:2400,metadata:{...pi.metadata,bidId:undefined,quoteId:'quote'}};
 const q={...bid,id:'quote',repair_cost:100,tva_rate:0.20,is_vat_exempt:false};
 assert.deepEqual(completionInvoiceAmounts(s,p,q,'service',false),{amountTtc:120,amountHt:100,vatRate:20,vatExempt:false});
 assert.equal(completionInvoiceAmounts(s,p,q,'service_fee',false).amountTtc,12);
});
test('VAT-exempt visit does not add uncharged VAT',()=>assert.equal(completionInvoiceAmounts(step,pi,bid,'displacement',true).amountHt,75));
for(const [label,s,p,b,type] of [
 ['unpaid',{...step,paid_at:null},pi,bid,'displacement'],
 ['partial',step,{...pi,amount_received:8000},bid,'displacement'],
 ['wrong owner',step,{...pi,metadata:{...pi.metadata,ownerId:'other'}},bid,'displacement'],
 ['foreign bid',step,pi,{...bid,emergency_request_id:'other'},'displacement'],
 ['wrong phase type',step,pi,bid,'service'],
 ['price changed',step,pi,{...bid,travel_cost:30},'displacement'],
 ['uncaptured',step,{...pi,status:'requires_capture'},bid,'displacement'],
])test(`no document for ${label}`,()=>assert.throws(()=>completionInvoiceAmounts(s,p,b,type,false)));
function harness(failedType){
 const calls=[];let marked=false;
 const db={functions:{invoke:async(name,{body})=>{calls.push(body);return body.invoiceType===failedType?{error:Error('offline')}:{data:{ok:true}}}},from:()=>({update:()=>({eq:()=>({throwOnError:async()=>{marked=true}})})})};
 return {db,calls,marked:()=>marked};
}
test('marks documents ready only after all three have succeeded',async()=>{
 const h=harness();await generateCompletionInvoices(h.db,step);
 assert.deepEqual(h.calls.map(c=>c.invoiceType),['displacement','service_fee','commission']);assert.ok(h.marked());
 assert.ok(h.calls.every(c=>c.completionStepId==='s'&&c.stripePaymentIntentId==='pi_visit'));
});
test('partial document failure remains retryable without another card payment',async()=>{
 const h=harness('service_fee');await assert.rejects(generateCompletionInvoices(h.db,step));assert.equal(h.marked(),false);
 const retry=harness();await generateCompletionInvoices(retry.db,step);assert.ok(retry.marked());
});
test('already generated documents and unpaid steps do not invoke generation',async()=>{
 const h=harness();await generateCompletionInvoices(h.db,{...step,invoiced_at:'now'});assert.equal(h.calls.length,0);
 await assert.rejects(generateCompletionInvoices(h.db,{...step,paid_at:null}));assert.equal(h.calls.length,0);
});
test('HT-model visit takes 10 % of the HT price on each side',()=>{
 const s={...step,amount_cents:8125};
 const p={...pi,amount:8125,amount_received:8125,application_fee_amount:1250,metadata:{...pi.metadata,pricingVersion:'ht-v1',serviceCents:'7500',htCents:'6250',feeCents:'625'}};
 const a=t=>completionInvoiceAmounts(s,p,bid,t,false);
 assert.equal(a('displacement').amountTtc,75);
 assert.equal(a('service_fee').amountTtc,6.25);
 assert.equal(a('commission').amountTtc,6.25);
 assert.throws(()=>completionInvoiceAmounts(s,{...p,application_fee_amount:1477},bid,'commission',false));
});
