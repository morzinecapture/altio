import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS } from '../../src/theme';
import { getMissions, startMission, completeMission } from '../../src/api';

export default function MyMissionsScreen() {
  const router = useRouter();
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const result = await getMissions();
      setMissions(result.filter((m: any) => m.status !== 'pending'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const handleStart = async (missionId: string) => {
    try {
      await startMission(missionId);
      Alert.alert('Mission démarrée');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleComplete = async (missionId: string) => {
    Alert.alert('Terminer la mission ?', 'Confirmez-vous avoir terminé cette mission ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: async () => {
        try { await completeMission(missionId); Alert.alert('Mission terminée !'); fetchData(); }
        catch (e: any) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="my-missions-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Mes missions</Text>
        </View>

        {missions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={50} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>Aucune mission en cours</Text>
            <Text style={styles.emptySubtext}>Candidatez aux missions disponibles</Text>
          </View>
        ) : (
          missions.map((m) => (
            <View key={m.mission_id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.chip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg }]}>
                  <Text style={[styles.chipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                    {STATUS_LABELS[m.status] || m.status}
                  </Text>
                </View>
                <Text style={styles.typeLabel}>{MISSION_TYPE_LABELS[m.mission_type] || m.mission_type}</Text>
              </View>
              <Text style={styles.cardTitle}>{m.property_name || 'Logement'}</Text>
              {m.property_address && <Text style={styles.cardAddr}>{m.property_address}</Text>}

              {/* Access info for assigned/in_progress missions */}
              {m.access_code && (
                <View style={styles.accessInfo}>
                  <View style={styles.accessItem}>
                    <Ionicons name="key-outline" size={16} color={COLORS.info} />
                    <Text style={styles.accessText}>Code: {m.access_code}</Text>
                  </View>
                  {m.instructions && (
                    <View style={styles.accessItem}>
                      <Ionicons name="document-text-outline" size={16} color={COLORS.info} />
                      <Text style={styles.accessText}>{m.instructions}</Text>
                    </View>
                  )}
                  {m.deposit_location && (
                    <View style={styles.accessItem}>
                      <Ionicons name="location-outline" size={16} color={COLORS.info} />
                      <Text style={styles.accessText}>Dépôt: {m.deposit_location}</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.cardMeta}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                <Text style={styles.metaText}>
                  {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString('fr-FR') : '-'}
                </Text>
                {m.fixed_rate && (
                  <>
                    <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                    <Text style={[styles.metaText, { color: COLORS.success }]}>{m.fixed_rate}€</Text>
                  </>
                )}
              </View>

              {/* Actions */}
              {m.status === 'assigned' && (
                <TouchableOpacity testID={`start-mission-${m.mission_id}`} style={styles.actionBtn} onPress={() => handleStart(m.mission_id)}>
                  <Ionicons name="play" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionText}>Démarrer la mission</Text>
                </TouchableOpacity>
              )}
              {m.status === 'in_progress' && (
                <TouchableOpacity testID={`complete-mission-${m.mission_id}`} style={[styles.actionBtn, { backgroundColor: COLORS.success }]} onPress={() => handleComplete(m.mission_id)}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionText}>Terminer la mission</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
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
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl * 2 },
  emptyText: { ...FONTS.body, color: COLORS.textTertiary, marginTop: SPACING.md },
  emptySubtext: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  card: { backgroundColor: COLORS.paper, marginHorizontal: SPACING.xl, marginTop: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, ...SHADOWS.card },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 3, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption, fontSize: 10 },
  typeLabel: { ...FONTS.caption, color: COLORS.textTertiary },
  cardTitle: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  cardAddr: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  accessInfo: { backgroundColor: COLORS.infoSoft, padding: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.md, gap: SPACING.sm },
  accessItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  accessText: { ...FONTS.bodySmall, color: COLORS.info },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  metaText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, marginTop: SPACING.md },
  actionText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
});
