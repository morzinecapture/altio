import { supabase, checkError, unwrapJoin } from './_client';
import type { UpdateProviderProfilePayload, FunctionsInvokeError } from './_client';
import { priceFromTtc, providerVatRate } from '../utils/commission';
import { quotePrice } from '../utils/quotePrice';

// ─── Geo helpers ──────────────────────────────────────────────────────────────

export const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const encoded = encodeURIComponent(address + ', France');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Altio/1.0 (contact@altio.app)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const setRole = async (role: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: session.user.id,
      email: session.user.email || '',
      name: session.user.user_metadata?.full_name || '',
      picture: session.user.user_metadata?.avatar_url || '',
      role
    })
    .select()
    .single();

  checkError(error);

  if (role === 'provider') {
    // Create a provider profile if none exists
    const { error: profileError } = await supabase
      .from('provider_profiles')
      .insert({ provider_id: session.user.id })
      .select()
      .single();

    if (profileError && profileError.code !== '23505') { // 23505 is unique violation (already exists)
      checkError(profileError);
    }
  }

  return data;
};

export const getProfile = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('users')
    .select('*, provider_profile:provider_profiles(*)')
    .eq('id', session.user.id)
    .single();

  checkError(error);
  return data;
};

export const getProviders = async (specialty?: string) => {
  let query = supabase
    .from('public_provider_profiles')
    .select('*, user:public_profiles!inner(id, name, picture, role)');

  if (specialty) {
    query = query.contains('specialties', [specialty]);
  }

  const { data, error } = await query;
  checkError(error);
  return data || [];
};

export const updateProviderProfile = async (data: UpdateProviderProfilePayload) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: updated, error } = await supabase
    .from('provider_profiles')
    .update(data)
    .eq('provider_id', session.user.id)
    .select()
    .single();

  checkError(error);
  return updated;
};

