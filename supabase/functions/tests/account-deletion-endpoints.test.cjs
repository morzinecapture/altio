const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../../frontend/node_modules/typescript');
const { assertAccountDeletionReady, deleteAccountAtomically } = require('../_shared/account-deletion-data.ts');
const { authorizeAccountDeletion, prepareAccountDeletion } = require('../_shared/account-deletion-authorization.ts');
function endpoint(name, user) {
 let handler; const calls=[];
 const db={rpc:async()=>({data:{protocol:1,ready:true},error:null}),auth:{getUser:async()=>({data:{user},error:user?null:new Error('expired')})},from:()=>{calls.push('database mutation');throw new Error('Unexpected data access')},storage:{from:()=>{calls.push('storage mutation');throw new Error('Unexpected storage access')}}};
 const source=fs.readFileSync(path.join(__dirname,'..',name,'index.ts'),'utf8').replace(/^import .*\n/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 new Function('serve','Deno','createClient','corsHeaders','handleCors','checkRateLimit','authorizeAccountDeletion','prepareAccountDeletion','assertAccountDeletionReady','deleteAccountAtomically','requireActiveSession','processAccountErasure',js)(
  fn=>{handler=fn},{serve:fn=>{handler=fn},env:{get:()=>undefined}},()=>db,{},()=>null,async()=>{},authorizeAccountDeletion,prepareAccountDeletion,assertAccountDeletionReady,deleteAccountAtomically,async()=>{},async()=>({completed:true}));
 return {request:body=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)})),handler,calls};
}
const email={id:'fixture',identities:[{provider:'email'}]};
test('preparation endpoint is read-only and supplies the protocol contract',async()=>{
 const e=endpoint('prepare-account-deletion',email);const r=await e.request({action:'prepare'});
 assert.equal(r.status,200);assert.equal((await r.json()).ready,true);assert.deepEqual(e.calls,[]);
});
test('preparation refuses missing Apple setup without touching data',async()=>{
 const e=endpoint('prepare-account-deletion',{id:'fixture',identities:[{provider:'apple',identity_data:{sub:'subject'}}]});
 assert.equal((await e.request({action:'prepare'})).status,503);assert.deepEqual(e.calls,[]);
});
test('expired session cannot prepare deletion',async()=>{
 const e=endpoint('prepare-account-deletion',null);assert.equal((await e.request({action:'prepare'})).status,401);assert.deepEqual(e.calls,[]);
});
for(const body of [{action:'prepare'},null,{action:'delete'},{action:'delete',confirmation:'incorrect'}])test('deletion endpoint refuses unconfirmed requests before data access '+JSON.stringify(body),async()=>{
 const e=endpoint('delete-account',email);assert.equal((await e.request(body)).status,400);assert.deepEqual(e.calls,[]);
});
test('deletion endpoint refuses Apple account without fresh code before data access',async()=>{
 const e=endpoint('delete-account',{id:'fixture',identities:[{provider:'apple',identity_data:{sub:'subject'}}]});
 assert.equal((await e.request({action:'delete',confirmation:'DELETE_MY_ACCOUNT'})).status,400);assert.deepEqual(e.calls,[]);
});
for(const name of ['delete-account','prepare-account-deletion'])test(name+' rejects GET before any action',async()=>{
 const e=endpoint(name,email);assert.equal((await e.handler(new Request('https://fixture.invalid'))).status,405);assert.deepEqual(e.calls,[]);
});
