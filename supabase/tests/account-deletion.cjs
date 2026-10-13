const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE || '../../frontend/node_modules/@electric-sql/pglite');
const id='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
async function setup(){const db=new PGlite();await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;create schema storage;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
create table auth.identities(user_id uuid references auth.users on delete cascade);
create table public.users(id uuid primary key constraint users_id_fkey references auth.users, email text, picture text, google_calendar_token text, google_calendar_refresh_token text);
create table provider_profiles(provider_id uuid primary key references public.users on delete cascade,stripe_account_id text,rc_pro_doc_url text,decennale_doc_url text);
create table notifications(user_id uuid references auth.users on delete cascade);
create table push_tokens(user_id uuid references public.users on delete cascade);
create table rate_limit_log(user_id uuid);
create table provider_schedule(provider_id uuid references public.users on delete cascade);
create table favorite_providers(owner_id uuid references public.users on delete cascade,provider_id uuid references public.users on delete cascade);
create table blocked_users(blocker_id uuid references auth.users on delete cascade,blocked_id uuid references auth.users on delete cascade);
create table invoices(id uuid primary key,buyer_id uuid references public.users on delete set null,amount numeric);
create table auth_linked_history(user_id uuid references auth.users on delete cascade);
create table storage.objects(owner uuid,owner_id text,name text);
insert into auth.users values('${id}'),('${other}');
insert into public.users(id,email) values('${id}','fixture@example.invalid'),('${other}','other@example.invalid');
insert into auth.sessions values('${id}','${id}'),('${other}','${other}');
insert into auth.identities values('${id}'),('${other}');
insert into provider_profiles(provider_id) values('${id}');
insert into notifications values('${id}'),('${other}');
insert into push_tokens values('${id}');insert into rate_limit_log values('${id}');
insert into provider_schedule values('${id}');insert into favorite_providers values('${other}','${id}');
insert into blocked_users values('${id}','${other}');
`);await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261009093406_atomic_account_deletion_foundation.sql'),'utf8'));return db;}
async function ready(db){return(await db.query('select public.check_account_deletion($1) value',[id])).rows[0].value;}
async function count(db,table){return(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;}
async function remove(db){return db.query('delete from auth.users where id=$1',[id]);}
test('Auth, profile, identities, sessions and simple data delete in one transaction; other account remains',async()=>{const db=await setup();try{
 assert.equal((await ready(db)).ready,true);await remove(db);
 for(const t of ['auth.users','users','auth.sessions','auth.identities','notifications']) assert.equal(await count(db,t),1,t);
 for(const t of ['provider_profiles','push_tokens','rate_limit_log','provider_schedule','favorite_providers','blocked_users']) assert.equal(await count(db,t),0,t);
 assert.equal((await db.query('select email from users')).rows[0].email,'other@example.invalid');
 await remove(db);assert.equal(await count(db,'users'),1);
}finally{await db.close();}});
test('financial history blocks deletion, preserving invoices and all account data',async()=>{const db=await setup();try{
 await db.query('insert into invoices values($1,$1,120)',[id]);assert.equal((await ready(db)).ready,false);
 await assert.rejects(remove(db),/related-data/);assert.equal(await count(db,'auth.users'),2);assert.equal(await count(db,'notifications'),2);
 assert.equal((await db.query('select buyer_id,amount from invoices')).rows[0].buyer_id,id);
}finally{await db.close();}});
test('Auth-linked history is checked before any Auth cascade can remove it',async()=>{const db=await setup();try{
 await db.query('insert into auth_linked_history values($1)',[id]);await assert.rejects(remove(db),/related-data/);
 assert.equal(await count(db,'auth_linked_history'),1);assert.equal(await count(db,'auth.sessions'),2);
}finally{await db.close();}});
test('late cleanup failure rolls back profile, Auth, sessions and earlier cleanup; retry succeeds',async()=>{const db=await setup();try{
 await db.exec(`create function fail_cleanup() returns trigger language plpgsql as $$ begin raise exception 'fixture failure'; end $$;
 create trigger fail_cleanup before delete on provider_profiles for each row execute function fail_cleanup();`);
 await assert.rejects(remove(db),/fixture failure/);
 for(const t of ['auth.users','users','auth.sessions','auth.identities','notifications']) assert.equal(await count(db,t),2,t);
 assert.equal(await count(db,'rate_limit_log'),1);assert.equal(await count(db,'favorite_providers'),1);
 await db.exec('drop trigger fail_cleanup on provider_profiles');await remove(db);assert.equal(await count(db,'users'),1);
}finally{await db.close();}});
test('direct public profile deletion is rejected without affecting Auth',async()=>{const db=await setup();try{
 await assert.rejects(db.query('delete from public.users where id=$1',[id]),/authentication account/);assert.equal(await count(db,'users'),2);
}finally{await db.close();}});
for(const stmt of ["insert into storage.objects(owner,name) values($1,'photo.jpg')","insert into storage.objects(owner_id,name) values($1::text,'photo.jpg')","insert into storage.objects(name) values($1::text || '/nested/photo.jpg')","update provider_profiles set stripe_account_id='acct_fixture' where provider_id=$1","update users set picture='https://fixture.invalid/photo' where id=$1","update users set google_calendar_refresh_token='fixture' where id=$1"])
 test('external data prevents deletion: '+stmt,async()=>{const db=await setup();try{await db.query(stmt,[id]);assert.equal((await ready(db)).ready,false);await assert.rejects(remove(db),/related-data/);assert.equal(await count(db,'auth.users'),2);}finally{await db.close();}});
test('a relationship created after preparation is caught by the transaction guard',async()=>{const db=await setup();try{
 assert.equal((await ready(db)).ready,true);await db.exec('create table new_business_table(account uuid)');await db.query('insert into new_business_table values($1)',[id]);
 await assert.rejects(remove(db),/related-data/);assert.equal(await count(db,'auth.users'),2);
}finally{await db.close();}});
test('anonymous and signed-in clients cannot call privileged readiness or trigger helpers',async()=>{const db=await setup();try{
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(ready(db),/permission denied/);await assert.rejects(db.query('select altio_private.account_deletion_blockers($1)',[id]),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');assert.equal((await ready(db)).ready,true);
}finally{await db.close();}});
test('missing profile fails preparation instead of claiming the account is ready',async()=>{const db=await setup();try{
 const orphan='33333333-3333-4333-8333-333333333333';await db.query('insert into auth.users values($1)',[orphan]);
 const r=(await db.query('select public.check_account_deletion($1) value',[orphan])).rows[0].value;assert.equal(r.ready,false);assert.deepEqual(r.blockers,['profile_missing']);
 await assert.rejects(db.query('delete from auth.users where id=$1',[orphan]),/profile requires/);
}finally{await db.close();}});
