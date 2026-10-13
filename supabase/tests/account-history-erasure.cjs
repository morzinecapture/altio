const {test}=require('node:test'),assert=require('node:assert/strict');const {PGlite}=require(process.env.PGLITE_MODULE || '../../frontend/node_modules/@electric-sql/pglite');const {installSchema,migration}=require('./fixtures/account-schema.cjs');
const owner='11111111-1111-4111-8111-111111111111',provider='22222222-2222-4222-8222-222222222222',property='33333333-3333-4333-8333-333333333333',mission='44444444-4444-4444-8444-444444444444',invoice='55555555-5555-4555-8555-555555555555',quote='66666666-6666-4666-8666-666666666666';
async function setup(){const db=new PGlite();await installSchema(db);
 await db.exec(`insert into auth.users(id) values('${owner}'),('${provider}');insert into users(id,email,name,role,billing_address) values('${owner}','owner@example.invalid','Owner fixture','owner','Owner address'),('${provider}','provider@example.invalid','Provider fixture','provider','Provider address');
 insert into auth.sessions values('${owner}','${owner}'),('${provider}','${provider}');insert into auth.identities values('${owner}'),('${provider}');
 insert into provider_profiles(provider_id) values('${provider}');
 insert into properties(id,owner_id,name,address) values('${property}','${owner}','Private home','Private location');
 insert into missions(id,property_id,owner_id,assigned_provider_id,mission_type,status,mode,description) values('${mission}','${property}','${owner}','${provider}','cleaning','completed','fixed','Owner private instructions');
 insert into invoices(id,invoice_number,mission_id,invoice_type,amount_ht,amount_ttc,vat_rate,seller_id,buyer_id,status) values('${invoice}','TEST-INVOICE','${mission}','service',100,100,0,'${provider}','${owner}','issued');
 insert into mission_quotes(id,mission_id,provider_id,description,repair_cost,repair_delay_days,status,accepted_by,owner_signature_ip) values('${quote}','${mission}','${provider}','Agreed scope',100,1,'accepted','${owner}','192.0.2.1');
 insert into messages(sender_id,receiver_id,mission_id,content) values('${owner}','${provider}','${mission}','Private message');
 `);
 await migration(db,'20261009093406_atomic_account_deletion_foundation.sql');
 await migration(db,'20261009095059_preserve_invoice_parties_for_account_erasure.sql');
 await migration(db,'20261009095630_erase_closed_account_history.sql');return db;}
async function remove(db,id){await db.query('delete from auth.users where id=$1',[id]);}
async function ready(db,id){return(await db.query('select check_account_deletion($1) r',[id])).rows[0].r;}
test('owner erasure removes private content but preserves provider history and financial documents',async()=>{const db=await setup();try{
 assert.equal((await ready(db,owner)).ready,true);await remove(db,owner);
 assert.equal((await db.query('select count(*)::int n from users')).rows[0].n,1);
 const i=(await db.query('select * from invoices')).rows[0];assert.equal(i.buyer_id,null);assert.equal(i.seller_id,provider);assert.equal(Number(i.amount_ttc),100);assert.equal(i.mission_id,mission);
 const m=(await db.query('select * from missions')).rows[0];assert.equal(m.owner_id,null);assert.equal(m.property_id,null);assert.equal(m.description,null);assert.equal(m.assigned_provider_id,provider);
 assert.equal((await db.query('select count(*)::int n from properties')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from messages')).rows[0].n,0);
 const parties=(await db.query('select get_invoice_document_parties($1) p',[invoice])).rows[0].p;assert.equal(parties.buyer.name,'Owner fixture');
 const q=(await db.query('select * from mission_quotes')).rows[0];assert.equal(q.provider_id,provider);assert.equal(q.accepted_by,null);assert.equal(q.owner_signature_ip,null);
 assert.equal((await db.query("select count(*)::int n from altio_private.retained_account_documents where kind='accepted_quote'")).rows[0].n,1);
}finally{await db.close();}});
test('provider erasure preserves owner invoice and completed mission',async()=>{const db=await setup();try{
 assert.equal((await ready(db,provider)).ready,true);await remove(db,provider);
 const i=(await db.query('select * from invoices')).rows[0];assert.equal(i.seller_id,null);assert.equal(i.buyer_id,owner);
 const m=(await db.query('select * from missions')).rows[0];assert.equal(m.owner_id,owner);assert.equal(m.assigned_provider_id,null);assert.equal(m.property_id,property);
 assert.equal((await db.query('select count(*)::int n from mission_quotes')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from auth.sessions')).rows[0].n,1);
}finally{await db.close();}});
test('late failure rolls back archives, invoice detachment, content cleanup and Auth deletion',async()=>{const db=await setup();try{
 await db.exec(`create function reject_property_deletion() returns trigger language plpgsql as $$begin raise exception 'late fixture failure';end$$;create trigger reject_deletion before delete on properties for each row execute function reject_property_deletion();`);
 await assert.rejects(remove(db,owner),/late fixture failure/);assert.equal((await db.query('select buyer_id from invoices')).rows[0].buyer_id,owner);
 assert.equal((await db.query('select count(*)::int n from messages')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from altio_private.retained_account_documents')).rows[0].n,0);
 await db.exec('drop trigger reject_deletion on properties');await remove(db,owner);
}finally{await db.close();}});
test('open work prevents erasure before any invoice or message change',async()=>{const db=await setup();try{
 await db.exec("update missions set status='in_progress'");assert.equal((await ready(db,owner)).ready,false);await assert.rejects(remove(db,owner),/related-data/);
 assert.equal((await db.query('select buyer_id from invoices')).rows[0].buyer_id,owner);assert.equal((await db.query('select count(*)::int n from messages')).rows[0].n,1);
}finally{await db.close();}});
test('queued erasure preserves closed history and rejects new operational writes',async()=>{const db=await setup();try{
 await migration(db,'20261009094637_revoke_deleted_account_access.sql');
 await migration(db,'20261009120423_resumable_account_file_erasure.sql');
 const job=(await db.query('select begin_account_erasure($1) r',[owner])).rows[0].r;
 await assert.rejects(db.query("update missions set description='new operational data' where id=$1",[mission]),/erasure in progress/);
 const lease=(await db.query('select claim_account_erasure($1) r',[job.id])).rows[0].r;
 await db.query("select checkpoint_account_erasure($1,$2,'resources')",[job.id,lease.leaseToken]);
 await remove(db,owner);
 assert.equal((await db.query('select buyer_id from invoices')).rows[0].buyer_id,null);
 assert.equal((await db.query("select checkpoint_account_erasure($1,$2,'complete') r",[job.id,lease.leaseToken])).rows[0].r,true);
}finally{await db.close();}});
