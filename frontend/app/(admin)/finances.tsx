import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS } from '../../src/theme';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAdminFinances, getMonthlyVolume, exportCsvData, logAuditAction } from '../../src/api';
import { useAuth } from '../../src/auth';

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export default function AdminFinances() {
  const { user } = useAuth();
  const [finances, setFinances]   = useState<any>(null);
  const [monthly, setMonthly]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    try {
      const [fin, mon] = await Promise.all([getAdminFinances(), getMonthlyVolume()]);
      setFinances(fin);
      setMonthly(mon);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await exportCsvData();
      await Share.share({ message: csv, title: 'Export transactions Altio' });
      await logAuditAction('export_csv', 'payment', undefined, { date: new Date().toISOString() });
    } catch (e: any) {
      Alert.alert('Erreur export', e.message);
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
          <Text style={styles.title}>Finances</Text>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting ? <ActivityIndicator size="small" color={COLORS.textInverse} /> : (
              <><Ionicons name="download-outline" size={16} color={COLORS.textInverse} />
              <Text style={styles.exportBtnText}>Export CSV</Text></>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
        >
          {/* KPIs */}
          <View style={styles.kpiGrid}>
            {[
              { label: 'Commissions ce mois', value: `${Math.round(finances?.commissions_this_month ?? 0)}€`, color: COLORS.success, bg: COLORS.successSoft, icon: 'trending-up-outline' },
              { label: 'Volume ce mois', value: `${Math.round(finances?.volume_this_month ?? 0)}€`, color: COLORS.brandPrimary, bg: '#EEF2FF', icon: 'cash-outline' },
              { label: 'Missions payées', value: String(finances?.paid_missions_count ?? 0), color: COLORS.info, bg: COLORS.infoSoft, icon: 'checkmark-circle-outline' },
              { label: 'Volume total', value: `${Math.round(finances?.total_volume ?? 0)}€`, color: COLORS.purple, bg: COLORS.purpleSoft, icon: 'bar-chart-outline' },
            ].map(kpi => (
              <View key={kpi.label} style={[styles.kpiCard, { borderLeftColor: kpi.color }]}>
                <View style={[styles.kpiIcon, { backgroundColor: kpi.bg }]}>
                  <Ionicons name={kpi.icon as any} size={18} color={kpi.color} />
                </View>
                <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
              </View>
            ))}
          </View>

          {/* Graphique barres 12 mois */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Volume mensuel (12 mois)</Text>
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
            <Text style={styles.sectionTitle}>Missions récentes</Text>
          </View>
          {(finances?.recent_missions ?? []).map((m: any) => (
            <View key={m.id} style={styles.missionRow}>
              <View style={styles.missionInfo}>
                <Text style={styles.missionTitle} numberOfLines={1}>{m.property_name || 'Logement'}</Text>
                <Text style={styles.missionMeta}>{m.mission_type} · {m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR') : '—'}</Text>
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
            <Text style={styles.emptyText}>Aucune transaction récente</Text>
          )}

          {/* Structure FacturX info */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Conformité e-invoicing</Text>
          </View>
          <View style={styles.facturxCard}>
            <Ionicons name="document-text-outline" size={24} color={COLORS.info} />
            <View style={{ flex: 1 }}>
              <Text style={styles.facturxTitle}>Factur-X (EN 16931)</Text>
              <Text style={styles.facturxSub}>Structure prête. Génération XML via Edge Function — disponible en v2</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: COLORS.warningSoft }]}>
              <Text style={[styles.chipText, { color: COLORS.warning }]}>V2</Text>
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
