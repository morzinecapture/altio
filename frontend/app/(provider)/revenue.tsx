import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../../src/theme';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { useProviderStats } from '../../src/hooks';
import { getMyInvoices } from '../../src/api';
import type { ProviderStats, Invoice, RecentMission } from '../../src/types/api';

type Tab = 'revenus' | 'factures';

const INVOICE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  issued:    { bg: '#EFF6FF', text: '#2563EB' },
  sent:      { bg: COLORS.infoSoft, text: COLORS.info },
  paid:      { bg: COLORS.successSoft, text: COLORS.success },
  cancelled: { bg: '#FEF2F2', text: COLORS.urgency },
};

export default function RevenueScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab]   = useState<Tab>('revenus');

  const { data: stats = null, isLoading: statsLoading, isRefetching: statsRefetching, refetch: refetchStats } = useProviderStats();
  const { data: invoices = [], isLoading: invoicesLoading, isRefetching: invoicesRefetching, refetch: refetchInvoices } = useQuery<Invoice[]>({
    queryKey: ['invoices', 'my'],
    queryFn: getMyInvoices,
  });

  const isLoading = statsLoading || invoicesLoading;
  const isRefreshing = statsRefetching || invoicesRefetching;
  const refetch = () => { refetchStats(); refetchInvoices(); };

  useFocusEffect(
    useCallback(() => {
      refetchStats();
    }, [refetchStats]),
  );

  const INVOICE_TYPE_LABELS: Record<string, string> = {
    commission: t('provider.revenue.invoice_type_commission'),
    service:    t('provider.revenue.invoice_type_service'),
  };

  const handleOpenInvoice = (url: string, invoiceNumber?: string) => {
    router.push({ pathname: '/invoice-viewer', params: { url, title: invoiceNumber || 'Facture' } });
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="revenue-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('provider.revenue.title')}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {(['revenus', 'factures'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'revenus' ? t('provider.revenue.tab_revenue') : `${t('provider.revenue.tab_invoices')}${invoices.length > 0 ? ` (${invoices.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => refetch()} />}
      >
        {/* ── Tab Revenus ── */}
        {activeTab === 'revenus' && (
          <>
            <LinearGradient
              colors={GRADIENT.brandButton}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.earningsCard}
            >
              <Text style={styles.earningsLabel}>Net perçu</Text>
              <Text style={styles.earningsValue}>{(stats?.total_earnings || 0).toFixed(2)}€</Text>
              <View style={styles.earningsRow}>
                <View style={styles.earningStat}>
                  <Ionicons name="checkmark-circle" size={16} color="#86EFAC" />
                  <Text style={styles.earningStatText}>
                    {(stats?.in_progress_missions ?? 0) > 0
                      ? `${stats?.in_progress_missions} mission${(stats?.in_progress_missions ?? 0) > 1 ? 's' : ''} en cours`
                      : 'Tout est à jour'}
                  </Text>
                </View>
                <View style={styles.earningStat}>
                  <Ionicons name="star" size={16} color={COLORS.warning} />
                  <Text style={styles.earningStatText}>{stats?.rating || 0}/5 ({stats?.total_reviews || 0} avis)</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Bandeau obligation fiscale — art. 242 bis CGI */}
            <View style={styles.fiscalBanner}>
              <View style={styles.fiscalBannerHeader}>
                <Ionicons name="information-circle" size={20} color={COLORS.info} />
                <Text style={styles.fiscalBannerTitle}>Obligations fiscales et sociales</Text>
              </View>
              <Text style={styles.fiscalBannerText}>
                Les revenus perçus via Altio sont imposables et soumis aux cotisations sociales. Vous devez les déclarer auprès de l'administration fiscale et de l'URSSAF.
              </Text>
              <View style={styles.fiscalLinks}>
                <TouchableOpacity
                  style={styles.fiscalLink}
                  onPress={() => Linking.openURL('https://www.impots.gouv.fr')}
                >
                  <Text style={styles.fiscalLinkText}>impots.gouv.fr</Text>
                  <Ionicons name="open-outline" size={14} color={COLORS.brandPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.fiscalLink}
                  onPress={() => Linking.openURL('https://www.urssaf.fr')}
                >
                  <Text style={styles.fiscalLinkText}>urssaf.fr</Text>
                  <Ionicons name="open-outline" size={14} color={COLORS.brandPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.success} />
                <Text style={styles.statValue}>{stats?.completed_missions || 0}</Text>
                <Text style={styles.statLabel}>{t('provider.revenue.stat_completed')}</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="play-circle-outline" size={24} color={COLORS.info} />
                <Text style={styles.statValue}>{stats?.in_progress_missions || 0}</Text>
                <Text style={styles.statLabel}>{t('provider.revenue.stat_in_progress')}</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="time-outline" size={24} color={COLORS.warning} />
                <Text style={styles.statValue}>{stats?.pending_applications || 0}</Text>
                <Text style={styles.statLabel}>{t('provider.revenue.stat_applications')}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('provider.revenue.recent_missions')}</Text>
              {(stats?.recent_missions || []).length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>{t('provider.revenue.no_completed_missions')}</Text>
                </View>
              ) : (
                (stats?.recent_missions || []).map((m: RecentMission) => (
                  <View key={m.mission_id} style={styles.missionItem}>
                    <View style={styles.missionLeft}>
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                      <View>
                        <Text style={styles.missionTitle}>{m.description || getMissionTypeLabel(m.mission_type ?? '')}</Text>
                        <Text style={styles.missionDate}>
                          {m.completed_at ? new Date(m.completed_at).toLocaleDateString('fr-FR') : '-'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.missionAmount}>{m.fixed_rate || 0}€</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* ── Tab Factures ── */}
        {activeTab === 'factures' && (
          <View style={styles.section}>
            {invoices.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={32} color={COLORS.textTertiary} style={{ marginBottom: SPACING.md }} />
                <Text style={styles.emptyText}>{t('provider.revenue.no_invoices')}</Text>
                <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>{t('provider.revenue.no_invoices_sub')}</Text>
              </View>
            ) : (
              invoices.map((inv) => {
                const statusColor = INVOICE_STATUS_COLORS[inv.status] || INVOICE_STATUS_COLORS.issued;
                return (
                  <View key={inv.id} style={styles.invoiceCard}>
                    <View style={styles.invoiceRow}>
                      <View style={styles.invoiceLeft}>
                        <Text style={styles.invoiceNumber}>{inv.invoice_number}</Text>
                        <Text style={styles.invoiceType}>{INVOICE_TYPE_LABELS[inv.invoice_type] || inv.invoice_type}</Text>
                        <Text style={styles.invoiceDate}>
                          {new Date(inv.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </Text>
                      </View>
                      <View style={styles.invoiceRight}>
                        <Text style={styles.invoiceAmount}>{Number(inv.amount_ttc).toFixed(2)} €</Text>
                        <Text style={styles.invoiceAmountHt}>{t('provider.revenue.amount_ht')} {Number(inv.amount_ht).toFixed(2)} €</Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                          <Text style={[styles.statusText, { color: statusColor.text }]}>{inv.status}</Text>
                        </View>
                      </View>
                    </View>
                    {inv.pdf_url && (
                      <TouchableOpacity
                        style={styles.downloadBtn}
                        onPress={() => handleOpenInvoice(inv.pdf_url || '', inv.invoice_number)}
                      >
                        <Ionicons name="open-outline" size={16} color={COLORS.brandPrimary} />
                        <Text style={styles.downloadBtnText}>{t('provider.revenue.open_invoice')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: SPACING.lg },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F' },
  tabBar: { flexDirection: 'row', marginHorizontal: SPACING.xl, backgroundColor: COLORS.subtle, borderRadius: RADIUS.lg, padding: 4, marginBottom: SPACING.sm },
  tab: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.paper, ...SHADOWS.card },
  tabText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  tabTextActive: { color: COLORS.brandPrimary, fontWeight: '700' },
  earningsCard: { marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, padding: SPACING.xxl, borderRadius: RADIUS.xxl, ...SHADOWS.float },
  earningsLabel: { ...FONTS.bodySmall, color: COLORS.textInverse, opacity: 0.9, fontWeight: '500' },
  earningsValue: { ...FONTS.h1, color: COLORS.textInverse, fontSize: 40, marginVertical: SPACING.sm },
  earningsRow: { flexDirection: 'row', gap: SPACING.xl, marginTop: SPACING.md },
  earningStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earningStatText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', paddingHorizontal: SPACING.xl, gap: SPACING.md, marginTop: SPACING.xl },
  statCard: { flex: 1, backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl, alignItems: 'center', ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  statValue: { ...FONTS.h2, color: COLORS.textPrimary, marginTop: SPACING.sm },
  statLabel: { ...FONTS.caption, color: COLORS.textSecondary, marginTop: 4, fontWeight: '600' },
  section: { paddingHorizontal: SPACING.xl, marginTop: SPACING.xxxl },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.lg },
  emptyCard: { backgroundColor: COLORS.paper, padding: SPACING.xxl, borderRadius: RADIUS.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  emptyText: { ...FONTS.body, color: COLORS.textTertiary, textAlign: 'center' },
  missionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.xl, marginBottom: SPACING.md, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  missionLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  missionTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  missionDate: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: 2 },
  missionAmount: { ...FONTS.h3, color: COLORS.success },
  invoiceCard: { backgroundColor: COLORS.paper, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invoiceLeft: { flex: 1, gap: 3 },
  invoiceNumber: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: COLORS.textPrimary },
  invoiceType: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  invoiceDate: { ...FONTS.caption, color: COLORS.textTertiary },
  invoiceRight: { alignItems: 'flex-end', gap: 3 },
  invoiceAmount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: COLORS.textPrimary },
  invoiceAmountHt: { ...FONTS.caption, color: COLORS.textTertiary },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  statusText: { ...FONTS.caption, fontSize: 10, fontWeight: '600' },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  downloadBtnText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  fiscalBanner: { marginHorizontal: SPACING.xl, marginTop: SPACING.lg, padding: SPACING.lg, backgroundColor: '#EFF6FF', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: '#BFDBFE' },
  fiscalBannerHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  fiscalBannerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: COLORS.info },
  fiscalBannerText: { ...FONTS.bodySmall, color: '#1E40AF', lineHeight: 20, marginBottom: SPACING.md },
  fiscalLinks: { flexDirection: 'row', gap: SPACING.lg },
  fiscalLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fiscalLinkText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600', textDecorationLine: 'underline' },
});
