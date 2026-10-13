const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE || '../../../frontend/node_modules/@electric-sql/pglite');
const id='00000000-0000-4000-8000-000000000001';
async function setup() {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SEQUENCE credit_note_seq;
    CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_number text UNIQUE NOT NULL,
      mission_id uuid,emergency_id uuid,intervention_id uuid,completion_step_id uuid,invoice_type text NOT NULL,
      amount_ht numeric NOT NULL,amount_ttc numeric NOT NULL,vat_rate numeric,seller_id uuid,buyer_id uuid,
      pdf_url text,facturx_url text,stripe_pi_id text,status text,related_invoice_id uuid REFERENCES invoices(id),created_at timestamptz DEFAULT now());
    GRANT ALL ON invoices TO service_role;
    INSERT INTO invoices(id,invoice_number,invoice_type,amount_ht,amount_ttc,vat_rate,stripe_pi_id,status,completion_step_id)
      VALUES('${id}','ALTIO-FIXTURE','service',100,120,20,'pi_fixture','paid','${id}');`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../../migrations/20261009083321_atomic_credit_note_issuance.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../../migrations/20261009084247_isolate_credit_note_validation_numbers.sql'),'utf8'));
  return db;
}

module.exports={setup,id};
