import { supabase, checkError, unwrapJoin, captureError } from './_client';
import type { UpdateProviderProfilePayload, FunctionsInvokeError } from './_client';

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
    .from('provider_profiles')
    .select('*, user:users!inner(*)');

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
  radius_km: number;
  weekly_availability: string[];
  cgu_accepted_at?: string;
  mandate_accepted_at?: string;
  dsa_certified_at?: string;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  // Update user + legal acceptance timestamps
  const isAutoEntrepreneur = data.company_type === 'auto_entrepreneur';
  const userUpdate: Record<string, unknown> = {
    onboarding_completed: true,
    is_auto_entrepreneur: isAutoEntrepreneur,
    is_vat_exempt: isAutoEntrepreneur,
  };
  if (data.cgu_accepted_at) userUpdate.cgu_accepted_at = data.cgu_accepted_at;
  if (data.mandate_accepted_at) userUpdate.mandate_accepted_at = data.mandate_accepted_at;
  if (data.dsa_certified_at) userUpdate.dsa_certified_at = data.dsa_certified_at;
  const { error: userError } = await supabase
    .from('users')
    .update(userUpdate)
    .eq('id', session.user.id);
  checkError(userError);
  const { data: updated, error } = await supabase
    .from('provider_profiles')
    .update({ specialties: data.specialties, company_type: data.company_type, radius_km: data.radius_km, weekly_availability: data.weekly_availability })
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
    supabase.from('users').select('name, picture').eq('id', providerId).single(),
    supabase.from('provider_profiles').select('rating, total_reviews, specialties, bio, zone').eq('provider_id', providerId).single()
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

  const [profileRes, completedRes, inProgressRes, applicationsRes, recentRes, earningsRes,
    emCompletedRes, emInProgressRes, emEarningsRes, emQuotesRes] = await Promise.all([
      supabase.from('provider_profiles').select('total_earnings, total_reviews, rating').eq('provider_id', uid).single(),
      supabase.from('missions').select('id', { count: 'exact', head: true }).eq('assigned_provider_id', uid).eq('status', 'completed'),
      supabase.from('missions').select('id', { count: 'exact', head: true }).eq('assigned_provider_id', uid).eq('status', 'in_progress'),
      supabase.from('mission_applications').select('id', { count: 'exact', head: true }).eq('provider_id', uid).eq('status', 'pending'),
      supabase.from('missions')
        .select('id, mission_type, description, fixed_rate, completed_at, property:properties(name)')
        .eq('assigned_provider_id', uid)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(5),
      supabase.from('missions')
        .select('fixed_rate')
        .eq('assigned_provider_id', uid)
        .eq('status', 'completed'),
      supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('accepted_provider_id', uid).eq('status', 'completed'),
      supabase.from('emergency_requests').select('id', { count: 'exact', head: true }).eq('accepted_provider_id', uid).neq('status', 'open').neq('status', 'completed'),
      supabase.from('emergency_requests').select('displacement_fee, diagnostic_fee, completed_at, id, service_type, description, property:properties(name)').eq('accepted_provider_id', uid).eq('status', 'completed').order('completed_at', { ascending: false }).limit(5),
      supabase.from('mission_quotes').select('repair_cost, emergency_request_id, emergency:emergency_requests!inner(status)').eq('provider_id', uid).eq('status', 'accepted').eq('emergency.status', 'completed')
    ]);

  const COMMISSION_RATE = 0.10;
  const missionsEarnings = (earningsRes.data || []).reduce((sum, m) => sum + (m.fixed_rate || 0), 0);
  const emFees = (emEarningsRes.data || []).reduce((sum, e) => sum + (e.displacement_fee || 0) + (e.diagnostic_fee || 0), 0);
  const emQuotesEarnings = (emQuotesRes.data || []).reduce((sum, q) => sum + (q.repair_cost || 0), 0);

  // Net perçu = montant brut × (1 - commission 10%)
  const grossEarnings = missionsEarnings + emFees + emQuotesEarnings;
  const totalEarnings = profileRes.data?.total_earnings || parseFloat((grossEarnings * (1 - COMMISSION_RATE)).toFixed(2));

  const rawRecentMissions = (recentRes.data || []).map((m) => ({
    ...m,
    mission_id: m.id,
    fixed_rate: parseFloat(((m.fixed_rate || 0) * (1 - COMMISSION_RATE)).toFixed(2)),
    property_name: unwrapJoin(m.property)?.name,
    is_emergency: false
  }));

  const rawRecentEmergencies = (emEarningsRes.data || []).map((e) => {
    const quote = (emQuotesRes.data || []).find((q) => q.emergency_request_id === e.id);
    const grossRate = (e.displacement_fee || 0) + (e.diagnostic_fee || 0) + (quote?.repair_cost || 0);
    return {
      mission_id: e.id,
      mission_type: e.service_type,
      description: e.description,
      fixed_rate: parseFloat((grossRate * (1 - COMMISSION_RATE)).toFixed(2)),
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
    rating: profileRes.data?.rating || 0,
    total_reviews: profileRes.data?.total_reviews || 0,
    completed_missions: (completedRes.count || 0) + (emCompletedRes.count || 0),
    in_progress_missions: (inProgressRes.count || 0) + (emInProgressRes.count || 0),
    pending_applications: applicationsRes.count || 0,
    recent_missions: recent,
  };
};

// ─── Account management ───────────────────────────────────────────────────────

export const deleteAccount = async (): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error) {
    // Extract the real message from the function response body
    const body = await (error as FunctionsInvokeError).context?.json?.().catch(() => null);
    throw new Error(body?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
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
