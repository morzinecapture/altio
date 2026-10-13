import React,{useEffect,useRef,useState} from 'react';
import {Alert,ScrollView,Text,TextInput,TouchableOpacity,StyleSheet,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter,useLocalSearchParams} from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {COLORS} from '../src/theme';
import {submitWithdrawal,listWithdrawalReceipts,WithdrawalKind,WithdrawalResult} from '../src/api/withdrawal';
export default function WithdrawalScreen(){
 const router=useRouter();const params=useLocalSearchParams<{kind?:string;contractId?:string}>();
 const [kind,setKind]=useState<WithdrawalKind>(['mission','emergency','intervention'].includes(params.kind||'')?params.kind as WithdrawalKind:'platform');
 const [contractId,setContractId]=useState(params.contractId||'');
 const [declaration,setDeclaration]=useState('Je vous notifie ma décision de me rétracter du contrat identifié ci-dessus.');
 const [busy,setBusy]=useState(false);const [result,setResult]=useState<Awaited<ReturnType<typeof submitWithdrawal>>|null>(null);
 const pending=useRef<Parameters<typeof submitWithdrawal>[0]|null>(null);
 const [history,setHistory]=useState<WithdrawalResult[]>([]);const [historyError,setHistoryError]=useState(false);
 useEffect(()=>{let active=true;listWithdrawalReceipts().then(rows=>{if(active)setHistory(rows)}).catch(()=>{if(active)setHistoryError(true)});return()=>{active=false}},[]);
 const confirm=async()=>{
  if(busy||result)return;
  if(kind!=='platform'&&!/^[0-9a-f-]{36}$/i.test(contractId.trim())){Alert.alert('Référence requise','Indiquez la référence du contrat figurant dans votre mission.');return;}
  if(!declaration.trim()){Alert.alert('Déclaration requise','Indiquez votre décision de vous rétracter.');return;}
  if(!pending.current)pending.current={requestId:Crypto.randomUUID(),kind,contractId:kind==='platform'?null:contractId.trim(),declaration:declaration.trim()};
  setBusy(true);
  try{setResult(await submitWithdrawal(pending.current));}catch(error){Alert.alert('Réception non confirmée',error instanceof Error?error.message:'Réessayez avec la même référence.');}finally{setBusy(false);}
 };
 const saveReceipt=async()=>{if(!result)return;try{const file=await Print.printToFileAsync({html:result.receiptHtml});if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:'Conserver mon accusé de réception'});else await Print.printAsync({uri:file.uri});}catch{Alert.alert('Enregistrement impossible','Votre déclaration reste enregistrée. Réessayez de conserver votre accusé.');}};
 const locked=busy||!!pending.current||!!result;
 return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
 <TouchableOpacity onPress={()=>router.back()}><Text style={styles.link}>Retour</Text></TouchableOpacity>
 <Text style={styles.title}>Renoncer au contrat ici</Text>
 {!result&&historyError&&<Text>Vos anciens accusés n’ont pas pu être chargés. Si vous avez déjà envoyé cette déclaration, revenez sur cet écran après avoir rétabli la connexion pour vérifier sa réception.</Text>}
 {!result&&history.length>0&&<><Text style={styles.heading}>Vos déclarations enregistrées</Text>{history.map(item=><TouchableOpacity key={item.receipt.reference} style={styles.choice} onPress={()=>setResult(item)}><Text>{new Date(item.receipt.submittedAt).toLocaleString('fr-FR')} — {item.receipt.contractKind}</Text><Text>{item.receipt.reference}</Text><Text style={styles.link}>Consulter et conserver l’accusé</Text></TouchableOpacity>)}</>}
 {result?<><Text style={styles.heading}>Déclaration reçue</Text><Text>{result.receipt.notice}</Text><Text>Référence : {result.receipt.reference}</Text><Text>{new Date(result.receipt.submittedAt).toLocaleString('fr-FR')}</Text><Text>{result.emailSent?'Un accusé a été envoyé à votre adresse de compte.':'L’envoi du courriel n’est pas encore confirmé. Conservez dès maintenant votre accusé ci-dessous.'}</Text><TouchableOpacity style={styles.button} onPress={saveReceipt}><Text style={styles.buttonText}>Conserver mon accusé PDF</Text></TouchableOpacity></>:<>
 <Text>Ce formulaire transmet votre décision de rétractation. Il est gratuit et aucun motif n’est exigé. La réception ne signifie pas qu’un remboursement a déjà été effectué.</Text>
 <Text style={styles.heading}>Contrat concerné</Text>
 {([['platform','Service Altio'],['mission','Mission'],['emergency','Intervention urgente'],['intervention','Autre intervention']] as [WithdrawalKind,string][]).map(([value,label])=><TouchableOpacity key={value} disabled={locked} onPress={()=>setKind(value)} style={[styles.choice,kind===value&&styles.selected]} accessibilityRole="radio" accessibilityState={{selected:kind===value}}><Text>{kind===value?'● ':'○ '}{label}</Text></TouchableOpacity>)}
 {kind!=='platform'&&<TextInput style={styles.input} value={contractId} onChangeText={setContractId} editable={!locked} placeholder="Référence du contrat" autoCapitalize="none" accessibilityLabel="Référence du contrat"/>}
 <Text style={styles.heading}>Votre déclaration</Text><TextInput style={[styles.input,{minHeight:110}]} multiline maxLength={4000} value={declaration} onChangeText={setDeclaration} editable={!locked} accessibilityLabel="Déclaration de rétractation"/>
 <Text>Relisez le contrat et votre déclaration avant de confirmer. L’accusé reprend ces informations avec la date et l’heure de réception.</Text>
 {pending.current&&<Text>Référence conservée pour la reprise : {pending.current.requestId}</Text>}
 <TouchableOpacity style={styles.button} disabled={busy} onPress={()=>Alert.alert('Confirmer la rétractation','Confirmez-vous l’envoi de cette déclaration pour le contrat indiqué ?',[{text:'Revenir au formulaire',style:'cancel'},{text:'Confirmer la rétractation',onPress:confirm}])}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Confirmer la rétractation</Text>}</TouchableOpacity>
 </>}
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#f5f7f5'},content:{padding:24,gap:16},title:{fontSize:28,fontWeight:'700',color:COLORS.textPrimary},heading:{fontSize:19,fontWeight:'600'},link:{color:COLORS.brandPrimary},input:{padding:15,borderWidth:1,borderColor:'#bacbc3',borderRadius:12,backgroundColor:'#fff'},choice:{padding:14,borderRadius:10,borderWidth:1,borderColor:'#d7e0db'},selected:{backgroundColor:'#e1f0e6',borderColor:'#18754c'},button:{backgroundColor:'#176848',padding:17,borderRadius:12,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'600'}});
