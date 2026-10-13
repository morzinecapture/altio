// Fetch every page; never return a successful but silently truncated export.
export async function exportUserData(db: any, userId: string) {
 if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid subject');
 const fetchAll = async (table: string, select: string, filter: (query: any) => any) => {
  const rows: any[] = [];
  for(let start=0;;start+=500){
   const {data,error}=await filter(db.from(table).select(select)).order(table==='provider_profiles'?'provider_id':'id').range(start,start+499);
   if(error || !Array.isArray(data))throw new Error('Export temporarily unavailable');
   rows.push(...data);if(data.length<500)return rows;
  }
 };
 const own=(column:string)=>(q:any)=>q.eq(column,userId);
 const related=(columns:string[])=>(q:any)=>q.or(columns.map(c=>`${c}.eq.${userId}`).join(','));
 const specs: [string,string,string,(q:any)=>any][]=[
 ['profile','users','id,email,name,picture,role,phone,created_at,onboarding_completed,owner_type,siren,vat_number,company_name,billing_address,is_vat_exempt,cgu_accepted_at,mandate_accepted_at,dsa_certified_at,marketing_consent_at,is_auto_entrepreneur',own('id')],
 ['provider_profile','provider_profiles','provider_id,specialties,zone,available,bio,hourly_rate,company_type,radius_km,weekly_availability,latitude,longitude,location_label,legal_status,rcs_number,rne_number,insurance_company,insurance_coverage_area,qualifications,rc_pro_verified,decennale_verified',own('provider_id')],
 ['properties','properties','*',own('owner_id')],
 ['missions','missions','*',related(['owner_id','assigned_provider_id'])],
 ['emergencies','emergency_requests','*',related(['owner_id','accepted_provider_id'])],
 ['interventions','interventions','*',related(['owner_id','assigned_provider_id'])],
 ['quotes','mission_quotes','*',related(['provider_id','accepted_by'])],
 ['invoices','invoices','*',related(['seller_id','buyer_id'])],
 ['reclamations','reclamations','*',own('user_id')],
 ['reviews','reviews','*',related(['owner_id','provider_id'])],
 ['messages','messages','*',related(['sender_id','receiver_id'])],
 ];
 const values=await Promise.all(specs.map(async([key,table,select,filter])=>[key,await fetchAll(table,select,filter)]));
 return {exported_at:new Date().toISOString(),user_id:userId,data:Object.fromEntries(values)};
}
