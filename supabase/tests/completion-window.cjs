// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite node --test supabase/tests/completion-window.cjs
// Real PostgreSQL in memory; external cron, HTTP and push delivery are stubbed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
test('refused repairs close only after an undisputed paid diagnostic', async () => {
 const db = new PGlite();
 try {
  await db.exec(`
   CREATE ROLE authenticated;
   CREATE TABLE emergency_requests(id integer PRIMARY KEY,status text);
   CREATE TABLE emergency_completion_steps(emergency_id integer,phase text,finish_emergency boolean,paid_at timestamptz,disputed_at timestamptz);
   CREATE FUNCTION check_emergency_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE allowed text[]; BEGIN
    CASE OLD.status WHEN 'quote_refused' THEN allowed := ARRAY['quote_submitted'];
    ELSE allowed := ARRAY[]::text[]; END CASE;
    IF NOT (NEW.status=ANY(allowed)) THEN RAISE EXCEPTION 'Invalid transition'; END IF;
    RETURN NEW;
   END $$;
   CREATE TRIGGER transition BEFORE UPDATE ON emergency_requests FOR EACH ROW EXECUTE FUNCTION check_emergency_status_transition();
   INSERT INTO emergency_requests VALUES (1,'quote_refused');
   INSERT INTO emergency_completion_steps VALUES (1,'visit',true,null,null);
  `);
  await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261007125806_completion_quote_refused_close.sql'),'utf8'));
  await assert.rejects(db.exec("UPDATE emergency_requests SET status='completed' WHERE id=1"));
  await db.exec('UPDATE emergency_completion_steps SET paid_at=now(),disputed_at=now()');
  await assert.rejects(db.exec("UPDATE emergency_requests SET status='completed' WHERE id=1"));
  await db.exec('UPDATE emergency_completion_steps SET disputed_at=null; GRANT SELECT,UPDATE ON emergency_requests TO authenticated; SET ROLE authenticated');
  await assert.rejects(db.exec("UPDATE emergency_requests SET status='completed' WHERE id=1"));
  await db.exec("RESET ROLE; UPDATE emergency_requests SET status='completed' WHERE id=1");
  assert.equal((await db.query('SELECT status FROM emergency_requests')).rows[0].status,'completed');
 } finally { await db.close(); }
});
test('completion window: ownership, deadline, reminders, claims, disputes and settlement', async () => {
 const db = new PGlite();
 try {
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA vault; CREATE SCHEMA net;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.uid',true),'')::uuid $$;
 CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE users(id uuid PRIMARY KEY);
 CREATE TABLE emergency_requests(id uuid PRIMARY KEY,owner_id uuid,accepted_provider_id uuid,status text,displacement_payment_id text,quote_payment_id text,completed_at timestamptz);
 CREATE TABLE reclamations(id uuid DEFAULT gen_random_uuid(),user_id uuid,emergency_id uuid,status text,description text);
 CREATE TABLE notifications(user_id uuid,title text,body text,reference_id uuid,type text);
 CREATE FUNCTION public._send_push(uuid,text,text,uuid,text) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.notifications VALUES ($1,$2,$3,$4,$5) $$;
 CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
 CREATE TABLE cron.job(jobid bigint,jobname text,active boolean DEFAULT true);
 CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cron.job VALUES(1,$1,true); RETURN 1; END $$;
 CREATE FUNCTION cron.alter_job(bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
 `);
 await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261005153227_emergency_completion_window.sql'),'utf8'));
 const owner='00000000-0000-4000-8000-000000000001',provider='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000003',e='00000000-0000-4000-8000-000000000004';
 await db.query('INSERT INTO users VALUES ($1),($2),($3)',[owner,provider,stranger]);
 await db.query("INSERT INTO emergency_requests VALUES($1,$2,$3,'on_site','pi_visit','pi_repair',null)",[e,owner,provider]);
 const action=(phase,kind,actor=provider,reason=null,finish=false)=>db.query('SELECT * FROM emergency_completion_action($1,$2,$3,$4,$5,11000,$6,$7)',[e,phase,kind,actor,phase==='visit'?'pi_visit':'pi_repair',reason,finish]);
 await assert.rejects(action('visit','declare',owner));
 await assert.rejects(action('visit','declare',stranger));
 await assert.rejects(action('repair','declare'));
 const step=(await action('visit','declare')).rows[0];
 assert.equal(new Date(step.due_at)-new Date(step.declared_at),48*3600000);
 const duplicate=(await action('visit','declare')).rows[0]; assert.equal(duplicate.id,step.id); assert.equal(+new Date(duplicate.due_at),+new Date(step.due_at));
 const claim=()=>db.query('SELECT * FROM claim_emergency_completion($1,gen_random_uuid())',[step.id]);
 assert.equal((await claim()).rows.length,0);
 await db.exec('SELECT remind_emergency_completions()');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM notifications')).rows[0].n,1);
 await db.query("UPDATE emergency_completion_steps SET declared_at=now()-interval '24 hours' WHERE id=$1",[step.id]);
 await db.exec('SELECT remind_emergency_completions(); SELECT remind_emergency_completions()');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM notifications')).rows[0].n,2);
 await assert.rejects(action('visit','approve',provider));
 await action('visit','approve',owner);
 assert.equal((await claim()).rows.length,1); assert.equal((await claim()).rows.length,0);
 await action('visit','dispute',owner,'Diagnostic incomplet');
 assert.equal((await claim()).rows.length,0);
 // A payment already in flight may succeed: never erase the dispute.
 await db.query('SELECT settle_emergency_completion($1,$2)',[step.id,'pi_visit']);
 const disputed=(await db.query('SELECT * FROM emergency_completion_steps WHERE id=$1',[step.id])).rows[0];
 assert.equal(disputed.status,'disputed'); assert.ok(disputed.paid_at);
 await assert.rejects(action('visit','approve',owner));
 await db.query("UPDATE emergency_requests SET status='quote_accepted' WHERE id=$1",[e]);
 const repair=(await action('repair','declare')).rows[0];
 assert.equal(repair.status,'pending'); assert.equal(repair.payment_intent_id,'pi_repair');
 await db.query("UPDATE emergency_completion_steps SET due_at=now() WHERE id=$1",[repair.id]);
 assert.equal((await db.query('SELECT * FROM claim_emergency_completion($1,gen_random_uuid())',[repair.id])).rows.length,1);
 await db.query("INSERT INTO reclamations(user_id,emergency_id,status,description) VALUES($1,$2,'open','Réclamation générale')",[owner,e]);
 assert.equal((await db.query('SELECT status FROM emergency_completion_steps WHERE id=$1',[repair.id])).rows[0].status,'disputed');
 await db.query('SELECT settle_emergency_completion($1,$2)',[repair.id,'pi_repair']);
 assert.notEqual((await db.query('SELECT status FROM emergency_requests WHERE id=$1',[e])).rows[0].status,'completed');
 await db.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated; SET ROLE authenticated;`);
 await db.query("SELECT set_config('request.uid',$1,false)",[stranger]);
 assert.equal((await db.query('SELECT * FROM emergency_completion_steps')).rows.length,0);
 await assert.rejects(db.query('SELECT * FROM emergency_completion_action($1,$2,$3,$4)',[e,'visit','approve',owner]));
 await assert.rejects(db.query("UPDATE emergency_completion_steps SET status='paid'"));
 await db.exec('RESET ROLE');
 await db.query("UPDATE emergency_completion_steps SET status='pending',paid_at=null,disputed_at=null WHERE id=$1",[repair.id]);
 await db.exec('GRANT SELECT,UPDATE ON public.emergency_requests TO authenticated; SET ROLE authenticated');
 await db.query("SELECT set_config('request.uid',$1,false)",[owner]);
 await assert.rejects(db.query("UPDATE emergency_requests SET status='completed' WHERE id=$1",[e]));
 await db.query("UPDATE emergency_requests SET status='cancelled' WHERE id=$1",[e]);
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT status FROM emergency_completion_steps WHERE id=$1',[repair.id])).rows[0].status,'disputed');
 assert.equal((await db.query('SELECT active FROM cron.job')).rows[0].active,false);
 } finally { await db.close(); }
});

