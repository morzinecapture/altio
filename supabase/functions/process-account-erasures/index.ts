import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { requireAuthOrServiceKey } from '../_shared/auth.ts';
import { processAccountErasure } from '../_shared/account-erasure-worker.ts';
Deno.serve(async req=>{
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const key=Deno.env.get('COMPLETION_WORKER_KEY');
 if(!key || req.headers.get('x-service-key')!==key){
  try{const auth=await requireAuthOrServiceKey(req);if(!auth.isServiceCall)return reply({error:'Forbidden'},403);}
  catch{return reply({error:'Unauthorized'},401);}
 }
 if(new URL(req.url).searchParams.get('check')==='configuration')return reply({ok:true});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data,error}=await db.rpc('pending_account_erasures');
 if(error || !Array.isArray(data))return reply({error:'Jobs unavailable'},503);
 let completed=0;
 for(const id of data){try{if((await processAccountErasure(db,id)).completed)completed++;}catch{/* Lease expiry makes this retryable. */}}
 return reply({processed:data.length,completed,pending:data.length-completed});
});
