import { needsMissionSchedule, ownerMissionFollowUp } from '../../src/utils/ownerMissionFollowUp';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMissions, useProperties, useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../src/hooks';
import { useProviders } from '../../src/hooks/useProfile';
import { useAuth } from '../../src/auth';
import { supabase } from '../../src/lib/supabase';
import { SkeletonDashboard } from '../../src/components/Skeleton';
import { Button, Card, EmptyState } from '../../src/components/ui';
import { AlpineHeader } from '../../src/components/alpine/AlpineHeader';
import { HomeSection } from '../../src/components/alpine/MarketplaceKit';
import { homeStyles, MissionPreview, WeekStrip } from '../../src/components/alpine/DashboardKit';
import { COLORS, FONTS, RADIUS, SPACING } from '../../src/theme';
import { isActiveMission, ownerMissionAction } from '../../src/utils/missionPresentation';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import type { AppNotification, MergedMission } from '../../src/types/api';

export default function OwnerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [day, setDay] = useState(new Date());
  const [panel, setPanel] = useState<'properties' | 'notifications' | null>(null);
  const [closing, setClosing] = useState(false);
  const pendingRoute = useRef<Href | null>(null);
  const closeGuard = useRef(false);
  const { data: allMissions = [], isLoading, isError, isRefetching, refetch } = useMissions();
  const { data: properties = [] } = useProperties();
  const { data: providers = [] } = useProviders();
  const { data: notifications = [], refetch: refreshNotifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { data: applications = [], refetch: refreshApplications } = useQuery({
    queryKey: ['owner-pending-applications', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('mission_applications').select('mission_id').eq('status', 'pending');
      if (error) throw error;
      return data || [];
    },
  });
  const refresh = useCallback(() => { refetch(); refreshNotifications(); refreshApplications(); }, [refetch, refreshNotifications, refreshApplications]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const finishClose = useCallback(() => {
    if (!closeGuard.current) return;
    const destination = pendingRoute.current;
    pendingRoute.current = null; closeGuard.current = false;
    setPanel(null); setClosing(false);
    if (destination) router.push(destination);
  }, [router]);
  const closePanel = (destination: Href | null = null) => {
    if (closeGuard.current) return;
    closeGuard.current = true; pendingRoute.current = destination; setClosing(true);
  };
  useEffect(() => { if (closing && Platform.OS !== 'ios') finishClose(); }, [closing, finishClose]);
  const openMission = (mission: MergedMission) => router.push(mission.is_emergency ? `/emergency?id=${mission.mission_id}` : `/mission/${mission.mission_id}`);
  const handleNotification = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.notification_id);
    closePanel(n.reference_id ? n.type?.includes('emergency') || n.type === 'bid_accepted' ? `/emergency?id=${n.reference_id}` : n.type?.includes('mission') ? `/mission/${n.reference_id}` : null : null);
  };
  const selectedProperty = properties.find(p => p.id === propertyId);
  const missions = (allMissions as MergedMission[]).filter(m => !propertyId || m.property_id === propertyId);
  const active = missions.filter(isActiveMission);
  const actions = active.map(mission => ({ mission, label: ownerMissionAction(mission, applications.some(a => a.mission_id === mission.mission_id)) })).filter(item => item.label);
  const scheduled = active.filter(m => !!m.scheduled_date).sort((a, b) => new Date(a.scheduled_date!).getTime() - new Date(b.scheduled_date!).getTime());
  const dayMissions = scheduled.filter(m => new Date(m.scheduled_date!).toDateString() === day.toDateString());
  const unscheduled = active.filter(needsMissionSchedule);
  const followUp = active.filter(m => !!ownerMissionFollowUp(m) && !actions.some(a => a.mission.mission_id === m.mission_id));
  const ongoing = active.filter(m => !m.scheduled_date && !needsMissionSchedule(m) && !ownerMissionFollowUp(m) && !actions.some(a => a.mission.mission_id === m.mission_id));
  const createMission = (urgent = false) => router.push({ pathname: '/(owner)/missions', params: { create: '1', property: propertyId || '', priority: urgent ? 'urgent' : 'normal' } });
  if (isLoading) return <SafeAreaView style={homeStyles.container}><SkeletonDashboard /></SafeAreaView>;
  return <SafeAreaView style={homeStyles.container} edges={['left', 'right']} testID="owner-dashboard">
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} />}>
      <AlpineHeader role="owner" location={selectedProperty?.name} unreadCount={notifications.filter(n => !n.read).length} onNotifications={() => { if (!closeGuard.current) { setPanel('notifications'); markAllRead.mutate(); } }} footer={
        <TouchableOpacity accessibilityRole="button" style={styles.selector} onPress={() => setPanel('properties')}>
          <Ionicons name="home-outline" size={16} color={COLORS.paper} /><Text style={styles.selectorText} numberOfLines={1}>{selectedProperty?.name || t('alpine.allProperties')}</Text><Ionicons name="chevron-down" size={15} color={COLORS.paper} />
        </TouchableOpacity>
      } />
      <View style={homeStyles.sheet}>
        <View style={homeStyles.row}><Text style={[homeStyles.summary, homeStyles.flex]}>{t('alpine.propertyCount', { count: propertyId ? 1 : properties.length })}</Text><Text style={homeStyles.summary}>{t('alpine.actionCount', { count: actions.length })}</Text></View>
        {isError && <EmptyState compact title={t('alpine.loadError')} actionLabel={t('alpine.retry')} onAction={refresh} icon="cloud-offline-outline" />}
        {!!actions.length && <HomeSection tone="amber" icon="flash-outline" title={`À vous de décider · ${actions.length}`}>
          {actions.map(({ mission, label }) => <Card key={`${mission.is_emergency}-${mission.mission_id}`} style={styles.attention} onPress={() => openMission(mission)}>
            <View style={homeStyles.row}><Text style={[homeStyles.cardTitle, homeStyles.flex]}>{label}</Text><Ionicons name="arrow-forward" color={COLORS.warning} size={20} /></View>
            <Text style={homeStyles.meta}>{getMissionTypeLabel(mission.mission_type, mission.services)} · {mission.property_name}</Text>
          </Card>)}
        </HomeSection>}
        <HomeSection icon="calendar-outline" title={t('alpine.yourDay')} actionLabel={t('alpine.planning')} onAction={() => router.push('/(owner)/planning')}>
        <WeekStrip selected={day} onSelect={setDay} dates={scheduled.map(m => m.scheduled_date!)} />
        {dayMissions.length ? dayMissions.map(m => <View key={m.mission_id} style={styles.agendaRow}><View style={styles.timeRail}><Text style={styles.time}>{new Date(m.scheduled_date!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text><View style={styles.rail} /></View><View style={homeStyles.flex}><MissionPreview mission={m} onPress={() => openMission(m)} /></View></View>) : <EmptyState compact icon="calendar-outline" title={t('alpine.noDayMission')} subtitle={t('alpine.noDaySubtitle')} />}
        </HomeSection>
        {!!unscheduled.length && <HomeSection title="Créneau à confirmer" icon="time-outline">{unscheduled.map(m => <MissionPreview key={`${m.is_emergency}-${m.mission_id}`} mission={m} onPress={() => openMission(m)} />)}</HomeSection>}
        {!!followUp.length && <HomeSection tone="amber" title={t('alpine.waitingFollowUp')} icon="time-outline">{followUp.map(m => <MissionPreview key={m.mission_id} mission={m} onPress={() => openMission(m)} />)}</HomeSection>}
        {!!ongoing.length && <HomeSection tone="ice" title={t('alpine.activeMissionsTitle')} icon="construct-outline">{ongoing.map(m => <MissionPreview key={m.mission_id} mission={m} onPress={() => openMission(m)} />)}</HomeSection>}
        <Button label="Voir toutes mes missions" variant="outline" onPress={() => router.push('/(owner)/missions')} />
        <HomeSection tone="mint" title="Un besoin pour votre logement ?" icon="add-circle-outline">
        <View style={{ gap: SPACING.sm }}>
          <Button label="Nouvelle mission" icon="add" onPress={() => createMission()} testID="create-mission-quick-btn" />
          <Text style={[homeStyles.meta, { textAlign: 'center' }]}>Ménage, linge, plomberie, électricité, serrurerie…</Text>
          <TouchableOpacity accessibilityRole="button" testID="emergency-quick-btn" style={styles.emergency} onPress={() => createMission(true)}><Ionicons name="flash-outline" size={21} color={COLORS.urgency} /><View style={homeStyles.flex}><Text style={homeStyles.cardTitle}>Besoin d’une intervention urgente ?</Text><Text style={homeStyles.meta}>La même mission, avec une priorité urgente.</Text></View><Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} /></TouchableOpacity>
        </View>
        </HomeSection>
        <HomeSection icon="people-outline" title={t('alpine.nearbyProviders')} actionLabel={t('alpine.map')} onAction={() => router.push('/(owner)/providers-map')}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providers}>{providers.slice(0, 6).map(p => <Card key={p.provider_id} style={styles.provider} onPress={() => router.push(`/(owner)/provider/${p.provider_id}`)}><View style={homeStyles.row}>{p.user?.picture ? <Image source={{ uri: p.user.picture }} style={styles.avatar} /> : <View style={styles.avatar}><Ionicons name="person-outline" color={COLORS.navy} size={22} /></View>}{p.verified && <Ionicons name="shield-checkmark" size={18} color={COLORS.success} />}</View><Text style={[homeStyles.cardTitle, { marginTop: SPACING.md }]} numberOfLines={1}>{p.company_name || p.user?.name}</Text><Text style={homeStyles.meta} numberOfLines={1}>{p.location_label || p.zone || p.user?.city}</Text><Text style={homeStyles.link}>{p.rating ? `★ ${p.rating.toFixed(1)}` : t('alpine.providersNew')}</Text></Card>)}</ScrollView>
        {!providers.length && <Button label={t('alpine.map')} variant="outline" icon="map-outline" onPress={() => router.push('/(owner)/providers-map')} />}
        </HomeSection>
      </View>
    </ScrollView>
    <Modal visible={!!panel && !closing} transparent animationType="slide" onDismiss={finishClose} onRequestClose={() => closePanel()}>
      <View style={styles.overlay}><View style={styles.panel}><View style={homeStyles.row}><Text style={[FONTS.h2, homeStyles.flex, { color: COLORS.textPrimary }]}>{t(panel === 'properties' ? 'alpine.allProperties' : 'alpine.notifications')}</Text><TouchableOpacity style={styles.close} accessibilityLabel={t('alpine.close')} onPress={() => closePanel()}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity></View>
        <ScrollView>{panel === 'properties' ? <>{[{ id: '', name: t('alpine.allProperties') }, ...properties].map(p => <TouchableOpacity key={p.id} style={styles.choice} onPress={() => { setPropertyId(p.id || null); closePanel(); }}><Text style={[homeStyles.cardTitle, homeStyles.flex]}>{p.name}</Text>{(propertyId || '') === p.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.brandPrimary} />}</TouchableOpacity>)}</> : notifications.length ? notifications.map(n => <TouchableOpacity key={n.notification_id} style={styles.choice} onPress={() => handleNotification(n)}><View style={homeStyles.flex}><Text style={homeStyles.cardTitle}>{n.title}</Text><Text style={homeStyles.meta}>{n.body}</Text></View><Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} /></TouchableOpacity>) : <EmptyState icon="notifications-off-outline" title={t('provider.dashboard.no_notifications')} />}</ScrollView>
      </View></View>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  selector: { flexDirection: 'row', gap: SPACING.sm, minHeight: 48, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: SPACING.md, borderRadius: RADIUS.full, backgroundColor: COLORS.heroGlass, borderWidth: 1, borderColor: COLORS.heroBorder, maxWidth: '100%' },
  selectorText: { ...FONTS.bodySmall, fontFamily: FONTS.h2.fontFamily, color: COLORS.paper, flexShrink: 1 },
  attention: { backgroundColor: COLORS.attention, borderColor: COLORS.attentionBorder, padding: SPACING.xl },
  goldDot: { width: 6, height: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.gold },
  attentionTitle: { ...FONTS.h2, fontSize: 21, color: COLORS.textPrimary, marginVertical: SPACING.sm },
  attentionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md },
  attentionLink: { ...FONTS.bodySmall, fontFamily: FONTS.h2.fontFamily, color: COLORS.warning, marginTop: SPACING.md },
  agendaRow: { flexDirection: 'row', gap: SPACING.md },
  timeRail: { width: 38, alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.lg },
  time: { ...FONTS.bodySmall, fontSize: 10, color: COLORS.textSecondary },
  rail: { width: 1, flex: 1, backgroundColor: COLORS.border },
  service: { flex: 1, minHeight: 138, backgroundColor: COLORS.paper, borderRadius: RADIUS.lg, borderColor: COLORS.border, borderWidth: 1, padding: SPACING.md, gap: SPACING.sm },
  serviceIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  serviceLabel: { ...FONTS.bodySmall, fontSize: 11, fontFamily: FONTS.h2.fontFamily, color: COLORS.textPrimary, flex: 1 },
  emergency: { padding: SPACING.lg, flexDirection: 'row', gap: SPACING.md, alignItems: 'center', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.attentionBorder },
  providers: { gap: SPACING.md },
  provider: { width: 210 },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.avatar, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: 'flex-end' },
  panel: { maxHeight: '80%', backgroundColor: COLORS.paper, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACING.xl, paddingBottom: SPACING.xxxxl },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  choice: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
});
