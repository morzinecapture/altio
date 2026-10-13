import {Alert} from 'react-native';
export type EarlyExecutionConsent={version:'2026-10-09-v1';requested:true;acknowledged:true};
export const EARLY_EXECUTION_REQUEST='Je demande expressément que la prestation commence avant la fin du délai de rétractation de 14 jours.';
export const EARLY_EXECUTION_ACK='Je reconnais que je perdrai mon droit de rétractation lorsque la prestation sera entièrement exécutée. Son seul commencement ne supprime pas ce droit.';
export function confirmEarlyExecution():Promise<EarlyExecutionConsent>{
 return new Promise((resolve,reject)=>{
  const cancel=()=>reject(new Error('Démarrage anticipé non autorisé. Revenez au contrat pour convenir d’un début après le délai de rétractation.'));
  Alert.alert('Demande de démarrage anticipé',EARLY_EXECUTION_REQUEST,[{text:'Revenir au contrat',style:'cancel',onPress:cancel},{text:'Je demande ce démarrage',onPress:()=>{
   Alert.alert('Droit de rétractation',EARLY_EXECUTION_ACK,[{text:'Revenir au contrat',style:'cancel',onPress:cancel},{text:'Je le reconnais',onPress:()=>resolve({version:'2026-10-09-v1',requested:true,acknowledged:true})}],{cancelable:true,onDismiss:cancel});
  }}],{cancelable:true,onDismiss:cancel});
 });
}
