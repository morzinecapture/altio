const{test}=require('node:test');const assert=require('node:assert/strict');
const{reconcileFullRefund}=require('../_shared/full-refund-reconciliation.ts');
function fixture(patch={}) {
 const calls={documents:[],marked:0,filters:[]};
 const receipt={charge_id:'ch_fixture',payment_intent_id:'pi_fixture',livemode:false};
 const charge={id:'ch_fixture',payment_intent:'pi_fixture',livemode:false,currency:'eur',amount:11000,amount_refunded:11000,refunded:true,transfer:'tr_fixture',application_fee:'fee_fixture',...patch.charge};
 const transfer={id:'tr_fixture',currency:'eur',livemode:false,amount:11000,amount_reversed:11000,source_transaction:'ch_fixture',...patch.transfer};
 const fee={id:'fee_fixture',currency:'eur',livemode:false,charge:'ch_fixture',amount:2000,amount_refunded:2000,...patch.fee};
 const invoices=patch.invoices||[{id:'service',invoice_type:'service',amount_ttc:100},{id:'fee',invoice_type:'service_fee',amount_ttc:10},{id:'commission',invoice_type:'commission',amount_ttc:10}].map(i=>({...i,stripe_pi_id:'pi_fixture'}));
 const db={from:table=>({select(){return this},update(){calls.marked++;return this},eq(k,v){calls.filters.push([k,v]);return this},neq:async()=>({data:invoices,error:patch.readError}),then(resolve){resolve({error:patch.markError})}}),
 functions:{invoke:async(name,opts)=>{calls.documents.push(opts.body.invoiceId);return{data:{success:!patch.documentFailure},error:null}}}};
 const stripe={charges:{retrieve:async()=>charge},transfers:{retrieve:async()=>transfer},applicationFees:{retrieve:async()=>fee}};
 return{calls,run:()=>reconcileFullRefund(db,stripe,receipt)};
}
test('full refund verifies all financial legs and issues only its three linked credits',async()=>{
 const f=fixture();assert.equal((await f.run()).completed,true);assert.deepEqual(f.calls.documents,['service','fee','commission']);assert.equal(f.calls.marked,1);
 assert.ok(f.calls.filters.some(([k,v])=>k==='stripe_pi_id'&&v==='pi_fixture'));
});
test('partial refund cannot accidentally issue full credits',async()=>{
 const f=fixture({charge:{amount_refunded:1000,refunded:false}});assert.equal((await f.run()).completed,false);assert.equal(f.calls.documents.length,0);assert.equal(f.calls.marked,0);
});
for(const patch of [{charge:{payment_intent:'pi_other'}},{charge:{livemode:true}},{transfer:{amount_reversed:0}},{fee:{amount_refunded:0}},{fee:{charge:'ch_other'}},{invoices:[]},{readError:{message:'offline'}}])test('unconfirmed refund does not issue credits '+JSON.stringify(patch),async()=>{
 const f=fixture(patch);await assert.rejects(f.run());assert.equal(f.calls.documents.length,0);assert.equal(f.calls.marked,0);
});
test('destination fee can refer back to the platform charge through originating_transaction',async()=>{
 const f=fixture({fee:{charge:'py_destination',originating_transaction:'ch_fixture'}});assert.equal((await f.run()).completed,true);
});
test('incomplete credit generation leaves refund pending for retry',async()=>{
 const f=fixture({documentFailure:true});await assert.rejects(f.run(),/incomplète/);assert.equal(f.calls.marked,0);
});
test('failed completion write propagates for retry',async()=>{
 const f=fixture({markError:{message:'offline'}});await assert.rejects(f.run(),/indisponible/);assert.equal(f.calls.documents.length,3);
});
