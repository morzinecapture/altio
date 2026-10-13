const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require('../../../frontend/node_modules/typescript');
const {completionInvoiceAmounts}=require('../_shared/completion-invoices.ts');
const {assertConnectIntent}=require('../_shared/connect-split.ts');
const {escapeDocumentText,escapePartyFields}=require('../_shared/document-text.ts');
const {getFrenchServiceLabel}=require('../_shared/serviceLabels.ts');
const {missionInvoiceAmounts}=require('../_shared/mission-invoice-amounts.ts');
const {requireLegalEntity}=require('../_shared/legal-entity.ts');
const {HT_PRICING_VERSION,htPricing}=require('../_shared/billing.ts');

async function generate(phase,type,options={}) {
 let handler;const documents=new Map();const inserts=[];
 const step={id:'step-'+phase,phase,emergency_id:'emergency',owner_id:'owner',provider_id:'provider',payment_intent_id:'pi_'+phase,amount_cents:phase==='visit'?8250:13200,paid_at:'2026-10-08',declared_at:'2026-10-08'};
 const provider={id:'provider',name:'Prestataire <test>',siren:'111111111',siret:'11111111100011',billing_address:'Adresse de test',is_vat_exempt:false,mandate_accepted_at:'2026-10-01'};
 const source={id:'emergency',owner_id:'owner',accepted_provider_id:'provider',status:phase==='visit'?'on_site':'completed',service_type:'plumbing',displacement_fee:25,diagnostic_fee:50,owner:{id:'owner',name:'Propriétaire test'},provider,property:{name:'Logement test',address:'Adresse test'}};
 const order={id:phase==='visit'?'bid':'quote',emergency_request_id:'emergency',provider_id:'provider',travel_cost:25,diagnostic_cost:50,repair_cost:100,tva_rate:0.20,is_vat_exempt:false};
 const payment={id:step.payment_intent_id,status:'succeeded',currency:'eur',amount:step.amount_cents,amount_received:step.amount_cents,application_fee_amount:Math.round(step.amount_cents*2/11),transfer_data:{destination:'acct_test'},metadata:{emergencyId:'emergency',ownerId:'owner',completionFlow:'v1',[phase==='visit'?'bidId':'quoteId']:order.id}};
 if(options.classic){
  Object.assign(source,{id:'mission',status:'paid',fixed_rate:options.quoted?999:100.55,assigned_provider_id:'provider',stripe_payment_intent_id:'pi_mission'});
  Object.assign(payment,{id:'pi_mission',amount:options.quoted?13200:11061,amount_received:options.quoted?13200:11061,application_fee_amount:options.quoted?2400:2011,metadata:{missionId:'mission',ownerId:'owner',...(options.quoted?{quoteId:'quote'}:{pricingVersion:'cents-v1'})}});
  Object.assign(order,{id:'quote',mission_id:'mission',status:'accepted',repair_cost:100,tva_rate:0.2,is_vat_exempt:false});
 }
 class Stripe {static createFetchHttpClient(){return {}};paymentIntents={retrieve:async()=>payment}}
 const db={
  from(table){let payload;return {select(){return this},eq(){return this},is(){return this},insert(value){payload=value;return this},limit:async()=>({data:[]}),
   single:async()=>({data:table==='emergency_requests'||table==='missions'?source:table==='emergency_completion_steps'?step:table==='provider_profiles'?{stripe_account_id:'acct_test'}:table==='emergency_bids'||table==='mission_quotes'?order:table==='invoices'?(inserts.push(payload),{id:'invoice',...payload}):null}),
  }},
  rpc:(name,args)=>name==='insert_invoice_with_parties'?(inserts.push(args.p_invoice),Promise.resolve({data:{id:'invoice',...args.p_invoice},error:null})):({single:async()=>({data:1})}),
  storage:{from:()=>({upload:async(name,bytes)=>{if(options.storageError)return {error:{message:'offline'}};documents.set(name,new TextDecoder().decode(bytes));return {error:null}}})},
 };
 const code=fs.readFileSync(path.join(__dirname,'../generate-invoice/index.ts'),'utf8').replace(/^import .*$/gm,'');
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
  serve:fn=>handler=fn,Response,TextEncoder,console,Stripe,createClient:()=>db,
  Deno:{env:{get:key=>options.env ? options.env[key] : 'local-test-only'}},handleCors:()=>null,corsHeaders:{},
  requireAuthOrServiceKey:async()=>({user:{id:options.user||'owner'},isServiceCall:false}),assertUUID:x=>x,assertOptionalString:x=>x,assertOneOf:x=>x,ValidationError:class extends Error{},
  completionInvoiceAmounts,assertConnectIntent,HT_PRICING_VERSION,htPricing,escapeDocumentText,escapePartyFields,getFrenchServiceLabel,missionInvoiceAmounts,
  requireLegalEntity:options.env ? requireLegalEntity : ()=>({name:'Exploitant TEST',form:'TEST',siren:'000000000',siret:'00000000000000',address:'TEST',email:'test@example.invalid',rcs:'TEST',capital:'',vatExempt:false,vat:'TEST',mediatorName:'TEST',mediatorAddress:'TEST',mediatorUrl:'https://example.invalid'}),
 });
 const response=await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify(options.classic?{missionId:'mission',invoiceType:type,stripePaymentIntentId:'pi_mission'}:{emergencyId:'emergency',completionStepId:step.id,invoiceType:type,stripePaymentIntentId:step.payment_intent_id})}));
 return {response,body:await response.json(),documents,inserts};
}
for(const [phase,type,total,buyer,seller] of [
 ['visit','displacement',75,'owner','provider'],['visit','service_fee',7.5,'owner',null],['visit','commission',7.5,'provider',null],
 ['repair','service',120,'owner','provider'],['repair','service_fee',12,'owner',null],['repair','commission',12,'provider',null],
])test(`${phase} ${type}: actual handler creates French documents for the correct participant`,async()=>{
 const r=await generate(phase,type);assert.equal(r.response.status,200,JSON.stringify(r.body));assert.equal(r.inserts.length,1);
 const i=r.inserts[0];assert.equal(i.amount_ttc,total);assert.equal(i.buyer_id,buyer);assert.equal(i.seller_id,seller);assert.equal(i.completion_step_id,'step-'+phase);assert.equal(i.stripe_pi_id,'pi_'+phase);
 assert.equal(r.documents.size,2);
 const html=[...r.documents.entries()].find(([name])=>name.endsWith('.html'))[1];
 assert.ok(html.includes('Facture'));assert.ok(!html.includes('plumbing'));assert.ok(!html.includes('Prestataire <test>'));
 assert.ok([...r.documents.keys()].every(name=>!name.startsWith('http')));
});
test('storage failure cannot leave an invoice pointing at a missing document',async()=>{
 const r=await generate('visit','displacement',{storageError:true});assert.equal(r.response.status,400);assert.equal(r.inserts.length,0);
});
test('foreign caller cannot create or read another participant invoice',async()=>{
 const r=await generate('visit','displacement',{user:'stranger'});assert.equal(r.response.status,403);assert.equal(r.documents.size,0);
});

