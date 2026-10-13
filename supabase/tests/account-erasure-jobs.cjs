const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('../../frontend/node_modules/@electric-sql/pglite');
const {installSchema,migration}=require('./fixtures/account-schema.cjs');
const user='11111111-1111-4111-8111-111111111111';
async function setup(){const db=new PGlite();await installSchema(db);for(const file of ['20261009093406_atomic_account_deletion_foundation.sql','20261009094637_revoke_deleted_account_access.sql','20261009095059_preserve_invoice_parties_for_account_erasure.sql','20261009095630_erase_closed_account_history.sql','20261009120423_resumable_account_file_erasure.sql'])await migration(db,file);
await db.exec(`insert into auth.users(id) values('${user}');insert into auth.sessions values('${user}','${user}');insert into users(id,email,name,role,picture,google_calendar_refresh_token) values('${user}','fixture@example.invalid','Fixture','owner','avatar','fake-token');insert into storage.objects(owner,name,bucket_id) values('${user}','${user}/avatar.jpg','avatars');`);return db;}
async function rpc(db,name,args=[]){return(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;}
test('combined migrations: resumable erasure freezes access and waits for external resources',async()=>{const db=await setup();try{
assert.equal(await rpc(db,'is_auth_session_active',[user,user]),true);
const job=await rpc(db,'begin_account_erasure',[user]);assert.equal((await rpc(db,'begin_account_erasure',[user])).id,job.id);
assert.equal(await rpc(db,'is_auth_session_active',[user,user]),false);
const lease=await rpc(db,'claim_account_erasure',[job.id]);assert.equal(lease.files.length,1);assert.equal(await rpc(db,'claim_account_erasure',[job.id]),null);
const checkpoint=(step,bucket=null,names=null)=>rpc(db,'checkpoint_account_erasure',[job.id,lease.leaseToken,step,bucket,names]);
assert.equal(await checkpoint('resources'),false);await assert.rejects(db.query('delete from auth.users where id=$1',[user]),/related-data/);
await checkpoint('google');await db.exec('delete from storage.objects');await checkpoint('files','avatars',[`${user}/avatar.jpg`]);assert.equal(await checkpoint('resources'),true);
await db.query('delete from auth.users where id=$1',[user]);assert.equal(await checkpoint('complete'),true);assert.deepEqual(await rpc(db,'pending_account_erasures'),[]);
}finally{await db.close();}});
test('unknown buckets and client access fail closed',async()=>{const db=await setup();try{
await db.exec(`insert into storage.objects(owner,name,bucket_id) values('${user}','financial.xml','invoices')`);
await assert.rejects(rpc(db,'begin_account_erasure',[user]),/related-data/);
await db.exec('set role authenticated');await assert.rejects(rpc(db,'begin_account_erasure',[user]),/permission denied/);
}finally{await db.close();}});
test('leases can be released and retried without giving stale worker write access',async()=>{const db=await setup();try{
const job=await rpc(db,'begin_account_erasure',[user]);const first=await rpc(db,'claim_account_erasure',[job.id]);await rpc(db,'checkpoint_account_erasure',[job.id,first.leaseToken,'retry',null,null]);const second=await rpc(db,'claim_account_erasure',[job.id]);assert.notEqual(second.leaseToken,first.leaseToken);await assert.rejects(rpc(db,'checkpoint_account_erasure',[job.id,first.leaseToken,'google',null,null]),/lease unavailable/);
}finally{await db.close();}});
