import { escapeDocumentText } from './document-text.ts';
export function withdrawalReceiptHtml(receipt:any){
 const line=(key:string)=>escapeDocumentText(String(receipt[key]??''));
 return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Accusé de réception de rétractation</title><body><h1>Rétractation — accusé de réception</h1><p>Référence : ${line('reference')}</p><p>Date et heure : ${line('submittedAt')}</p><p>${line('name')} — ${line('email')}</p><p>Contrat : ${line('contractKind')} ${line('contractId')}</p><h2>Votre déclaration</h2><p style="white-space:pre-wrap">${line('declaration')}</p><p>${line('notice')}</p></body></html>`;
}
export async function sendWithdrawalReceipt(row:any,env:(key:string)=>string|undefined,fetcher:typeof fetch=fetch){
 const key=env('RESEND_API_KEY'),sender=env('WITHDRAWAL_RECEIPT_FROM');
 if(!key||!sender){
  const brevoKey=env('BREVO_API_KEY');
  if(!brevoKey)throw Error('Receipt delivery configuration missing');
  const response=await fetcher('https://api.brevo.com/v3/smtp/email',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{'api-key':brevoKey,'Content-Type':'application/json'},
   body:JSON.stringify({sender:{name:'Altio',email:'morzinecapture@gmail.com'},to:[{email:row.receipt.email}],
    subject:'Altio — accusé de réception de votre rétractation',htmlContent:withdrawalReceiptHtml(row.receipt),headers:{idempotencyKey:row.id}})});
  if(!response.ok){const detail=await response.json().catch(()=>null);console.error('[withdrawal-receipt] Brevo rejected request',response.status,typeof detail?.code==='string'?detail.code.slice(0,80):'unknown');throw Error('Receipt delivery pending');}
  const data=await response.json();if(typeof data.messageId!=='string'||!data.messageId)throw Error('Receipt delivery unconfirmed');
  return;
 }
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
 headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`withdrawal:${row.id}`},
 body:JSON.stringify({from:sender,to:[row.receipt.email],subject:'Altio — accusé de réception de votre rétractation',html:withdrawalReceiptHtml(row.receipt)})});
 if(!response.ok)throw Error('Receipt delivery pending');
 const data=await response.json();if(typeof data.id!=='string'||!data.id)throw Error('Receipt delivery unconfirmed');
}
