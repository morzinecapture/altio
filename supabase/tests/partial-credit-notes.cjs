const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {setup:base,id}=require('./fixtures/credit-schema.cjs');
async function setup(){const db=await base();await db.exec(fs.readFileSync('supabase/migrations/20261009121916_atomic_partial_credit_notes.sql','utf8'));return db;}
async function prepare(db,target){return(await db.query('select prepare_partial_credit_note($1,$2,$3,$4) r',[id,target,'Fixture',{seller:{name:'Seller'},buyer:{name:'Buyer'}}])).rows[0].r;}
async function finalize(db,job){return(await db.query('select finalize_partial_credit_note($1,$2) r',[id,job.id])).rows[0].r;}
test('partial credits are incremental, idempotent and exactly exhaust original tax amounts',async()=>{const db=await setup();try{
 for(const [target,ttc,ht] of [[3333,-33.33,-27.78],[6666,-33.33,-27.77],[12000,-53.34,-44.45]]){
 const job=await prepare(db,target);assert.deepEqual(await prepare(db,target),job);const credit=await finalize(db,job);assert.equal(credit.amount_ttc,ttc);assert.equal(credit.amount_ht,ht);assert.deepEqual(await finalize(db,job),credit);assert.equal((await prepare(db,target)).existing.id,credit.id);
 assert.equal((await db.query('select status from invoices where id=$1',[id])).rows[0].status,target===12000?'cancelled':'paid');
 }
 const totals=(await db.query("select sum(amount_ht) ht,sum(amount_ttc) ttc from invoices")).rows[0];assert.equal(Number(totals.ht),0);assert.equal(Number(totals.ttc),0);
}finally{await db.close();}});
test('pending partial blocks competing targets and a legacy full credit',async()=>{const db=await setup();try{
 await prepare(db,1000);await assert.rejects(prepare(db,2000),/Prior credit/);await assert.rejects(db.query('select prepare_credit_note($1,$2,$3)',[id,'Fixture',{}]),/cumulative credit/);
}finally{await db.close();}});
test('over-credit, changed source and unauthorized caller cannot publish',async()=>{const db=await setup();try{
 await assert.rejects(prepare(db,12001),/exceeds/);const job=await prepare(db,1000);await db.query('update invoices set amount_ttc=121 where id=$1',[id]);await assert.rejects(finalize(db,job),/changed/);
 await db.exec('set role authenticated');await assert.rejects(prepare(db,2000),/permission denied/);
}finally{await db.close();}});
