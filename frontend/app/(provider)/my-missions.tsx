import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { MARKETPLACE } from '../../src/components/alpine/MarketplaceKit';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/theme';
import { SkeletonList } from '../../src/components/Skeleton';
import { Button, Card, EmptyState, StatusBadge } from '../../src/components/ui';
import { providerMissionFollowUp } from '../../src/utils/providerMissionFollowUp';
import { isUrgentMission } from '../../src/utils/missionPresentation';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { useMissions, useStartMission, missionKeys } from '../../src/hooks';
import { acceptDirectMission, rejectDirectMission, getMyApplications } from '../../src/api';
import { useAuth } from '../../src/auth';
import { supabase } from '../../src/lib/supabase';
import { PageHeader } from '../../src/components/alpine/AlpineHeader';
import { MissionPreview } from '../../src/components/alpine/DashboardKit';
import { groupProviderMissions, parseMissionView, applicationIsPending } from '../../src/utils/providerMissionViews';
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
  const { user } = useAuth();
  const params = useLocalSearchParams<{ view?: string; filter?: string }>();
  const [view, setView] = useState(() => parseMissionView(params.view));
  useEffect(() => { setView(parseMissionView(params.view)); }, [params.view]);
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string | null>(params.filter === 'waiting' ? 'waiting' : null);
  useEffect(() => { setFilter(params.filter === 'waiting' ? 'waiting' : null); }, [params.filter]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: rawMissions, isLoading, isRefetching, refetch } = useMissions(undefined, undefined, true);

  const applicationQuery = useQuery({
    queryKey: ['provider-mission-hub', user?.id],
    queryFn: async () => {
      const [applications, ids] = await Promise.all([
        getMyApplications(),
        supabase.from('mission_applications').select('mission_id').eq('provider_id', user!.id),
      ]);
      if (ids.error) throw ids.error;
      return { applications, ids: (ids.data || []).map(a => a.mission_id) };
    },
    enabled: !!user?.id,
  });
  const { refetch: refreshApplications } = applicationQuery;
  const refresh = useCallback(() => { refetch(); refreshApplications(); }, [refetch, refreshApplications]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const groups = groupProviderMissions((rawMissions ?? []) as MergedMission[], user?.id || '', new Set(applicationQuery.data?.ids || []));
  const pendingApplications = (applicationQuery.data?.applications || []).filter(a => a.status === 'pending' && applicationIsPending(a.mission_status) && a.mission_id);
  const applicationMissions: MergedMission[] = [
    ...groups.applications,
    ...pendingApplications.map(a => ({ ...a, id: a.mission_id!, mission_id: a.mission_id!, status: 'pending', is_emergency: false } as MergedMission)),
  ];
  const missions = groups.active;

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
    { key: 'waiting', label: t('alpine.waitingFollowUp') },
    { key: 'completed', label: t('provider.my_missions.filter_history') },
  ];

  const filteredMissions = missions.filter(m => {
    if (!filter) return true;
    if (filter === 'waiting') return !!providerMissionFollowUp(m);
    if (filter === 'in_progress' && providerMissionFollowUp(m)) return false;
    if (filter === 'completed') return ['completed', 'paid', 'cancelled', 'refunded'].includes(m.status);
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

  if (isLoading || applicationQuery.isLoading) return <SafeAreaView style={styles.container} testID="my-missions-screen"><SkeletonList count={4} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} testID="my-missions-screen">
      <FlatList
        data={view === 'discover' ? groups.discover : view === 'applications' ? applicationMissions : filteredMissions}
        keyExtractor={(m) => m.mission_id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching || applicationQuery.isRefetching} onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            <PageHeader title={t('alpine.missions')} subtitle={t('alpine.missionsSubtitle')} />
            <View style={styles.segments}>{(['discover', 'applications', 'active'] as const).map(key => <TouchableOpacity key={key} testID={`mission-view-${key}`} accessibilityRole="tab" aria-selected={view === key} accessibilityState={{ selected: view === key }} style={[styles.segment, view === key && styles.segmentActive]} onPress={() => { setView(key); router.setParams({ view: key }); }}><Text style={[styles.segmentText, view === key && styles.segmentTextActive]}>{t(key === 'active' ? 'alpine.myMissions' : `alpine.${key}`)}</Text></TouchableOpacity>)}</View>
            {applicationQuery.isError && <EmptyState compact icon="cloud-offline-outline" title={t('alpine.loadError')} actionLabel={t('alpine.retry')} onAction={refresh} />}
            {view === 'active' &&             <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
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
            </ScrollView>}
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-outline"
            title={t(view === 'discover' ? 'alpine.emptyDiscover' : view === 'applications' ? 'alpine.emptyApplications' : emptyKeys.text)}
            subtitle={t(view === 'discover' ? 'alpine.emptyDiscoverSub' : view === 'applications' ? 'alpine.emptyApplicationsSub' : emptyKeys.sub)}
            testID="my-missions-empty"
          />
        }
        renderItem={({ item: m }) => view !== 'active' ? <View style={styles.card}><MissionPreview mission={m} provider label={view === 'applications' ? t('alpine.applicationSent') : undefined} onPress={() => router.push(m.is_emergency ? `/emergency?id=${m.mission_id}` : `/mission/${m.mission_id}`)} /></View> : (
          <Card style={styles.card}>
            <View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('alpine.openMission')} onPress={() => router.push(m.is_emergency ? `/emergency?id=${m.mission_id}` : `/mission/${m.mission_id}`)}>
              <View style={styles.cardTop}>
                <StatusBadge multiline={!!providerMissionFollowUp(m)} style={{ flexShrink: 1 }} status={providerMissionFollowUp(m) ? 'awaiting_payment' : m.raw_status || m.status} emergency={m.is_emergency} size="sm" label={providerMissionFollowUp(m) ? t(`alpine.${providerMissionFollowUp(m)}`) : undefined} />
                {isUrgentMission(m) && (
                  <StatusBadge status="urgent" label="URGENCE" size="sm" style={styles.urgencyBadge} />
                )}
                <Text style={styles.typeLabel}>{getMissionTypeLabel(m.mission_type, m.services)}</Text>
              </View>
              <Text style={styles.cardTitle}>{m.property_name || 'Logement'}</Text>
              {!!m.property_address && <Text style={styles.cardAddr}>{m.property_address}</Text>}

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

              </TouchableOpacity>
              {m.status === 'pending_provider_approval' && !m.is_emergency && (
                <View style={styles.actionRow}>
                  <Button
                    label={t('provider.my_missions.accept')}
                    icon="checkmark-circle"
                    variant="success"
                    size="sm"
                    loading={actionLoading === m.mission_id}
                    onPress={() => handleAcceptDirect(m.mission_id)}
                    style={styles.actionFlex}
                    testID={`accept-mission-${m.mission_id}`}
                  />
                  <Button
                    label={t('provider.my_missions.reject')}
                    icon="close-circle"
                    variant="danger"
                    size="sm"
                    loading={actionLoading === m.mission_id}
                    onPress={() => handleRejectDirect(m.mission_id)}
                    style={styles.actionFlex}
                    testID={`reject-mission-${m.mission_id}`}
                  />
                </View>
              )}
              {m.status === 'assigned' && !m.is_emergency && (
                <Button
                  label={t('provider.my_missions.start')}
                  icon="play"
                  variant="primary"
                  size="sm"
                  loading={actionLoading === m.mission_id}
                  onPress={() => handleStart(m.mission_id)}
                  style={styles.actionSpacing}
                  testID={`start-mission-${m.mission_id}`}
                />
              )}
              {m.status === 'in_progress' && !m.is_emergency && (
                <Button
                  label={t('provider.my_missions.complete')}
                  icon="checkmark-circle"
                  variant="success"
                  size="sm"
                  loading={actionLoading === m.mission_id}
                  onPress={() => handleComplete(m.mission_id)}
                  style={styles.actionSpacing}
                  testID={`complete-mission-${m.mission_id}`}
                />
              )}
              {m.is_emergency && (
                <Button
                  label={t(providerMissionFollowUp(m) ? 'alpine.viewFollowUp' : 'alpine.openMission')}
                  icon={providerMissionFollowUp(m) ? 'time-outline' : 'arrow-forward'}
                  variant={providerMissionFollowUp(m) ? 'outline' : 'primary'}
                  size="sm"
                  onPress={() => router.push(`/emergency?id=${m.mission_id}`)}
                  style={styles.actionSpacing}
                />
              )}
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', margin: SPACING.xl, marginBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  segment: { flex: 1, minHeight: 48, paddingHorizontal: SPACING.xs, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  segmentActive: { borderBottomColor: COLORS.textPrimary },
  segmentText: { ...FONTS.bodySmall, fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  segmentTextActive: { fontFamily: FONTS.h2.fontFamily, color: COLORS.textPrimary },
  container: { flex: 1, backgroundColor: MARKETPLACE.canvas },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.lg },
  title: { ...FONTS.h1, fontSize: 24, color: COLORS.textPrimary },
  card: { marginHorizontal: SPACING.xl, marginTop: SPACING.md, borderRadius: 16 },
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  typeLabel: { ...FONTS.caption, color: COLORS.textTertiary },
  cardTitle: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  cardAddr: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  accessInfo: { backgroundColor: COLORS.infoSoft, padding: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.md, gap: SPACING.sm },
  accessItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  accessText: { ...FONTS.bodySmall, color: COLORS.info },
  accessPending: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, opacity: 0.6 },
  accessPendingText: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontStyle: 'italic' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  metaText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  metaSep: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginHorizontal: SPACING.xs },
  urgencyBadge: { marginLeft: SPACING.xs },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  actionFlex: { flex: 1 },
  actionSpacing: { marginTop: SPACING.md },
  filterBar: { flexGrow: 0, marginTop: SPACING.md },
  filterContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm, paddingBottom: SPACING.sm },
  filterChip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: 9, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.brandPrimary },
  filterText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  filterTextActive: { color: COLORS.textInverse, fontWeight: '600' },
});
