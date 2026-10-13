const {test}=require('node:test'),assert=require('node:assert/strict');
const {requireActiveSession}=require('../_shared/active-session.ts');
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const token=(claims={sub:uid,session_id:sid})=>'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
test('verified user session is checked against Auth data, not editable metadata',async()=>{
 let seen;await requireActiveSession({rpc:async(...args)=>{seen=args;return{data:true,error:null}}},uid,token());
 assert.deepEqual(seen,['is_auth_session_active',{p_user_id:uid,p_session_id:sid}]);
});
for(const data of [false,null,{},'true'])test('inactive or malformed session result is denied '+JSON.stringify(data),async()=>{
 await assert.rejects(requireActiveSession({rpc:async()=>({data,error:null})},uid,token()),/Session inactive/);
});
test('database outage fails closed',async()=>{await assert.rejects(requireActiveSession({rpc:async()=>({data:true,error:new Error('private')})},uid,token()),/Session inactive/)});
for(const jwt of ['invalid','a.bad!.b',token({sub:uid}),token({sub:'other',session_id:sid}),token({sub:uid,session_id:'bad'}),token({sub:uid,user_metadata:{session_id:sid}})])test('invalid verified-token claims cannot reach privileged RPC '+jwt.slice(0,15),async()=>{
 let calls=0;await assert.rejects(requireActiveSession({rpc:async()=>{calls++;return{data:true,error:null}}},uid,jwt),/Session inactive/);assert.equal(calls,0);
});
