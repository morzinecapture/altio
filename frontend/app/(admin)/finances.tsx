import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Share, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS } from '../../src/theme';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAdminFinances, getMonthlyVolume, exportCsvData, logAuditAction, getAdminInvoices } from '../../src/api';
import { useAuth } from '../../src/auth';
import type { AdminFinances as AdminFinancesType, MissionFinanceRow, Invoice } from '../../src/types/api';

export default function AdminFinances() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'commission' | 'service_fee'>('all');

  const MONTH_LABELS = [
    t('admin.finances.month_jan'), t('admin.finances.month_feb'), t('admin.finances.month_mar'),
    t('admin.finances.month_apr'), t('admin.finances.month_may'), t('admin.finances.month_jun'),
    t('admin.finances.month_jul'), t('admin.finances.month_aug'), t('admin.finances.month_sep'),
    t('admin.finances.month_oct'), t('admin.finances.month_nov'), t('admin.finances.month_dec'),
  ];

  const { data: finances = null, isLoading: loadingFinances, refetch: refetchFinances } = useQuery({
    queryKey: ['admin-finances'],
    queryFn: getAdminFinances,
  });
  const { data: monthly = [] as { month: number; year: number; volume: number }[], refetch: refetchMonthly } = useQuery({
    queryKey: ['admin-monthly-volume'],
    queryFn: getMonthlyVolume,
  });
  const { data: invoices = [] as Invoice[], refetch: refetchInvoices } = useQuery({
    queryKey: ['admin-invoices'],
    queryFn: () => getAdminInvoices({ limit: 50 }),
  });

  const loading = loadingFinances;
  const refetchAll = () => { refetchFinances(); refetchMonthly(); refetchInvoices(); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await exportCsvData();
      await Share.share({ message: csv, title: 'Export transactions Altio' });
      await logAuditAction('export_csv', 'payment', undefined, { date: new Date().toISOString() });
    } catch (e: unknown) {
      Alert.alert(t('admin.finances.export_error'), e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const maxVolume = Math.max(...monthly.map(m => m.volume ?? 0), 1);

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={COLORS.purple} /></View>
  );

  return (
    <AdminGuard>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('admin.finances.title')}</Text>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting ? <ActivityIndicator size="small" color={COLORS.textInverse} /> : (
              <><Ionicons name="download-outline" size={16} color={COLORS.textInverse} />
              <Text style={styles.exportBtnText}>{t('admin.finances.export_csv')}</Text></>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetchAll()} />}
        >
          {/* KPIs */}
          <View style={styles.kpiGrid}>
            {[
              { label: t('admin.finances.commissions_month'), value: `${Math.round(finances?.commissions_this_month ?? 0)}€`, color: COLORS.success, bg: COLORS.successSoft, icon: 'trending-up-outline' },
              { label: t('admin.finances.volume_month'), value: `${Math.round(finances?.volume_this_month ?? 0)}€`, color: COLORS.brandPrimary, bg: '#EEF2FF', icon: 'cash-outline' },
              { label: t('admin.finances.paid_missions'), value: String(finances?.paid_missions_count ?? 0), color: COLORS.info, bg: COLORS.infoSoft, icon: 'checkmark-circle-outline' },
              { label: t('admin.finances.total_volume'), value: `${Math.round(finances?.total_volume ?? 0)}€`, color: COLORS.purple, bg: COLORS.purpleSoft, icon: 'bar-chart-outline' },
            ].map(kpi => (
              <View key={kpi.label} style={[styles.kpiCard, { borderLeftColor: kpi.color }]}>
                <View style={[styles.kpiIcon, { backgroundColor: kpi.bg }]}>
                  <Ionicons name={kpi.icon as keyof typeof Ionicons.glyphMap} size={18} color={kpi.color} />
                </View>
                <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
              </View>
            ))}
          </View>

          {/* Graphique barres 12 mois */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('admin.finances.monthly_volume')}</Text>
          </View>
          <View style={styles.chartContainer}>
            <View style={styles.chart}>
              {monthly.map((m, i) => {
                const height = maxVolume > 0 ? Math.max(4, (m.volume / maxVolume) * 80) : 4;
                const isCurrentMonth = i === monthly.length - 1;
                return (
                  <View key={i} style={styles.bar}>
                    <Text style={styles.barValue}>{m.volume > 0 ? `${Math.round(m.volume)}€` : ''}</Text>
                    <View style={[styles.barFill, { height, backgroundColor: isCurrentMonth ? COLORS.brandPrimary : COLORS.brandPrimary + '40' }]} />
                    <Text style={[styles.barLabel, isCurrentMonth && { color: COLORS.brandPrimary, fontFamily: 'PlusJakartaSans_600SemiBold' }]}>
                      {MONTH_LABELS[m.month - 1]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Missions récentes avec paiements */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('admin.finances.recent_missions')}</Text>
          </View>
          {(finances?.recent_missions ?? []).map((m: MissionFinanceRow) => (
            <View key={m.id} style={styles.missionRow}>
              <View style={styles.missionInfo}>
                <Text style={styles.missionTitle} numberOfLines={1}>{m.property_name || t('admin.finances.property_default')}</Text>
                <Text style={styles.missionMeta}>{getMissionTypeLabel(m.mission_type)} · {m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR') : '—'}</Text>
              </View>
              <View style={styles.missionRight}>
                {m.fixed_rate && <Text style={styles.missionAmount}>{m.fixed_rate}€</Text>}
                <View style={[styles.chip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg }]}>
                  <Text style={[styles.chipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                    {STATUS_LABELS[m.status] || m.status}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          {(finances?.recent_missions ?? []).length === 0 && (
            <Text style={styles.emptyText}>{t('admin.finances.no_recent_transaction')}</Text>
          )}

          {/* Factures section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('admin.finances.issued_invoices')}</Text>
          </View>

          {/* Filter chips */}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}>
            {(['all', 'commission', 'service_fee'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.chip, { backgroundColor: invoiceFilter === f ? COLORS.brandPrimary : COLORS.subtle, paddingHorizontal: 12, paddingVertical: 6 }]}
                onPress={() => setInvoiceFilter(f)}
              >
                <Text style={[styles.chipText, { color: invoiceFilter === f ? '#fff' : COLORS.textSecondary, fontSize: 11 }]}>
                  {f === 'all' ? t('admin.finances.filter_all') : f === 'commission' ? t('admin.finances.filter_commissions') : t('admin.finances.filter_services')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {invoices
            .filter(inv => invoiceFilter === 'all' || inv.invoice_type === invoiceFilter)
            .map((inv: Invoice) => (
              <View key={inv.id} style={[styles.missionRow, { alignItems: 'flex-start', paddingVertical: SPACING.md }]}>
                <View style={styles.missionInfo}>
                  <Text style={styles.missionTitle}>{inv.invoice_number}</Text>
                  <Text style={styles.missionMeta}>
                    {inv.invoice_type === 'commission' ? t('admin.finances.commission_label') : t('admin.finances.service_label')} ·{' '}
                    {inv.mission?.mission_type ? getMissionTypeLabel(inv.mission.mission_type) : '—'} ·{' '}
                    {new Date(inv.created_at).toLocaleDateString('fr-FR')}
                  </Text>
                  <Text style={[styles.missionMeta, { marginTop: 2 }]}>
                    {inv.seller?.company_name || inv.seller?.name || '—'} → {inv.buyer?.company_name || inv.buyer?.name || '—'}
                  </Text>
                </View>
                <View style={styles.missionRight}>
                  <Text style={styles.missionAmount}>{Number(inv.amount_ttc).toFixed(2)}€</Text>
                  <Text style={{ ...FONTS.caption, color: COLORS.textTertiary }}>{t('admin.finances.excl_tax')} {Number(inv.amount_ht).toFixed(2)}€</Text>
                  {inv.pdf_url && (
                    <TouchableOpacity onPress={() => Linking.openURL(inv.pdf_url || '')}>
                      <View style={[styles.chip, { backgroundColor: COLORS.infoSoft, marginTop: 4 }]}>
                        <Text style={[styles.chipText, { color: COLORS.info }]}>{t('admin.finances.view')}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          {invoices.filter(inv => invoiceFilter === 'all' || inv.invoice_type === invoiceFilter).length === 0 && (
            <Text style={styles.emptyText}>{t('admin.finances.no_invoice')}</Text>
          )}

          {/* Conformité e-invoicing */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('admin.finances.einvoicing_compliance')}</Text>
          </View>
          <View style={styles.facturxCard}>
            <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.facturxTitle}>{t('admin.finances.einvoicing_active')}</Text>
              <Text style={styles.facturxSub}>{t('admin.finances.einvoicing_desc')}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: COLORS.successSoft }]}>
              <Text style={[styles.chipText, { color: COLORS.success }]}>{t('admin.finances.einvoicing_status')}</Text>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, backgroundColor: COLORS.purple, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  exportBtnText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingTop: SPACING.sm },
  kpiCard: { flex: 1, minWidth: '44%', backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: SPACING.md, ...SHADOWS.card, borderLeftWidth: 3 },
  kpiIcon: { width: 32, height: 32, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  kpiValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20 },
  kpiLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  sectionHeader: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: SPACING.sm },
  sectionTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  chartContainer: { paddingHorizontal: SPACING.xl },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 110, backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm, paddingTop: SPACING.md },
  bar: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  barFill: { width: '70%', borderRadius: 3 },
  barValue: { fontSize: 7, color: COLORS.textTertiary, textAlign: 'center' },
  barLabel: { ...FONTS.caption, fontSize: 8, color: COLORS.textTertiary },
  missionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  missionInfo: { flex: 1, marginRight: SPACING.md },
  missionTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#1E3A5F' },
  missionMeta: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  missionRight: { alignItems: 'flex-end', gap: SPACING.xs },
  missionAmount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: COLORS.success },
  chip: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption, fontSize: 9 },
  emptyText: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center', paddingVertical: SPACING.xl },
  facturxCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginHorizontal: SPACING.xl, backgroundColor: COLORS.infoSoft, borderRadius: RADIUS.md, padding: SPACING.md },
  facturxTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#1E3A5F' },
  facturxSub: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
});
