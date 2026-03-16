import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAdminStats, getAuditLog } from '../../src/api';

const KPI_CONFIG = [
  { key: 'active_missions_count',      label: 'Missions actives',      icon: 'briefcase-outline',  color: COLORS.info,         bg: COLORS.infoSoft },
  { key: 'commissions_this_month',     label: 'Commissions ce mois',   icon: 'trending-up-outline', color: COLORS.success,      bg: COLORS.successSoft, isMoney: true },
  { key: 'new_users_30d',              label: 'Nouveaux users (30j)',   icon: 'people-outline',     color: COLORS.brandPrimary, bg: '#EEF2FF' },
  { key: 'active_emergencies',         label: 'Urgences actives',      icon: 'warning-outline',    color: COLORS.urgency,      bg: COLORS.urgencySoft },
];

const ACTION_LABELS: Record<string, string> = {
  suspend_user:     'Utilisateur suspendu',
  reactivate_user:  'Utilisateur réactivé',
  approve_doc:      'Document approuvé',
  reject_doc:       'Document refusé',
  export_csv:       'Export CSV généré',
  generate_invoice: 'Facture générée',
};

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return `il y a ${Math.floor(hrs / 24)}j`;
}

export default function AdminOverview() {
  const router = useRouter();
  const { user, handleLogout } = useAuth();
  const [stats, setStats]       = useState<any>(null);
  const [audit, setAudit]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [s, a] = await Promise.all([getAdminStats(), getAuditLog()]);
      setStats(s);
      setAudit(a);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
        >
          {/* Header */}
          <LinearGradient colors={['#F3EEFF', '#EEF2FF', '#F0F4FF']} style={styles.header}>
            <View>
              <View style={styles.adminBadge}>
                <Ionicons name="shield-checkmark" size={12} color={COLORS.purple} />
                <Text style={styles.adminBadgeText}>ADMIN</Text>
              </View>
              <Text style={styles.title}>Administration</Text>
              <Text style={styles.subtitle}>MontRTO — Panneau de contrôle</Text>
            </View>
            <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/(admin)/settings')}>
              <Ionicons name="person-circle-outline" size={36} color={COLORS.purple} />
            </TouchableOpacity>
          </LinearGradient>

          {/* Alertes */}
          {stats?.failed_payments_48h > 0 && (
            <TouchableOpacity style={styles.alertBanner} onPress={() => router.push('/(admin)/finances')}>
              <Ionicons name="alert-circle" size={18} color={COLORS.urgency} />
              <Text style={styles.alertText}>{stats.failed_payments_48h} paiement(s) échoué(s) dans les 48h</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.urgency} />
            </TouchableOpacity>
          )}
          {stats?.providers_pending_verification > 0 && (
            <TouchableOpacity style={[styles.alertBanner, { backgroundColor: COLORS.warningSoft }]} onPress={() => router.push('/(admin)/users')}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.warning} />
              <Text style={[styles.alertText, { color: COLORS.warning }]}>{stats.providers_pending_verification} prestataire(s) en attente de vérification</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.warning} />
            </TouchableOpacity>
          )}

          {/* KPIs */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Indicateurs clés</Text>
          </View>
          <View style={styles.kpiGrid}>
            {KPI_CONFIG.map(kpi => {
              const value = stats?.[kpi.key] ?? 0;
              const display = kpi.isMoney ? `${Math.round(value)}€` : String(value);
              return (
                <View key={kpi.key} style={[styles.kpiCard, { borderLeftColor: kpi.color }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: kpi.bg }]}>
                    <Ionicons name={kpi.icon as any} size={20} color={kpi.color} />
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
              <Text style={styles.statLabel}>Propriétaires</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.providers_count ?? 0}</Text>
              <Text style={styles.statLabel}>Prestataires</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.completed_missions_total ?? 0}</Text>
              <Text style={styles.statLabel}>Missions totales</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.success }]}>{Math.round(stats?.total_volume ?? 0)}€</Text>
              <Text style={styles.statLabel}>Volume total</Text>
            </View>
          </View>

          {/* Raccourcis */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Actions rapides</Text>
          </View>
          <View style={styles.shortcuts}>
            {[
              { label: 'Gérer les users',      icon: 'people-outline',      route: '/(admin)/users',       color: COLORS.brandPrimary, bg: '#EEF2FF' },
              { label: 'Urgences',             icon: 'warning-outline',     route: '/(admin)/emergencies', color: COLORS.urgency,      bg: COLORS.urgencySoft },
              { label: 'Finances',             icon: 'bar-chart-outline',   route: '/(admin)/finances',    color: COLORS.success,      bg: COLORS.successSoft },
              { label: 'Partenaires',          icon: 'storefront-outline',  route: '/(admin)/partners',    color: COLORS.purple,       bg: COLORS.purpleSoft },
            ].map(s => (
              <TouchableOpacity key={s.label} style={styles.shortcutBtn} onPress={() => router.push(s.route as any)}>
                <View style={[styles.shortcutIcon, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon as any} size={22} color={s.color} />
                </View>
                <Text style={styles.shortcutLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Audit récent */}
          {audit.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Activité récente</Text>
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
});
