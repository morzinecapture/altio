import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert, Switch } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getMissions, getEmergencies, toggleAvailability, getProfile, applyToMission } from '../../src/api';

export default function ProviderDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [missions, setMissions] = useState<any[]>([]);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [m, e, profile] = await Promise.all([getMissions('pending'), getEmergencies(), getProfile()]);
      setMissions(m.filter((mi: any) => mi.status === 'pending'));
      setEmergencies(e);
      setAvailable(profile?.provider_profile?.available || false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const handleToggle = async () => {
    try {
      const result = await toggleAvailability();
      setAvailable(result.available);
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleApply = async (missionId: string, rate?: number) => {
    try {
      await applyToMission(missionId, { proposed_rate: rate, message: 'Disponible pour cette mission' });
      Alert.alert('Candidature envoyée !');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="provider-dashboard">
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
        </View>

        {/* Availability Toggle */}
        <View style={styles.availCard}>
          <View style={styles.availLeft}>
            <View style={[styles.statusDot, { backgroundColor: available ? COLORS.success : COLORS.textTertiary }]} />
            <View>
              <Text style={styles.availTitle}>{available ? 'Disponible' : 'Indisponible'}</Text>
              <Text style={styles.availSubtext}>{available ? 'Vous recevez les nouvelles missions' : 'Activez pour recevoir des missions'}</Text>
            </View>
          </View>
          <Switch
            testID="availability-toggle"
            value={available}
            onValueChange={handleToggle}
            trackColor={{ false: COLORS.border, true: COLORS.successSoft }}
            thumbColor={available ? COLORS.success : COLORS.textTertiary}
          />
        </View>

        {/* Available Missions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Missions disponibles</Text>
          {missions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="search-outline" size={36} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>Aucune mission disponible</Text>
            </View>
          ) : (
            missions.map((m) => (
              <View key={m.mission_id} style={styles.missionCard}>
                <View style={styles.missionTop}>
                  <View style={[styles.chip, { backgroundColor: COLORS.warningSoft }]}>
                    <Text style={[styles.chipText, { color: COLORS.warning }]}>{MISSION_TYPE_LABELS[m.mission_type] || m.mission_type}</Text>
                  </View>
                  <Text style={styles.modeText}>{m.mode === 'fixed' ? 'Tarif fixe' : 'Appel d\'offres'}</Text>
                </View>
                <Text style={styles.missionTitle}>{m.property_name || 'Logement'}</Text>
                <Text style={styles.missionAddr}>{m.property_address}</Text>
                {m.description && <Text style={styles.missionDesc} numberOfLines={2}>{m.description}</Text>}
                <View style={styles.missionMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                    <Text style={styles.metaText}>
                      {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString('fr-FR') : '-'}
                    </Text>
                  </View>
                  {m.fixed_rate && (
                    <View style={styles.metaItem}>
                      <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                      <Text style={[styles.metaText, { color: COLORS.success, fontWeight: '700' }]}>{m.fixed_rate}€</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  testID={`apply-mission-${m.mission_id}`}
                  style={styles.applyBtn}
                  onPress={() => handleApply(m.mission_id, m.fixed_rate)}
                >
                  <Ionicons name="hand-left-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.applyText}>Candidater</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Emergency Requests */}
        {emergencies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Urgences en cours</Text>
            {emergencies.filter((e: any) => e.status === 'open').map((e: any) => (
              <TouchableOpacity key={e.request_id} style={[styles.missionCard, styles.emergencyCard]} onPress={() => router.push(`/emergency?id=${e.request_id}`)}>
                <View style={styles.missionTop}>
                  <View style={[styles.chip, { backgroundColor: COLORS.urgencySoft }]}>
                    <Text style={[styles.chipText, { color: COLORS.urgency }]}>URGENCE</Text>
                  </View>
                  <Text style={styles.modeText}>{e.service_type}</Text>
                </View>
                <Text style={styles.missionTitle}>{e.property_name}</Text>
                <Text style={styles.missionDesc}>{e.description}</Text>
                <TouchableOpacity style={[styles.applyBtn, { backgroundColor: COLORS.urgency }]} onPress={() => router.push(`/emergency?id=${e.request_id}`)}>
                  <Ionicons name="document-text-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.applyText}>Envoyer un devis</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  greeting: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  userName: { ...FONTS.h2, color: COLORS.textPrimary },
  availCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.paper, marginHorizontal: SPACING.xl, padding: SPACING.lg, borderRadius: RADIUS.lg, ...SHADOWS.card },
  availLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  availTitle: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  availSubtext: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontSize: 11 },
  section: { paddingHorizontal: SPACING.xl, marginTop: SPACING.xxl },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md },
  emptyCard: { backgroundColor: COLORS.paper, padding: SPACING.xxl, borderRadius: RADIUS.lg, alignItems: 'center', ...SHADOWS.card },
  emptyText: { ...FONTS.body, color: COLORS.textTertiary, marginTop: SPACING.md },
  missionCard: { backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.md, ...SHADOWS.card },
  emergencyCard: { borderLeftWidth: 3, borderLeftColor: COLORS.urgency },
  missionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 3, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption, fontSize: 10 },
  modeText: { ...FONTS.caption, color: COLORS.textTertiary },
  missionTitle: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  missionAddr: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  missionDesc: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: SPACING.sm },
  missionMeta: { flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  metaText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, marginTop: SPACING.md },
  applyText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
});
