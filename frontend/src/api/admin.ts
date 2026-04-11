import { supabase, checkError, captureError, unwrapJoin, requireAdmin } from './_client';
import type { ProviderDocument, MissionStatus } from './_client';
import { sendPushNotification } from './notifications';
import { assertMissionTransition } from './_client';

export const getAdminStats = async () => {
  await requireAdmin();
  const { data, error } = await supabase
    .from('admin_dashboard_stats')
    .select('*')
    .single();
  checkError(error);
  return data;
};

export const getAdminUsers = async (
  search: string = '',
  role: string = 'all',
  status: string = 'all',
) => {
  await requireAdmin();
  let query = supabase
    .from('users')
    .select('id, name, email, role, is_admin, suspended, created_at, onboarding_completed')
    .order('created_at', { ascending: false })
    .limit(100);

  if (search.trim()) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (role !== 'all') {
    query = query.eq('role', role);
  }
  if (status === 'suspended') {
    query = query.eq('suspended', true);
  }

  const { data, error } = await query;
  checkError(error);
  return data ?? [];
};

export const getAdminUserDetail = async (userId: string) => {
  await requireAdmin();
  const [userRes, providerRes, missionsRes, auditRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase.from('provider_profiles').select('*').eq('provider_id', userId).maybeSingle(),
    supabase.from('missions')
      .select('id, status, mission_type, scheduled_date, fixed_rate, created_at')
      .or(`owner_id.eq.${userId},assigned_provider_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('audit_log')
      .select('*')
      .eq('target_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  return {
    user: userRes.data,
    provider: providerRes.data,
    missions: missionsRes.data ?? [],
    audit: auditRes.data ?? [],
  };
};

export const suspendUser = async (userId: string, reason: string = '') => {
  const admin = await requireAdmin();

  const { error } = await supabase
    .from('users')
    .update({ suspended: true, suspended_at: new Date().toISOString(), suspended_reason: reason })
    .eq('id', userId);
  checkError(error);

  await supabase.from('audit_log').insert({
    admin_id: admin.id,
    action: 'suspend_user',
    target_type: 'user',
    target_id: userId,
    metadata: { reason },
  });
};

export const reactivateUser = async (userId: string) => {
  const admin = await requireAdmin();

  const { error } = await supabase
    .from('users')
    .update({ suspended: false, suspended_at: null, suspended_reason: null })
    .eq('id', userId);
  checkError(error);

  await supabase.from('audit_log').insert({
    admin_id: admin.id,
    action: 'reactivate_user',
    target_type: 'user',
    target_id: userId,
    metadata: {},
  });
};

export const approveProviderDocument = async (providerId: string, docType: string) => {
  const admin = await requireAdmin();

  const { data: profile, error: fetchErr } = await supabase
    .from('provider_profiles')
    .select('documents')
    .eq('provider_id', providerId)
    .single();
  checkError(fetchErr);

  const docs = (profile?.documents ?? []).map((d: ProviderDocument) =>
    d.type === docType ? { ...d, status: 'approved' as const } : d
  );
  const allApproved = docs.every((d: ProviderDocument) => d.status === 'approved');

  const { error } = await supabase
    .from('provider_profiles')
    .update({ documents: docs, verified: allApproved })
    .eq('provider_id', providerId);
  checkError(error);

  await supabase.from('audit_log').insert({
    admin_id: admin.id,
    action: 'approve_doc',
    target_type: 'provider_profile',
    target_id: providerId,
    metadata: { doc_type: docType },
  });
};

export const rejectProviderDocument = async (providerId: string, docType: string, reason: string = '') => {
  const admin = await requireAdmin();

  const { data: profile, error: fetchErr } = await supabase
    .from('provider_profiles')
    .select('documents')
    .eq('provider_id', providerId)
    .single();
  checkError(fetchErr);

  const docs = (profile?.documents ?? []).map((d: ProviderDocument) =>
    d.type === docType ? { ...d, status: 'rejected' as const, reject_reason: reason } : d
  );

  const { error } = await supabase
    .from('provider_profiles')
    .update({ documents: docs, verified: false })
    .eq('provider_id', providerId);
  checkError(error);

  await supabase.from('audit_log').insert({
    admin_id: admin.id,
    action: 'reject_doc',
    target_type: 'provider_profile',
    target_id: providerId,
    metadata: { doc_type: docType, reason },
  });
};

export const getAdminEmergencies = async () => {
  await requireAdmin();
  const { data, error } = await supabase
    .from('emergency_requests')
    .select('*, property:properties(name, address, latitude, longitude), owner:users!owner_id(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  checkError(error);
  return data ?? [];
};

export const getAdminFinances = async () => {
  await requireAdmin();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: missions, error } = await supabase
    .from('missions')
    .select('id, status, mission_type, fixed_rate, created_at, properties(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  checkError(error);

  const all = missions ?? [];
  const paid = all.filter(m => ['completed', 'awaiting_payment'].includes(m.status));
  const paidThisMonth = paid.filter(m => new Date(m.created_at) >= startOfMonth);

  return {
    commissions_this_month: paidThisMonth.reduce((s, m) => s + (m.fixed_rate ?? 0) * 0.10, 0),
    volume_this_month: paidThisMonth.reduce((s, m) => s + (m.fixed_rate ?? 0), 0),
    paid_missions_count: paid.length,
    total_volume: paid.reduce((s, m) => s + (m.fixed_rate ?? 0), 0),
    recent_missions: all.slice(0, 20).map((m) => ({
      ...m,
      property_name: unwrapJoin(m.properties)?.name,
    })),
  };
};

export const getMonthlyVolume = async () => {
  await requireAdmin();
  const { data, error } = await supabase
    .from('missions')
    .select('fixed_rate, created_at, status')
    .in('status', ['completed', 'awaiting_payment']);
  checkError(error);

  const now = new Date();
  const months: { month: number; year: number; volume: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: d.getMonth() + 1, year: d.getFullYear(), volume: 0 });
  }

  (data ?? []).forEach((m) => {
    const d = new Date(m.created_at);
    const entry = months.find(mo => mo.month === d.getMonth() + 1 && mo.year === d.getFullYear());
    if (entry) entry.volume += m.fixed_rate ?? 0;
  });

  return months;
};

export const getAuditLog = async (targetId?: string) => {
  await requireAdmin();
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (targetId) {
    query = query.eq('target_id', targetId);
  }

  const { data, error } = await query;
  checkError(error);
  return data ?? [];
};

export const logAuditAction = async (
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
) => {
  const admin = await requireAdmin();

  await supabase.from('audit_log').insert({
    admin_id: admin.id,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    metadata: metadata ?? {},
  });
};

export const getAdminInvoices = async (filters?: { invoice_type?: string; status?: string; limit?: number }) => {
  await requireAdmin();
  let query = supabase
    .from('invoices')
    .select('*, mission:missions(mission_type, description, property:properties(name)), seller:users!invoices_seller_id_fkey(name, company_name), buyer:users!invoices_buyer_id_fkey(name, company_name)')
    .order('created_at', { ascending: false });

  if (filters?.invoice_type) query = query.eq('invoice_type', filters.invoice_type);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  checkError(error);
  return data || [];
};

export const getDisputes = async () => {
  await requireAdmin();
  const { data, error } = await supabase
    .from('missions')
    .select('id, status, mission_type, fixed_rate, dispute_reason, dispute_at, dispute_resolution, dispute_resolved_at, owner:users!missions_owner_id_fkey(name), provider:users!missions_assigned_provider_id_fkey(name), property:properties(name, address)')
    .eq('status', 'dispute')
    .order('dispute_at', { ascending: false });
  checkError(error);
  return data || [];
};

export const resolveDispute = async (missionId: string, resolution: string, outcome: 'validate' | 'cancel' | 'partial_refund') => {
  const admin = await requireAdmin();

  const { data: mission, error: fetchErr } = await supabase
    .from('missions')
    .select('status, owner_id, assigned_provider_id, mission_type, property:properties(name)')
    .eq('id', missionId)
    .single();

  if (fetchErr || !mission) throw new Error('Mission introuvable');

  const targetStatus = outcome === 'cancel' ? 'cancelled' : 'validated';
  assertMissionTransition(mission.status as MissionStatus, targetStatus as MissionStatus);

  const { error } = await supabase
    .from('missions')
    .update({
      status: targetStatus,
      dispute_resolution: resolution,
      dispute_resolved_at: new Date().toISOString(),
    })
    .eq('id', missionId)
    .eq('status', 'dispute');
  checkError(error);

  const missionLabel = `${mission.mission_type || 'service'}`;

  // Contextual dispute resolution notifications (richer than generic trigger)
  if (mission.owner_id) {
    const ownerMsg = outcome === 'cancel'
      ? `Le litige pour "${missionLabel}" a été résolu : intervention annulée. ${resolution}`
      : `Le litige pour "${missionLabel}" a été résolu : intervention validée, paiement en cours. ${resolution}`;
    sendPushNotification(mission.owner_id, '✅ Litige résolu', ownerMsg, { missionId }).catch(err => captureError(err, { context: 'push-notification-dispute-resolved-owner', userId: mission.owner_id }));
  }

  if (mission.assigned_provider_id) {
    const providerMsg = outcome === 'cancel'
      ? `Le litige pour "${missionLabel}" a été résolu : mission annulée. ${resolution}`
      : `Le litige pour "${missionLabel}" a été résolu en votre faveur. Le paiement va être effectué. ${resolution}`;
    sendPushNotification(mission.assigned_provider_id, '✅ Litige résolu', providerMsg, { missionId }).catch(err => captureError(err, { context: 'push-notification-dispute-resolved-provider', userId: mission.assigned_provider_id }));
  }

  await supabase.from('audit_log').insert({
    admin_id: admin.id,
    action: 'resolve_dispute',
    target_type: 'mission',
    target_id: missionId,
    metadata: { outcome, resolution, previous_status: 'dispute', new_status: targetStatus },
  }).then(({ error: auditErr }) => { if (auditErr) captureError(auditErr, { context: 'audit-log-resolve-dispute', missionId }); });

  return { status: targetStatus };
};

export const exportCsvData = async (): Promise<string> => {
  await requireAdmin();
  const { data, error } = await supabase
    .from('missions')
    .select('id, status, mission_type, fixed_rate, created_at, properties(name, address)')
    .order('created_at', { ascending: false })
    .limit(500);
  checkError(error);

  const rows = data ?? [];
  const headers = 'Date,Mission ID,Type,Propriété,Adresse,Montant,Commission (10%),Statut';
  const lines = rows.map((m) => {
    const date = new Date(m.created_at).toLocaleDateString('fr-FR');
    const prop = unwrapJoin(m.properties)?.name ?? '';
    const addr = unwrapJoin(m.properties)?.address ?? '';
    const amount = m.fixed_rate ?? 0;
    const commission = (amount * 0.10).toFixed(2);
    return `${date},${m.id},${m.mission_type},"${prop}","${addr}",${amount},${commission},${m.status}`;
  });

  return [headers, ...lines].join('\n');
};
