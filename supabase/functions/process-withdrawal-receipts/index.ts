import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import {requireAuthOrServiceKey} from '../_shared/auth.ts';
import {sendWithdrawalReceipt} from '../_shared/withdrawal-receipt.ts';
Deno.serve(async req=>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const key=Deno.env.get('COMPLETION_WORKER_KEY');
 try{if(!key||req.headers.get('x-service-key')!==key){const auth=await requireAuthOrServiceKey(req);if(!auth.isServiceCall)return reply({error:'Forbidden'},403);}}catch{return reply({error:'Unauthorized'},401);}
 const configured=(!!Deno.env.get('RESEND_API_KEY')&&!!Deno.env.get('WITHDRAWAL_RECEIPT_FROM'))||!!Deno.env.get('BREVO_API_KEY');
 if(new URL(req.url).searchParams.get('check')==='configuration')return reply({ok:configured},configured?200:503);
 if(!configured)return reply({error:'Receipt delivery not configured'},503);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:rows,error}=await db.from('withdrawal_requests').select('id,receipt').is('receipt_sent_at',null).order('receipt_attempted_at',{nullsFirst:true}).limit(10);
 if(error||!Array.isArray(rows))return reply({error:'Receipts unavailable'},503);
 let sent=0;
 for(const row of rows){
  try{
   await sendWithdrawalReceipt(row,name=>Deno.env.get(name));
   const result=await db.from('withdrawal_requests').update({receipt_sent_at:new Date().toISOString(),receipt_attempted_at:new Date().toISOString(),receipt_error:false}).eq('id',row.id);if(!result.error)sent++;
  }catch{await db.from('withdrawal_requests').update({receipt_attempted_at:new Date().toISOString(),receipt_error:true}).eq('id',row.id);}
 }
 return reply({processed:rows.length,sent,pending:rows.length-sent},sent===rows.length?200:503);
});
