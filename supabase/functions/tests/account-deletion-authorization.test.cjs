const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareAccountDeletion, authorizeAccountDeletion } = require('../_shared/account-deletion-authorization.ts');
const email = { id: 'email-user', identities: [{ provider: 'email' }] };
const apple = { id: 'apple-user', identities: [{ provider: 'apple', identity_data: { sub: 'verified-subject' } }] };
const input = { action: 'delete', confirmation: 'DELETE_MY_ACCOUNT', appleAuthorizationCode: 'fresh-code' };
test('email preparation returns explicit versioned contract and does not require Apple keys', async () => {
 assert.deepEqual(await prepareAccountDeletion(email, () => undefined), { protocol: 1, ready: true, userId: 'email-user', requiresApple: false });
});
test('Apple preparation fails before reauthentication when server keys are missing', async () => {
 await assert.rejects(prepareAccountDeletion(apple, () => undefined), /non configurée/);
});
for (const body of [null, {}, {action:'prepare'}, {...input,confirmation:undefined}, []]) test('no revocation on missing explicit confirmation '+JSON.stringify(body), async () => {
 let calls=0; await assert.rejects(authorizeAccountDeletion(apple,body,()=>undefined,async()=>{calls++})); assert.equal(calls,0);
});
test('server ignores caller identity and revokes only verified Apple subject', async () => {
 let args; await authorizeAccountDeletion(apple,{...input,appleSubject:'attacker',userId:'other'},()=>undefined,async a=>{args=a;return {revoked:true}});
 assert.equal(args.expectedSubject,'verified-subject'); assert.equal(args.authorizationCode,'fresh-code');
});
test('email account never revokes Apple despite user-editable metadata', async () => {
 let calls=0; await authorizeAccountDeletion({...email,user_metadata:{provider:'apple'}},input,()=>undefined,async()=>{calls++}); assert.equal(calls,0);
});
test('failed Apple revocation stops authorization', async () => {
 await assert.rejects(authorizeAccountDeletion(apple,input,()=>undefined,async()=>{throw new Error('Apple failed')}), /Apple failed/);
});
test('missing Apple code stops before revocation', async () => {
 let calls=0; await assert.rejects(authorizeAccountDeletion(apple,{...input,appleAuthorizationCode:undefined},()=>undefined,async()=>{calls++}), /Confirmation Apple/); assert.equal(calls,0);
});
