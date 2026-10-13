const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '../../frontend/node_modules/@electric-sql/pglite');
test('refund receipt table is private, deduplicated, and preserves reconciliation on replay', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/20261009074235_persist_stripe_refund_events.sql'), 'utf8'));
    await db.exec(`CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
      INSERT INTO vault.decrypted_secrets VALUES('project_url','https://fixture.invalid'),('completion_worker_key','fixture');
      CREATE SCHEMA net; CREATE TABLE net.requests(id bigserial,url text,headers jsonb,body jsonb);
      CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$
        DECLARE request_id bigint; BEGIN INSERT INTO net.requests(url,headers,body) VALUES($1,$2,$3) RETURNING id INTO request_id; RETURN request_id; END $$;
      CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/20261009083401_schedule_refund_reconciliation.sql'), 'utf8'));
    await db.query('SELECT dispatch_refund_reconciliation(true)');
    assert.equal((await db.query('SELECT url FROM net.requests')).rows[0].url, 'https://fixture.invalid/functions/v1/process-refund-events?check=configuration');
    const insert = `INSERT INTO public.stripe_refund_events(event_id,charge_id,payment_intent_id,amount_refunded_cents,charge_amount_cents,currency,fully_refunded,livemode,event_created_at)
      VALUES('evt_fixture','ch_fixture','pi_fixture',2000,11000,'eur',false,false,now()) ON CONFLICT(event_id) DO NOTHING`;
    await db.exec('SET ROLE service_role');
    await db.exec(insert);
    await db.exec("UPDATE public.stripe_refund_events SET reconciliation_state='completed',reconciled_at=now()");
    await db.exec(insert);
    assert.deepEqual((await db.query('SELECT reconciliation_state,amount_refunded_cents::int AS amount FROM public.stripe_refund_events')).rows,
      [{ reconciliation_state: 'completed', amount: 2000 }]);
    await db.exec('RESET ROLE');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT * FROM public.stripe_refund_events'), /permission denied/);
      await assert.rejects(db.exec(insert), /permission denied/);
      await assert.rejects(db.query('SELECT dispatch_refund_reconciliation()'), /permission denied/);
      await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});
