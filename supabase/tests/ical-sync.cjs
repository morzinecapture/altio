const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'../../frontend/node_modules/@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261009073545_restore_secure_ical_sync.sql'),'utf8');
const owner='00000000-0000-4000-8000-000000000001',p1='00000000-0000-4000-8000-000000000002',p2='00000000-0000-4000-8000-000000000003';
const event={uid:'same-vendor-uid',summary:'Fixture',dtstart:'2026-10-09',dtend:'2026-10-12'};
async function setup(){const db=new PGlite();await db.exec(`
CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE TABLE public.properties(id uuid PRIMARY KEY,owner_id uuid,ical_airbnb_url text,ical_booking_url text,ical_url text);
CREATE TABLE public.reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid NOT NULL REFERENCES public.properties,owner_id uuid NOT NULL,source text,ical_uid text,external_id text,guest_name text,check_in timestamptz NOT NULL,check_out timestamptz NOT NULL,UNIQUE(property_id,ical_uid));
CREATE UNIQUE INDEX reservations_external_id_idx ON public.reservations(external_id) WHERE external_id IS NOT NULL;
CREATE TABLE inserted_reservations(id uuid);
CREATE FUNCTION track_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.inserted_reservations VALUES(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER track_insert AFTER INSERT ON public.reservations FOR EACH ROW EXECUTE FUNCTION track_insert();
CREATE SCHEMA vault;CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES('project_url','https://fixture.supabase.co'),('completion_worker_key','fixture-worker');
CREATE SCHEMA net;CREATE TABLE net.requests(url text,headers jsonb,body jsonb);
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO net.requests VALUES($1,$2,$3); RETURN 42; END $$;
CREATE SCHEMA cron;CREATE TABLE cron.job(jobname text,schedule text,command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cron.job VALUES($1,$2,$3); RETURN 1; END $$;
`);await db.query('INSERT INTO properties(id,owner_id) VALUES($1,$3),($2,$3)',[p1,p2,owner]);await db.exec(migration);return db;}
const sync=(db,property,source,events)=>db.query('SELECT sync_ical_reservations($1,$2,$3) AS result',[property,source,JSON.stringify(events)]);
test('atomic iCal import is scoped to property and source; retries do not recreate reservations',async()=>{const db=await setup();try{
assert.deepEqual((await sync(db,p1,'airbnb',[event])).rows[0].result,{inserted:1,updated:0});
assert.deepEqual((await sync(db,p1,'airbnb',[event])).rows[0].result,{inserted:0,updated:0});
await sync(db,p2,'airbnb',[event]);await sync(db,p1,'booking',[event]);
assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n,3);
assert.equal((await db.query('SELECT count(*)::int AS n FROM inserted_reservations')).rows[0].n,3);
assert.deepEqual((await sync(db,p1,'airbnb',[{...event,dtend:'2026-10-13'}])).rows[0].result,{inserted:0,updated:1});
const rows=(await db.query('SELECT owner_id,external_id FROM reservations')).rows;
assert.ok(rows.every(x=>x.owner_id===owner&&x.external_id===null));
await assert.rejects(sync(db,p1,'airbnb',[{...event,uid:'new'}, {...event,uid:'invalid',dtend:'2026-01-01'}]));
assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n,3);
await db.exec('SET ROLE authenticated');await assert.rejects(sync(db,p1,'airbnb',[]),/permission denied/);
}finally{await db.close();}});
test('legacy imports are adopted without deleting or duplicating their existing row',async()=>{const db=await setup();try{
await db.query("INSERT INTO reservations(property_id,owner_id,source,external_id,guest_name,check_in,check_out) VALUES($1,$2,'airbnb',$3,'Fixture','2026-10-09','2026-10-12')",[p1,owner,event.uid]);
const original=(await db.query('SELECT id FROM reservations')).rows[0].id;
assert.deepEqual((await sync(db,p1,'airbnb',[event])).rows[0].result,{inserted:0,updated:1});
assert.equal((await db.query('SELECT id FROM reservations')).rows[0].id,original);
await sync(db,p2,'airbnb',[event]);assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n,2);
}finally{await db.close();}});
test('cron uses Vault and net.http_post, and supports a non-mutating health check',async()=>{const db=await setup();try{
await db.exec('SELECT dispatch_ical_sync(true)');
const req=(await db.query('SELECT * FROM net.requests')).rows[0];assert.match(req.url,/check=configuration$/);assert.deepEqual(req.body,{});assert.equal(req.headers['x-service-key'],'fixture-worker');
await db.exec('DELETE FROM net.requests; SELECT dispatch_ical_sync()');assert.equal((await db.query('SELECT * FROM net.requests')).rows.length,0);
await db.query("UPDATE properties SET ical_airbnb_url='https://www.airbnb.fr/calendar/ical/fixture' WHERE id=$1",[p1]);await db.exec('SELECT dispatch_ical_sync()');
assert.deepEqual((await db.query('SELECT body FROM net.requests')).rows[0].body,{property_id:p1});
assert.equal((await db.query('SELECT command FROM cron.job')).rows[0].command,'select public.dispatch_ical_sync()');
await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT dispatch_ical_sync(true)'),/permission denied/);
}finally{await db.close();}});
