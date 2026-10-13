const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '../../frontend/node_modules/@electric-sql/pglite');
const {setup,id}=require('./fixtures/credit-schema.cjs');
async function prepare(db,reason='Fixture') {return (await db.query('SELECT prepare_credit_note($1,$2,$3) result',[id,reason,{seller:{name:'Original seller'},legalEntity:{name:'Fixture'}}])).rows[0].result;}
async function finalize(db,job) {return (await db.query('SELECT finalize_credit_note($1,$2) result',[id,job.id])).rows[0].result;}
test('explicit test fixtures never consume the customer credit-note sequence',async()=>{
 const db=await setup();try{await db.query('UPDATE invoices SET invoice_number=$1 WHERE id=$2',['TEST-RELEASE-'+id,id]);
 const job=(await db.query('SELECT prepare_credit_note($1,$2,$3) result',[id,'Validation',{validationRunId:id}])).rows[0].result;
 assert.equal(job.invoice_number,'TEST-AV-'+id);assert.equal((await db.query('SELECT is_called FROM credit_note_seq')).rows[0].is_called,false);
 }finally{await db.close();}
});
test('reservation and publication remain idempotent, preserve source phase and cancel source atomically',async()=>{
 const db=await setup();try{
  await db.exec('SET ROLE service_role');const first=await prepare(db);const retry=await prepare(db,'Different reason');
  assert.deepEqual(retry,first);assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1',[id])).rows[0].status,'paid');
  const issued=await finalize(db,first);assert.equal(issued.amount_ttc,-120);assert.equal(issued.amount_ht,-100);
  assert.equal(issued.completion_step_id,id);assert.equal(issued.related_invoice_id,id);
  assert.deepEqual(await finalize(db,first),issued);assert.equal((await prepare(db)).existing.id,issued.id);
  assert.equal((await db.query('SELECT count(*)::int n FROM invoices')).rows[0].n,2);
  assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1',[id])).rows[0].status,'cancelled');
 }finally{await db.close();}
});
test('failed source update rolls back the credit insertion and leaves reservation retryable',async()=>{
 const db=await setup();try{
  const job=await prepare(db);await db.exec(`CREATE FUNCTION reject_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture outage'; END $$;
    CREATE TRIGGER reject_update BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION reject_update();`);
  await assert.rejects(finalize(db,job),/fixture outage/);
  assert.equal((await db.query('SELECT count(*)::int n FROM invoices')).rows[0].n,1);
  assert.equal((await db.query('SELECT issued_at FROM credit_note_jobs')).rows[0].issued_at,null);
  await db.exec('DROP TRIGGER reject_update ON invoices');assert.equal((await finalize(db,job)).id,job.id);
 }finally{await db.close();}
});
test('changed source cannot be credited using obsolete document amounts',async()=>{
 const db=await setup();try{const job=await prepare(db);await db.exec(`UPDATE invoices SET amount_ttc=121 WHERE id='${id}'`);
  await assert.rejects(finalize(db,job),/changed/);assert.equal((await db.query('SELECT count(*)::int n FROM invoices')).rows[0].n,1);
 }finally{await db.close();}
});
test('existing partial credit blocks a new full credit rather than over-crediting',async()=>{
 const db=await setup();try{await db.exec(`INSERT INTO invoices(invoice_number,invoice_type,amount_ht,amount_ttc,related_invoice_id) VALUES('PARTIAL','credit_note',-10,-12,'${id}')`);
  await assert.rejects(prepare(db),/requires reconciliation/);
 }finally{await db.close();}
});
test('public callers cannot reserve, finalize or read credit note jobs',async()=>{
 const db=await setup();try{for(const role of ['anon','authenticated']){
  await db.exec('SET ROLE '+role);await assert.rejects(prepare(db),/permission denied/);
  await assert.rejects(finalize(db,{id}),/permission denied/);await assert.rejects(db.query('SELECT * FROM credit_note_jobs'),/permission denied/);
  await db.exec('RESET ROLE');
 }}finally{await db.close();}
});
