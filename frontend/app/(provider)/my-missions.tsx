import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS } from '../../src/theme';
import { getMissions, startMission, completeMission, acceptDirectMission, rejectDirectMission } from '../../src/api';

const EMPTY_MESSAGES: Record<string, { text: string; sub: string }> = {
  pending_provider_approval: { text: 'Aucune invitation', sub: 'Les propriétaires vous inviteront directement ici' },
  assigned:    { text: 'Aucune mission assignée', sub: 'Acceptez des invitations pour les voir ici' },
  in_progress: { text: 'Aucune mission en cours', sub: 'Démarrez une mission assignée' },
  completed:   { text: 'Aucun historique', sub: 'Vos missions terminées apparaîtront ici' },
  default:     { text: 'Aucune mission', sub: 'Candidatez aux missions disponibles' },
};

const formatRelativeDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const dateCopy = new Date(dateStr);
  const diffDays = Math.round((dateCopy.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / 86400000);
  if (diffDays === 0) return `Aujourd'hui à ${time}`;
  if (diffDays === 1) return `Demain à ${time}`;
  if (diffDays > 1 && diffDays < 7) {
    const day = new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long' });
    return `${day.charAt(0).toUpperCase() + day.slice(1)} à ${time}`;
  }
  return `${new Date(dateStr).toLocaleDateString('fr-FR')} à ${time}`;
};