export const completeOwnerOnboarding = async (data: {
  owner_type: string;
  company_name?: string;
  siren?: string;
  vat_number?: string;
  billing_address?: string;
  is_vat_exempt?: boolean;
  cgu_accepted_at?: string;
  marketing_consent_at?: string | null;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const updatePayload: Record<string, unknown> = {
    ...data,
    onboarding_completed: true,
  };
  // Explicitly set marketing_consent_at to null if not provided
  if (!data.marketing_consent_at) {
    updatePayload.marketing_consent_at = null;
  }
  const { data: updated, error } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('id', session.user.id)
    .select()
    .single();
  checkError(error);
  return updated;
};

export const completeProviderOnboarding = async (data: {
  specialties: string[];
  company_type: string;
  is_vat_exempt?: boolean;
  radius_km: number;
  weekly_availability: string[];
  siren?: string;
  rc_pro_doc_url?: string;
  decennale_doc_url?: string;
  latitude?: number;
  longitude?: number;
  location_label?: string;
  cgu_accepted_at?: string;
  mandate_accepted_at?: string;
  dsa_certified_at?: string;
  notify_new_missions_in_zone?: boolean;
}) => {
  if (typeof data.is_vat_exempt !== 'boolean') throw new Error('Veuillez confirmer votre régime de TVA.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  // Update user + legal acceptance timestamps
  const isAutoEntrepreneur = data.company_type === 'auto_entrepreneur';
  const userUpdate: Record<string, unknown> = {
    onboarding_completed: true,
    is_auto_entrepreneur: isAutoEntrepreneur,
    is_vat_exempt: data.is_vat_exempt === true,
  };
  if (data.cgu_accepted_at) userUpdate.cgu_accepted_at = data.cgu_accepted_at;
  if (data.mandate_accepted_at) userUpdate.mandate_accepted_at = data.mandate_accepted_at;
  if (data.dsa_certified_at) userUpdate.dsa_certified_at = data.dsa_certified_at;
  if (data.siren) userUpdate.siren = data.siren.replace(/\s/g, '');
  const { error: userError } = await supabase
    .from('users')
    .update(userUpdate)
    .eq('id', session.user.id);
  checkError(userError);
  const profileUpdate: Record<string, unknown> = {
    specialties: data.specialties,
    company_type: data.company_type,
    radius_km: data.radius_km,
    weekly_availability: data.weekly_availability,
  };
  if (data.latitude !== undefined) profileUpdate.latitude = data.latitude;
  if (data.longitude !== undefined) profileUpdate.longitude = data.longitude;
  if (data.location_label !== undefined) profileUpdate.location_label = data.location_label;
  if (data.notify_new_missions_in_zone !== undefined) profileUpdate.notify_new_missions_in_zone = data.notify_new_missions_in_zone;
  if (data.rc_pro_doc_url !== undefined) profileUpdate.rc_pro_doc_url = data.rc_pro_doc_url;
  if (data.decennale_doc_url !== undefined) profileUpdate.decennale_doc_url = data.decennale_doc_url;
  const { data: updated, error } = await supabase
    .from('provider_profiles')
    .update(profileUpdate)
    .eq('provider_id', session.user.id)
    .select()
    .single();
  checkError(error);
  return updated;
};

// ─── Service Types ────────────────────────────────────────────────────────────

export const getServiceTypes = async () => [
  { id: 'plumbing', name: 'Plomberie', icon: 'water-outline' },
  { id: 'electrical', name: 'Électricité', icon: 'flash-outline' },
  { id: 'locksmith', name: 'Serrurerie', icon: 'key-outline' },
  { id: 'jacuzzi', name: 'Jacuzzi/Piscine', icon: 'snow-outline' },
  { id: 'repair', name: 'Réparation', icon: 'construct-outline' }
];

// ─── Provider ─────────────────────────────────────────────────────────────────

export const toggleAvailability = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');

  const { data: profile } = await supabase.from('provider_profiles').select('available').eq('provider_id', session.user.id).single();

  if (profile) {
    const { data, error } = await supabase.from('provider_profiles').update({ available: !profile.available }).eq('provider_id', session.user.id).select().single();
    checkError(error);
    return data;
  }
};

export const getProviderProfile = async (providerId: string) => {
  const [userRes, profileRes] = await Promise.all([
    supabase.from('public_profiles').select('name, picture').eq('id', providerId).single(),
    supabase.from('public_provider_profiles').select('rating, total_reviews, specialties, bio, zone').eq('provider_id', providerId).single()
  ]);

  return {
    ...(userRes.data || {}),
    ...(profileRes.data || {})
  };
};

export const getProviderStats = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const uid = session.user.id;
  // The current regular-mission flow ends at `paid`. Keep `completed` for
  // legacy rows created before the payment state machine was introduced.
  const settledMissionStatuses = ['paid', 'completed'];

  const [completedRes, inProgressRes, applicationsRes, recentRes, invoiceRevenueRes,
    emCompletedRes, emInProgressRes, emEarningsRes, emQuotesRes, reviewsRes, vatRes] = await Promise.all([
      supabase.from('missions').select('id', { count: 'exact', head: true }).eq('assigned_provider_id', uid).in('status', settledMissionStatuses),
      supabase.from('missions').select('id', { count: 'exact', head: true }).eq('assigned_provider_id', uid).in('status', ['assigned', 'in_progress']),
      supabase.from('mission_applications').select('id', { count: 'exact', head: true }).eq('provider_id', uid).eq('status', 'pending'),
      supabase.from('missions')
        .select('id, mission_type, description, fixed_rate, completed_at, property:properties(name)')
        .eq('assigned_provider_id', uid)
        .in('status', settledMissionStatuses)
        .order('completed_at', { ascending: false })
        .limit(5),
      supabase.from('invoices')
        .select('invoice_type, amount_ttc, seller_id, buyer_id, status')
        .or(`seller_id.eq.${uid},buyer_id.eq.${uid}`)
        .neq('status', 'cancelled'),
      supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('accepted_provider_id', uid).eq('status', 'completed'),
      supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('accepted_provider_id', uid).neq('status', 'bids_open').neq('status', 'completed'),
      supabase.from('emergency_requests').select('displacement_fee, diagnostic_fee, completed_at, id, service_type, description, property:properties(name)').eq('accepted_provider_id', uid).eq('status', 'completed').order('completed_at', { ascending: false }).limit(5),
      supabase.from('mission_quotes').select('repair_cost, tva_rate, is_vat_exempt, emergency_request_id, line_items:quote_line_items(quantity, unit_price_ht, unit_price), emergency:emergency_requests!inner(status)').eq('provider_id', uid).eq('status', 'accepted').eq('emergency.status', 'completed'),
      supabase.from('reviews').select('rating').eq('provider_id', uid),
      supabase.from('users').select('is_vat_exempt').eq('id', uid).maybeSingle(),
    ]);

  // Net amounts: TTC price minus Altio's 10 % of the HT price.
  const vatRate = providerVatRate(vatRes?.data?.is_vat_exempt);

  // Rating : calculé directement depuis la table reviews (la colonne provider_profiles.rating n'est pas mise à jour automatiquement)
  const reviewsList = reviewsRes.data || [];
  const totalReviews = reviewsList.length;
  const avgRating = totalReviews > 0
    ? parseFloat((reviewsList.reduce((sum, r) => sum + (r.rating || 0), 0) / totalReviews).toFixed(1))
    : 0;

  // Invoices are generated only after payment, so they are the authoritative
  // source for money actually received. Service invoices add revenue and
  // commission invoices subtract Altio's fee. Credit notes carry a negative
  // amount and therefore reverse the corresponding side automatically.
  const totalEarnings = parseFloat((invoiceRevenueRes.data || []).reduce((sum, invoice) => {
    if (invoice.status === 'cancelled') return sum;
    const amount = Number(invoice.amount_ttc || 0);
    if (invoice.seller_id === uid && ['service', 'displacement', 'credit_note'].includes(invoice.invoice_type)) {
      return sum + amount;
    }
    if (invoice.buyer_id === uid && ['commission', 'credit_note'].includes(invoice.invoice_type)) {
      return sum - amount;
    }
    return sum;
  }, 0).toFixed(2));

  const rawRecentMissions = (recentRes.data || []).map((m) => ({
    ...m,
    mission_id: m.id,
    fixed_rate: priceFromTtc(m.fixed_rate || 0, vatRate).payout,
    property_name: unwrapJoin(m.property)?.name,
    is_emergency: false
  }));

  const rawRecentEmergencies = (emEarningsRes.data || []).map((e) => {
    const quote = (emQuotesRes.data || []).find((q) => q.emergency_request_id === e.id);
    const visitPayout = priceFromTtc((e.displacement_fee || 0) + (e.diagnostic_fee || 0), vatRate).payout;
    const repairPayout = quote ? quotePrice(quote).payout : 0;
    return {
      mission_id: e.id,
      mission_type: e.service_type,
      description: e.description,
      fixed_rate: Math.round((visitPayout + repairPayout) * 100) / 100,
      completed_at: e.completed_at,
      property_name: unwrapJoin(e.property)?.name,
      is_emergency: true
    };
  });

  const recent = [...rawRecentMissions, ...rawRecentEmergencies]
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .slice(0, 5);

  return {
    total_earnings: totalEarnings,
    rating: avgRating,
    total_reviews: totalReviews,
    completed_missions: (completedRes.count || 0) + (emCompletedRes.count || 0),
    in_progress_missions: (inProgressRes.count || 0) + (emInProgressRes.count || 0),
    pending_applications: applicationsRes.count || 0,
    recent_missions: recent,
  };
};

