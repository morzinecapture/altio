const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE || '../../frontend/node_modules/@electric-sql/pglite');
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key,deleted_at timestamptz);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth,storage to authenticated,service_role;
create table public.records(id int,owner_id uuid);alter table public.records enable row level security;
grant select,insert,update,delete on records to authenticated,service_role;
create policy own_records on records for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create table storage.objects(name text);alter table storage.objects enable row level security;grant all on storage.objects to authenticated,service_role;
create policy files on storage.objects for all to authenticated using(true) with check(true);
insert into records values(1,'${owner}'),(2,'${other}');insert into storage.objects values('fixture');
insert into auth.users values('${owner}',null),('${other}',null);insert into auth.sessions values('${session}','${owner}');
create view public_profiles as select * from records;grant select on public_profiles to authenticated;
create function is_admin() returns boolean language sql stable security definer as $$ select true; $$;
create function get_intervention_property_preview(p_id uuid) returns jsonb language plpgsql security definer as $$ BEGIN RETURN jsonb_build_object('ok',true); END; $$;
create function trigger_fixture() returns trigger language plpgsql security definer as $$ BEGIN RETURN NEW; END; $$;
create trigger fixture before insert on records for each row execute function trigger_fixture();`);
await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261009094637_revoke_deleted_account_access.sql'),'utf8'));return db;}
async function login(db,uid=owner,sid=session){await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)",[uid,JSON.stringify({session_id:sid})]);await db.exec('set role authenticated');}
async function active(db){return (await db.query('select altio_private.has_active_session() active')).rows[0].active;}
test('valid session preserves ownership rules, storage access and privileged RPC behavior',async()=>{const db=await setup();try{
 await login(db);assert.equal(await active(db),true);assert.equal((await db.query('select * from records')).rows.length,1);
 await assert.rejects(db.query('insert into records values(3,$1)',[other]),/row-level security/);
 await db.query('insert into records values(3,$1)',[owner]);assert.equal((await db.query('select * from storage.objects')).rows.length,1);
 assert.equal((await db.query('select is_admin() a')).rows[0].a,true);assert.equal((await db.query('select get_intervention_property_preview($1) p',[owner])).rows[0].p.ok,true);
 assert.equal((await db.query("select has_function_privilege('authenticated','trigger_fixture()','execute') ok")).rows[0].ok,false);
}finally{await db.close();}});
for(const change of ['delete from auth.sessions',`delete from auth.users where id='${owner}'`,`update auth.users set deleted_at=now() where id='${owner}'`])
 test('stale JWT denied for tables, files, directory and privileged RPC: '+change,async()=>{const db=await setup();try{
 await db.exec(change);await login(db);assert.equal(await active(db),false);
 for(const table of ['records','storage.objects','public_profiles'])assert.equal((await db.query('select * from '+table)).rows.length,0,table);
 await assert.rejects(db.query('insert into records values(3,$1)',[owner]),/row-level security/);
 await assert.rejects(db.query("insert into storage.objects values('new')"),/row-level security/);
 assert.equal((await db.query('select is_admin() a')).rows[0].a,null);
 await assert.rejects(db.query('select get_intervention_property_preview($1)',[owner]),/Session inactive/);
 }finally{await db.close();}});
for(const sid of ['',null,'not-a-uuid',other])test('missing or mismatched session fails closed '+sid,async()=>{const db=await setup();try{await login(db,owner,sid);assert.equal(await active(db),false);}finally{await db.close();}});
test('another user cannot borrow a session id',async()=>{const db=await setup();try{await login(db,other,session);assert.equal(await active(db),false);}finally{await db.close();}});
test('trusted backend retains table and RPC access without a user session',async()=>{const db=await setup();try{await db.exec('set role service_role');assert.equal((await db.query('select * from records')).rows.length,2);assert.equal((await db.query('select is_admin() a')).rows[0].a,true);}finally{await db.close();}});
