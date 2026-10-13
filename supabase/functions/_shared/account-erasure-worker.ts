import { deleteAccountAtomically } from './account-deletion-data.ts';

export async function revokeGoogleCalendar(token:string, fetcher:typeof fetch=fetch) {
 const response=await fetcher('https://oauth2.googleapis.com/revoke',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),
 });
 if(response.ok)return;
 // Retrying an already revoked token must not strand an erasure request.
 if(response.status===400){const body=await response.json().catch(()=>null);if(body?.error==='invalid_token')return;}
 throw new Error('Google revocation pending');
}

export async function processAccountErasure(db:any,jobId:string,fetcher:typeof fetch=fetch) {
 const {data:job,error}=await db.rpc('claim_account_erasure',{p_job_id:jobId});
 if(error)throw new Error('Erasure unavailable');
 if(!job)return {completed:false};
 const checkpoint=async(step:string,extra:Record<string,unknown>={})=>{
  const result=await db.rpc('checkpoint_account_erasure',{p_job_id:job.id,p_lease:job.leaseToken,p_step:step,...extra});
  if(result.error)throw new Error('Erasure checkpoint unavailable');return result.data===true;
 };
 try{
  // If Auth deletion succeeded but its response was lost, finish idempotently.
  if(await checkpoint('complete'))return {completed:true};
  if(job.googleToken){await revokeGoogleCalendar(job.googleToken,fetcher);await checkpoint('google');}
  const buckets=new Map<string,string[]>();
  for(const file of job.files){
   if(!['avatars','insurance-documents','property-photos','mission_proofs','emergency-photos'].includes(file.bucket_id))throw new Error('Unclassified erasure file');
   const list=buckets.get(file.bucket_id)||[];list.push(file.name);buckets.set(file.bucket_id,list);
  }
  for(const [bucket,names]of buckets){
   const {error:removeError}=await db.storage.from(bucket).remove(names);
   if(removeError)throw new Error('File erasure pending');
   await checkpoint('files',{p_bucket:bucket,p_names:names});
  }
  if(!await checkpoint('resources')){await checkpoint('retry');return {completed:false};}
  await deleteAccountAtomically(db,job.subjectId);
  if(!await checkpoint('complete'))throw new Error('Erasure completion unconfirmed');
  return {completed:true};
 }catch{
  await checkpoint('retry').catch(()=>false);
  // Do not include raw errors, credentials, paths, or another user's data.
  return {completed:false};
 }
}