test('franchise operator without mediator issues fee documents without invented mediation or VAT', async () => {
 const env={ALTIO_COMPANY_NAME:'Exploitant TEST',ALTIO_COMPANY_FORM:'EI',ALTIO_SIREN:'123456789',ALTIO_SIRET:'12345678900012',ALTIO_ADDRESS:'Adresse TEST',ALTIO_EMAIL:'test@example.invalid',ALTIO_RCS:'RNE TEST',ALTIO_VAT_REGIME:'franchise'};
 for (const type of ['service_fee','commission']) {
  const r=await generate('visit',type,{env});
  assert.equal(r.response.status,200,JSON.stringify(r.body));
  const invoice=r.inserts[0];assert.equal(invoice.amount_ht,7.5);assert.equal(invoice.amount_ttc,7.5);assert.equal(invoice.vat_rate,0);
  const html=[...r.documents.entries()].find(([name])=>name.endsWith('.html'))[1];
  assert.ok(!html.includes('Médiateur Altio'));assert.ok(html.includes('TVA non applicable'));assert.ok(html.includes('test@example.invalid'));
 }
 const failed=await generate('visit','service_fee',{env:{...env,ALTIO_SIREN:undefined}});
 assert.equal(failed.response.status,400);assert.equal(failed.documents.size,0);
});

test('classic mission invoices reconcile the actual cent-precise charge',async()=>{const r=await generate('repair','service_fee',{classic:true});assert.equal(r.response.status,200,JSON.stringify(r.body));assert.equal(r.inserts[0].amount_ttc,10.06);});
test('accepted mission quote overrides an obsolete fixed rate and retains quote VAT',async()=>{const r=await generate('repair','service',{classic:true,quoted:true});assert.equal(r.response.status,200,JSON.stringify(r.body));assert.equal(r.inserts[0].amount_ttc,120);assert.equal(r.inserts[0].amount_ht,100);});
