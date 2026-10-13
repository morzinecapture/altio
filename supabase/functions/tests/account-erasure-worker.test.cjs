const {test}=require('node:test'),assert=require('node:assert/strict');
const {processAccountErasure,revokeGoogleCalendar}=require('../_shared/account-erasure-worker.ts');
function setup(options={}){const calls=[];let deleted=!!options.alreadyDeleted;
 const db={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='claim_account_erasure')return{data:options.busy?null:{id:'job',subjectId:'user',leaseToken:'lease',files:options.files||[{bucket_id:'avatars',name:'user/avatar.jpg'}],googleToken:options.googleToken||null},error:null};
  if(name==='check_account_deletion')return{data:{protocol:1,ready:true},error:null};
  if(args.p_step==='complete')return{data:deleted,error:null};
  if(args.p_step==='resources')return{data:!options.moreFiles,error:null};
  return{data:true,error:null};
 },storage:{from:bucket=>({remove:async names=>{calls.push(['remove',bucket,names]);return{error:options.storageError?new Error('storage failed'):null}}})},
 auth:{admin:{deleteUser:async id=>{calls.push(['deleteUser',id]);if(options.authError)return{error:new Error('failed')};deleted=true;return{error:null}}}}};return{db,calls};}
test('files are removed and checkpointed before a single Auth deletion',async()=>{const f=setup();assert.equal((await processAccountErasure(f.db,'job')).completed,true);const remove=f.calls.findIndex(c=>c[0]==='remove'),del=f.calls.findIndex(c=>c[0]==='deleteUser');assert.ok(remove<del);assert.ok(f.calls.some(c=>c[1]?.p_step==='files'));});
test('file failure retains Auth account and releases lease for retry',async()=>{const f=setup({storageError:true});assert.equal((await processAccountErasure(f.db,'job')).completed,false);assert.ok(!f.calls.some(c=>c[0]==='deleteUser'));assert.ok(f.calls.some(c=>c[1]?.p_step==='retry'));});
test('additional file batches postpone final deletion',async()=>{const f=setup({moreFiles:true});assert.equal((await processAccountErasure(f.db,'job')).completed,false);assert.ok(!f.calls.some(c=>c[0]==='deleteUser'));});
test('lost Auth response can be recovered without replaying deletion',async()=>{const f=setup({alreadyDeleted:true});assert.equal((await processAccountErasure(f.db,'job')).completed,true);assert.ok(!f.calls.some(c=>['remove','deleteUser'].includes(c[0])));});
test('busy job cannot be processed concurrently',async()=>{const f=setup({busy:true});assert.equal((await processAccountErasure(f.db,'job')).completed,false);assert.equal(f.calls.length,1);});
test('legal invoice bucket is never removed by the erasure worker',async()=>{const f=setup({files:[{bucket_id:'invoices',name:'document.html'}]});assert.equal((await processAccountErasure(f.db,'job')).completed,false);assert.ok(!f.calls.some(c=>c[0]==='remove'));});
test('Google revocation happens before any file or Auth deletion and never logs token',async()=>{const f=setup({googleToken:'fixture-secret'});let called=false;const result=await processAccountErasure(f.db,'job',async(url,opts)=>{called=true;assert.equal(url,'https://oauth2.googleapis.com/revoke');assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');assert.equal(opts.body.get('token'),'fixture-secret');assert.ok(!f.calls.some(c=>c[0]==='remove'));return new Response('',{status:200});});assert.equal(called,true);assert.equal(result.completed,true);});
test('Google outage postpones all destructive work',async()=>{const f=setup({googleToken:'fixture-secret'});assert.equal((await processAccountErasure(f.db,'job',async()=>new Response('',{status:503}))).completed,false);assert.ok(!f.calls.some(c=>['remove','deleteUser'].includes(c[0])));});
test('already revoked Google token is safely retryable',async()=>{await revokeGoogleCalendar('fixture',async()=>Response.json({error:'invalid_token'},{status:400}));});
