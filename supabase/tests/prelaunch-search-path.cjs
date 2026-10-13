const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('fixed search paths reject caller and temporary table shadowing without changing function bodies', async () => {
  const db = new PGlite();
  try {
    const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261008141936_prelaunch_function_search_paths.sql'), 'utf8');
    const signatures = [...migration.matchAll(/ALTER FUNCTION (.+?) SET/g)].map(m => m[1]);
    // Minimal signatures for the other functions; business flows have separate tests.
    for (const signature of signatures) {
      if (!signature.includes('_can_notify_provider_zone')) {
        await db.exec(`CREATE FUNCTION ${signature} RETURNS boolean LANGUAGE sql AS $$ SELECT true $$`);
      }
    }
    await db.exec(`
      CREATE TABLE public.provider_profiles(provider_id uuid, last_zone_notification_at timestamptz);
      INSERT INTO public.provider_profiles VALUES ('00000000-0000-4000-8000-000000000001', NULL);
      CREATE SCHEMA hostile;
      CREATE TABLE hostile.provider_profiles(LIKE public.provider_profiles);
      INSERT INTO hostile.provider_profiles VALUES ('00000000-0000-4000-8000-000000000001', now());
      CREATE TEMP TABLE provider_profiles(LIKE public.provider_profiles);
      INSERT INTO pg_temp.provider_profiles SELECT * FROM hostile.provider_profiles;
      CREATE FUNCTION public._can_notify_provider_zone(p_provider_id uuid) RETURNS boolean
      LANGUAGE plpgsql STABLE AS $$ DECLARE v_last timestamptz; BEGIN
        SELECT last_zone_notification_at INTO v_last FROM provider_profiles WHERE provider_id=p_provider_id;
        RETURN v_last IS NULL OR v_last < now()-interval '30 minutes'; END $$;
      SET search_path=hostile,public;
    `);
    const call = () => db.query("SELECT public._can_notify_provider_zone('00000000-0000-4000-8000-000000000001') AS allowed");
    assert.equal((await call()).rows[0].allowed, false);
    const bodies = () => db.query("SELECT proname,prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname");
    const before = await bodies();
    await db.exec(migration);
    assert.equal((await call()).rows[0].allowed, true);
    assert.deepEqual((await bodies()).rows, before.rows);
    const settings = await db.query("SELECT count(*)::int AS total FROM pg_proc WHERE pronamespace='public'::regnamespace AND proconfig=ARRAY['search_path=pg_catalog, public, pg_temp']");
    assert.equal(settings.rows[0].total, 19);
  } finally { await db.close(); }
});
