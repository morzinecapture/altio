const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {PGlite}=require(process.env.PGLITE_MODULE || '../../frontend/node_modules/@electric-sql/pglite');
const user='11111111-1111-4111-8111-111111111111',invoice='22222222-2222-4222-8222-222222222222',credit='33333333-3333-4333-8333-333333333333';
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create table users(id uuid primary key,name text,company_name text,siren text,vat_number text,billing_address text,email text,phone text,google_calendar_refresh_token text);create table invoices(id uuid primary key default gen_random_uuid(),invoice_number text unique,mission_id uuid,emergency_id uuid,intervention_id uuid,completion_step_id uuid,invoice_type text,amount_ht numeric,amount_ttc numeric,vat_rate numeric,pdf_url text,stripe_pi_id text,status text,facturx_url text,seller_id uuid references users on delete set null,buyer_id uuid references users on delete set null,related_invoice_id uuid references invoices,created_at timestamptz default now());insert into users values('${user}','Original name',null,'123456789',null,'Original address','private@example.invalid','phone','secret');`);await db.exec(fs.readFileSync(path.join(__dirname,'../migrations/20261009095059_preserve_invoice_parties_for_account_erasure.sql'),'utf8'));return db;}
async function read(db,id=invoice){return(await db.query('select get_invoice_document_parties($1) data',[id])).rows[0].data;}
test('snapshot survives profile changes and deletion without retaining tokens/contact data',async()=>{const db=await setup();try{
 await db.query('insert into invoices(id,seller_id,buyer_id) values($1,$2,$2)',[invoice,user]);await db.query("update users set name='Changed',billing_address='Changed' where id=$1",[user]);await db.query('delete from users where id=$1',[user]);const result=await read(db);
 assert.equal(result.seller.name,'Original name');assert.equal(result.buyer.billing_address,'Original address');assert.equal(result.source,'issuance');
 const dump=JSON.stringify(result);for(const forbidden of ['secret','phone','private@example.invalid','google_calendar'])assert.equal(dump.includes(forbidden),false);
}finally{await db.close();}});
test('credit after profile deletion inherits the original billing snapshot',async()=>{const db=await setup();try{
 await db.query('insert into invoices(id,seller_id,buyer_id) values($1,$2,$2)',[invoice,user]);await db.query('delete from users where id=$1',[user]);await db.query('insert into invoices(id,related_invoice_id) values($1,$2)',[credit,invoice]);const result=await read(db,credit);assert.equal(result.seller.name,'Original name');assert.equal(result.source,'credit_original');
}finally{await db.close();}});
test('client roles cannot inspect retained billing identities but backend can',async()=>{const db=await setup();try{
 await db.query('insert into invoices(id,seller_id,buyer_id) values($1,$2,$2)',[invoice,user]);for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(read(db),/permission denied/);await assert.rejects(db.query('select * from altio_private.invoice_parties'),/permission denied/);await db.exec('reset role');}await db.exec('set role service_role');assert.equal((await read(db)).buyer.name,'Original name');
}finally{await db.close();}});
test('renderer snapshot is committed with invoice even when profile changed in the meantime',async()=>{const db=await setup();try{
 const original={id:user,name:'Rendered name',billing_address:'Rendered address',google_calendar_refresh_token:'must-not-be-retained'};
 await db.query("update users set name='Updated name' where id=$1",[user]);
 const inv={invoice_number:'FIXTURE-1',invoice_type:'service',seller_id:user,buyer_id:user,amount_ht:100,amount_ttc:100,vat_rate:0,status:'issued'};
 const created=(await db.query('select (insert_invoice_with_parties($1,$2,$2)).id id',[inv,original])).rows[0].id;
 const parties=await read(db,created);assert.equal(parties.seller.name,'Rendered name');assert.equal(parties.buyer.billing_address,'Rendered address');assert.equal(JSON.stringify(parties).includes('must-not-be-retained'),false);
}finally{await db.close();}});
test('invalid renderer party cannot leave an invoice without its correct identity',async()=>{const db=await setup();try{
 const inv={invoice_number:'INVALID',invoice_type:'service',seller_id:user,buyer_id:user,amount_ht:100,amount_ttc:100};
 await assert.rejects(db.query('select insert_invoice_with_parties($1,$2,$2)',[inv,{id:credit,name:'Wrong account'}]),/snapshot invalid/);
 assert.equal((await db.query('select count(*)::int n from invoices')).rows[0].n,0);
}finally{await db.close();}});
