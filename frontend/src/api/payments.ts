import type { EarlyExecutionConsent } from '../services/early-execution-consent';
import { supabase, checkError, checkFunctionError, assertMissionTransition, captureError } from './_client';
import type { MissionStatus, PaymentMetadata } from './_client';

type InvoiceSource = {
  missionId?: string;
  emergencyId?: string;
  interventionId?: string;
  stripePaymentIntentId?: string;
};

export type InvoiceGenerationResult = {
  failedTypes: string[];
};

/** Edge Function invocations resolve even when the function responds 4xx. */
export const generateInvoiceDocuments = async (source: InvoiceSource): Promise<InvoiceGenerationResult> => {
  const invoiceTypes = ['service', 'service_fee', 'commission'] as const;
  const results = await Promise.allSettled(invoiceTypes.map(async (invoiceType) => {
    const { data, error } = await supabase.functions.invoke('generate-invoice', {
      body: { ...source, invoiceType },
    });
    await checkFunctionError(error);
    if (data?.error) throw new Error(String(data.error));
  }));

  const failedTypes = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    captureError(result.reason, { scope: 'generateInvoiceDocuments', invoiceType: invoiceTypes[index] });
    return [invoiceTypes[index]];
  });

  return { failedTypes };
};

export const createPaymentIntent = async (amount: number, metadata?: PaymentMetadata, captureMethod: 'automatic' | 'manual' = 'automatic', destination?: string, applicationFeeAmount?: number, executionConsent?: EarlyExecutionConsent) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: {
      amount: Math.round(amount * 100),
      captureMethod,
      executionConsent,
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
    .select('payment_intent_id, stripe_payment_intent_id, status, owner_id')
    .eq('id', missionId)
    .eq('owner_id', session.user.id)
    .single();

  if (fetchErr || !mission) throw new Error('Mission introuvable');
  if (mission.status !== 'paid') assertMissionTransition(mission.status as MissionStatus, 'paid');

  const piId = mission.payment_intent_id || mission.stripe_payment_intent_id || stripePaymentIntentId;

  if (piId && !stripePaymentIntentId && mission.status !== 'paid') {
    await capturePayment(piId, undefined, missionId);
  }

  if (!piId) throw new Error('Référence de paiement manquante');
  const { data: confirmed, error } = await supabase.functions.invoke('confirm-mission-payment', {
    body: { missionId, paymentIntentId: piId },
  });
  await checkFunctionError(error);
  if (!confirmed?.ok) throw new Error(confirmed?.error || 'Le paiement n’est pas encore confirmé.');

  // A document failure must not be presented as a failed card payment. Return
  // the result so the screen can explain the situation to the user.
  return generateInvoiceDocuments({ missionId, stripePaymentIntentId: stripePaymentIntentId || piId });
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

// Payment status must come from a server-verified mission; no optimistic paid stub.
export const checkPaymentStatus = async (missionId: string) => {
  const { data, error } = await supabase.from('missions').select('status').eq('id', missionId).single();
  checkError(error);
  if (!data) throw new Error('Mission introuvable');
  return { status: data.status as MissionStatus };
};

type InvoiceDocumentFields = {
  pdf_url?: string | null;
  facturx_url?: string | null;
};

const signedInvoiceUrlTtlSeconds = 60 * 60;

const extractInvoiceObjectPath = (value?: string | null) => {
  if (!value) return null;
  if (!/^https?:\/\//.test(value)) return value;

  try {
    const path = decodeURIComponent(new URL(value).pathname);
    const publicMarker = '/storage/v1/object/public/invoices/';
    const signedMarker = '/storage/v1/object/sign/invoices/';
    const marker = path.includes(publicMarker) ? publicMarker : path.includes(signedMarker) ? signedMarker : null;
    if (!marker) return null;
    return path.slice(path.indexOf(marker) + marker.length);
  } catch {
    return null;
  }
};

const resolveInvoiceDocumentUrl = async (value?: string | null) => {
  const objectPath = extractInvoiceObjectPath(value);
  if (!objectPath) return value ?? undefined;

  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUrl(objectPath, signedInvoiceUrlTtlSeconds);

  // Le bucket `invoices` est privé : sans URL signée le document est inaccessible.
  // Ne pas retomber sur la valeur brute — ce serait une URL publique morte (HTTP 400).
  // On remonte l'échec pour qu'il soit visible au lieu de produire un lien cassé.
  if (error || !data?.signedUrl) {
    captureError(error ?? new Error('Signature du document impossible'), {
      scope: 'resolveInvoiceDocumentUrl',
      objectPath,
    });
    return undefined;
  }
  return data.signedUrl;
};

const withSignedInvoiceDocuments = async <T extends InvoiceDocumentFields>(invoice: T): Promise<T> => ({
  ...invoice,
  pdf_url: await resolveInvoiceDocumentUrl(invoice.pdf_url),
  facturx_url: await resolveInvoiceDocumentUrl(invoice.facturx_url),
}) as T;

const withSignedInvoiceListDocuments = async <T extends InvoiceDocumentFields>(invoices: T[]): Promise<T[]> => {
  // A full history must not open one Storage connection per invoice at once.
  const signed: T[] = [];
  for (let offset = 0; offset < invoices.length; offset += 4) {
    signed.push(...await Promise.all(invoices.slice(offset, offset + 4).map(withSignedInvoiceDocuments)));
  }
  return signed;
};

export const getMyInvoices = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('invoices')
    .select('*, mission:missions(mission_type, description), emergency:emergency_requests(service_type, description), seller:public_profiles!invoices_seller_id_fkey(name, company_name), buyer:public_profiles!invoices_buyer_id_fkey(name, company_name)')
    .or(`seller_id.eq.${session.user.id},buyer_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false });
  checkError(error);
  return withSignedInvoiceListDocuments(data || []);
};

const INVOICE_SELECT = `
  *,
  mission:missions(mission_type, description, property:properties(name, address)),
  emergency:emergency_requests(service_type, description),
  seller:public_profiles!invoices_seller_id_fkey(name, company_name, siren, vat_number, billing_address, is_vat_exempt),
  buyer:public_profiles!invoices_buyer_id_fkey(name, company_name, siren, vat_number, billing_address, is_vat_exempt)
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
  return withSignedInvoiceListDocuments(data || []);
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
  return withSignedInvoiceDocuments(data);
};
