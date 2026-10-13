const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('../../frontend/node_modules/@electric-sql/pglite');
const {installSchema,migration}=require('./fixtures/account-schema.cjs');
const one='11111111-1111-4111-8111-111111111111',two='22222222-2222-4222-8222-222222222222';
test('issuer series survives account deletion and is shared across accounts of the same company',async()=>{const db=new PGlite();try{
await installSchema(db);await db.exec(`create schema altio_private;insert into auth.users(id) values('${one}'),('${two}');insert into users(id,email,name,role,siren) values('${one}','one@example.invalid','One','provider','999304736'),('${two}','two@example.invalid','Two','provider','999304736');insert into invoice_mandate_counters(provider_id,year,last_number) values('${one}',2026,42);`);
await migration(db,'20261009121306_preserve_siren_invoice_counters.sql');
const next=async id=>(await db.query('select next_mandate_invoice_number($1,2026) n',[id])).rows[0].n;
assert.equal(await next(one),43);assert.equal(await next(two),44);
await db.query('delete from invoice_mandate_counters where provider_id=$1',[one]);await db.query('delete from users where id=$1',[one]);await db.query('delete from auth.users where id=$1',[one]);assert.equal(await next(two),45);
await db.exec('set role authenticated');await assert.rejects(next(two),/permission denied/);
}finally{await db.close();}});
