import { supabase, checkError, checkFunctionError, assertMissionTransition } from './_client';
import type { MissionStatus, PaymentMetadata } from './_client';

export const createPaymentIntent = async (amount: number, metadata?: PaymentMetadata, captureMethod: 'automatic' | 'manual' = 'automatic', destination?: string, applicationFeeAmount?: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: {
      amount: Math.round(amount * 100),
      captureMethod,
      metadata,
      destination,
      application_fee_amount: applicationFeeAmount ? Math.round(applicationFeeAmount * 100) : undefined
    }
  });

  await checkFunctionError(error);
  if (data?.error) throw new Error(data.error);

  return data;
};

export const capturePayment = async (paymentIntentId: string, amountToCapture?: number, missionId?: string, emergencyId?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('capture-payment', {
    body: {
      paymentIntentId,
      amountToCapture: amountToCapture ? Math.round(amountToCapture * 100) : undefined,
      missionId,
      emergencyId,
    }
  });

  await checkFunctionError(error);
  if (data?.error) throw new Error(data.error);

  return data;
};

export const completeMissionPayment = async (missionId: string, stripePaymentIntentId?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: mission, error: fetchErr } = await supabase
    .from('missions')
    .select('payment_intent_id, status, owner_id')
    .eq('id', missionId)
    .eq('owner_id', session.user.id)
    .single();

  if (fetchErr || !mission) throw new Error('Mission introuvable');
  assertMissionTransition(mission.status as MissionStatus, 'paid');

  const piId = mission.payment_intent_id || stripePaymentIntentId;

  if (piId && !stripePaymentIntentId) {
    await capturePayment(piId, undefined, missionId);
  }

  const { error } = await supabase
    .from('missions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', missionId)
    .eq('status', 'validated')
    .eq('owner_id', session.user.id);
  checkError(error);

  // Generate invoices after successful payment
  const session2 = (await supabase.auth.getSession()).data.session;
  if (session2?.access_token) {
    const invoiceBody = { missionId, stripePaymentIntentId: stripePaymentIntentId || piId };
    Promise.all([
      supabase.functions.invoke('generate-invoice', {
        body: { ...invoiceBody, invoiceType: 'service' },
      }),
      supabase.functions.invoke('generate-invoice', {
        body: { ...invoiceBody, invoiceType: 'service_fee' },
      }),
      supabase.functions.invoke('generate-invoice', {
        body: { ...invoiceBody, invoiceType: 'commission' },
      }),
    ]).catch((err) => console.error('[completeMissionPayment] Invoice generation error:', err));
  }
};

export const createStripeConnectAccount = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('create-connect-account', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    method: 'POST',
  });

  await checkFunctionError(error);
  if (data?.error) throw new Error(data.error);

  return data;
};

export const checkPaymentStatus = async (_sessionId: string) => ({ status: 'paid' as const });

export const getMyInvoices = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('invoices')
    .select('*, mission:missions(mission_type, description), emergency:emergency_requests(service_type, description), seller:users!invoices_seller_id_fkey(name, company_name), buyer:users!invoices_buyer_id_fkey(name, company_name)')
    .or(`seller_id.eq.${session.user.id},buyer_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false });
  checkError(error);
  return data || [];
};

const INVOICE_SELECT = `
  *,
  mission:missions(mission_type, description, property:properties(name, address)),
  emergency:emergency_requests(service_type, description),
  seller:users!invoices_seller_id_fkey(name, company_name, siren, vat_number, billing_address, is_vat_exempt),
  buyer:users!invoices_buyer_id_fkey(name, company_name, siren, vat_number, billing_address, is_vat_exempt)
`;

export const getInvoices = async (role: 'buyer' | 'seller') => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const filter = role === 'buyer'
    ? `buyer_id.eq.${session.user.id}`
    : `seller_id.eq.${session.user.id},and(buyer_id.eq.${session.user.id},invoice_type.eq.commission)`;
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .or(filter)
    .order('created_at', { ascending: false });
  checkError(error);
  return data || [];
};

export const getInvoiceDetail = async (invoiceId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('id', invoiceId)
    .single();
  checkError(error);
  return data;
};
