import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert, Switch, Image, TextInput, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_LABELS, GRADIENT } from '../../src/theme';
import { getMissionTypeLabel, getServiceTypeLabel } from '../../src/utils/serviceLabels';
import { useAuth } from '../../src/auth';
import { getMissions, getEmergencies, toggleAvailability, getProfile, applyToMission, getMyApplications, getProviderSchedule, getProviderStats, cancelEmergencyBid } from '../../src/api';
import { supabase } from '../../src/lib/supabase';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../src/hooks/useNotifications';
import type { MergedMission, EmergencyRequest, ProviderStats, ScheduleItem, AppNotification } from '../../src/types/api';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

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
  const { t } = useTranslation();
  const { user } = useAuth();
  const [availableMissions, setAvailableMissions] = useState<AvailableItem[]>([]);
  const [applications, setApplications] = useState<EnrichedApplication[]>([]);
  const [myActiveMissions, setMyActiveMissions] = useState<AvailableItem[]>([]);
  const [todayMissions, setTodayMissions] = useState<ScheduleItem[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const markAllRead = useMarkAllNotificationsRead();
  const [stats, setStats] = useState<ProviderStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [myBidEmergencyIds, setMyBidEmergencyIds] = useState<Set<string>>(new Set());
  const [providerProfileComplete, setProviderProfileComplete] = useState(true);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<AppNotification | null>(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();

  const fetchData = async () => {
    try {
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
        setMyBidEmergencyIds(bidSet);
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
        !cancelledBidIds.has(em.id)
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
      // Only take regular missions from getMissions (exclude emergencies already merged in by getMissions to avoid duplicates)
      const activeStatuses = ['assigned', 'in_progress', 'on_site', 'quote_submitted', 'quote_accepted'];
      const myMissions = m.filter((mi: MergedMission) =>
        !mi.is_emergency && mi.assigned_provider_id === user?.id && activeStatuses.includes(mi.status)
      );
      const myEmergencies = e.filter((em) =>
        em.accepted_provider_id === user?.id &&
        !['bids_open', 'completed'].includes(em.status)
      ).map((em) => ({
        ...(em as unknown as EmergencyRequest),
        mission_id: em.id,
        is_emergency: true as const,
        mission_type: em.service_type,
      } as EnrichedEmergency));
      setMyActiveMissions([...myMissions, ...myEmergencies].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));

      setAvailable(profile?.provider_profile?.available || false);
      const pp = profile?.provider_profile;
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
    } catch (e) { if (__DEV__) console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  // Detect unread "selected for emergency" notification and show congratulation modal
  useFocusEffect(useCallback(() => {
    if (!notifications || notifications.length === 0) return;
    const alert = (notifications as AppNotification[]).find((n: AppNotification) =>
      !n.read &&
      !dismissedAlertIds.has(n.notification_id) &&
      (
        n.type === 'emergency_accepted' ||
        n.type === 'bid_accepted' ||
        (n.body && (n.body.includes('choisi') || n.body.includes('accepté') || n.body.includes('sélectionné')))
      )
    );
    if (alert && !selectedAlert) setSelectedAlert(alert);
  }, [notifications, dismissedAlertIds]));

  const unreadCount = (notifications as AppNotification[]).filter((n: AppNotification) => !n.read).length;

  const handleNotifTap = async (notif: AppNotification) => {
    if (!notif.read) {
      markRead.mutate(notif.notification_id);
    }
    setShowNotifs(false);
    if (notif.type === 'emergency' || notif.type === 'emergency_accepted') {
      router.push(`/emergency?id=${notif.reference_id}`);
    } else if (notif.type === 'mission' || notif.type === 'mission_assigned') {
      router.push(`/mission/${notif.reference_id}`);
    }
  };

  const handleToggle = async () => {
    try {
      const result = await toggleAvailability();
      setAvailable(result.available);
    } catch (err) { Alert.alert(t('common.error'), err instanceof Error ? err.message : String(err)); }
  };

  const handleApply = async (missionId: string, rate?: number) => {
    if (!providerProfileComplete) {
      Alert.alert('Profil incomplet', 'Complétez votre SIRET et assurance RC Pro avant de postuler.', [
        { text: 'Compléter', onPress: () => router.push('/(provider)/profile') },
        { text: 'Plus tard', style: 'cancel' },
      ]);
      return;
    }
    try {
      await applyToMission(missionId, { proposed_rate: rate, message: 'Disponible pour cette mission' });
      Alert.alert(
        'Candidature envoyée !',
        'Le propriétaire va examiner votre profil. Vous serez notifié dès qu\'il aura fait son choix.',
      );
      fetchData();
    } catch (err) { Alert.alert(t('common.error'), err instanceof Error ? err.message : String(err)); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  // Search filtering
  const lowerQuery = searchQuery.toLowerCase();

  const filterByQuery = (item: AvailableItem | EnrichedApplication) => {
    if (!searchQuery) return true;
    const missionType = 'mission_type' in item ? item.mission_type : undefined;
    const serviceType = 'service_type' in item ? item.service_type : undefined;
    return (
      item.property_name?.toLowerCase().includes(lowerQuery) ||
      item.property_address?.toLowerCase().includes(lowerQuery) ||
      getMissionTypeLabel(missionType ?? '').toLowerCase().includes(lowerQuery) ||
      item.description?.toLowerCase().includes(lowerQuery) ||
      serviceType?.toLowerCase().includes(lowerQuery)
    );
  };

  const filteredAvailable = availableMissions.filter(filterByQuery);

  const filteredApplications = applications.filter(filterByQuery);

  const filteredActiveMissions = myActiveMissions.filter(filterByQuery);

  const kpiStats = [
    { label: t('provider.dashboard.stat_missions'), value: stats?.completed_missions ?? 0, icon: 'checkmark-circle-outline', color: '#10B981', bg: '#D1FAE5' },
    { label: t('provider.dashboard.stat_revenue'), value: stats?.total_earnings ? `${Math.round(stats.total_earnings)}€` : '—', icon: 'cash-outline', color: '#3B82F6', bg: '#EFF6FF' },
    { label: t('provider.dashboard.stat_rating'), value: stats?.rating ? `${stats.rating}/5` : '—', icon: 'star-outline', color: '#F59E0B', bg: '#FEF9C3' },
  ];

  return (
    <SafeAreaView style={styles.container} testID="provider-dashboard">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Image
              source={{ uri: `https://ui-avatars.com/api/?name=${user?.name || 'Provider'}&background=1E3A5F&color=fff&size=150&font-size=0.4&rounded=true` }}
              style={styles.headerAvatar}
            />
            <View>
              <Text style={styles.greeting}>{t('provider.dashboard.good_morning')}</Text>
              <Text style={styles.userName}>{user?.name?.split(' ')[0]}</Text>
            </View>
          </View>
          <TouchableOpacity testID="notifications-btn" onPress={() => { setShowNotifs(true); markAllRead.mutate(); }} style={styles.notifBtn}>
            <Ionicons name="notifications-outline" size={24} color="#1E3A5F" />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
            <TextInput
              placeholder={t('provider.dashboard.search_placeholder')}
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity style={styles.filterBtn}>
            <Ionicons name="options-outline" size={22} color="#1E3A5F" />
          </TouchableOpacity>
        </View>

        {/* Stripe Configuration Alert */}
        {myActiveMissions.length > 0 && !stripeConfigured && (
          <View style={styles.stripeAlert}>
            <View style={styles.stripeAlertContent}>
              <Ionicons name="warning-outline" size={20} color="#EA580C" />
              <Text style={styles.stripeAlertText}>Configurez vos paiements pour recevoir vos revenus</Text>
            </View>
            <TouchableOpacity style={styles.stripeAlertBtn} onPress={() => router.push('/(provider)/profile')}>
              <Text style={styles.stripeAlertBtnText}>Configurer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Motivation Banner */}
        <View style={styles.promoBanner}>
          <LinearGradient
            colors={['#D1FAE5', '#A7F3D0']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.promoGradient}
          >
            <View style={styles.promoContent}>
              <View style={styles.promoBadge}>
                <Text style={styles.promoBadgeText}>{t('provider.dashboard.performance')}</Text>
              </View>
              <Text style={styles.promoTitle}>{t('provider.dashboard.performance_desc')}</Text>
              <TouchableOpacity style={styles.promoButton} onPress={() => router.push('/(provider)/revenue')}>
                <Ionicons name="trending-up-outline" size={16} color="#FFFFFF" />
                <Text style={styles.promoButtonText}>{t('provider.dashboard.performance_cta')}</Text>
              </TouchableOpacity>
            </View>
            <Image
              source={{ uri: 'https://cdn3d.iconscout.com/3d/premium/thumb/construction-worker-6804616-5601984.png' }}
              style={styles.promoImage}
            />
          </LinearGradient>
        </View>

        {/* KPI Stats Row */}
        <View style={styles.statsRow}>
          {kpiStats.map((k, i) => (
            <View key={i} style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: k.bg }]}>
                <Ionicons name={k.icon as IoniconsName} size={20} color={k.color} />
              </View>
              <Text style={styles.statValue}>{k.value}</Text>
              <Text style={styles.statLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Availability Toggle */}
        <View style={[styles.availCard, { backgroundColor: available ? '#F0FDF4' : '#FEF2F2', borderColor: available ? '#86EFAC' : '#FECACA' }]}>
          <View style={styles.availLeft}>
            <View style={[styles.statusDot, { backgroundColor: available ? '#10B981' : '#EF4444' }]} />
            <View>
              <Text style={styles.availTitle}>{available ? 'Vous êtes visible' : 'Vous êtes invisible'}</Text>
              <Text style={styles.availSubtext}>{available ? 'Les propriétaires peuvent vous envoyer des missions' : 'Vous ne recevrez aucune nouvelle demande'}</Text>
            </View>
          </View>
          <Switch
            testID="availability-toggle"
            value={available}
            onValueChange={handleToggle}
            trackColor={{ false: '#E2E8F0', true: '#86EFAC' }}
            thumbColor={available ? '#10B981' : '#94A3B8'}
          />
        </View>

        {/* Planning du jour — bouton toujours visible */}
        <TouchableOpacity
          style={styles.planningDayBtn}
          onPress={() => router.push('/(provider)/planning')}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="calendar-outline" size={22} color={COLORS.brandPrimary} />
            <Text style={styles.planningDayText}>Voir le planning du jour</Text>
            {todayMissions.length > 0 && (
              <View style={styles.planningDayBadge}>
                <Text style={styles.planningDayBadgeText}>{todayMissions.length}</Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* Section 1: Missions disponibles (regular + open emergencies merged) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>{t('provider.dashboard.available_missions')}</Text>
              {filteredAvailable.length > 0 && (
                <View style={[styles.countBadge, { backgroundColor: '#FBBF24' }]}>
                  <Text style={styles.countBadgeText}>{filteredAvailable.length}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={() => router.push('/(provider)/my-missions')}>
              <Text style={styles.seeAll}>{t('provider.dashboard.see_all')}</Text>
            </TouchableOpacity>
          </View>

          {filteredAvailable.length === 0 ? (
            <View style={styles.emptyCardStrict}>
              <Ionicons name="briefcase-outline" size={32} color="#94A3B8" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTextStrict}>Pas de mission disponible pour l'instant</Text>
              <Text style={styles.emptySubtextStrict}>
                {!available
                  ? 'Activez votre disponibilité pour recevoir des missions'
                  : 'Les nouvelles missions apparaîtront ici dès qu\'un propriétaire en crée une dans votre zone. Les missions ménage sont plus fréquentes le week-end.'}
              </Text>
              {!available && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99 }}
                  onPress={handleToggle}
                >
                  <Ionicons name="radio-button-on" size={16} color="#FFFFFF" />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FFFFFF', fontSize: 13 }}>Me rendre disponible</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredAvailable.slice(0, 5).map((m) => (
              <TouchableOpacity
                key={m.mission_id || m.id}
                style={styles.cardStrict}
                activeOpacity={0.7}
                onPress={() => {
                  if (m.is_emergency) {
                    router.push(`/emergency?id=${m.id}`);
                  } else {
                    router.push(`/mission/${m.mission_id}`);
                  }
                }}
              >
                <View style={styles.cardStrictTop}>
                  {m.is_emergency ? (
                    <View style={[styles.pillStrict, { backgroundColor: COLORS.urgencySoft }]}>
                      <Text style={[styles.pillStrictText, { color: COLORS.urgency }]}>URGENCE</Text>
                    </View>
                  ) : (
                    <View style={[styles.pillStrict, { backgroundColor: '#FEF9C3' }]}>
                      <Text style={[styles.pillStrictText, { color: '#CA8A04' }]}>
                        {getMissionTypeLabel(m.mission_type || '').toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.cardStrictCategory}>
                    {m.is_emergency
                      ? getServiceTypeLabel(m.service_type ?? '').toUpperCase()
                      : m.mode === 'fixed' ? t('provider.dashboard.fixed_badge') : t('provider.dashboard.quote_badge')}
                  </Text>
                </View>
                <Text style={styles.cardStrictTitle}>{m.property_name || t('provider.dashboard.no_property')}</Text>
                {m.property_address ? <Text style={styles.providerTextStrict}>{m.property_address}</Text> : null}
                {m.description && <Text style={[styles.providerTextStrict, { marginTop: 4 }]} numberOfLines={2}>{m.description}</Text>}

                <View style={styles.actionRowStrict}>
                  <Text style={[styles.actionTextStrict, { color: '#64748B' }]}>
                    {m.is_emergency
                      ? (m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString('fr-FR') : 'Dès que possible')
                      : m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString('fr-FR') : t('provider.dashboard.no_date')}
                  </Text>
                  {m.fixed_rate ? (
                    <Text style={[styles.actionTextStrict, { color: '#16A34A', fontWeight: 'bold' }]}>{m.fixed_rate}€</Text>
                  ) : null}
                </View>

                {m.is_emergency ? (
                  myBidEmergencyIds.has(m.id) ? (
                    <View>
                      <View style={[styles.applyBtnStrict, { backgroundColor: '#FFF7ED' }]}>
                        <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                        <Text style={[styles.applyTextStrict, { color: COLORS.warning }]}>Candidature en cours</Text>
                      </View>
                      <TouchableOpacity
                        style={{ alignItems: 'center', marginTop: 6 }}
                        onPress={async () => {
                          try {
                            await cancelEmergencyBid(m.id);
                            fetchData();
                          } catch (e) {
                            Alert.alert('Erreur', (e as Error).message);
                          }
                        }}
                      >
                        <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Annuler ma candidature</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.applyBtnStrict, { backgroundColor: COLORS.urgency }]}
                      onPress={() => {
                        if (!providerProfileComplete) {
                          Alert.alert('Profil incomplet', 'Complétez votre SIRET et assurance RC Pro avant de répondre aux urgences.', [
                            { text: 'Compléter', onPress: () => router.push('/(provider)/profile') },
                            { text: 'Plus tard', style: 'cancel' },
                          ]);
                          return;
                        }
                        router.push(`/emergency?id=${m.id}`);
                      }}
                    >
                      <Ionicons name="warning-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.applyTextStrict}>{t('provider.dashboard.respond_emergency')}</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <TouchableOpacity
                    testID={`apply-mission-${m.mission_id}`}
                    style={styles.applyBtnStrict}
                    onPress={() => handleApply(m.mission_id, m.fixed_rate)}
                  >
                    <Ionicons name="paper-plane-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.applyTextStrict}>{t('provider.dashboard.apply')}</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Section 2: Candidatures en attente */}
        {filteredApplications.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>Mes candidatures</Text>
                <View style={[styles.countBadge, { backgroundColor: COLORS.warning }]}>
                  <Text style={styles.countBadgeText}>{filteredApplications.length}</Text>
                </View>
              </View>
            </View>
            {filteredApplications.map((app: EnrichedApplication) => (
              <TouchableOpacity
                key={app.id}
                style={styles.cardStrict}
                onPress={() => app.mission_id ? router.push(`/mission/${app.mission_id}`) : null}
              >
                <View style={styles.cardStrictTop}>
                  <View style={[styles.pillStrict, { backgroundColor: app.status === 'accepted' ? '#DCFCE7' : app.status === 'rejected' ? '#FEE2E2' : COLORS.warningSoft }]}>
                    <Text style={[styles.pillStrictText, { color: app.status === 'accepted' ? '#16A34A' : app.status === 'rejected' ? '#DC2626' : COLORS.warning }]}>
                      {app.status === 'accepted' ? 'ACCEPTÉE' : app.status === 'rejected' ? 'REFUSÉE' : 'EN ATTENTE'}
                    </Text>
                  </View>
                  <Text style={styles.cardStrictCategory}>
                    {getMissionTypeLabel(app.mission_type ?? '').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.cardStrictTitle}>{app.property_name || t('provider.dashboard.no_property')}</Text>
                {app.property_address ? <Text style={styles.providerTextStrict}>{app.property_address}</Text> : null}
                {app.description && <Text style={[styles.providerTextStrict, { marginTop: 4 }]} numberOfLines={2}>{app.description}</Text>}
                <View style={styles.actionRowStrict}>
                  <Text style={[styles.actionTextStrict, { color: '#64748B' }]}>
                    {app.scheduled_date ? new Date(app.scheduled_date).toLocaleDateString('fr-FR') : t('provider.dashboard.no_date')}
                  </Text>
                  {app.fixed_rate ? (
                    <Text style={[styles.actionTextStrict, { color: '#16A34A', fontWeight: 'bold' }]}>{app.fixed_rate}€</Text>
                  ) : null}
                </View>
                {app.status === 'accepted' ? (
                  <View style={[styles.pendingResponseStrict]}>
                    <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                    <Text style={[styles.pendingResponseText, { color: '#16A34A' }]}>Candidature acceptée — mission à venir</Text>
                  </View>
                ) : app.status === 'rejected' ? (
                  <View style={[styles.pendingResponseStrict]}>
                    <Ionicons name="close-circle" size={14} color="#DC2626" />
                    <Text style={[styles.pendingResponseText, { color: '#DC2626' }]}>Le propriétaire a choisi un autre prestataire</Text>
                  </View>
                ) : (
                  <View style={[styles.pendingResponseStrict]}>
                    <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                    <Text style={styles.pendingResponseText}>En attente de réponse du propriétaire</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Section 3: Mes missions en cours */}
        {filteredActiveMissions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>Mes missions en cours</Text>
                <View style={[styles.countBadge, { backgroundColor: COLORS.brandPrimary }]}>
                  <Text style={styles.countBadgeText}>{filteredActiveMissions.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => router.push('/(provider)/my-missions')}>
                <Text style={styles.seeAll}>{t('provider.dashboard.see_all')}</Text>
              </TouchableOpacity>
            </View>
            {filteredActiveMissions.map((m: AvailableItem) => {
              const statusLabel = STATUS_LABELS[m.status] || STATUS_LABELS[m.raw_status ?? ''] || m.status;
              return (
                <TouchableOpacity
                  key={m.mission_id || m.id}
                  style={styles.cardStrict}
                  onPress={() => m.is_emergency ? router.push(`/emergency?id=${m.id}`) : router.push(`/mission/${m.mission_id}`)}
                >
                  <View style={styles.cardStrictTop}>
                    {m.is_emergency ? (
                      <View style={[styles.pillStrict, { backgroundColor: COLORS.urgencySoft }]}>
                        <Text style={[styles.pillStrictText, { color: COLORS.urgency }]}>URGENCE</Text>
                      </View>
                    ) : (
                      <View style={[styles.pillStrict, { backgroundColor: COLORS.infoSoft }]}>
                        <Text style={[styles.pillStrictText, { color: COLORS.info }]}>
                          {getMissionTypeLabel(m.mission_type || '').toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.cardStrictCategory}>
                      {m.is_emergency
                        ? getServiceTypeLabel(m.service_type ?? '').toUpperCase()
                        : getMissionTypeLabel(m.mission_type || '').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.cardStrictTitle}>{m.property_name || t('provider.dashboard.no_property')}</Text>
                  {m.property_address ? <Text style={styles.providerTextStrict}>{m.property_address}</Text> : null}
                  <View style={[styles.pillStrict, { backgroundColor: COLORS.infoSoft, alignSelf: 'flex-start', marginTop: SPACING.md }]}>
                    <Text style={[styles.pillStrictText, { color: COLORS.info }]}>{statusLabel}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Global empty state when nothing at all */}
        {filteredAvailable.length === 0 && filteredApplications.length === 0 && filteredActiveMissions.length === 0 && (
          <View style={[styles.section, { alignItems: 'center', paddingVertical: SPACING.xxl }]}>
            <Ionicons name="rocket-outline" size={48} color={COLORS.brandPrimary} style={{ marginBottom: SPACING.md }} />
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F', textAlign: 'center' }}>
              Votre espace est prêt !
            </Text>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20, paddingHorizontal: SPACING.xl }}>
              Dès qu'un propriétaire publiera une mission dans votre zone, elle apparaîtra ici. En attendant, vérifiez que votre profil et votre zone sont bien configurés.
            </Text>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.lg, backgroundColor: COLORS.brandPrimary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 99 }}
              onPress={() => router.push('/(provider)/profile')}
            >
              <Ionicons name="person-outline" size={16} color="#FFFFFF" />
              <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FFFFFF', fontSize: 13 }}>Voir mon profil</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('provider.dashboard.quick_actions')}</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/(provider)/my-missions')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="clipboard-outline" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.quickActionText}>{t('provider.dashboard.action_missions')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/(provider)/planning')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="calendar-outline" size={24} color="#10B981" />
              </View>
              <Text style={styles.quickActionText}>{t('provider.dashboard.action_schedule')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/(provider)/revenue')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#FEF9C3' }]}>
                <Ionicons name="cash-outline" size={24} color="#CA8A04" />
              </View>
              <Text style={styles.quickActionText}>{t('provider.dashboard.action_revenue')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Notifications Modal */}
      {showNotifs && <Modal visible={true} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('provider.dashboard.notifications')}</Text>
              <TouchableOpacity onPress={() => setShowNotifs(false)}>
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
      </Modal>}

      {/* Selected for Emergency — Congratulation Modal */}
      {selectedAlert && <Modal visible={true} transparent animationType="fade">
        <View style={styles.selectedAlertOverlay}>
          <View style={styles.selectedAlertCard}>
            <View style={styles.selectedAlertIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
            </View>
            <Text style={styles.selectedAlertTitle}>Vous avez été choisi !</Text>
            <Text style={styles.selectedAlertSubtext}>Un propriétaire vous a sélectionné pour une intervention.</Text>
            <TouchableOpacity
              style={styles.selectedAlertPrimaryBtn}
              onPress={() => {
                if (selectedAlert?.reference_id) {
                  markRead.mutate(selectedAlert.notification_id);
                  router.push(`/emergency?id=${selectedAlert.reference_id}`);
                }
                setSelectedAlert(null);
              }}
            >
              <Ionicons name="arrow-forward-outline" size={18} color="#FFFFFF" />
              <Text style={styles.selectedAlertPrimaryText}>Voir la demande</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectedAlertSecondaryBtn}
              onPress={() => {
                if (selectedAlert) {
                  setDismissedAlertIds(prev => new Set(prev).add(selectedAlert.notification_id));
                }
                setSelectedAlert(null);
              }}
            >
              <Text style={styles.selectedAlertSecondaryText}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    backgroundColor: '#FFFFFF',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  headerAvatar: { width: 44, height: 44, borderRadius: 22 },
  greeting: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B' },
  userName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F', marginTop: -2 },
  notifBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  notifBadge: { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  notifBadgeText: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FFFFFF', fontSize: 9 },

  stripeAlert: { marginHorizontal: SPACING.xl, marginBottom: SPACING.md, backgroundColor: '#FFF7ED', borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: '#FDBA74' },
  stripeAlertContent: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  stripeAlertText: { flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#EA580C' },
  stripeAlertBtn: { backgroundColor: '#EA580C', borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  stripeAlertBtnText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#FFFFFF' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl, gap: SPACING.sm },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: SPACING.md, height: 44 },
  searchIcon: { marginRight: SPACING.sm },
  searchInput: { flex: 1, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#1E3A5F' },
  filterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },

  promoBanner: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  promoGradient: { padding: SPACING.lg, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  promoContent: { flex: 1, zIndex: 1 },
  promoBadge: { backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  promoBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: '#059669' },
  promoTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#065F46', marginBottom: SPACING.md, paddingRight: SPACING.sm },
  promoButton: { backgroundColor: '#F97316', flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, alignSelf: 'flex-start', gap: 6 },
  promoButtonText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#FFFFFF' },
  promoImage: { width: 90, height: 90, position: 'absolute', right: -10, bottom: -10, zIndex: 0 },

  statsRow: { flexDirection: 'row', paddingHorizontal: SPACING.xl, gap: SPACING.md, marginBottom: SPACING.xl },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', padding: SPACING.md, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' },
  statIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  statValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#1E3A5F' },
  statLabel: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: '#64748B', textAlign: 'center', marginTop: 2 },

  availCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.xl, padding: SPACING.lg, borderRadius: 16, borderWidth: 1, marginBottom: SPACING.md, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  planningDayBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.xl, marginBottom: SPACING.xl, padding: SPACING.lg, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  planningDayText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.brandPrimary },
  planningDayBadge: { backgroundColor: COLORS.brandPrimary, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  planningDayBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: '#FFFFFF' },
  availLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  availTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#1E3A5F' },
  availSubtext: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#64748B', marginTop: 2 },

  section: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xxl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F' },
  seeAll: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#3B82F6' },

  countBadge: { marginLeft: SPACING.sm, backgroundColor: '#EF4444', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, height: 18, justifyContent: 'center', alignItems: 'center' },
  countBadgeText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10, color: '#FFFFFF' },

  cardStrict: { backgroundColor: '#FFFFFF', padding: SPACING.lg, borderRadius: 16, marginBottom: SPACING.md, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' },
  cardStrictTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  pillStrict: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  pillStrictText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11 },
  cardStrictCategory: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10, color: '#94A3B8', letterSpacing: 0.5 },
  cardStrictTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#1E3A5F', marginBottom: 2 },
  providerTextStrict: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B' },
  actionRowStrict: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.sm, paddingTop: SPACING.sm },
  actionTextStrict: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: '#3B82F6' },

  emptyCardStrict: { backgroundColor: '#F8FAFC', padding: SPACING.xl, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  emptyTextStrict: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#1E3A5F', marginBottom: 4 },
  emptySubtextStrict: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B', textAlign: 'center' },

  applyBtnStrict: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#3B82F6', paddingVertical: 12, borderRadius: 12, marginTop: SPACING.md },
  applyTextStrict: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FFFFFF', fontSize: 14 },

  pendingResponseStrict: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  pendingResponseText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: COLORS.warning },

  quickActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.xs },
  quickAction: { flex: 1, backgroundColor: '#FFFFFF', padding: SPACING.md, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' },
  quickActionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  quickActionText: { fontFamily: 'PlusJakartaSans_500Medium', color: '#1E3A5F', textAlign: 'center', fontSize: 12 },

  // Notifications modal
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

  // Selected for Emergency — Congratulation Modal
  selectedAlertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  selectedAlertCard: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', width: '100%', maxWidth: 340, ...SHADOWS.card },
  selectedAlertIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  selectedAlertTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#1B3A4B', textAlign: 'center', marginBottom: SPACING.sm },
  selectedAlertSubtext: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: SPACING.xl },
  selectedAlertPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#48A9A6', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999, width: '100%', marginBottom: SPACING.md },
  selectedAlertPrimaryText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#FFFFFF' },
  selectedAlertSecondaryBtn: { paddingVertical: 10 },
  selectedAlertSecondaryText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: '#94A3B8' },
});