// ─── Account management ───────────────────────────────────────────────────────

export const deleteAccount = async (): Promise<'deleted' | 'processing'> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  // Pin both requests to the initiating session: a concurrent sign-in must not
  // redirect this destructive operation to another account.
  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(body.action === 'prepare' ? 'prepare-account-deletion' : 'delete-account', {
      body, headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      const response = await (error as FunctionsInvokeError).context?.json?.().catch(() => null);
      throw new Error(response?.error || error.message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const preparation = await invoke({ action: 'prepare' });
  // A legacy endpoint returning success:true must never trigger another call.
  if (preparation?.protocol !== 1 || preparation?.ready !== true ||
      preparation?.userId !== session.user.id || typeof preparation?.requiresApple !== 'boolean') {
    throw new Error('La préparation de la suppression n’a pas été confirmée. Réessayez plus tard.');
  }
  let appleAuthorizationCode: string | undefined;
  if (preparation.requiresApple) {
    if (typeof preparation.appleSubject !== 'string' || !preparation.appleSubject) {
      throw new Error('Votre identité Apple n’a pas été confirmée.');
    }
    const { confirmAppleAccountDeletion } = await import('../services/account-deletion-apple');
    appleAuthorizationCode = await confirmAppleAccountDeletion(preparation.appleSubject);
  }
  const current = await supabase.auth.getSession();
  if (current.data.session?.user.id !== session.user.id) {
    throw new Error('Votre session a changé. La suppression a été interrompue.');
  }
  const data = await invoke({ action: 'delete', confirmation: 'DELETE_MY_ACCOUNT', ...(appleAuthorizationCode ? { appleAuthorizationCode } : {}) });
  if (data?.success === false && data?.accepted === true && data?.status === 'processing' && typeof data?.requestId === 'string' && data.requestId) return 'processing';
  if (data?.success !== true) {
    throw new Error('La suppression du compte n’a pas été confirmée. Réessayez dans quelques instants.');
  }
  return 'deleted';
};

// ─── Billing info ─────────────────────────────────────────────────────────────

export const updateBillingInfo = async (data: {
  company_name?: string;
  siren?: string;
  vat_number?: string;
  billing_address?: string;
  is_vat_exempt?: boolean;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data: updated, error } = await supabase
    .from('users')
    .update(data)
    .eq('id', session.user.id)
    .select()
    .single();
  checkError(error);
  return updated;
};

// ─── Marketing Consent (RGPD / CPCE art. L34-5) ─────────────────────────────

export const updateMarketingConsent = async (consent: boolean) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('users')
    .update({ marketing_consent_at: consent ? new Date().toISOString() : null })
    .eq('id', session.user.id);
  checkError(error);
  return { consent };
};

export const getMarketingConsent = async (): Promise<boolean> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('users')
    .select('marketing_consent_at')
    .eq('id', session.user.id)
    .single();
  checkError(error);
  return data?.marketing_consent_at != null;
};