test('real notification trigger cannot roll back an already captured completion', async () => {
 const db = new PGlite();
 try {
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA vault; CREATE SCHEMA net;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.uid',true),'')::uuid $$;
 CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE users(id uuid PRIMARY KEY,name text,expo_push_token text);
 CREATE TABLE push_tokens(user_id uuid,token text,updated_at timestamptz);
 CREATE TABLE properties(id uuid PRIMARY KEY,name text);
 CREATE TABLE invoices(id uuid PRIMARY KEY,emergency_id uuid,invoice_type text);
 CREATE FUNCTION public.localize_service_codes(text) RETURNS text LANGUAGE sql AS $$ SELECT replace($1,'plumbing','plomberie') $$;
 CREATE TABLE emergency_requests(id uuid PRIMARY KEY,owner_id uuid,accepted_provider_id uuid,status text,displacement_payment_id text,quote_payment_id text,completed_at timestamptz,service_type text,property_id uuid);
 CREATE TABLE reclamations(id uuid DEFAULT gen_random_uuid(),user_id uuid,emergency_id uuid,status text,description text);
 CREATE TABLE notifications(user_id uuid,title text,body text,reference_id uuid,type text,created_at timestamptz DEFAULT now());
 CREATE FUNCTION public._send_push(uuid,text,text,uuid,text) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.notifications(user_id,title,body,reference_id,type) VALUES ($1,$2,$3,$4,$5) $$;
 CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
 CREATE TABLE cron.job(jobid bigint,jobname text,active boolean DEFAULT true);
 CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cron.job VALUES(1,$1,true); RETURN 1; END $$;
 CREATE FUNCTION cron.alter_job(bigint,active boolean) RETURNS void LANGUAGE sql AS $$ UPDATE cron.job SET active=$2 WHERE jobid=$1 $$;
 CREATE TABLE public.push_log(payload jsonb);
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer DEFAULT 10000) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.push_log VALUES(body); RETURN 1; END $$;
 `);
 await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261005153227_emergency_completion_window.sql'),'utf8'));
 const owner='00000000-0000-4000-8000-000000000001',provider='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000003',e='00000000-0000-4000-8000-000000000004';
 await db.query('INSERT INTO users(id) VALUES ($1),($2),($3)',[owner,provider,stranger]);
 await db.query("INSERT INTO emergency_requests VALUES($1,$2,$3,'on_site','pi_visit','pi_repair',null,'plumbing',null)",[e,owner,provider]);

 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/legacy-emergency-notification.sql'),'utf8'));
 await db.exec('CREATE TRIGGER notify_status AFTER UPDATE ON emergency_requests FOR EACH ROW EXECUTE FUNCTION notify_emergency_status_change()');
 const step=(await db.query("SELECT * FROM emergency_completion_action($1,'visit','declare',$2,'pi_visit',8250,null,true)",[e,provider])).rows[0];
 await db.query("SELECT * FROM emergency_completion_action($1,'visit','approve',$2)",[e,owner]);
 await assert.rejects(db.query('SELECT settle_emergency_completion($1,$2)',[step.id,'pi_visit']), /relation "users" does not exist/);
 assert.equal((await db.query('SELECT paid_at FROM emergency_completion_steps WHERE id=$1',[step.id])).rows[0].paid_at,null);
 // Apply the release migration, but stub external delivery only; execute real business triggers.
 const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261008090320_lifecycle_invoice_notification_reliability.sql'),'utf8');
 await db.exec('DROP FUNCTION public._send_push(uuid,text,text,uuid,text) CASCADE');
 await db.exec(migration);
 await db.exec("UPDATE users SET expo_push_token='ExponentPushToken[LOCAL_TEST]'");

 await db.query('SELECT settle_emergency_completion($1,$2)',[step.id,'pi_visit']);
 assert.equal((await db.query('SELECT status FROM emergency_requests WHERE id=$1',[e])).rows[0].status,'completed');
 assert.equal((await db.query('SELECT status FROM emergency_completion_steps WHERE id=$1',[step.id])).rows[0].status,'paid');
 const messages=(await db.query('SELECT body FROM notifications')).rows;
 assert.equal(messages.some(n=>n.body.includes('plumbing')),false);
 const before=messages.length;
 await db.query('SELECT settle_emergency_completion($1,$2)',[step.id,'pi_visit']);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM notifications')).rows[0].n,before);
 // Two different candidates are two events; replaying either event is not a third.
 await db.query("SELECT public._send_push_event($1,'Nouvelle candidature','Mission plumbing',$2,'emergency','bid:one')",[owner,e]);
 await db.query("SELECT public._send_push_event($1,'Nouvelle candidature','Mission plumbing',$2,'emergency','bid:two')",[owner,e]);
 await db.query("SELECT public._send_push_event($1,'Nouvelle candidature','Mission plumbing',$2,'emergency','bid:one')",[owner,e]);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM notifications WHERE event_key LIKE 'bid:%'")).rows[0].n,2);
 assert.equal((await db.query("SELECT body FROM notifications WHERE event_key='bid:one'")).rows[0].body,'Mission plomberie');
 const sent=(await db.query('SELECT payload FROM push_log')).rows;
 assert.ok(sent.length>0);assert.equal(sent.some(row=>row.payload.body.includes('plumbing')),false);
 // Legacy invoice and each distinct paid phase can coexist, but phase duplicates cannot.
 await db.query("INSERT INTO invoices VALUES(gen_random_uuid(),$1,'service',null)",[e]);
 await db.query("INSERT INTO invoices VALUES(gen_random_uuid(),$1,'service',$2)",[e,step.id]);
 await assert.rejects(db.query("INSERT INTO invoices VALUES(gen_random_uuid(),$1,'service',$2)",[e,step.id]),/duplicate key/);
 } finally { await db.close(); }
});
