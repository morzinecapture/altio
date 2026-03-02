import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getMission, handleApplication, startMission, completeMission, applyToMission } from '../../src/api';

export default function MissionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [mission, setMission] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    try {
      const data = await getMission(id!);
      setMission(data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAcceptApp = async (appId: string) => {
    try {
      await handleApplication(id!, appId, 'accept');
      Alert.alert('Candidature acceptée');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleRejectApp = async (appId: string) => {
    try {
      await handleApplication(id!, appId, 'reject');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleApply = async () => {
    try {
      await applyToMission(id!, { proposed_rate: mission?.fixed_rate, message: 'Disponible' });
      Alert.alert('Candidature envoyée !');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleStart = async () => {
    try { await startMission(id!); Alert.alert('Mission démarrée'); fetchData(); }
    catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleComplete = async () => {
    Alert.alert('Terminer ?', 'Confirmez la fin de mission', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: async () => {
        try { await completeMission(id!); Alert.alert('Terminée !'); fetchData(); }
        catch (e: any) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;
  if (!mission) return <View style={styles.center}><Text>Mission non trouvée</Text></View>;

  const isOwner = user?.role === 'owner';
  const isProvider = user?.role === 'provider';
  const statusColor = STATUS_COLORS[mission.status] || STATUS_COLORS.pending;

  return (
    <SafeAreaView style={styles.container} testID="mission-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détail mission</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Status */}
        <View style={styles.statusRow}>
          <View style={[styles.statusChip, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusText, { color: statusColor.text }]}>{STATUS_LABELS[mission.status] || mission.status}</Text>
          </View>
          <Text style={styles.typeLabel}>{MISSION_TYPE_LABELS[mission.mission_type] || mission.mission_type}</Text>
        </View>

        {/* Info Card */}
        <View style={styles.card}>
          <Text style={styles.propName}>{mission.property_name}</Text>
          {mission.property_address && <Text style={styles.propAddr}>{mission.property_address}</Text>}
          {mission.description && <Text style={styles.desc}>{mission.description}</Text>}

          <View style={styles.metaGrid}>
            <MetaItem icon="calendar-outline" label="Date" value={mission.scheduled_date ? new Date(mission.scheduled_date).toLocaleDateString('fr-FR') : 'Non planifiée'} />
            <MetaItem icon="cash-outline" label="Tarif" value={mission.fixed_rate ? `${mission.fixed_rate}€` : '-'} />
            <MetaItem icon="pricetags-outline" label="Mode" value={mission.mode === 'fixed' ? 'Tarif fixe' : 'Appel d\'offres'} />
            <MetaItem icon="people-outline" label="Candidatures" value={String(mission.applications_count || 0)} />
          </View>
        </View>

        {/* Access info for assigned provider */}
        {isProvider && mission.assigned_provider_id === user?.id && mission.access_code && (
          <View style={[styles.card, styles.accessCard]}>
            <Text style={styles.sectionTitle}>Informations d'accès</Text>
            <View style={styles.accessRow}>
              <Ionicons name="key-outline" size={18} color={COLORS.info} />
              <Text style={styles.accessText}>Code: {mission.access_code}</Text>
            </View>
            {mission.instructions && (
              <View style={styles.accessRow}>
                <Ionicons name="document-text-outline" size={18} color={COLORS.info} />
                <Text style={styles.accessText}>{mission.instructions}</Text>
              </View>
            )}
            {mission.deposit_location && (
              <View style={styles.accessRow}>
                <Ionicons name="location-outline" size={18} color={COLORS.info} />
                <Text style={styles.accessText}>Dépôt: {mission.deposit_location}</Text>
              </View>
            )}
          </View>
        )}

        {/* Applications (Owner view) */}
        {isOwner && mission.applications && mission.applications.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Candidatures ({mission.applications.length})</Text>
            {mission.applications.map((app: any) => (
              <View key={app.application_id} style={styles.appItem}>
                <View style={styles.appTop}>
                  <View style={styles.appInfo}>
                    <View style={styles.appAvatar}>
                      <Text style={styles.appAvatarText}>{app.provider_name?.[0] || 'P'}</Text>
                    </View>
                    <View>
                      <Text style={styles.appName}>{app.provider_name || 'Prestataire'}</Text>
                      <View style={styles.appRating}>
                        <Ionicons name="star" size={12} color={COLORS.warning} />
                        <Text style={styles.appRatingText}>{app.provider_rating || 0}/5 ({app.provider_reviews || 0} avis)</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.appRate}>{app.proposed_rate}€</Text>
                </View>
                {app.message && <Text style={styles.appMessage}>{app.message}</Text>}
                {app.status === 'pending' && (
                  <View style={styles.appActions}>
                    <TouchableOpacity testID={`accept-app-${app.application_id}`} style={styles.acceptBtn} onPress={() => handleAcceptApp(app.application_id)}>
                      <Ionicons name="checkmark" size={18} color={COLORS.textInverse} />
                      <Text style={styles.actionBtnText}>Accepter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectApp(app.application_id)}>
                      <Ionicons name="close" size={18} color={COLORS.urgency} />
                      <Text style={[styles.actionBtnText, { color: COLORS.urgency }]}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {app.status !== 'pending' && (
                  <View style={[styles.appStatusChip, { backgroundColor: (STATUS_COLORS[app.status] || STATUS_COLORS.pending).bg }]}>
                    <Text style={[styles.appStatusText, { color: (STATUS_COLORS[app.status] || STATUS_COLORS.pending).text }]}>
                      {STATUS_LABELS[app.status] || app.status}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Provider Actions */}
        {isProvider && mission.status === 'pending' && (
          <TouchableOpacity testID="apply-btn" style={styles.mainAction} onPress={handleApply}>
            <Ionicons name="hand-left-outline" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>Candidater</Text>
          </TouchableOpacity>
        )}
        {isProvider && mission.status === 'assigned' && mission.assigned_provider_id === user?.id && (
          <TouchableOpacity testID="start-btn" style={styles.mainAction} onPress={handleStart}>
            <Ionicons name="play" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>Démarrer la mission</Text>
          </TouchableOpacity>
        )}
        {isProvider && mission.status === 'in_progress' && mission.assigned_provider_id === user?.id && (
          <TouchableOpacity testID="complete-btn" style={[styles.mainAction, { backgroundColor: COLORS.success }]} onPress={handleComplete}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>Terminer la mission</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={miStyles.item}>
      <Ionicons name={icon as any} size={16} color={COLORS.textTertiary} />
      <Text style={miStyles.label}>{label}</Text>
      <Text style={miStyles.value}>{value}</Text>
    </View>
  );
}

const miStyles = StyleSheet.create({
  item: { width: '48%', flexDirection: 'column', gap: 2, paddingVertical: SPACING.sm },
  label: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 9 },
  value: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  headerTitle: { ...FONTS.h3, color: COLORS.textPrimary },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  statusChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.full },
  statusText: { ...FONTS.caption },
  typeLabel: { ...FONTS.caption, color: COLORS.textTertiary },
  card: { backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.lg, ...SHADOWS.card },
  accessCard: { borderLeftWidth: 3, borderLeftColor: COLORS.info },
  propName: { ...FONTS.h2, color: COLORS.textPrimary },
  propAddr: { ...FONTS.body, color: COLORS.textSecondary, marginTop: 4 },
  desc: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md, fontSize: 16 },
  accessRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  accessText: { ...FONTS.body, color: COLORS.info },
  appItem: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  appTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  appAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center' },
  appAvatarText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '700' },
  appName: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  appRating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  appRatingText: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontSize: 11 },
  appRate: { ...FONTS.h3, color: COLORS.success },
  appMessage: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.sm },
  appActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: COLORS.success, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: COLORS.urgencySoft, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
  actionBtnText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
  appStatusChip: { alignSelf: 'flex-start', paddingHorizontal: SPACING.md, paddingVertical: 3, borderRadius: RADIUS.full, marginTop: SPACING.sm },
  appStatusText: { ...FONTS.caption, fontSize: 10 },
  mainAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.md, ...SHADOWS.float },
  mainActionText: { ...FONTS.h3, color: COLORS.textInverse },
});
