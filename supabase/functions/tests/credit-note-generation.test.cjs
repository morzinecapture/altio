const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const ts=require('../../../frontend/node_modules/typescript');
const {escapeDocumentText,escapePartyFields}=require('../_shared/document-text.ts');
const id='00000000-0000-4000-8000-000000000001';
const legal={name:'EI Fixture',form:'EI',siren:'123456789',siret:'12345678900012',address:'Adresse',email:'support@example.invalid',rcs:'RNE',capital:'',vat:'',mediatorName:'Fixture',mediatorAddress:'Adresse',mediatorUrl:'https://example.invalid'};
function setup(options={}) {
 let handler;const uploads=new Map();const calls={finalize:0,prepare:0,reads:0};
 const original={id,invoice_type:'service',invoice_number:'ORIGINAL <fixture>',amount_ht:100,amount_ttc:100,vat_rate:0,seller_id:id,buyer_id:id};
 const party={name:'Nom <fixture>',siren:'123456789',billing_address:'Adresse'};
 const job={...(options.partial?{credit_ht:25,credit_ttc:25}:{}),id,invoice_number:'ALTIO-AV-2026-000001',created_at:'2026-10-09T08:00:00Z',reason:'Motif <fixture>',original_invoice:original,document_context:{seller:party,buyer:party,legalEntity:legal}};
 const db={from:table=>{calls.reads++;return {select(){return this},eq(){return this},single:async()=>({data:table==='invoices'?original:options.denied?{is_admin:false}:party,error:null})}},
  rpc:async name=>{if(['prepare_credit_note','prepare_partial_credit_note'].includes(name)){calls.prepare++;return{data:options.existing?{existing:{id}}:job,error:null}}calls.finalize++;return{data:{id},error:options.finalizeError?{message:'offline'}:null}},
  storage:{from:()=>({upload:async(name,bytes)=>{if(options.uploadError===name.split('.').pop())return{error:{message:'offline'}};uploads.set(name,new TextDecoder().decode(bytes));return{error:null}}})},
 };
 const source=fs.readFileSync(path.join(__dirname,'../generate-credit-note/index.ts'),'utf8').replace(/^import .*$/gm,'');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
  exports:{},serve:fn=>handler=fn,Response,TextEncoder,Date,JSON,console,Deno:{env:{get:()=>''}},
  handleCors:()=>null,corsHeaders:{},requireAuthOrServiceKey:async()=>({user:{id},isServiceCall:!options.denied}),createClient:()=>db,
  invoiceDocumentParties:async()=>({seller:party,buyer:party}),requireLegalEntity:()=>legal,escapeDocumentText,escapePartyFields,assertUUID:x=>x,assertString:x=>x,
 });
 return{uploads,calls,run:()=>handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({invoiceId:id,reason:'Request reason',...(options.partial?{targetCents:2500}:{})})}))};
}
test('credit documents use reserved identity, date and reason and escape text without invented VAT numbers',async()=>{
 const h=setup();const r=await h.run();assert.equal(r.status,200,await r.clone().text());assert.equal(h.calls.finalize,1);assert.equal(h.uploads.size,2);
 const html=h.uploads.get('2026/ALTIO-AV-2026-000001.html');const xml=h.uploads.get('2026/ALTIO-AV-2026-000001.xml');
 assert.ok(html.includes('Motif &lt;fixture&gt;'));assert.ok(html.includes('Nom &lt;fixture&gt;'));assert.ok(html.includes('09/10/2026'));
 assert.ok(!xml.includes('FR00000000000'));assert.ok(!html.includes('contact@altio.fr'));assert.ok(!html.includes('Request reason'));
 assert.ok(xml.includes('<ram:ChargeAmount>100.00</ram:ChargeAmount>'));
 assert.ok(xml.includes('<ram:TypeCode>381</ram:TypeCode>'));
});
for(const extension of ['html','xml'])test('failed '+extension+' upload cannot publish or cancel any invoice',async()=>{
 const h=setup({uploadError:extension});assert.equal((await h.run()).status,400);assert.equal(h.calls.finalize,0);
});
test('publication failure is not reported as a successful credit',async()=>{
 const h=setup({finalizeError:true});const response=await h.run();assert.equal(response.status,400);assert.equal((await response.json()).success,undefined);
});
test('an existing credit is returned successfully without replacing its files',async()=>{
 const h=setup({existing:true});assert.equal((await h.run()).status,200);assert.equal(h.calls.finalize,0);assert.equal(h.uploads.size,0);
});
test('ordinary user cannot prepare or publish a credit',async()=>{
 const h=setup({denied:true});assert.equal((await h.run()).status,403);assert.equal(h.calls.prepare,0);assert.equal(h.uploads.size,0);
});

test('partial credit renders reserved delta rather than original full amount',async()=>{const h=setup({partial:true});assert.equal((await h.run()).status,200);const xml=h.uploads.get('2026/ALTIO-AV-2026-000001.xml');assert.ok(xml.includes('<ram:GrandTotalAmount>25.00</ram:GrandTotalAmount>'));assert.ok(!xml.includes('100.00'));});
