import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Modal, Image, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, EMERGENCY_STATUS_LABELS as THEME_EMERGENCY_LABELS, GRADIENT } from '../../src/theme';
import { getServiceTypeLabel } from '../../src/utils/serviceLabels';
import { SkeletonDashboard } from '../../src/components/Skeleton';
import { useAuth } from '../../src/auth';
import { useOwnerDashboard, useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../src/hooks';
import { useEmergencies } from '../../src/hooks/useEmergencies';
import { useProviders } from '../../src/hooks/useProfile';
import UpcomingReservations from '../../src/components/owner/UpcomingReservations';
import type { OwnerDashboardData, EmergencyRequest, AppNotification, ProviderProfile, MergedMission } from '../../src/types/api';

// Dashboard-specific labels with owner-centric wording (extends theme labels)
const EMERGENCY_STATUS_LABELS: Record<string, string> = {
  ...THEME_EMERGENCY_LABELS,
  bids_open: 'On cherche un prestataire',
  bid_accepted: 'Confirmez le déplacement',
  provider_accepted: 'Il arrive bientôt',
  displacement_paid: 'Il arrive bientôt',
  on_site: 'Il est sur place',
  quote_sent: 'Devis reçu — à valider',
  quote_submitted: 'Devis reçu — à valider',
  quote_accepted: 'Travaux en cours',
  quote_paid: 'Travaux en cours',
  in_progress: 'Travaux en cours',
  quote_refused: 'Devis refusé',
  completed: 'Réparation terminée',
  cancelled: 'Urgence annulée',
};

export default function OwnerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [showNotifs, setShowNotifs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, isRefetching: dashRefetching, refetch: refetchDashboard } = useOwnerDashboard();
  const { data: emergencies = [], isRefetching: emgRefetching, refetch: refetchEmergencies } = useEmergencies();
  const { data: notifications = [], refetch: refetchNotifs } = useNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const { data: providers = [] } = useProviders();
  const markRead = useMarkNotificationRead();

  const refreshing = dashRefetching || emgRefetching;
  const onRefresh = useCallback(() => { refetchDashboard(); refetchEmergencies(); refetchNotifs(); }, [refetchDashboard, refetchEmergencies, refetchNotifs]);

  useFocusEffect(useCallback(() => { onRefresh(); }, [onRefresh]));

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
    } else if (notif.type === 'new_reservation' || notif.type === 'new_reservations') {
      // No dedicated reservation screen — modal closes, user stays on dashboard
    }
  };

  if (isLoading) {
    return <SafeAreaView style={styles.container}><SkeletonDashboard /></SafeAreaView>;
  }

  const missions = (data?.upcoming_missions || []) as MergedMission[];
  const awaitingPayment = missions.filter(m => m.status === 'awaiting_payment');
  const upcomingNonCompleted = missions.filter(m => !['awaiting_payment', 'completed', 'cancelled', 'refunded'].includes(m.status));

  const activeEmergencies = (emergencies as EmergencyRequest[]).filter(e => e.status !== 'completed' && e.status !== 'cancelled');

  // Filtering based on search query
  const lowerQuery = searchQuery.toLowerCase();

  const filteredEmergencies = activeEmergencies.filter(e => {
    if (!searchQuery) return true;
    return (
      e.property_name?.toLowerCase().includes(lowerQuery) ||
      e.provider_name?.toLowerCase().includes(lowerQuery) ||
      getServiceTypeLabel(e.service_type)?.toLowerCase().includes(lowerQuery) ||
      (EMERGENCY_STATUS_LABELS[e.status] || e.status)?.toLowerCase().includes(lowerQuery)
    );
  });

  return (
    <SafeAreaView style={styles.container} testID="owner-dashboard">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header (Clean White) */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Image
              source={{ uri: `https://ui-avatars.com/api/?name=${user?.name || 'Owner'}&background=1E3A5F&color=fff&size=150&font-size=0.4&rounded=true` }}
              style={styles.headerAvatar}
            />
            <View>
              <Text style={styles.greeting}>{t('owner.dashboard.good_morning')}</Text>
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
              placeholder={t('owner.dashboard.search_placeholder')}
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


        {/* Active Emergencies */}
        {filteredEmergencies.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>{t('owner.dashboard.emergencies')}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{filteredEmergencies.length}</Text>
                </View>
              </View>
            </View>
            {filteredEmergencies.map((e) => {
              const needsAction = e.status === 'bids_open' || e.status === 'quote_submitted' || e.status === 'quote_sent' || e.status === 'bid_accepted' || e.status === 'provider_accepted';
              const isTechOnWay = e.status === 'displacement_paid';
              const isTechOnSite = e.status === 'on_site' || e.status === 'quote_accepted' || e.status === 'in_progress';

              const hasBids = e.status === 'bids_open' && (e.bids ?? []).length > 0;

              let pillBg = '#F1F5F9';
              let pillText = '#64748B';
              if (isTechOnWay) { pillBg = '#E0F2FE'; pillText = '#0284C7'; }
              else if (isTechOnSite) { pillBg = '#DCFCE7'; pillText = '#16A34A'; }
              else if (hasBids) { pillBg = '#FEF9C3'; pillText = '#A16207'; }
              else if (needsAction) { pillBg = '#FEF2F2'; pillText = '#EF4444'; }

              return (
                <TouchableOpacity
                  key={e.id}
                  testID={`emergency-card-${e.id}`}
                  style={styles.cardStrict}
                  onPress={() => router.push(`/emergency?id=${e.id}`)}
                >
                  <View style={styles.cardStrictTop}>
                    <View style={[styles.pillStrict, { backgroundColor: pillBg }]}>
                      <Text style={[styles.pillStrictText, { color: pillText }]}>
                        {hasBids
                          ? `${(e.bids ?? []).length} offre${(e.bids ?? []).length > 1 ? 's' : ''} reçue${(e.bids ?? []).length > 1 ? 's' : ''}`
                          : (EMERGENCY_STATUS_LABELS[e.status] || e.status)}
                      </Text>
                    </View>
                    <Text style={styles.cardStrictCategory}>{getServiceTypeLabel(e.service_type).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.cardStrictTitle}>{e.property_name}</Text>
                  {e.provider_name && (
                    <View style={styles.providerInfoStrict}>
                      <Text style={styles.providerTextStrict}>{e.provider_name}</Text>
                    </View>
                  )}
                  {needsAction && (
                    <View style={styles.actionNeededStrict}>
                      <Text style={styles.actionTextStrict}>
                        {e.status === 'bids_open'
                          ? ((e.bids ?? []).length > 0 ? `${(e.bids ?? []).length} offre${(e.bids ?? []).length > 1 ? 's' : ''} reçue${(e.bids ?? []).length > 1 ? 's' : ''} — Comparer` : 'En attente d\'offres...')
                          : e.status === 'bid_accepted' ? 'Confirmer et payer le déplacement'
                          : 'Voir le devis reçu'}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
                    </View>
                  )}
                  {isTechOnWay && (
                    <View style={[styles.actionNeededStrict, { borderTopColor: '#E0F2FE' }]}>
                      <Text style={[styles.actionTextStrict, { color: '#0284C7' }]}>Votre prestataire est en chemin</Text>
                      <Ionicons name="car-outline" size={16} color="#0284C7" />
                    </View>
                  )}
                  {isTechOnSite && !needsAction && (
                    <View style={[styles.actionNeededStrict, { borderTopColor: '#DCFCE7' }]}>
                      <Text style={[styles.actionTextStrict, { color: '#16A34A' }]}>Intervention en cours — rien à faire</Text>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#16A34A" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Paiements en attente — compact */}
        {awaitingPayment.length > 0 && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' }}
            onPress={() => router.push('/(owner)/missions')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="card-outline" size={22} color="#EF4444" />
              </View>
              <View>
                <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#1E3A5F' }}>Paiements en attente</Text>
                <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#EF4444' }}>
                  {awaitingPayment.length} facture{awaitingPayment.length > 1 ? 's' : ''} à régler
                </Text>
              </View>
            </View>
            <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{awaitingPayment.length}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Mes missions — compact */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' }}
          onPress={() => router.push('/(owner)/missions')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="clipboard-outline" size={22} color="#3B82F6" />
            </View>
            <View>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#1E3A5F' }}>Mes missions</Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#64748B' }}>
                {upcomingNonCompleted.length > 0 ? `${upcomingNonCompleted.length} mission${upcomingNonCompleted.length > 1 ? 's' : ''} à venir` : 'Aucune mission planifiée'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* Prochaines missions — inline list */}
        {upcomingNonCompleted.length > 0 && (
          <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
            {upcomingNonCompleted.slice(0, 3).map((m) => {
              const isPending = m.status === 'pending' || m.status === 'pending_provider_approval';
              const isAssigned = m.status === 'assigned';
              const isInProgress = m.status === 'in_progress';
              const isQuote = (m.status || '').startsWith('quote_');

              let pillBg = '#F1F5F9';
              let pillText = '#64748B';
              let dotColor = '#94A3B8';
              if (isPending) { pillBg = '#FFFBEB'; pillText = '#D97706'; dotColor = '#F59E0B'; }
              else if (isAssigned) { pillBg = '#EFF6FF'; pillText = '#3B82F6'; dotColor = '#3B82F6'; }
              else if (isInProgress) { pillBg = '#F0FDF4'; pillText = '#22C55E'; dotColor = '#22C55E'; }
              else if (isQuote) { pillBg = '#F5F3FF'; pillText = '#7C3AED'; dotColor = '#7C3AED'; }

              const statusLabel = m.status === 'pending' ? 'En attente'
                : m.status === 'pending_provider_approval' ? 'Recherche prestataire'
                : m.status === 'assigned' ? 'Prestataire trouvé'
                : m.status === 'in_progress' ? 'En cours'
                : m.status === 'quote_submitted' || m.status === 'quote_sent' ? 'Devis en cours'
                : m.status === 'quote_accepted' ? 'Devis accepté'
                : m.status;

              const dateStr = m.scheduled_date
                ? new Date(m.scheduled_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                : null;

              return (
                <TouchableOpacity
                  key={m.mission_id || m.id}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}
                  onPress={() => router.push(m.is_emergency ? `/emergency?id=${m.mission_id || m.id}` : `/mission/${m.mission_id || m.id}`)}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor, marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#1E3A5F' }} numberOfLines={1}>
                        {getServiceTypeLabel(m.mission_type)} — {m.property_name || 'Logement'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ backgroundColor: pillBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: pillText }}>{statusLabel}</Text>
                      </View>
                      {dateStr && (
                        <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: '#94A3B8' }}>{dateStr}</Text>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              );
            })}
            {upcomingNonCompleted.length > 3 && (
              <TouchableOpacity onPress={() => router.push('/(owner)/missions')} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: '#3B82F6' }}>
                  Voir les {upcomingNonCompleted.length - 3} autres missions
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Planning */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' }}
          onPress={() => router.push('/(owner)/planning')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={22} color="#22C55E" />
            </View>
            <View>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#1E3A5F' }}>Voir le planning</Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#22C55E' }}>Réservations et missions du mois</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#22C55E" />
        </TouchableOpacity>

        {/* Prochaines réservations */}
        <UpcomingReservations />

        {/* Catalogue partenaires locaux */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' }}
          onPress={() => router.push('/(owner)/catalogue')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="storefront-outline" size={22} color="#D97706" />
            </View>
            <View>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#1E3A5F' }}>Partenaires locaux</Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#D97706' }}>Offres & services pour vos locataires</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#D97706" />
        </TouchableOpacity>

        {/* Most Booked Services */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('owner.dashboard.popular_services')}</Text>
            <TouchableOpacity onPress={() => router.push('/(owner)/providers-map')}><Text style={styles.seeAll}>{t('owner.dashboard.see_all')}</Text></TouchableOpacity>
          </View>
          <View style={styles.servicesGrid}>
            {[
              { id: 'plumbing', name: t('mission_types.plumbing'), icon: 'water-outline', color: '#3B82F6', bg: '#EFF6FF' },
              { id: 'electrical', name: t('mission_types.electrical'), icon: 'flash-outline', color: '#EAB308', bg: '#FEF9C3' },
              { id: 'cleaning', name: t('mission_types.cleaning'), icon: 'sparkles-outline', color: '#10B981', bg: '#D1FAE5' },
              { id: 'repair', name: t('mission_types.repair'), icon: 'hammer-outline', color: '#F97316', bg: '#FFEDD5' },
              { id: 'locksmith', name: t('mission_types.locksmith'), icon: 'key-outline', color: '#8B5CF6', bg: '#EDE9FE' },
              { id: 'jacuzzi', name: t('mission_types.jacuzzi'), icon: 'sunny-outline', color: '#06B6D4', bg: '#CFFAFE' },
              { id: 'linen', name: t('mission_types.linen'), icon: 'shirt-outline', color: '#EC4899', bg: '#FCE7F3' },
              { id: 'more', name: t('owner.dashboard.service_more'), icon: 'apps-outline', color: '#64748B', bg: '#F1F5F9' },
            ].map((service) => (
              <TouchableOpacity
                key={service.id}
                style={styles.serviceItem}
                onPress={() => {
                  if (service.id === 'more') {
                    router.push('/(owner)/providers-map');
                  } else {
                    router.push({ pathname: '/(owner)/providers-map', params: { specialty: service.id } });
                  }
                }}
              >
                <View style={[styles.serviceIconWrap, { backgroundColor: service.bg }]}>
                    <Ionicons name={service.icon as keyof typeof Ionicons.glyphMap} size={28} color={service.color} />
                </View>
                <Text style={styles.serviceItemName}>{service.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Popular Near You */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('owner.dashboard.popular_near_you')}</Text>
            <TouchableOpacity onPress={() => router.push('/(owner)/providers-map')}>
              <Text style={styles.seeAll}>{t('owner.dashboard.see_map')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.xl, gap: SPACING.md }}>
            {providers.slice(0, 5).map(provider => (
              <TouchableOpacity
                key={provider.provider_id}
                style={styles.providerCard}
                onPress={() => router.push(`/(owner)/provider/${provider.provider_id}`)}
              >
                <View style={styles.providerCardHeader}>
                  <Image source={{ uri: provider.user?.picture || `https://ui-avatars.com/api/?name=${provider.user?.name}&background=random` }} style={styles.providerAvatar} />
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{provider.user?.name}</Text>
                    <Text style={styles.providerPrice}>
                      <Text style={{ color: '#64748B', fontSize: 12 }}>{(provider.specialties || []).slice(0, 2).join(', ') || 'Polyvalent'}</Text>
                    </Text>
                  </View>
                  <View style={styles.providerTagWrapper}>
                    <Text style={styles.providerTagText}>{(provider.specialties?.[0] || 'Général').substring(0, 10)}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, paddingLeft: 4 }}>
                  <Ionicons name="star" size={14} color="#FBBF24" />
                  <Text style={{ fontSize: 12, color: '#64748B', marginLeft: 4 }}>
                    {provider.rating ? `${provider.rating}/5` : '—'} ({provider.total_reviews || 0} avis)
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('owner.dashboard.quick_actions')}</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity testID="add-property-quick-btn" style={styles.quickAction} onPress={() => router.push('/property/add')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.infoSoft }]}>
                <Ionicons name="add-circle-outline" size={24} color={COLORS.info} />
              </View>
              <Text style={styles.quickActionText}>{t('owner.dashboard.action_property')}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="create-mission-quick-btn" style={styles.quickAction} onPress={() => router.push('/(owner)/missions')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.successSoft }]}>
                <Ionicons name="clipboard-outline" size={24} color={COLORS.success} />
              </View>
              <Text style={styles.quickActionText}>{t('owner.dashboard.action_mission')}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="emergency-quick-btn" style={styles.quickAction} onPress={() => router.push('/emergency')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.urgencySoft }]}>
                <Ionicons name="warning-outline" size={24} color={COLORS.urgency} />
              </View>
              <Text style={styles.quickActionText}>{t('owner.dashboard.action_emergency')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Empty State — new user with no activity */}
        {activeEmergencies.length === 0 && upcomingNonCompleted.length === 0 && awaitingPayment.length === 0 && (
          <View style={styles.emptyHeroCard}>
            <Ionicons name="home-outline" size={48} color={COLORS.brandPrimary} />
            <Text style={styles.emptyHeroTitle}>{t('owner.dashboard.empty_title')}</Text>
            <Text style={styles.emptyHeroSub}>{t('owner.dashboard.empty_sub')}</Text>
            <TouchableOpacity style={styles.emptyHeroCta} onPress={() => router.push('/emergency')}>
              <Text style={styles.emptyHeroCtaText}>{t('owner.dashboard.empty_cta')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/property/add')} style={{ marginTop: SPACING.md }}>
              <Text style={styles.emptyHeroSecondary}>{t('owner.dashboard.empty_secondary')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Emergency Button (Gradient) */}
      <TouchableOpacity
        testID="emergency-fab"
        style={styles.emergencyFabContainer}
        onPress={() => router.push('/emergency')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={GRADIENT.urgencyButton}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.emergencyFabStyle}
        >
          <Ionicons name="warning" size={28} color={COLORS.textInverse} />
        </LinearGradient>
      </TouchableOpacity>

      {/* Notifications Modal */}
      <Modal visible={showNotifs} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('owner.dashboard.notifications')}</Text>
              <TouchableOpacity onPress={() => setShowNotifs(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <View style={styles.emptyNotifs}>
                  <Ionicons name="notifications-off-outline" size={40} color={COLORS.textTertiary} />
                  <Text style={styles.emptyText}>{t('owner.dashboard.no_notifications')}</Text>
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
                      backgroundColor: n.type?.includes('emergency') ? COLORS.urgencySoft : n.type === 'new_reservation' || n.type === 'new_reservations' ? '#F0FDF4' : COLORS.infoSoft
                    }]}>
                      <Ionicons
                        name={n.type?.includes('emergency') ? 'warning-outline' : n.type === 'new_reservation' || n.type === 'new_reservations' ? 'calendar-outline' : 'briefcase-outline'}
                        size={18}
                        color={n.type?.includes('emergency') ? COLORS.urgency : n.type === 'new_reservation' || n.type === 'new_reservations' ? '#16A34A' : COLORS.info}
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
      </Modal>
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
    paddingTop: SPACING.xl, // Increased top padding for safe area logic
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

  searchContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl, gap: SPACING.sm },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: SPACING.md, height: 44 },
  searchIcon: { marginRight: SPACING.sm },
  searchInput: { flex: 1, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#1E3A5F' },
  filterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },

  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.xl, justifyContent: 'space-between', gap: SPACING.md },
  serviceItem: { width: '22%', alignItems: 'center', marginBottom: SPACING.sm },
  serviceIconWrap: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  serviceItemName: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#1E3A5F', textAlign: 'center' },


  providerCard: { width: 260, backgroundColor: '#FFFFFF', padding: SPACING.md, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: SPACING.md },
  providerCardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  providerAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: SPACING.md },
  providerInfo: { flex: 1 },
  providerName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#1E3A5F', marginBottom: 2 },
  providerPrice: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#3B82F6' },
  providerTagWrapper: { backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  providerTagText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10, color: '#EF4444' },



  section: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xxl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F' },
  seeAll: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#3B82F6' },

  countBadge: { marginLeft: SPACING.sm, backgroundColor: '#EF4444', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2, height: 18, justifyContent: 'center', alignItems: 'center' },
  countBadgeText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10, color: '#FFFFFF' },

  // Strict Cards
  cardStrict: { backgroundColor: '#FFFFFF', padding: SPACING.lg, borderRadius: 16, marginBottom: SPACING.md, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' },
  cardStrictTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  pillStrict: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  pillStrictText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11 },
  cardStrictCategory: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10, color: '#94A3B8', letterSpacing: 0.5 },
  cardStrictTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#1E3A5F', marginBottom: 2 },
  providerInfoStrict: { marginTop: 4 },
  providerTextStrict: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B' },
  actionNeededStrict: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  actionTextStrict: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: '#3B82F6' },

  emptyCardStrict: { backgroundColor: '#F8FAFC', padding: SPACING.xl, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  emptyTextStrict: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#1E3A5F', marginBottom: 4 },
  emptySubtextStrict: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B', textAlign: 'center' },

  // Empty hero card (new user)
  emptyHeroCard: { marginHorizontal: SPACING.xl, marginBottom: SPACING.xxl, backgroundColor: '#F8FAFC', padding: SPACING.xxl, borderRadius: 20, alignItems: 'center', borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  emptyHeroTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#1E3A5F', marginTop: SPACING.md, marginBottom: SPACING.sm },
  emptyHeroSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: SPACING.lg, paddingHorizontal: SPACING.md },
  emptyHeroCta: { backgroundColor: '#1E3A5F', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full },
  emptyHeroCtaText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#FFFFFF' },
  emptyHeroSecondary: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#3B82F6', textDecorationLine: 'underline' },

  // Quick actions override
  quickActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.xs },
  quickAction: { flex: 1, backgroundColor: '#FFFFFF', padding: SPACING.md, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' },
  quickActionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  quickActionText: { fontFamily: 'PlusJakartaSans_500Medium', color: '#1E3A5F', textAlign: 'center', fontSize: 12 },

  // Emergency FAB
  emergencyFabContainer: {
    position: 'absolute', bottom: 100, right: 20,
    ...SHADOWS.urgency,
  },
  emergencyFabStyle: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center',
  },

  // Notifications modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 29, 46, 0.4)', justifyContent: 'flex-end' }, // Darker, rich blur color
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
});