export default function MyMissionsScreen() {
  const router = useRouter();
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const result = await getMissions();
      // Only keep non-pending missions (assigned, in_progress, completed, awaiting_payment, etc.)
      setMissions(result.filter((m: any) => m.status !== 'pending'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const filters = [
    { key: null, label: 'Toutes' },
    { key: 'pending_provider_approval', label: 'Invitations' },
    { key: 'assigned', label: 'Assignées' },
    { key: 'in_progress', label: 'En cours' },
    { key: 'completed', label: 'Historique' },
  ];

  const filteredMissions = missions.filter(m => {
    if (!filter) return true;
    if (filter === 'completed') return ['completed', 'cancelled', 'refunded'].includes(m.status);
    return m.status === filter;
  });

  const handleStart = async (missionId: string) => {
    setActionLoading(missionId);
    try {
      await startMission(missionId);
      Alert.alert('Mission démarrée');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setActionLoading(null); }
  };

  const handleComplete = async (missionId: string) => {
    Alert.alert('Terminer la mission ?', 'Confirmez-vous avoir terminé cette mission ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer', onPress: async () => {
          setActionLoading(missionId);
          try { await completeMission(missionId); Alert.alert('Mission terminée !'); fetchData(); }
          catch (e: any) { Alert.alert('Erreur', e.message); }
          finally { setActionLoading(null); }
        }
      },
    ]);
  };

  const handleAcceptDirect = async (missionId: string) => {
    setActionLoading(missionId);
    try {
      await acceptDirectMission(missionId);
      Alert.alert('Succès', 'Mission acceptée ! Vous pouvez maintenant la démarrer le jour J.');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setActionLoading(null); }
  };

  const handleRejectDirect = async (missionId: string) => {
    Alert.alert('Refuser la demande ?', 'Cette action est irréversible.', [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Confirmer le refus', style: 'destructive', onPress: async () => {
          setActionLoading(missionId);
          try {
            await rejectDirectMission(missionId);
            fetchData();
          } catch (e: any) { Alert.alert('Erreur', e.message); }
          finally { setActionLoading(null); }
        }
      }
    ]);
  };

  const emptyMsg = EMPTY_MESSAGES[filter ?? 'default'] ?? EMPTY_MESSAGES.default;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="my-missions-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Mes missions{filteredMissions.length > 0 ? ` (${filteredMissions.length})` : ''}</Text>
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
          {filters.map((f) => (
            <TouchableOpacity
              key={f.key || 'all'}
              testID={`filter-${f.key || 'all'}`}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredMissions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={50} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>{emptyMsg.text}</Text>
            <Text style={styles.emptySubtext}>{emptyMsg.sub}</Text>
          </View>
        ) : (
          filteredMissions.map((m) => (
            <TouchableOpacity
              key={m.mission_id}
              activeOpacity={0.95}
              onPress={() => router.push(`/mission/${m.mission_id}`)}
            >
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.chip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg }]}>
                    <Text style={[styles.chipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                      {STATUS_LABELS[m.status] || m.status}
                    </Text>
                  </View>
                  {m.is_emergency && (
                    <View style={[styles.chip, { backgroundColor: COLORS.urgencySoft, marginLeft: SPACING.xs }]}>
                      <Text style={[styles.chipText, { color: COLORS.urgency }]}>URGENCE</Text>
                    </View>
                  )}
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

                {['assigned', 'in_progress'].includes(m.status) && !m.access_code && (
                  <View style={styles.accessPending}>
                    <Ionicons name="time-outline" size={14} color={COLORS.textTertiary} />
                    <Text style={styles.accessPendingText}>Infos d'accès non encore renseignées</Text>
                  </View>
                )}

                <View style={styles.cardMeta}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                  <Text style={styles.metaText}>{m.scheduled_date ? formatRelativeDate(m.scheduled_date) : '-'}</Text>
                  {m.fixed_rate && (
                    <>
                      <Text style={styles.metaSep}>·</Text>
                      <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                      <Text style={[styles.metaText, { color: COLORS.success }]}>{m.fixed_rate}€</Text>
                    </>
                  )}
                </View>

                {/* Actions */}
                {m.status === 'pending_provider_approval' && !m.is_emergency && (
                  <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { flex: 1, backgroundColor: COLORS.success, opacity: actionLoading === m.mission_id ? 0.7 : 1 }]}
                      disabled={actionLoading === m.mission_id}
                      onPress={() => handleAcceptDirect(m.mission_id)}
                    >
                      {actionLoading === m.mission_id
                        ? <ActivityIndicator color={COLORS.textInverse} />
                        : <><Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} /><Text style={styles.actionText}>Accepter</Text></>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { flex: 1, backgroundColor: COLORS.urgency, opacity: actionLoading === m.mission_id ? 0.7 : 1 }]}
                      disabled={actionLoading === m.mission_id}
                      onPress={() => handleRejectDirect(m.mission_id)}
                    >
                      {actionLoading === m.mission_id
                        ? <ActivityIndicator color={COLORS.textInverse} />
                        : <><Ionicons name="close-circle" size={18} color={COLORS.textInverse} /><Text style={styles.actionText}>Refuser</Text></>}
                    </TouchableOpacity>
                  </View>
                )}
                {m.status === 'assigned' && !m.is_emergency && (
                  <TouchableOpacity
                    testID={`start-mission-${m.mission_id}`}
                    style={[styles.actionBtn, { opacity: actionLoading === m.mission_id ? 0.7 : 1 }]}
                    disabled={actionLoading === m.mission_id}
                    onPress={() => handleStart(m.mission_id)}
                  >
                    {actionLoading === m.mission_id
                      ? <ActivityIndicator color={COLORS.textInverse} />
                      : <><Ionicons name="play" size={18} color={COLORS.textInverse} /><Text style={styles.actionText}>Démarrer la mission</Text></>}
                  </TouchableOpacity>
                )}
                {m.status === 'in_progress' && !m.is_emergency && (
                  <TouchableOpacity
                    testID={`complete-mission-${m.mission_id}`}
                    style={[styles.actionBtn, { backgroundColor: COLORS.success, opacity: actionLoading === m.mission_id ? 0.7 : 1 }]}
                    disabled={actionLoading === m.mission_id}
                    onPress={() => handleComplete(m.mission_id)}
                  >
                    {actionLoading === m.mission_id
                      ? <ActivityIndicator color={COLORS.textInverse} />
                      : <><Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} /><Text style={styles.actionText}>Terminer la mission</Text></>}
                  </TouchableOpacity>
                )}
                {m.is_emergency && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/emergency?id=${m.mission_id}`)}>
                    <Ionicons name="warning-outline" size={18} color={COLORS.textInverse} />
                    <Text style={styles.actionText}>Gérer l'urgence</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.lg },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F' },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl * 2 },
  emptyText: { ...FONTS.body, color: COLORS.textTertiary, marginTop: SPACING.md },
  emptySubtext: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  card: { backgroundColor: '#FFFFFF', marginHorizontal: SPACING.xl, marginTop: SPACING.md, padding: SPACING.lg, borderRadius: 16, ...SHADOWS.card, borderWidth: 1, borderColor: '#F1F5F9' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 3, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption },
  typeLabel: { ...FONTS.caption, color: COLORS.textTertiary },
  cardTitle: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  cardAddr: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  accessInfo: { backgroundColor: COLORS.infoSoft, padding: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.md, gap: SPACING.sm },
  accessItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  accessText: { ...FONTS.bodySmall, color: COLORS.info },
  accessPending: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, opacity: 0.6 },
  accessPendingText: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontStyle: 'italic' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  metaText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  metaSep: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginHorizontal: SPACING.xs },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, marginTop: SPACING.md },
  actionText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
  filterBar: { flexGrow: 0, marginTop: SPACING.md },
  filterContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm, paddingBottom: SPACING.sm },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  filterText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  filterTextActive: { color: COLORS.textInverse, fontWeight: '600' },
});
