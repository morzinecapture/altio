import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getProviderStats } from '../../src/api';

export default function RevenueScreen() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const result = await getProviderStats();
      setStats(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="revenue-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Mes revenus</Text>
        </View>

        {/* Total Earnings */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Revenus totaux</Text>
          <Text style={styles.earningsValue}>{(stats?.total_earnings || 0).toFixed(2)}€</Text>
          <View style={styles.earningsRow}>
            <View style={styles.earningStat}>
              <Ionicons name="star" size={16} color={COLORS.warning} />
              <Text style={styles.earningStatText}>{stats?.rating || 0} / 5</Text>
            </View>
            <View style={styles.earningStat}>
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.textTertiary} />
              <Text style={styles.earningStatText}>{stats?.total_reviews || 0} avis</Text>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.success} />
            <Text style={styles.statValue}>{stats?.completed_missions || 0}</Text>
            <Text style={styles.statLabel}>Terminées</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="play-circle-outline" size={24} color={COLORS.info} />
            <Text style={styles.statValue}>{stats?.in_progress_missions || 0}</Text>
            <Text style={styles.statLabel}>En cours</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={24} color={COLORS.warning} />
            <Text style={styles.statValue}>{stats?.pending_applications || 0}</Text>
            <Text style={styles.statLabel}>Candidatures</Text>
          </View>
        </View>

        {/* Recent Missions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Missions récentes</Text>
          {(stats?.recent_missions || []).length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Aucune mission complétée</Text>
            </View>
          ) : (
            (stats?.recent_missions || []).map((m: any) => (
              <View key={m.mission_id} style={styles.missionItem}>
                <View style={styles.missionLeft}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <View>
                    <Text style={styles.missionTitle}>{m.description || m.mission_type}</Text>
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

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  title: { ...FONTS.h2, color: COLORS.textPrimary },
  earningsCard: { backgroundColor: COLORS.brandPrimary, marginHorizontal: SPACING.xl, marginTop: SPACING.xl, padding: SPACING.xxl, borderRadius: RADIUS.xl, ...SHADOWS.float },
  earningsLabel: { ...FONTS.bodySmall, color: COLORS.textInverse, opacity: 0.7 },
  earningsValue: { ...FONTS.h1, color: COLORS.textInverse, fontSize: 36, marginVertical: SPACING.sm },
  earningsRow: { flexDirection: 'row', gap: SPACING.xl, marginTop: SPACING.md },
  earningStat: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  earningStatText: { ...FONTS.bodySmall, color: COLORS.textInverse, opacity: 0.8 },
  statsGrid: { flexDirection: 'row', paddingHorizontal: SPACING.xl, gap: SPACING.md, marginTop: SPACING.xl },
  statCard: { flex: 1, backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, alignItems: 'center', ...SHADOWS.card },
  statValue: { ...FONTS.h2, color: COLORS.textPrimary, marginTop: SPACING.sm },
  statLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2, fontSize: 11 },
  section: { paddingHorizontal: SPACING.xl, marginTop: SPACING.xxl },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md },
  emptyCard: { backgroundColor: COLORS.paper, padding: SPACING.xxl, borderRadius: RADIUS.lg, alignItems: 'center' },
  emptyText: { ...FONTS.body, color: COLORS.textTertiary },
  missionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, ...SHADOWS.card },
  missionLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  missionTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary },
  missionDate: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontSize: 11 },
  missionAmount: { ...FONTS.h3, color: COLORS.success },
});
