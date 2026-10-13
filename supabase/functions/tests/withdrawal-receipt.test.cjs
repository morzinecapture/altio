const {test}=require('node:test'),assert=require('node:assert/strict');const {sendWithdrawalReceipt,withdrawalReceiptHtml}=require('../_shared/withdrawal-receipt.ts');
const row={id:'fixture',receipt:{reference:'fixture',name:'<script>name</script>',email:'fixture@example.invalid',submittedAt:'2026-10-09T12:00:00Z',declaration:'Je me rétracte. <img src=x>',notice:'Demande reçue.'}};
test('durable receipt includes original declaration, timestamp and escaped content',()=>{const html=withdrawalReceiptHtml(row.receipt);assert.ok(html.includes('2026-10-09T12:00:00Z'));assert.ok(html.includes('Je me rétracte. &lt;img'));assert.ok(!html.includes('<script>'))});
test('delivery uses fixed endpoint, confirmed recipient and stable idempotency key',async()=>{await sendWithdrawalReceipt(row,key=>key==='RESEND_API_KEY'?'test-key':'Altio <noreply@example.invalid>',async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],'withdrawal:fixture');assert.deepEqual(JSON.parse(options.body).to,['fixture@example.invalid']);return Response.json({id:'email-fixture'})})});
test('missing mail configuration does not send or claim delivery',async()=>{let calls=0;await assert.rejects(sendWithdrawalReceipt(row,()=>undefined,async()=>{calls++;return Response.json({id:'email'})}));assert.equal(calls,0)});
test('mail error remains retryable and is never reported as delivered',async()=>{await assert.rejects(sendWithdrawalReceipt(row,()=> 'fixture',async()=>new Response(null,{status:503})));await assert.rejects(sendWithdrawalReceipt(row,()=> 'fixture',async()=>Response.json({})));});

test('existing Brevo service uses verified recipient and does not claim unconfirmed sends',async()=>{
 const env=k=>k==='BREVO_API_KEY'?'brevo-fixture':undefined;
 await sendWithdrawalReceipt(row,env,async(url,options)=>{assert.equal(url,'https://api.brevo.com/v3/smtp/email');const body=JSON.parse(options.body);assert.deepEqual(body.to,[{email:row.receipt.email}]);assert.equal(body.headers.idempotencyKey,row.id);return Response.json({messageId:'confirmed'})});
 await assert.rejects(sendWithdrawalReceipt(row,env,async()=>Response.json({})));
 await assert.rejects(sendWithdrawalReceipt(row,env,async()=>new Response(null,{status:401})));
});
