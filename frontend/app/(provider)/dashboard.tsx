import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, Alert, Switch, Modal, Platform } from 'react-native';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AlpineHeader } from '../../src/components/alpine/AlpineHeader';
import { HomeSection, MARKETPLACE } from '../../src/components/alpine/MarketplaceKit';
import { homeStyles, MissionPreview } from '../../src/components/alpine/DashboardKit';
import { Button, Card, EmptyState } from '../../src/components/ui';
import { SkeletonDashboard } from '../../src/components/Skeleton';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getMissions, getEmergencies, toggleAvailability, getProfile, getMyApplications, getProviderSchedule, getProviderStats } from '../../src/api';
import { supabase } from '../../src/lib/supabase';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../src/hooks/useNotifications';
import { providerMissionFollowUp } from '../../src/utils/providerMissionFollowUp';
import type { CompletionStep } from '../../src/api/completion';
import type { MergedMission, EmergencyRequest, ProviderStats, ScheduleItem, AppNotification } from '../../src/types/api';


interface EnrichedEmergency extends EmergencyRequest {
  mission_id: string;
  is_emergency: true;
  mission_type: string;
  mode?: string;
  scheduled_date?: string;
  fixed_rate?: number;
  raw_status?: string;
  assigned_provider_id?: string | null;
}

interface EnrichedApplication {
  id: string;
  mission_id?: string;
  mission_type?: string;
  property_name?: string;
  property_address?: string;
  description?: string;
  scheduled_date?: string;
  fixed_rate?: number;
  mission_status?: string;
  status: string;
  proposed_rate?: number;
  message?: string;
  provider_id: string;
  created_at: string;
}

interface AvailableItemBase {
  completion_steps?: CompletionStep[];
  id: string;
  mission_id: string;
  mission_type: string;
  is_emergency: boolean;
  status: string;
  description?: string;
  property_name?: string;
  property_address?: string;
  scheduled_date?: string;
  fixed_rate?: number;
  created_at: string;
  service_type?: string;
  mode?: string;
  raw_status?: string;
  assigned_provider_id?: string | null;
  accepted_provider_id?: string | null;
}

type AvailableItem = AvailableItemBase;

