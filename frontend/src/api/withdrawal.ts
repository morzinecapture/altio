import { supabase } from './_client';
export type WithdrawalKind='mission'|'emergency'|'intervention'|'platform';
export type WithdrawalReceipt={reference:string;submittedAt:string;name:string;email:string;contractKind:WithdrawalKind;contractId:string|null;declaration:string;notice:string};
export type WithdrawalResult={accepted:true;receipt:WithdrawalReceipt;receiptHtml:string;emailSent:boolean};
export async function listWithdrawalReceipts():Promise<WithdrawalResult[]>{
 const {data,error}=await supabase.functions.invoke('submit-withdrawal',{body:{action:'receipts'}});
 if(error||!Array.isArray(data?.receipts))throw new Error('Impossible de charger vos accusés de réception.');
 return data.receipts;
}
export async function submitWithdrawal(input:{requestId:string;kind:WithdrawalKind;contractId:string|null;declaration:string}){
 const {data,error}=await supabase.functions.invoke('submit-withdrawal',{body:{...input,confirmation:'CONFIRM_WITHDRAWAL'}});
 if(error||data?.accepted!==true||data.receipt?.reference!==input.requestId||typeof data.receiptHtml!=='string')throw new Error('La réception n’est pas confirmée. Réessayez sans changer les informations ; la même référence évite les doublons.');
 return data as WithdrawalResult;
}
