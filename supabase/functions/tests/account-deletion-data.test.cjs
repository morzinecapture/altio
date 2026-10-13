const {test}=require('node:test');const assert=require('node:assert/strict');
const {assertAccountDeletionReady,deleteAccountAtomically}=require('../_shared/account-deletion-data.ts');
function fixture(data={protocol:1,ready:true},error=null){const calls=[];return {calls,db:{rpc:async(name,args)=>{calls.push(['check',name,args]);return {data,error}},auth:{admin:{deleteUser:async id=>{calls.push(['delete',id]);return {error:null}}}}}};}
for(const data of [null,{}, {protocol:1}, {protocol:2,ready:true},{protocol:1,ready:false}])test('incomplete or blocked readiness never invokes Auth deletion '+JSON.stringify(data),async()=>{
 const f=fixture(data);await assert.rejects(deleteAccountAtomically(f.db,'owner'));assert.equal(f.calls.length,1);
});
test('database check failure preserves account',async()=>{const f=fixture(null,new Error('database failed'));await assert.rejects(deleteAccountAtomically(f.db,'owner'),/conservé/);assert.equal(f.calls.length,1)});
test('only Auth deletion is invoked after a valid check',async()=>{const f=fixture();assert.deepEqual(await deleteAccountAtomically(f.db,'owner'),{success:true});assert.deepEqual(f.calls,[['check','check_account_deletion',{p_user_id:'owner'}],['delete','owner']]);});
test('Auth failure never reports success or exposes database internals',async()=>{const f=fixture();f.db.auth.admin.deleteUser=async()=>({error:new Error('private constraint secret')});await assert.rejects(deleteAccountAtomically(f.db,'owner'),e=>e.message.includes('pas abouti')&&!e.message.includes('secret'));});
test('preparation check alone cannot delete the account',async()=>{const f=fixture();await assertAccountDeletionReady(f.db,'owner');assert.equal(f.calls.length,1);});
