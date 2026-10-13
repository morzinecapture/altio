const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('../../../frontend/node_modules/typescript');
function load(file, dependencies = {}) {
 const context = { exports: {}, crypto: require('node:crypto').webcrypto, ...dependencies };
 const source=fs.readFileSync(path.join(__dirname,'../_shared',file),'utf8').replace(/^import .*$/gm,'');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return context.exports;
}
const { expectedApplicationFee }=load('billing.ts');
const { assertConnectIntent }=load('connect-split.ts',{expectedApplicationFee});
const { checkCompletionPayment, processCompletion }=load('completion-payment.ts',{assertConnectIntent});
const step={id:'step',emergency_id:'emergency',phase:'visit',owner_id:'owner',provider_id:'provider',payment_intent_id:'pi_test',amount_cents:11000,claim_token:'claim'};
const intent={id:'pi_test',amount:11000,amount_capturable:11000,currency:'eur',status:'requires_capture',metadata:{emergencyId:'emergency',ownerId:'owner',bidId:'bid',completionFlow:'v1'},application_fee_amount:2000,transfer_data:{destination:'acct_test'}};
test('capture only a matching authorized phase',()=>assert.equal(checkCompletionPayment(step,intent,'acct_test'),'capture'));
for(const [name,change] of Object.entries({currency:{currency:'usd'},amount:{amount:9000},foreign:{metadata:{...intent.metadata,ownerId:'foreign'}},legacy:{metadata:{...intent.metadata,completionFlow:undefined}},wrongPhase:{metadata:{...intent.metadata,bidId:undefined,quoteId:'quote'}},fee:{application_fee_amount:2200}})) {
 test(`phase payment rejects ${name}`,()=>assert.throws(()=>checkCompletionPayment(step,{...intent,...change},'acct_test')));
}
test('expired and canceled authorizations never become paid',()=>{
 assert.equal(checkCompletionPayment(step,{...intent,latest_charge:{payment_method_details:{card:{capture_before:100}}}},'acct_test',100000),'payment_required');
 assert.equal(checkCompletionPayment(step,{...intent,status:'canceled'},'acct_test'),'payment_required');
 assert.throws(()=>checkCompletionPayment(step,{...intent,status:'succeeded',amount_received:1},'acct_test'));
});
function harness(options={}) {
 let captured=0,settled=0,retrieved=0,key;
 const query={select(){return this},eq(){return this},is(){return this},update(){return this},throwOnError:async()=>{},single:async()=>({data:{stripe_account_id:'acct_test',status:'processing',claim_token:'claim',disputed_at:options.disputed?'now':null}})};
 const db={from:()=>query,rpc:async(name)=>{
   if(name==='claim_emergency_completion')return {data:options.claimed===false?[]:[step]};
   if(name==='settle_emergency_completion')settled++;
   return {data:null};
 }};
 const paid={...intent,status:'succeeded',amount_received:11000};
 const stripe={paymentIntents:{retrieve:async()=>{retrieved++;return options.paid?paid:options.expired?{...intent,status:'canceled'}:intent},capture:async(id,args,opts)=>{captured++;key=opts.idempotencyKey;if(options.networkError)throw Error('network');return paid}}};
 return {db,stripe,counts:()=>({captured,settled,retrieved,key})};
}
test('no claim means no Stripe calls',async()=>{const h=harness({claimed:false});await processCompletion(h.db,h.stripe,'step');assert.equal(h.counts().retrieved,0)});
test('dispute observed before capture prevents debit',async()=>{const h=harness({disputed:true});await processCompletion(h.db,h.stripe,'step');assert.equal(h.counts().captured,0);assert.equal(h.counts().settled,0)});
test('successful capture uses stable idempotency and then settles',async()=>{const h=harness();await processCompletion(h.db,h.stripe,'step');assert.equal(h.counts().captured,1);assert.equal(h.counts().settled,1);assert.equal(h.counts().key,'completion-v1:step:pi_test')});
test('retry after Stripe success only reconciles the database',async()=>{const h=harness({paid:true});await processCompletion(h.db,h.stripe,'step');assert.equal(h.counts().captured,0);assert.equal(h.counts().settled,1)});
test('network uncertainty never marks an invoice or phase paid',async()=>{const h=harness({networkError:true});await assert.rejects(processCompletion(h.db,h.stripe,'step'));assert.equal(h.counts().settled,0)});
test('expired authorization is reported without capture or settlement',async()=>{const h=harness({expired:true});const result=await processCompletion(h.db,h.stripe,'step');assert.equal(result.status,'payment_required');assert.equal(h.counts().captured,0);assert.equal(h.counts().settled,0)});
