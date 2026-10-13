jest.mock('../../lib/supabase',()=>{const{mockSupabaseClient}=require('../../__test-utils__/supabase-mock');return{supabase:mockSupabaseClient}});
jest.mock('../../sentry',()=>({captureError:jest.fn()}));
import {mockSupabaseClient,resetAllMocks} from '../../__test-utils__/supabase-mock';
import {submitWithdrawal} from '../withdrawal';
const input={requestId:'fixture-id',kind:'platform' as const,contractId:null,declaration:'Je me rétracte.'};
beforeEach(()=>resetAllMocks());
test('explicit server receipt confirms registration even when email is pending',async()=>{
 mockSupabaseClient.functions.invoke.mockResolvedValue({data:{accepted:true,receipt:{reference:input.requestId},receiptHtml:'<p>Reçu</p>',emailSent:false},error:null});
 const result=await submitWithdrawal(input);expect(result.accepted).toBe(true);expect(result.emailSent).toBe(false);expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith('submit-withdrawal',{body:{...input,confirmation:'CONFIRM_WITHDRAWAL'}});
});
test.each([null,{}, {accepted:true,receipt:{reference:'other'},receiptHtml:'test'}, {accepted:true,receipt:{reference:input.requestId}}])('does not invent a successful withdrawal receipt %j',async data=>{mockSupabaseClient.functions.invoke.mockResolvedValue({data,error:null});await expect(submitWithdrawal(input)).rejects.toThrow('réception n’est pas confirmée')});
