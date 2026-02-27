import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getOwnerDashboard } from '../../src/api';

export default function OwnerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const result = await getOwnerDashboard();
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  const stats = [
    { label: 'Logements', value: data?.total_properties || 0, icon: 'home-outline', color: COLORS.brandPrimary },
    { label: 'En attente', value: data?.pending_missions || 0, icon: 'time-outline', color: COLORS.warning },
    { label: 'En cours', value: data?.active_missions || 0, icon: 'play-outline', color: COLORS.info },
    { label: 'Urgences', value: data?.open_emergencies || 0, icon: 'warning-outline', color: COLORS.urgency },
  ];

  return (
    <SafeAreaView style={styles.container} testID="owner-dashboard">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.userName}>{user?.name?.split(' ')[0]} 👋</Text>
          </View>
          <TouchableOpacity testID="notifications-btn" onPress={() => {}} style={styles.notifBtn}>
            <Ionicons name="notifications-outline" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat, i) => (
            <View key={i} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: stat.color + '15' }]}>
                <Ionicons name={stat.icon as any} size={20} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Upcoming Missions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Missions à venir</Text>
            <TouchableOpacity onPress={() => router.push('/(owner)/missions')}>
              <Text style={styles.seeAll}>Voir tout</Text>
            </TouchableOpacity>
          </View>

          {(data?.upcoming_missions || []).length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={40} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>Aucune mission planifiée</Text>
              <Text style={styles.emptySubtext}>Ajoutez un logement et synchronisez votre calendrier iCal</Text>
            </View>
          ) : (
            (data?.upcoming_missions || []).slice(0, 5).map((m: any) => (
              <TouchableOpacity
                key={m.mission_id}
                style={styles.missionCard}
                testID={`mission-card-${m.mission_id}`}
                onPress={() => router.push(`/mission/${m.mission_id}`)}
              >
                <View style={styles.missionTop}>
                  <View style={[styles.statusChip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg }]}>
                    <Text style={[styles.statusChipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                      {STATUS_LABELS[m.status] || m.status}
                    </Text>
                  </View>
                  <Text style={styles.missionType}>{MISSION_TYPE_LABELS[m.mission_type] || m.mission_type}</Text>
                </View>
                <Text style={styles.missionProperty}>{m.property_name}</Text>
                <View style={styles.missionMeta}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                  <Text style={styles.missionDate}>
                    {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Non planifiée'}
                  </Text>
                  {m.fixed_rate && (
                    <>
                      <Ionicons name="cash-outline" size={14} color={COLORS.textTertiary} />
                      <Text style={styles.missionDate}>{m.fixed_rate}€</Text>
                    </>
                  )}
                  {m.applications_count > 0 && (
                    <>
                      <Ionicons name="people-outline" size={14} color={COLORS.info} />
                      <Text style={[styles.missionDate, { color: COLORS.info }]}>{m.applications_count} candidature(s)</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity testID="add-property-quick-btn" style={styles.quickAction} onPress={() => router.push('/property/add')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.infoSoft }]}>
                <Ionicons name="add-circle-outline" size={24} color={COLORS.info} />
              </View>
              <Text style={styles.quickActionText}>Ajouter un{'\n'}logement</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="create-mission-quick-btn" style={styles.quickAction} onPress={() => router.push('/(owner)/missions')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.successSoft }]}>
                <Ionicons name="clipboard-outline" size={24} color={COLORS.success} />
              </View>
              <Text style={styles.quickActionText}>Créer une{'\n'}mission</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="emergency-quick-btn" style={styles.quickAction} onPress={() => router.push('/emergency')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.urgencySoft }]}>
                <Ionicons name="warning-outline" size={24} color={COLORS.urgency} />
              </View>
              <Text style={styles.quickActionText}>Urgence</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Emergency Button */}
      <TouchableOpacity
        testID="emergency-fab"
        style={styles.emergencyFab}
        onPress={() => router.push('/emergency')}
        activeOpacity={0.8}
      >
        <Ionicons name="warning" size={28} color={COLORS.textInverse} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  greeting: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  userName: { ...FONTS.h2, color: COLORS.textPrimary },
  notifBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.xl, gap: SPACING.md, marginTop: SPACING.md },
  statCard: { width: '47%', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, ...SHADOWS.card },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  statValue: { ...FONTS.h2, color: COLORS.textPrimary },
  statLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: SPACING.xl, marginTop: SPACING.xxl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary },
  seeAll: { ...FONTS.bodySmall, color: COLORS.info },
  emptyCard: { backgroundColor: COLORS.paper, padding: SPACING.xxl, borderRadius: RADIUS.lg, alignItems: 'center', ...SHADOWS.card },
  emptyText: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md },
  emptySubtext: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.sm },
  missionCard: { backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.md, ...SHADOWS.card },
  missionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  statusChip: { paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.full },
  statusChipText: { ...FONTS.caption, fontSize: 10 },
  missionType: { ...FONTS.caption, color: COLORS.textTertiary },
  missionProperty: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.sm, fontSize: 16 },
  missionMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  missionDate: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  quickActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  quickAction: { flex: 1, backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, alignItems: 'center', ...SHADOWS.card },
  quickActionIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  quickActionText: { ...FONTS.bodySmall, color: COLORS.textPrimary, textAlign: 'center', fontSize: 12 },
  emergencyFab: {
    position: 'absolute', bottom: 80, right: 20,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.urgency,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.urgency,
  },
});
