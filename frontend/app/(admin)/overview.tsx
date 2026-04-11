import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { useAuth } from '../../src/auth';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAdminStats, getAuditLog, getDisputes, resolveDispute } from '../../src/api';
import type { AdminStats, AuditLogEntry } from '../../src/types/api';

interface DisputeItem {
  id: string;
  status: string;
  mission_type?: string;
  fixed_rate?: number;
  dispute_reason?: string | null;
  dispute_at?: string | null;
  dispute_resolution?: string | null;
  dispute_resolved_at?: string | null;
  owner?: { name?: string } | { name?: string }[];
  provider?: { name?: string } | { name?: string }[];
  property?: { name?: string; city?: string } | { name?: string; city?: string }[];
}

export default function AdminOverview() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, handleLogout } = useAuth();
  const queryClient = useQueryClient();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');

  const { data: stats = null, isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
  });
  const { data: audit = [] as AuditLogEntry[], refetch: refetchAudit } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => getAuditLog(),
  });
  const { data: disputes = [] as DisputeItem[], refetch: refetchDisputes } = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: getDisputes,
  });

  const loading = loadingStats;
  const refetchAll = () => { refetchStats(); refetchAudit(); refetchDisputes(); };

  const KPI_CONFIG = [
    { key: 'active_missions_count',      label: t('admin.overview.active_missions'),      icon: 'briefcase-outline',  color: COLORS.info,         bg: COLORS.infoSoft },
    { key: 'commissions_this_month',     label: t('admin.overview.commissions_month'),   icon: 'trending-up-outline', color: COLORS.success,      bg: COLORS.successSoft, isMoney: true },
    { key: 'new_users_30d',              label: t('admin.overview.new_users_30d'),   icon: 'people-outline',     color: COLORS.brandPrimary, bg: '#EEF2FF' },
    { key: 'active_emergencies',         label: t('admin.overview.active_emergencies'),      icon: 'warning-outline',    color: COLORS.urgency,      bg: COLORS.urgencySoft },
  ];

  const ACTION_LABELS: Record<string, string> = {
    suspend_user:     t('admin.overview.audit_suspend_user'),
    reactivate_user:  t('admin.overview.audit_reactivate_user'),
    approve_doc:      t('admin.overview.audit_approve_doc'),
    reject_doc:       t('admin.overview.audit_reject_doc'),
    export_csv:       t('admin.overview.audit_export_csv'),
    generate_invoice: t('admin.overview.audit_generate_invoice'),
  };

  function formatRelative(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return t('admin.overview.time_ago_min', { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('admin.overview.time_ago_hours', { count: hrs });
    return t('admin.overview.time_ago_days', { count: Math.floor(hrs / 24) });
  }

  const handleResolve = (disputeId: string, outcome: 'validate' | 'cancel') => {
    const label = outcome === 'validate' ? 'Valider le paiement' : 'Annuler la mission';
    Alert.prompt(
      label,
      'Décrivez la résolution (visible par les deux parties) :',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: label,
          onPress: async (text: string | undefined) => {
            if (!text?.trim()) return;
            try {
              setResolvingId(disputeId);
              await resolveDispute(disputeId, text.trim(), outcome);
              Alert.alert('Litige résolu', 'Les deux parties ont été notifiées.');
              refetchAll();
            } catch (e: unknown) {
              Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
            } finally {
              setResolvingId(null);
            }
          },
        },
      ],
      'plain-text',
      ''
    );
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.purple} />
    </View>
  );

  return (
    <AdminGuard>
      <SafeAreaView style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetchAll()} />}
        >
          {/* Header */}
          <LinearGradient colors={['#F3EEFF', '#EEF2FF', '#F0F4FF']} style={styles.header}>
            <View>
              <View style={styles.adminBadge}>
                <Ionicons name="shield-checkmark" size={12} color={COLORS.purple} />
                <Text style={styles.adminBadgeText}>ADMIN</Text>
              </View>
              <Text style={styles.title}>{t('admin.overview.title')}</Text>
              <Text style={styles.subtitle}>{t('admin.overview.subtitle')}</Text>
            </View>
            <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/(admin)/settings')}>
              <Ionicons name="person-circle-outline" size={36} color={COLORS.purple} />
            </TouchableOpacity>
          </LinearGradient>

          {/* Alertes */}
          {(stats?.failed_payments_48h ?? 0) > 0 && (
            <TouchableOpacity style={styles.alertBanner} onPress={() => router.push('/(admin)/finances')}>
              <Ionicons name="alert-circle" size={18} color={COLORS.urgency} />
              <Text style={styles.alertText}>{t('admin.overview.failed_payments', { count: stats?.failed_payments_48h ?? 0 })}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.urgency} />
            </TouchableOpacity>
          )}
          {(stats?.providers_pending_verification ?? 0) > 0 && (
            <TouchableOpacity style={[styles.alertBanner, { backgroundColor: COLORS.warningSoft }]} onPress={() => router.push('/(admin)/users')}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.warning} />
              <Text style={[styles.alertText, { color: COLORS.warning }]}>{t('admin.overview.pending_verification', { count: stats?.providers_pending_verification ?? 0 })}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.warning} />
            </TouchableOpacity>
          )}

          {/* Disputes alert */}
          {disputes.length > 0 && (
            <TouchableOpacity style={[styles.alertBanner, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="warning" size={18} color="#D97706" />
              <Text style={[styles.alertText, { color: '#D97706' }]}>{disputes.length} litige{disputes.length > 1 ? 's' : ''} en attente de résolution</Text>
            </TouchableOpacity>
          )}

          {/* KPIs */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('admin.overview.key_indicators')}</Text>
          </View>
          <View style={styles.kpiGrid}>
            {KPI_CONFIG.map(kpi => {
              const value = Number(stats?.[kpi.key] ?? 0);
              const display = kpi.isMoney ? `${Math.round(value)}€` : String(value);
              return (
                <View key={kpi.key} style={[styles.kpiCard, { borderLeftColor: kpi.color }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: kpi.bg }]}>
                    <Ionicons name={kpi.icon as keyof typeof Ionicons.glyphMap} size={20} color={kpi.color} />
                  </View>
                  <Text style={[styles.kpiValue, { color: kpi.color }]}>{display}</Text>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </View>
              );
            })}
          </View>

          {/* Stats secondaires */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.owners_count ?? 0}</Text>
              <Text style={styles.statLabel}>{t('admin.overview.owners')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.providers_count ?? 0}</Text>
              <Text style={styles.statLabel}>{t('admin.overview.providers')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.completed_missions_total ?? 0}</Text>
              <Text style={styles.statLabel}>{t('admin.overview.total_missions')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.success }]}>{Math.round(stats?.total_volume ?? 0)}€</Text>
              <Text style={styles.statLabel}>{t('admin.overview.total_volume')}</Text>
            </View>
          </View>

          {/* Raccourcis */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('admin.overview.quick_actions')}</Text>
          </View>
          <View style={styles.shortcuts}>
            {[
              { label: t('admin.overview.manage_users'),      icon: 'people-outline',      route: '/(admin)/users',       color: COLORS.brandPrimary, bg: '#EEF2FF' },
              { label: t('admin.overview.emergencies'),             icon: 'warning-outline',     route: '/(admin)/emergencies', color: COLORS.urgency,      bg: COLORS.urgencySoft },
              { label: t('admin.overview.finances'),             icon: 'bar-chart-outline',   route: '/(admin)/finances',    color: COLORS.success,      bg: COLORS.successSoft },
              { label: t('admin.overview.partners'),          icon: 'storefront-outline',  route: '/(admin)/partners',    color: COLORS.purple,       bg: COLORS.purpleSoft },
            ].map(s => (
              <TouchableOpacity key={s.label} style={styles.shortcutBtn} onPress={() => router.push(s.route as never)}>
                <View style={[styles.shortcutIcon, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={22} color={s.color} />
                </View>
                <Text style={styles.shortcutLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Litiges ouverts */}
          {disputes.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Litiges ouverts ({disputes.length})</Text>
              </View>
              {disputes.map((d) => {
                const ownerName = Array.isArray(d.owner) ? d.owner[0]?.name : d.owner?.name || 'Propriétaire';
                const providerName = Array.isArray(d.provider) ? d.provider[0]?.name : d.provider?.name || 'Prestataire';
                const propName = Array.isArray(d.property) ? d.property[0]?.name : d.property?.name || '';
                const isResolving = resolvingId === d.id;
                return (
                  <View key={d.id} style={[styles.disputeCard]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="warning" size={16} color="#D97706" />
                        </View>
                        <View>
                          <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#1E3A5F' }}>{d.mission_type ? getMissionTypeLabel(d.mission_type) : 'Mission'}</Text>
                          {propName ? <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: COLORS.textTertiary }}>{propName}</Text> : null}
                        </View>
                      </View>
                      <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#1E3A5F' }}>{d.fixed_rate || 0}€</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.sm }}>
                      <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textSecondary }}>Proprio : {ownerName}</Text>
                      <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textSecondary }}>Presta : {providerName}</Text>
                    </View>

                    {d.dispute_reason && (
                      <View style={{ backgroundColor: COLORS.urgencySoft, padding: SPACING.md, borderRadius: RADIUS.sm, marginBottom: SPACING.md }}>
                        <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.urgency }}>
                          Motif : {d.dispute_reason}
                        </Text>
                        {d.dispute_at && (
                          <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: COLORS.textTertiary, marginTop: 4 }}>
                            Ouvert le {new Date(d.dispute_at).toLocaleDateString('fr-FR')}
                          </Text>
                        )}
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      <TouchableOpacity
                        style={{ flex: 1, paddingVertical: 10, borderRadius: RADIUS.sm, backgroundColor: COLORS.success, alignItems: 'center', opacity: isResolving ? 0.5 : 1 }}
                        onPress={() => handleResolve(d.id, 'validate')}
                        disabled={isResolving}
                      >
                        <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#fff' }}>Valider + Payer</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, paddingVertical: 10, borderRadius: RADIUS.sm, backgroundColor: COLORS.urgency, alignItems: 'center', opacity: isResolving ? 0.5 : 1 }}
                        onPress={() => handleResolve(d.id, 'cancel')}
                        disabled={isResolving}
                      >
                        <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#fff' }}>Annuler</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {/* Audit récent */}
          {audit.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('admin.overview.recent_activity')}</Text>
              </View>
              <View style={styles.auditList}>
                {audit.slice(0, 5).map(a => (
                  <View key={a.id} style={styles.auditRow}>
                    <View style={styles.auditDot} />
                    <View style={styles.auditBody}>
                      <Text style={styles.auditAction}>{ACTION_LABELS[a.action] ?? a.action}</Text>
                      <Text style={styles.auditTime}>{formatRelative(a.created_at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  header: { padding: SPACING.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.purpleSoft, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  adminBadgeText: { ...FONTS.caption, color: COLORS.purple, fontSize: 10 },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F' },
  subtitle: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  avatarBtn: { marginTop: SPACING.sm },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.urgencySoft, marginHorizontal: SPACING.xl, marginTop: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md },
  alertText: { ...FONTS.bodySmall, color: COLORS.urgency, flex: 1 },
  sectionHeader: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: SPACING.sm },
  sectionTitle: { ...FONTS.h3, color: '#1E3A5F', fontSize: 15 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: SPACING.md },
  kpiCard: { flex: 1, minWidth: '44%', backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: SPACING.md, ...SHADOWS.card, borderLeftWidth: 3 },
  kpiIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  kpiValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, letterSpacing: -0.5 },
  kpiLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.subtle, marginHorizontal: SPACING.xl, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: '#1E3A5F' },
  statLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: SPACING.md },
  shortcutBtn: { flex: 1, minWidth: '44%', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: SPACING.lg, ...SHADOWS.card, gap: SPACING.sm },
  shortcutIcon: { width: 44, height: 44, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  shortcutLabel: { ...FONTS.bodySmall, color: '#1E3A5F', textAlign: 'center' },
  auditList: { marginHorizontal: SPACING.xl, gap: SPACING.sm },
  auditRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  auditDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.purple },
  auditBody: { flex: 1 },
  auditAction: { ...FONTS.bodySmall, color: '#1E3A5F' },
  auditTime: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 2 },
  disputeCard: { marginHorizontal: SPACING.xl, marginBottom: SPACING.md, backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: SPACING.lg, borderWidth: 1, borderColor: '#FDE68A', ...SHADOWS.card },
});
