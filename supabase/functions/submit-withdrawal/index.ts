import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { assertUUID, assertString } from '../_shared/validate.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { sendWithdrawalReceipt, withdrawalReceiptHtml } from '../_shared/withdrawal-receipt.ts';
Deno.serve(async req=>{
 const cors=handleCors(req);if(cors)return cors;
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{...corsHeaders,'Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const {user}=await requireAuth(req);if(!user.email)return reply({error:'Adresse du compte indisponible'},400);await checkRateLimit(user.id,'withdrawal',10,3600000);
  const body=await req.json();
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if(body.action==='receipts'){
   const {data,error}=await db.from('withdrawal_requests').select('receipt,receipt_sent_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
   if(error||!Array.isArray(data))return reply({error:'Accusés indisponibles'},503);
   return reply({receipts:data.map(row=>({accepted:true,receipt:row.receipt,receiptHtml:withdrawalReceiptHtml(row.receipt),emailSent:!!row.receipt_sent_at}))});
  }
  const requestId=assertUUID(body.requestId,'requestId');
  if(body.confirmation!=='CONFIRM_WITHDRAWAL')return reply({error:'Confirmation requise'},400);
  if(!['mission','emergency','intervention','platform'].includes(body.kind))return reply({error:'Contrat invalide'},400);
  const contractId=body.kind==='platform'?null:assertUUID(body.contractId,'contractId');
  const declaration=assertString(body.declaration,'declaration').trim();if(!declaration||declaration.length>4000)return reply({error:'Déclaration invalide'},400);
  const {data:row,error}=await db.rpc('submit_withdrawal',{p_user_id:user.id,p_request_id:requestId,p_kind:body.kind,p_contract_id:contractId,p_declaration:declaration,p_verified_email:user.email});
  if(error||!row?.receipt)return reply({error:'Enregistrement indisponible. Votre déclaration n’est pas confirmée ; réessayez avec la même référence.'},503);
  let sent=!!row.receipt_sent_at;
  if(!sent){try{
   await sendWithdrawalReceipt(row,name=>Deno.env.get(name));
   const saved=await db.from('withdrawal_requests').update({receipt_sent_at:new Date().toISOString(),receipt_error:false}).eq('id',row.id);
   sent=!saved.error;
  }catch{await db.from('withdrawal_requests').update({receipt_error:true,receipt_attempted_at:new Date().toISOString()}).eq('id',row.id);}}
  return reply({accepted:true,receipt:row.receipt,receiptHtml:withdrawalReceiptHtml(row.receipt),emailSent:sent});
 }catch{return reply({error:'Vérifiez votre connexion et les informations du contrat.'},400);}
});
