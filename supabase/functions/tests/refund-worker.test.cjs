const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const ts=require('../../../frontend/node_modules/typescript');
function setup(options={}) {
 let handler;let reads=0;let processed=0;let updates=0;
 const db={from:()=>{reads++;return{select(){return this},eq(){return this},order(){return this},limit:async()=>({data:options.receipts||[],error:options.readError}),update(){updates++;return this},then:resolve=>resolve({error:null})}}};
 const source=fs.readFileSync(path.join(__dirname,'../process-refund-events/index.ts'),'utf8').replace(/^import .*$/gm,'');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
  exports:{},Deno:{serve:fn=>handler=fn,env:{get:k=>k==='COMPLETION_WORKER_KEY'?'fixture-worker':'configured'}},Response,URL,Date,JSON,Set,console,
  handleCors:()=>null,corsHeaders:{},requireAuthOrServiceKey:async req=>{if(req.headers.get('Authorization')!=='Bearer fixture-user')throw new Error('denied');return{isServiceCall:false}},
  createClient:()=>db,connectStripe:{},reconcileProportionalRefund:async()=>{processed++;if(options.failure)throw new Error('private details');return{completed:true}},
 });
 return{counts:()=>({reads,processed,updates}),run:(headers={},suffix='')=>handler(new Request('https://fixture.invalid'+suffix,{method:'POST',headers}))};
}
test('refund worker denies anonymous and signed-in ordinary callers before DB access',async()=>{
 const h=setup();assert.equal((await h.run()).status,401);assert.equal((await h.run({Authorization:'Bearer fixture-user'})).status,403);assert.equal(h.counts().reads,0);
});
test('refund worker configuration check performs no business writes',async()=>{
 const h=setup();assert.equal((await h.run({'x-service-key':'fixture-worker'},'?check=configuration')).status,200);assert.equal(h.counts().reads,0);
});
test('empty refund queue succeeds without Stripe or document calls',async()=>{
 const h=setup();assert.equal((await h.run({'x-service-key':'fixture-worker'})).status,200);assert.equal(h.counts().processed,0);
});
test('two receipts for the same charge are reconciled once per batch',async()=>{
 const h=setup({receipts:[{charge_id:'ch_fixture'},{charge_id:'ch_fixture'}]});assert.equal((await h.run({'x-service-key':'fixture-worker'})).status,200);assert.equal(h.counts().processed,1);
});
test('failed reconciliation remains pending and does not expose upstream details',async()=>{
 const h=setup({receipts:[{charge_id:'ch_fixture'}],failure:true});const r=await h.run({'x-service-key':'fixture-worker'});assert.equal(r.status,503);assert.equal((await r.json()).pending,1);assert.equal(h.counts().updates,2);
});
