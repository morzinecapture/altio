jest.mock('../../lib/supabase', () => {
  const { mockSupabaseClient } = require('../../__test-utils__/supabase-mock');
  return { supabase: mockSupabaseClient };
});
jest.mock('../../sentry', () => ({ captureError: jest.fn() }));
import { mockSupabaseClient, mockSupabaseResponse, resetAllMocks } from '../../__test-utils__/supabase-mock';
import { completeMissionPayment, checkPaymentStatus } from '../payments';
beforeEach(() => {
  resetAllMocks();
  mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } } });
  mockSupabaseClient.functions.invoke.mockReset();
});
test('a validated mission without payment reference cannot be completed', async () => {
  mockSupabaseResponse('missions','select',{status:'validated',owner_id:'owner'});
  await expect(completeMissionPayment('mission')).rejects.toThrow('Référence de paiement manquante');
  expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled();
});
test('a rejected server confirmation never generates invoices', async () => {
  mockSupabaseResponse('missions','select',{status:'validated',owner_id:'owner'});
  mockSupabaseClient.functions.invoke.mockResolvedValue({data:{ok:false,error:'Paiement non confirmé'},error:null});
  await expect(completeMissionPayment('mission','pi_test')).rejects.toThrow('Paiement non confirmé');
  expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledTimes(1);
});
test('invoice failures do not misrepresent a confirmed payment as a failed charge', async () => {
  mockSupabaseResponse('missions','select',{status:'validated',owner_id:'owner'});
  mockSupabaseClient.functions.invoke.mockImplementation(async (name: string, options: any) => ({
    data: name==='confirm-mission-payment' ? {ok:true} : options.body.invoiceType==='service' ? {error:'Document indisponible'} : {success:true},error:null,
  }));
  await expect(completeMissionPayment('mission','pi_test')).resolves.toEqual({failedTypes:['service']});
});
test('a paid mission can retry documents using its server-stored payment without another capture', async () => {
  mockSupabaseResponse('missions','select',{status:'paid',owner_id:'owner',stripe_payment_intent_id:'pi_stored'});
  mockSupabaseClient.functions.invoke.mockResolvedValue({data:{ok:true,success:true},error:null});
  await expect(completeMissionPayment('mission')).resolves.toEqual({failedTypes:[]});
  expect(mockSupabaseClient.functions.invoke.mock.calls.map((call:any[])=>call[0])).not.toContain('capture-payment');
});
test('payment status remains validated until the server marks it paid', async () => {
  mockSupabaseResponse('missions','select',{status:'validated'});
  await expect(checkPaymentStatus('mission')).resolves.toEqual({status:'validated'});
});

test('invoice history limits concurrent Storage requests and preserves list order', async () => {
  const { getInvoices } = require('../payments');
  const invoices = Array.from({ length: 25 }, (_, index) => ({
    id: String(index), pdf_url: `2026/${index}.html`, facturx_url: `2026/${index}.xml`,
  }));
  mockSupabaseResponse('invoices', 'select', invoices);
  let active = 0;
  let peak = 0;
  const sign = mockSupabaseClient.storage.from('invoices').createSignedUrl;
  sign.mockImplementation(async (path: string) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return { data: { signedUrl: `https://local.invalid/${path}` }, error: null };
  });
  const result = await getInvoices('buyer');
  expect(peak).toBeLessThanOrEqual(4);
  expect(result.map((invoice: any) => invoice.id)).toEqual(invoices.map(invoice => invoice.id));
  expect(result[24].facturx_url).toBe('https://local.invalid/2026/24.xml');
});
