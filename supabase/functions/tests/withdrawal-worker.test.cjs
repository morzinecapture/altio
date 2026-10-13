const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../../../frontend/node_modules/typescript');
function fixture(options={}){
 let handler,queries=0,sends=0;const marks=[];
 const db={from(){queries++;const q={select(){return q},is(){return q},order(){return q},limit:async()=>options.queryError?{error:{}}:{data:[{id:'fixture',receipt:{email:'test@example.invalid'}}]},update(value){marks.push(value);return q},eq:async()=>({error:options.markError?{}:null})};return q}};
 const source=fs.readFileSync('supabase/functions/process-withdrawal-receipts/index.ts','utf8').replace(/^import .*$/gm,'');
 new Function('Deno','createClient','requireAuthOrServiceKey','sendWithdrawalReceipt',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(
 {serve:fn=>handler=fn,env:{get:name=>name==='COMPLETION_WORKER_KEY'?'internal':options.configured===false?undefined:'fixture'}},()=>db,
 async()=>{if(options.anonymous)throw Error();return{isServiceCall:!!options.service}},async()=>{sends++;if(options.mailError)throw Error()});
 return{run:(suffix='',key)=>handler(new Request('https://fixture.invalid/'+suffix,{method:'POST',headers:key?{'x-service-key':key}:{}})),queries:()=>queries,sends:()=>sends,marks};
}
test('ordinary and anonymous callers cannot deliver receipts',async()=>{for(const options of [{},{anonymous:true}]){const f=fixture(options);assert.ok([401,403].includes((await f.run()).status));assert.equal(f.queries(),0);assert.equal(f.sends(),0)}});
test('configuration probe never sends mail and missing configuration blocks processing',async()=>{const f=fixture({configured:false});assert.equal((await f.run('?check=configuration','internal')).status,503);assert.equal((await f.run('','internal')).status,503);assert.equal(f.queries(),0);assert.equal(f.sends(),0)});
test('internal authenticated worker confirms a delivered and saved receipt',async()=>{const f=fixture();const r=await f.run('','internal');assert.equal(r.status,200);assert.deepEqual(await r.json(),{processed:1,sent:1,pending:0});assert.equal(f.sends(),1);assert.ok(f.marks[0].receipt_sent_at)});
test('failed mail or failed checkpoint cannot report delivery complete',async()=>{for(const options of [{service:true,mailError:true},{service:true,markError:true}]){const f=fixture(options);const r=await f.run();assert.equal(r.status,503);assert.equal((await r.json()).sent,0)}});
test('failed query sends no receipts',async()=>{const f=fixture({service:true,queryError:true});assert.equal((await f.run()).status,503);assert.equal(f.sends(),0)});
