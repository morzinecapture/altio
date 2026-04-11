import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, EMERGENCY_STATUS_LABELS } from '../../src/theme';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { useMissions, useStartMission, missionKeys } from '../../src/hooks';
import { acceptDirectMission, rejectDirectMission } from '../../src/api';
import type { MergedMission } from '../../src/types/api';
import { useTranslation } from 'react-i18next';

const EMPTY_KEYS: Record<string, { text: string; sub: string }> = {
  pending_provider_approval: { text: 'provider.my_missions.empty_invitations', sub: 'provider.my_missions.empty_invitations_sub' },
  assigned:    { text: 'provider.my_missions.empty_assigned', sub: 'provider.my_missions.empty_assigned_sub' },
  in_progress: { text: 'provider.my_missions.empty_in_progress', sub: 'provider.my_missions.empty_in_progress_sub' },
  completed:   { text: 'provider.my_missions.empty_history', sub: 'provider.my_missions.empty_history_sub' },
  default:     { text: 'provider.my_missions.empty_default', sub: 'provider.my_missions.empty_default_sub' },
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
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: rawMissions, isLoading, isRefetching, refetch } = useMissions(undefined, undefined, true);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  const missions = (rawMissions ?? []).filter((m) => m.status !== 'pending' && m.my_bid_status !== 'cancelled') as MergedMission[];

  const qc = useQueryClient();
  const startMissionMut = useStartMission();
  const acceptDirectMut = useMutation({
    mutationFn: (missionId: string) => acceptDirectMission(missionId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: missionKeys.all }); },
  });
  const rejectDirectMut = useMutation({
    mutationFn: (missionId: string) => rejectDirectMission(missionId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: missionKeys.all }); },
  });

  const filters = [
    { key: null, label: t('provider.my_missions.filter_all') },
    { key: 'pending_provider_approval', label: t('provider.my_missions.filter_invitations') },
    { key: 'assigned', label: t('provider.my_missions.filter_assigned') },
    { key: 'in_progress', label: t('provider.my_missions.filter_in_progress') },
    { key: 'completed', label: t('provider.my_missions.filter_history') },
  ];

  const filteredMissions = missions.filter(m => {
    if (!filter) return true;
    if (filter === 'completed') return ['completed', 'cancelled', 'refunded'].includes(m.status);
    return m.status === filter;
  });

  const handleStart = async (missionId: string) => {
    setActionLoading(missionId);
    startMissionMut.mutate(missionId, {
      onSuccess: () => { Alert.alert('C\'est parti !', 'La mission est en cours. Le propriétaire a été notifié.'); },
      onError: (e: unknown) => { Alert.alert('Erreur', e instanceof Error ? e.message : String(e)); },
      onSettled: () => { setActionLoading(null); },
    });
  };

  const handleComplete = (missionId: string) => {
    // R7: Rediriger vers la page détail mission pour compléter avec photos obligatoires
    router.push(`/mission/${missionId}`);
  };

  const handleAcceptDirect = async (missionId: string) => {
    setActionLoading(missionId);
    acceptDirectMut.mutate(missionId, {
      onSuccess: () => { Alert.alert(t('provider.my_missions.accept_success_title'), t('provider.my_missions.accept_success_msg')); },
      onError: (e: unknown) => { Alert.alert('Erreur', e instanceof Error ? e.message : String(e)); },
      onSettled: () => { setActionLoading(null); },
    });
  };

  const handleRejectDirect = async (missionId: string) => {
    Alert.alert(t('provider.my_missions.reject_title'), t('provider.my_missions.reject_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('provider.my_missions.reject_confirm'), style: 'destructive', onPress: () => {
          setActionLoading(missionId);
          rejectDirectMut.mutate(missionId, {
            onError: (e: unknown) => { Alert.alert('Erreur', e instanceof Error ? e.message : String(e)); },
            onSettled: () => { setActionLoading(null); },
          });
        }
      }
    ]);
  };

  const emptyKeys = EMPTY_KEYS[filter ?? 'default'] ?? EMPTY_KEYS.default;

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="my-missions-screen">
      <FlatList
        data={filteredMissions}
        keyExtractor={(m) => m.mission_id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.title}>{t('provider.my_missions.title')}{filteredMissions.length > 0 ? ` (${filteredMissions.length})` : ''}</Text>
            </View>
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
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={50} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>{t(emptyKeys.text)}</Text>
            <Text style={styles.emptySubtext}>{t(emptyKeys.sub)}</Text>
          </View>
        }
        renderItem={({ item: m }) => (
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => router.push(`/mission/${m.mission_id}`)}
          >
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.chip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg }]}>
                  <Text style={[styles.chipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                    {m.is_emergency
                      ? (EMERGENCY_STATUS_LABELS[m.status] || STATUS_LABELS[m.status] || m.status)
                      : (STATUS_LABELS[m.status] || m.status)}
                  </Text>
                </View>
                {m.is_emergency && (
                  <View style={[styles.chip, { backgroundColor: COLORS.urgencySoft, marginLeft: SPACING.xs }]}>
                    <Text style={[styles.chipText, { color: COLORS.urgency }]}>URGENCE</Text>
                  </View>
                )}
                <Text style={styles.typeLabel}>{getMissionTypeLabel(m.mission_type)}</Text>
              </View>
              <Text style={styles.cardTitle}>{m.property_name || 'Logement'}</Text>
              {!!m.property_address && <Text style={styles.cardAddr}>{m.property_address}</Text>}

              {!!m.access_code && (
                <View style={styles.accessInfo}>
                  <View style={styles.accessItem}>
                    <Ionicons name="key-outline" size={16} color={COLORS.info} />
                    <Text style={styles.accessText}>Code: {m.access_code}</Text>
                  </View>
                  {!!m.instructions && (
                    <View style={styles.accessItem}>
                      <Ionicons name="document-text-outline" size={16} color={COLORS.info} />
                      <Text style={styles.accessText}>{m.instructions}</Text>
                    </View>
                  )}
                  {!!m.deposit_location && (
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
                {!!m.fixed_rate && (
                  <>
                    <Text style={styles.metaSep}>·</Text>
                    <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                    <Text style={[styles.metaText, { color: COLORS.success }]}>{m.fixed_rate}€</Text>
                  </>
                )}
              </View>

              {m.status === 'pending_provider_approval' && !m.is_emergency && (
                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, backgroundColor: COLORS.success, opacity: actionLoading === m.mission_id ? 0.7 : 1 }]}
                    disabled={actionLoading === m.mission_id}
                    onPress={() => handleAcceptDirect(m.mission_id)}
                  >
                    {actionLoading === m.mission_id
                      ? <ActivityIndicator color={COLORS.textInverse} />
                      : <><Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} /><Text style={styles.actionText}>{t('provider.my_missions.accept')}</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { flex: 1, backgroundColor: COLORS.urgency, opacity: actionLoading === m.mission_id ? 0.7 : 1 }]}
                    disabled={actionLoading === m.mission_id}
                    onPress={() => handleRejectDirect(m.mission_id)}
                  >
                    {actionLoading === m.mission_id
                      ? <ActivityIndicator color={COLORS.textInverse} />
                      : <><Ionicons name="close-circle" size={18} color={COLORS.textInverse} /><Text style={styles.actionText}>{t('provider.my_missions.reject')}</Text></>}
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
                    : <><Ionicons name="play" size={18} color={COLORS.textInverse} /><Text style={styles.actionText}>{t('provider.my_missions.start')}</Text></>}
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
                    : <><Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} /><Text style={styles.actionText}>{t('provider.my_missions.complete')}</Text></>}
                </TouchableOpacity>
              )}
              {m.is_emergency && m.status === 'completed' && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.success }]} onPress={() => router.push(`/emergency?id=${m.mission_id}`)}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionText}>Voir le résumé</Text>
                </TouchableOpacity>
              )}
              {m.is_emergency && m.status === 'bids_open' && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F59E0B' }]} onPress={() => router.push(`/emergency?id=${m.mission_id}`)}>
                  <Ionicons name="time-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionText}>Candidature envoyée</Text>
                </TouchableOpacity>
              )}
              {m.is_emergency && ['displacement_paid', 'bid_accepted', 'provider_accepted'].includes(m.status) && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.brandPrimary }]} onPress={() => router.push(`/emergency?id=${m.mission_id}`)}>
                  <Ionicons name="car-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionText}>En route — voir détails</Text>
                </TouchableOpacity>
              )}
              {m.is_emergency && m.status === 'on_site' && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.brandPrimary }]} onPress={() => router.push(`/emergency?id=${m.mission_id}`)}>
                  <Ionicons name="location-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionText}>Sur place — voir détails</Text>
                </TouchableOpacity>
              )}
              {m.is_emergency && ['quote_submitted', 'quote_sent', 'quote_accepted', 'in_progress'].includes(m.status) && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.brandPrimary }]} onPress={() => router.push(`/emergency?id=${m.mission_id}`)}>
                  <Ionicons name="eye-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionText}>Voir les détails</Text>
                </TouchableOpacity>
              )}
              {m.is_emergency && !['completed', 'bids_open', 'displacement_paid', 'bid_accepted', 'provider_accepted', 'on_site', 'quote_submitted', 'quote_sent', 'quote_accepted', 'in_progress'].includes(m.status) && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.brandPrimary }]} onPress={() => router.push(`/emergency?id=${m.mission_id}`)}>
                  <Ionicons name="eye-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionText}>Voir les détails</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
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
