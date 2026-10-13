export type InvoiceParty = {name?:string;company_name?:string;siren?:string;siret?:string;vat_number?:string;billing_address?:string;address?:string;email?:string};
export async function invoiceDocumentParties(db: {rpc:(name:string,args:Record<string,string>)=>PromiseLike<{data:any;error:unknown}>},invoice:{id:string;invoice_type:string}) {
 const {data,error}=await db.rpc('get_invoice_document_parties',{p_invoice_id:invoice.id});
 const valid=(p:any)=>p && typeof p==='object' && !Array.isArray(p) &&
   (typeof p.name==='string' && p.name.trim() || typeof p.company_name==='string' && p.company_name.trim());
 const platformSeller=['commission','service_fee'].includes(invoice.invoice_type);
 if(error || !data || !valid(data.buyer) || (!platformSeller && !valid(data.seller))) {
  throw new Error('Les coordonnées de la facture originale sont indisponibles. Aucun avoir n’a été émis.');
 }
 return {seller:(data.seller || null) as InvoiceParty|null,buyer:data.buyer as InvoiceParty};
}
