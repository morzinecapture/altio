const objectId=(v:any)=>typeof v==='string'?v:v?.id;
const cents=(v:any)=>{const n=Number(v)*100;if(!Number.isFinite(n)||Math.abs(n-Math.round(n))>0.00001||n<0)throw Error('Invalid invoice amount');return Math.round(n)};
/** Read-only Stripe reconciliation. Only proportional refunds with every Connect
 * leg confirmed are eligible; exceptional commercial allocations require review. */
export async function reconcileProportionalRefund(db:any,stripe:any,receipt:any){
 const charge=await stripe.charges.retrieve(receipt.charge_id);
 const amount=charge.amount,refunded=charge.amount_refunded;
 if(charge.id!==receipt.charge_id||objectId(charge.payment_intent)!==receipt.payment_intent_id||!receipt.payment_intent_id||charge.livemode!==receipt.livemode||charge.currency!=='eur'||!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(refunded)||refunded<=0||refunded>amount)throw Error('Refund identity mismatch');
 let confirmed=0,cursor: string|undefined;
 for(let page=0;;page++){
  if(page>=20)throw Error('Refund history requires review');
  const list=await stripe.refunds.list({charge:charge.id,limit:100,...(cursor?{starting_after:cursor}:{})});
  if(!Array.isArray(list.data))throw Error('Refund history unavailable');
  for(const refund of list.data){
   if(objectId(refund.charge)!==charge.id||refund.currency!=='eur'||!Number.isSafeInteger(refund.amount)||refund.amount<=0)throw Error('Refund mismatch');
   if(refund.status==='succeeded')confirmed+=refund.amount;
   else if(!['failed','canceled'].includes(refund.status))throw Error('Refund not yet settled');
  }
  if(!list.has_more)break;if(!list.data.length)throw Error('Incomplete refund history');cursor=list.data.at(-1).id;
 }
 if(confirmed!==refunded)throw Error('Refund settlement mismatch');
 const {data:rows,error}=await db.from('invoices').select('id,invoice_type,amount_ttc,related_invoice_id,stripe_pi_id').eq('stripe_pi_id',receipt.payment_intent_id);
 if(error||!Array.isArray(rows))throw Error('Invoices unavailable');
 const original=rows.filter((i:any)=>i.invoice_type!=='credit_note');
 const service=original.filter((i:any)=>['service','displacement'].includes(i.invoice_type));
 const fees=original.filter((i:any)=>i.invoice_type==='service_fee'),commissions=original.filter((i:any)=>i.invoice_type==='commission');
 if(original.length!==3||service.length!==1||fees.length!==1||commissions.length!==1||rows.some((i:any)=>i.stripe_pi_id!==receipt.payment_intent_id))throw Error('Invoice allocation unavailable');
 const sf=cents(fees[0].amount_ttc),com=cents(commissions[0].amount_ttc);
 if(cents(service[0].amount_ttc)+sf!==amount)throw Error('Invoice/payment mismatch');
 const transferId=objectId(charge.transfer),feeId=objectId(charge.application_fee);
 if(!transferId||!feeId)throw Error('Connect references missing');
 const transfer=await stripe.transfers.retrieve(transferId),fee=await stripe.applicationFees.retrieve(feeId);
 if(transfer.id!==transferId||transfer.livemode!==charge.livemode||transfer.currency!=='eur'||transfer.amount!==amount||transfer.amount_reversed!==refunded||objectId(transfer.source_transaction)!==charge.id)throw Error('Transfer reversal unconfirmed');
 if(fee.id!==feeId||fee.livemode!==charge.livemode||fee.currency!=='eur'||fee.amount!==sf+com||(objectId(fee.originating_transaction)||objectId(fee.charge))!==charge.id||fee.amount_refunded!==Math.round((sf+com)*refunded/amount))throw Error('Proportional fee refund unconfirmed');
 const feeTarget=Math.round(sf*refunded/amount),commissionTarget=fee.amount_refunded-feeTarget;
 const targets=[[service[0],refunded-feeTarget],[fees[0],feeTarget],[commissions[0],commissionTarget]] as const;
 const plans=targets.map(([invoice,target])=>{
  if(target<0||target>cents(invoice.amount_ttc))throw Error('Credit allocation invalid');
  const credited=rows.filter((i:any)=>i.invoice_type==='credit_note'&&i.related_invoice_id===invoice.id).reduce((sum:number,i:any)=>sum+cents(-Number(i.amount_ttc)),0);
  if(credited>target)throw Error('Existing credit exceeds refund');return {invoice,target,credited};
 });
 // Inspect all legacy reservations before creating any new document.
 const legacyJobs=new Map<string,boolean>();
 for(const {invoice,target,credited} of plans){
  if(credited===target)continue;
  const {data:legacy,error}=await db.from('credit_note_jobs').select('id').eq('invoice_id',invoice.id).is('issued_at',null).maybeSingle();
  if(error)throw Error('Legacy credit reservations unavailable');
  if(legacy&&target!==cents(invoice.amount_ttc))throw Error('Legacy full credit requires review');
  legacyJobs.set(invoice.id,!!legacy);
 }
 for(const {invoice,target,credited} of plans){
  if(credited===target)continue;
  if(legacyJobs.get(invoice.id)){
   const result=await db.functions.invoke('generate-credit-note',{body:{invoiceId:invoice.id,reason:`Remboursement intégral confirmé — ${charge.id}`}});
   if(result.error||result.data?.success!==true)throw Error('Legacy credit issuance incomplete');
   continue;
  }
  const {data:pending,error:pendingError}=await db.from('partial_credit_note_jobs').select('target_cents').eq('invoice_id',invoice.id).is('issued_at',null).maybeSingle();
  if(pendingError)throw Error('Credit reservations unavailable');
  const issue=async(targetCents:number)=>{const result=await db.functions.invoke('generate-credit-note',{body:{invoiceId:invoice.id,targetCents,reason:`Remboursement proportionnel confirmé — ${charge.id}`}});if(result.error||result.data?.success!==true)throw Error('Credit issuance incomplete')};
  if(pending){const prior=Number(pending.target_cents);if(!Number.isSafeInteger(prior)||prior>target)throw Error('Credit reservation requires review');await issue(prior);if(prior===target)continue;}
  await issue(target);
 }
 const {error:markError}=await db.from('stripe_refund_events').update({reconciliation_state:'completed',reconciled_at:new Date().toISOString(),last_error:null}).eq('charge_id',charge.id).eq('livemode',receipt.livemode).lte('amount_refunded_cents',refunded);
 if(markError)throw Error('Reconciliation confirmation unavailable');return {completed:true};
}
