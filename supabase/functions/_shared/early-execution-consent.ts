export async function recordEarlyExecutionConsent(db:any,userId:string,metadata:Record<string,string>,consent:any){
 const reference=metadata.bidId||metadata.quoteId;
 // Completed classic missions cannot acquire a retroactive consent by paying.
 if(!reference)return null;
 if(consent?.version!=='2026-10-09-v1'||consent.requested!==true||consent.acknowledged!==true)throw Error('Explicit early execution consent required');
 const {data,error}=await db.rpc('record_early_execution_consent',{p_user_id:userId,p_reference:reference,p_kind:metadata.bidId?'bid':'quote',p_version:consent.version,p_requested:true,p_acknowledged:true});
 if(error||typeof data!=='string'||!data)throw Error('Consent evidence unavailable');return data;
}
