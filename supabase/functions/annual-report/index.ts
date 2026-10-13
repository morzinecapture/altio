import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

// A financial-document export for reconciliation. This is not a DAC7 filing:
// the legacy 242 bis format and assumed exemptions must never be advertised.
serve(async req => {
 const preflight=handleCors(req);if(preflight)return preflight;
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{...corsHeaders,'Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try {
  const {user}=await requireAuth(req);
  const userId=user.id;
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:profile,error:profileError}=await db.from('users').select('is_admin').eq('id',userId).single();
  if(profileError||profile?.is_admin!==true)return reply({error:'Forbidden'},403);
  const {year}=await req.json();if(!Number.isInteger(year)||year<2020||year>2100)return reply({error:'Invalid year'},400);
  const documents:unknown[]=[];
  for(let start=0;;start+=500){
   const {data,error}=await db.from('invoices')
    .select('id,invoice_number,invoice_type,related_invoice_id,seller_id,buyer_id,amount_ht,amount_ttc,vat_rate,status,stripe_pi_id,created_at')
    .gte('created_at',`${year}-01-01T00:00:00.000Z`).lt('created_at',`${year+1}-01-01T00:00:00.000Z`)
    .order('id').range(start,start+499);
   if(error||!Array.isArray(data))return reply({error:'Report temporarily unavailable'},503);
   documents.push(...data);if(data.length<500)break;
  }
  return reply({success:true,report:{report_type:'financial_documents_for_reconciliation',year,generated_at:new Date().toISOString(),generated_by:userId,
   tax_filing_ready:false,scope:'Documents émis sur l’année, avoirs et factures annulées inclus. Les encaissements, reversements et obligations DAC7 doivent être rapprochés séparément.',documents}});
 }catch{return reply({error:'Report unavailable; verify your session and request'},400);}
});