export default function ProviderDashboard() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const [modalClosing, setModalClosing] = useState(false);
  const closingRef = useRef(false);
  const navigatingAway = useRef(false);
  const pendingRoute = useRef<Href | null>(null);
  const { t } = useTranslation();
  const { user } = useAuth();
  const [availableMissions, setAvailableMissions] = useState<AvailableItem[]>([]);
  const [applications, setApplications] = useState<EnrichedApplication[]>([]);
  const [myActiveMissions, setMyActiveMissions] = useState<AvailableItem[]>([]);
  const [waitingMissions, setWaitingMissions] = useState<AvailableItem[]>([]);
  const [todayMissions, setTodayMissions] = useState<ScheduleItem[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const markAllRead = useMarkAllNotificationsRead();
  const [stats, setStats] = useState<ProviderStats | null>(null);
  const [bidCount, setBidCount] = useState(0);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const availabilityLock = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [providerProfileComplete, setProviderProfileComplete] = useState(true);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [providerZone, setProviderZone] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<AppNotification | null>(null);
  const [handledSelectionAlertIds, setHandledSelectionAlertIds] = useState<Set<string>>(new Set());
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();

  const fetchData = useCallback(async () => {
    try {
      setLoadError(false);
      const [m, e, apps, profile, schedule, provStats] = await Promise.all([
        getMissions(undefined, undefined, true),
        getEmergencies(true),
        getMyApplications(),
        getProfile(),
        getProviderSchedule(),
        getProviderStats(),
      ]);

      // Fetch my emergency bids (pending + cancelled) to filter available list
      const bidSet = new Set<string>();
      const cancelledBidIds = new Set<string>();
      if (user?.id) {
        const { data: myBids } = await supabase
          .from('emergency_bids')
          .select('emergency_request_id, status')
          .eq('provider_id', user.id)
          .in('status', ['pending', 'cancelled']);
        myBids?.forEach((b: { emergency_request_id: string; status: string }) => {
          if (b.status === 'pending') bidSet.add(b.emergency_request_id);
          else cancelledBidIds.add(b.emergency_request_id);
        });
        setBidCount(e.filter(em => em.status === 'bids_open' && bidSet.has(em.id)).length);
      }

      // Fetch tous les IDs de missions où j'ai candidaté (tous statuts) pour exclure de "disponibles"
      const { data: allMyApps } = await supabase
        .from('mission_applications')
        .select('mission_id')
        .eq('provider_id', user?.id || '');

      const appliedMissionIds = new Set(
        (allMyApps || []).map((a: { mission_id: string }) => a.mission_id).filter(Boolean)
      );

      // Pending missions (regular only, not emergencies — emergencies come from getEmergencies)
      // Exclure de "disponibles" les missions avec candidature déjà déposée
      const pendingMissions = m.filter((mi: MergedMission) =>
        !mi.is_emergency &&
        !appliedMissionIds.has(mi.id) &&
        (
          (mi.status === 'pending' && mi.assigned_provider_id !== user?.id) ||
          (mi.status === 'pending_provider_approval' && mi.assigned_provider_id === user?.id)
        )
      );

      // Open emergencies (available to respond to) — exclude those where provider cancelled their bid
      const openEmergencies = e.filter((em) =>
        em.status === 'bids_open' &&
        !cancelledBidIds.has(em.id) && !bidSet.has(em.id)
      ).map((em) => ({
        ...(em as unknown as EmergencyRequest),
        mission_id: em.id,
        is_emergency: true as const,
        mission_type: em.service_type,
      } as EnrichedEmergency));

      // Merge pending missions + open emergencies into one "available" list
      const merged = [...pendingMissions, ...openEmergencies].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setAvailableMissions(merged);

      // Pending applications
      // Exclure les candidatures dont la mission est déjà dans un statut actif ou terminé
      // (elles apparaissent déjà dans "Mes missions actives" ou sont terminées)
      const activeOrDoneStatuses = ['assigned', 'in_progress', 'awaiting_payment', 'validated', 'paid', 'completed', 'cancelled'];
      const filteredApps = (apps || []).filter((app: EnrichedApplication) =>
        app.status !== 'rejected' &&
        !activeOrDoneStatuses.includes(app.mission_status || '')
      );
      setApplications(filteredApps);

      // My active missions/emergencies (assigned to me)
      // getMissions includes completion evidence; keep work and owner/payment follow-up separate.
      const activeStatuses = ['validated', 'assigned', 'in_progress', 'on_site', 'quote_submitted', 'quote_accepted', 'awaiting_payment'];
      const myMissions = m.filter((mi: MergedMission) =>
        !mi.is_emergency && mi.assigned_provider_id === user?.id && activeStatuses.includes(mi.status)
      );
      const myEmergencies = (m as MergedMission[]).filter(mi =>
        mi.is_emergency && mi.assigned_provider_id === user?.id &&
        !['bids_open', 'completed', 'cancelled', 'refunded', 'expired'].includes(mi.raw_status || mi.status)
      );
      const assigned = [...myMissions, ...myEmergencies].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setMyActiveMissions(assigned.filter(mi => !providerMissionFollowUp(mi)));
      setWaitingMissions(assigned.filter(mi => !!providerMissionFollowUp(mi)));

      setAvailable(profile?.provider_profile?.available || false);
      const pp = profile?.provider_profile;
      setProviderZone(pp?.location_label || pp?.zone || profile?.city || '');
      // siren lives on users table, not provider_profiles
      setProviderProfileComplete(!!profile?.siren && !!pp?.rc_pro_doc_url);
      setStripeConfigured(!!pp?.stripe_account_id);
      // Today's missions
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setTodayMissions(schedule.filter((s: ScheduleItem) => {
        const d = new Date(s.scheduled_at);
        return d >= today && d < tomorrow;
      }));
      setStats(provStats);
    } catch (e) { setLoadError(true); if (__DEV__) console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void fetchData();
    const timer = setInterval(() => { void fetchData(); }, 30000);
    return () => clearInterval(timer);
  }, [fetchData]));

  useFocusEffect(useCallback(() => {
    navigatingAway.current = false;
  }, []));

  // Only selection notifications trigger this modal. A broader text match used to
  // reopen it for unrelated events such as an accepted quote.
  useFocusEffect(useCallback(() => {
    if (navigatingAway.current || showNotifs || modalClosing || !notifications || notifications.length === 0) return;
    const alert = (notifications as AppNotification[]).find((n: AppNotification) =>
      !n.read &&
      !handledSelectionAlertIds.has(n.notification_id) &&
      (
        n.type === 'emergency_accepted' ||
        n.type === 'bid_accepted' ||
        n.title.includes('Candidature acceptée') ||
        n.body.includes('a choisi votre offre')
      )
    );
    if (alert && !selectedAlert) setSelectedAlert(alert);
  }, [notifications, selectedAlert, handledSelectionAlertIds, showNotifs, modalClosing]));

  const unreadCount = (notifications as AppNotification[]).filter((n: AppNotification) => !n.read).length;

  // iOS must finish dismissing the native dialog before presenting a route.
  // Keep its content mounted throughout dismissal to avoid invisible touch blockers.
  const finishModalClose = useCallback(() => {
    if (!closingRef.current) return;
    const destination = pendingRoute.current;
    pendingRoute.current = null;
    closingRef.current = false;
    setShowNotifs(false);
    setSelectedAlert(null);
    setModalClosing(false);
    if (destination && isFocused) {
      // Do not present the next unread selection during the navigation transition.
      navigatingAway.current = true;
      router.push(destination);
    }
  }, [isFocused, router]);

  const closeDashboardModal = useCallback((destination: Href | null = null) => {
    if (closingRef.current) return;
    closingRef.current = true;
    pendingRoute.current = destination;
    setModalClosing(true);
  }, []);

  // onDismiss is iOS-only; elsewhere the dialog is removed on this commit.
  useEffect(() => {
    if (modalClosing && Platform.OS !== 'ios') finishModalClose();
  }, [modalClosing, finishModalClose]);

  useEffect(() => {
    if (!isFocused && (showNotifs || selectedAlert)) closeDashboardModal();
  }, [isFocused, showNotifs, selectedAlert, closeDashboardModal]);

  const dismissSelection = (openRequest = false) => {
    if (!selectedAlert || closingRef.current) return;
    setHandledSelectionAlertIds(previous => new Set(previous).add(selectedAlert.notification_id));
    markRead.mutate(selectedAlert.notification_id);
    closeDashboardModal(openRequest && selectedAlert.reference_id
      ? selectedAlert.type?.includes('mission') ? `/mission/${selectedAlert.reference_id}` : `/emergency?id=${selectedAlert.reference_id}`
      : null);
  };

  const handleNotifTap = (notif: AppNotification) => {
    if (closingRef.current) return;
    if (!notif.read) markRead.mutate(notif.notification_id);
    let destination: Href | null = null;
    if (notif.reference_id && (notif.type?.includes('emergency') || notif.type === 'bid_accepted')) {
      destination = `/emergency?id=${notif.reference_id}`;
    } else if (notif.reference_id && notif.type?.includes('mission')) {
      destination = `/mission/${notif.reference_id}`;
    }
    closeDashboardModal(destination);
  };

  const handleToggle = async () => {
    if (availabilityLock.current) return;
    availabilityLock.current = true; setAvailabilitySaving(true);
    try { const result = await toggleAvailability(); setAvailable(result.available); }
    catch { Alert.alert(t('common.error'), t('alpine.availabilityError')); }
    finally { availabilityLock.current = false; setAvailabilitySaving(false); }
  };
  const openHub = (view: 'discover' | 'applications' | 'active') => router.push({ pathname: '/(provider)/my-missions', params: { view } });
  const openItem = (item: AvailableItem) => router.push(item.is_emergency ? `/emergency?id=${item.mission_id}` : `/mission/${item.mission_id}`);
  if (loading) return <SafeAreaView style={homeStyles.container}><SkeletonDashboard /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']} testID="provider-dashboard">
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}>
        <AlpineHeader role="provider" location={providerZone} unreadCount={unreadCount}
          onNotifications={() => { if (!selectedAlert && !closingRef.current) { setShowNotifs(true); markAllRead.mutate(); } }}
          footer={<View style={homeStyles.row}><Ionicons name="location-outline" size={16} color={COLORS.paper} /><Text style={[homeStyles.meta, homeStyles.white]}>{providerZone || t('alpine.providerSpace')}</Text></View>}
        />
        <View style={homeStyles.sheet}>
          <View style={styles.availabilityRow}>
            <View style={[styles.availabilityDot, { backgroundColor: available ? COLORS.success : COLORS.textTertiary }]} />
            <Text style={[homeStyles.meta, homeStyles.flex]}>{t(available ? 'alpine.available' : 'alpine.unavailable')}</Text>
            <Switch testID="availability-toggle" accessibilityLabel={t('alpine.available')} value={available} disabled={availabilitySaving} onValueChange={handleToggle} trackColor={{ false: COLORS.borderActive, true: COLORS.success }} thumbColor={COLORS.paper} />
          </View>
          {loadError && <EmptyState compact icon="cloud-offline-outline" title={t('alpine.loadError')} actionLabel={t('alpine.retry')} onAction={fetchData} />}
          <HomeSection title={`${t('alpine.activeMissionsTitle')} · ${myActiveMissions.length}`} icon="construct-outline" tone="ice" actionLabel={t('alpine.seeAll')} onAction={() => openHub('active')}>
            {myActiveMissions.slice(0, 3).map(m => <MissionPreview key={m.mission_id} provider mission={m} onPress={() => openItem(m)} />)}
            {!myActiveMissions.length && <EmptyState compact icon="construct-outline" title={t('alpine.noActiveMissions')} subtitle={t('alpine.noActiveMissionsSub')} />}
          </HomeSection>
          <HomeSection tone="amber" icon="time-outline" title={`${t('alpine.waitingFollowUp')} · ${waitingMissions.length}`} actionLabel={t('alpine.seeAll')} onAction={() => router.push({ pathname: '/(provider)/my-missions', params: { view: 'active', filter: 'waiting' } })}>
            {waitingMissions.slice(0, 3).map(m => <MissionPreview key={m.mission_id} mission={m} provider onPress={() => openItem(m)} />)}
            {!waitingMissions.length && <EmptyState compact icon="checkmark-circle-outline" title={t('alpine.noWaitingMissions')} subtitle={t('alpine.noWaitingMissionsSub')} />}
          </HomeSection>
          <HomeSection title={t('alpine.upcomingWork')} icon="calendar-outline">
          {(applications.length + bidCount) > 0 && <TouchableOpacity style={styles.applicationLink} onPress={() => openHub('applications')}><Ionicons name="paper-plane-outline" size={19} color={COLORS.brandPrimary} /><Text style={[homeStyles.link, homeStyles.flex]}>{t('alpine.applicationCount', { count: applications.length + bidCount })}</Text><Ionicons name="chevron-forward" size={18} color={COLORS.brandPrimary} /></TouchableOpacity>}
          <TouchableOpacity style={styles.applicationLink} onPress={() => router.push('/(provider)/planning')}><Ionicons name="calendar-outline" size={19} color={COLORS.textSecondary} /><Text style={[homeStyles.meta, homeStyles.flex]}>{t('alpine.planning')} · {todayMissions.length} {t('alpine.missions').toLowerCase()}</Text><Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} /></TouchableOpacity>
          </HomeSection>
          <HomeSection tone="mint" icon="compass-outline" title={`${t('alpine.availableMissionsTitle')} · ${availableMissions.length}`} actionLabel={t('alpine.seeAll')} onAction={() => openHub('discover')}>
          {availableMissions.slice(0, 2).map(m => <MissionPreview key={m.mission_id} mission={m} provider onPress={() => openItem(m)} />)}
          {!availableMissions.length && <EmptyState compact icon="compass-outline" title={t('alpine.emptyDiscover')} subtitle={t('alpine.emptyDiscoverSub')} />}
          </HomeSection>
          <HomeSection icon="wallet-outline" title={t('alpine.activity')} actionLabel={t('alpine.seeAll')} onAction={() => router.push('/(provider)/revenue')}>
          <Card onPress={() => router.push('/(provider)/revenue')}>
            <Text style={homeStyles.eyebrow}>{t('alpine.totalEarnings')}</Text><Text style={styles.earnings}>{stats?.total_earnings?.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) || '—'}</Text>
            <View style={[homeStyles.row, { marginTop: SPACING.md }]}><Ionicons name="checkmark-circle-outline" color={COLORS.success} size={18} /><Text style={[homeStyles.meta, homeStyles.flex]}>{stats?.completed_missions ?? 0} {t('alpine.completed').toLowerCase()}</Text>{!!stats?.rating && <Text style={homeStyles.meta}>★ {stats.rating.toFixed(1)}</Text>}</View>
          </Card>
          </HomeSection>
          {(!providerProfileComplete || !stripeConfigured) && <Button label={t('alpine.completeProfile')} variant="outline" icon="person-outline" onPress={() => router.push('/(provider)/profile')} />}
        </View>
      </ScrollView>

      {/* A single native dialog prevents overlapping presentations. */}
      <Modal
        visible={(showNotifs || !!selectedAlert) && !modalClosing}
        animationType="fade"
        transparent
        onDismiss={finishModalClose}
        onRequestClose={() => selectedAlert ? dismissSelection() : closeDashboardModal()}
      >
      {showNotifs ? (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('provider.dashboard.notifications')}</Text>
              <TouchableOpacity onPress={() => closeDashboardModal()}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <View style={styles.emptyNotifs}>
                  <Ionicons name="notifications-off-outline" size={40} color={COLORS.textTertiary} />
                  <Text style={styles.emptyText}>{t('provider.dashboard.no_notifications')}</Text>
                </View>
              ) : (
                notifications.map((n) => (
                  <TouchableOpacity
                    key={n.notification_id}
                    testID={`notif-${n.notification_id}`}
                    style={[styles.notifItem, !n.read && styles.notifItemUnread]}
                    onPress={() => handleNotifTap(n)}
                  >
                    <View style={[styles.notifIcon, {
                      backgroundColor: n.type?.includes('emergency') ? COLORS.urgencySoft : COLORS.infoSoft
                    }]}>
                      <Ionicons
                        name={n.type?.includes('emergency') ? 'warning-outline' : 'briefcase-outline'}
                        size={18}
                        color={n.type?.includes('emergency') ? COLORS.urgency : COLORS.info}
                      />
                    </View>
                    <View style={styles.notifContent}>
                      <Text style={styles.notifTitle}>{n.title}</Text>
                      <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                      <Text style={styles.notifTime}>
                        {n.created_at ? new Date(n.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </Text>
                    </View>
                    {!n.read && <View style={styles.unreadDot} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      ) : selectedAlert ? (
        <View style={styles.selectedAlertOverlay}>
          <View style={styles.selectedAlertCard}>
            <View style={styles.selectedAlertIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
            </View>
            <Text style={styles.selectedAlertTitle}>Vous avez été choisi !</Text>
            <Text style={styles.selectedAlertSubtext}>Un propriétaire vous a sélectionné pour une intervention.</Text>
            <TouchableOpacity
              style={styles.selectedAlertPrimaryBtn}
              onPress={() => dismissSelection(true)}
            >
              <Ionicons name="arrow-forward-outline" size={18} color="#FFFFFF" />
              <Text style={styles.selectedAlertPrimaryText}>Voir la demande</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectedAlertSecondaryBtn}
              onPress={() => dismissSelection()}
            >
              <Text style={styles.selectedAlertSecondaryText}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  availabilityRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  availabilityDot: { width: 7, height: 7, borderRadius: RADIUS.full },
  applicationLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  earnings: { ...FONTS.h1, fontSize: 32, color: COLORS.textPrimary },
  container: { flex: 1, backgroundColor: MARKETPLACE.canvas },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 29, 46, 0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.paper, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACING.xl, maxHeight: '85%', ...SHADOWS.float },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  emptyNotifs: { alignItems: 'center', paddingVertical: SPACING.xxxl },
  emptyText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: '#64748B', marginTop: SPACING.sm },
  notifItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: RADIUS.xl, marginBottom: SPACING.sm, backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: 'transparent' },
  notifItemUnread: { backgroundColor: COLORS.infoSoft, borderColor: COLORS.info + '30' },
  notifIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  notifContent: { flex: 1 },
  notifTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 },
  notifBody: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 4, fontSize: 13, lineHeight: 18 },
  notifTime: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: 8, fontSize: 10 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.urgency, marginLeft: SPACING.sm },
  selectedAlertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  selectedAlertCard: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', width: '100%', maxWidth: 340, ...SHADOWS.card },
  selectedAlertIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  selectedAlertTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#1B3A4B', textAlign: 'center', marginBottom: SPACING.sm },
  selectedAlertSubtext: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: SPACING.xl },
  selectedAlertPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.navy, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999, width: '100%', marginBottom: SPACING.md },
  selectedAlertPrimaryText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#FFFFFF' },
  selectedAlertSecondaryBtn: { paddingVertical: 10 },
  selectedAlertSecondaryText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: '#94A3B8' },
});
