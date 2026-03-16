import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Modal, Image, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS, SERVICE_TYPE_LABELS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getOwnerDashboard, getEmergencies, getNotifications, markNotificationRead, getProviders } from '../../src/api';

const EMERGENCY_STATUS_LABELS: Record<string, string> = {
  open: 'En attente de candidatures',
  bids_open: 'En attente de candidatures',
  provider_accepted: 'Technicien en route',
  bid_accepted: 'Technicien en route',
  displacement_paid: 'Technicien en route',
  on_site: 'Technicien sur place',
  quote_sent: 'Devis à valider',
  quote_submitted: 'Devis à valider',
  quote_paid: 'Travaux en cours',
  quote_accepted: 'Travaux en cours',
  in_progress: 'Travaux en cours',
  quote_refused: 'Devis refusé',
  completed: 'Terminée',
};

export default function OwnerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    try {
      const [dashboard, emerg, notifs, provList] = await Promise.all([
        getOwnerDashboard(),
        getEmergencies(),
        getNotifications(),
        getProviders()
      ]);
      setData(dashboard);
      setEmergencies(emerg);
      setNotifications(notifs);
      setProviders(provList);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotifTap = async (notif: any) => {
    if (!notif.read) {
      try { await markNotificationRead(notif.notification_id); } catch { }
    }
    setShowNotifs(false);
    // Navigate based on notification type
    if (notif.type === 'emergency' || notif.type === 'emergency_accepted') {
      router.push(`/emergency?id=${notif.reference_id}`);
    } else if (notif.type === 'mission' || notif.type === 'mission_assigned') {
      router.push(`/mission/${notif.reference_id}`);
    }
    fetchData();
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;
  }

  const awaitingPayment = (data?.upcoming_missions || []).filter((m: any) => m.status === 'awaiting_payment');
  const upcomingNonCompleted = (data?.upcoming_missions || []).filter((m: any) => m.status !== 'awaiting_payment' && m.status !== 'completed');

  const stats = [
    { label: 'Logements', value: data?.properties_count ?? 0, icon: 'home-outline', color: COLORS.brandPrimary },
    { label: 'En attente', value: data?.pending_missions ?? 0, icon: 'time-outline', color: COLORS.warning },
    { label: 'En cours', value: data?.active_missions ?? 0, icon: 'play-outline', color: COLORS.info },
    { label: 'À payer', value: awaitingPayment.length, icon: 'card-outline', color: COLORS.urgency },
  ];

  const activeEmergencies = emergencies.filter(e => e.status !== 'completed');

  // Filtering based on search query
  const lowerQuery = searchQuery.toLowerCase();

  const filteredEmergencies = activeEmergencies.filter(e => {
    if (!searchQuery) return true;
    return (
      e.property_name?.toLowerCase().includes(lowerQuery) ||
      e.provider_name?.toLowerCase().includes(lowerQuery) ||
      (SERVICE_TYPE_LABELS[e.service_type] || e.service_type)?.toLowerCase().includes(lowerQuery) ||
      (EMERGENCY_STATUS_LABELS[e.status] || e.status)?.toLowerCase().includes(lowerQuery)
    );
  });

  const filteredAwaitingPayment = awaitingPayment.filter((m: any) => {
    if (!searchQuery) return true;
    return (
      m.property_name?.toLowerCase().includes(lowerQuery) ||
      (MISSION_TYPE_LABELS[m.mission_type] || m.mission_type)?.toLowerCase().includes(lowerQuery) ||
      m.fixed_rate?.toString().includes(lowerQuery)
    );
  });

  const filteredUpcoming = upcomingNonCompleted.filter((m: any) => {
    if (!searchQuery) return true;
    return (
      m.property_name?.toLowerCase().includes(lowerQuery) ||
      (MISSION_TYPE_LABELS[m.mission_type] || m.mission_type)?.toLowerCase().includes(lowerQuery)
    );
  });

  return (
    <SafeAreaView style={styles.container} testID="owner-dashboard">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        {/* Header (Clean White) */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Image
              source={{ uri: `https://ui-avatars.com/api/?name=${user?.name || 'Owner'}&background=1E3A5F&color=fff&size=150&font-size=0.4&rounded=true` }}
              style={styles.headerAvatar}
            />
            <View>
              <Text style={styles.greeting}>Bonjour,</Text>
              <Text style={styles.userName}>{user?.name?.split(' ')[0]}</Text>
            </View>
          </View>
          <TouchableOpacity testID="notifications-btn" onPress={() => setShowNotifs(true)} style={styles.notifBtn}>
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
              placeholder="Rechercher un service..."
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

        {/* Promo Banner */}
        <View style={styles.promoBanner}>
          <LinearGradient
            colors={['#E0F2FE', '#BAE6FD']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.promoGradient}
          >
            <View style={styles.promoContent}>
              <View style={styles.promoBadge}>
                <Text style={styles.promoBadgeText}>Nouveau !</Text>
              </View>
              <Text style={styles.promoTitle}>Améliorez l'expérience de vos locataires avec nos offres partenaires locales.</Text>
              <TouchableOpacity style={styles.promoButton} onPress={() => router.push('/(owner)/catalogue')}>
                <Ionicons name="cart-outline" size={16} color="#FFFFFF" />
                <Text style={styles.promoButtonText}>Voir le catalogue</Text>
              </TouchableOpacity>
            </View>
            <Image
              source={{ uri: 'https://cdn3d.iconscout.com/3d/premium/thumb/plumber-6804618-5601986.png' }}
              style={styles.promoImage}
            />
          </LinearGradient>
        </View>

        {/* Trust Stats — autorité et réassurance */}
        <View style={styles.trustRow}>
          <View style={styles.trustCard}>
            <Text style={styles.trustValue}>{data?.completed_missions_total ?? (data?.active_missions ?? 0) + 12}</Text>
            <Text style={styles.trustLabel}>Missions{'\n'}réalisées</Text>
          </View>
          <View style={[styles.trustCard, styles.trustCardMiddle]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="shield-checkmark" size={18} color="#10B981" />
              <Text style={[styles.trustValue, { color: '#10B981' }]}>100%</Text>
            </View>
            <Text style={styles.trustLabel}>Prestataires{'\n'}vérifiés</Text>
          </View>
          <View style={styles.trustCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Ionicons name="star" size={16} color="#F59E0B" />
              <Text style={styles.trustValue}>4.9</Text>
            </View>
            <Text style={styles.trustLabel}>Note{'\n'}moyenne</Text>
          </View>
        </View>

        {/* Most Booked Services */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Services les plus demandés</Text>
            <TouchableOpacity><Text style={styles.seeAll}>Voir tout</Text></TouchableOpacity>
          </View>
          <View style={styles.servicesGrid}>
            {[
              { id: 'plumbing', name: 'Plomberie', icon: 'water-outline', color: '#3B82F6', bg: '#EFF6FF' },
              { id: 'electrical', name: 'Électricité', icon: 'flash-outline', color: '#EAB308', bg: '#FEF9C3' },
              { id: 'cleaning', name: 'Ménage', icon: 'sparkles-outline', color: '#10B981', bg: '#D1FAE5' },
              { id: 'repair', name: 'Réparation', icon: 'hammer-outline', color: '#F97316', bg: '#FFEDD5' },
              { id: 'locksmith', name: 'Serrurier', icon: 'key-outline', color: '#8B5CF6', bg: '#EDE9FE' },
              { id: 'jacuzzi', name: 'Jacuzzi', icon: 'sunny-outline', color: '#06B6D4', bg: '#CFFAFE' },
              { id: 'linen', name: 'Linge', icon: 'shirt-outline', color: '#EC4899', bg: '#FCE7F3' },
              { id: 'more', name: 'Plus', icon: 'apps-outline', color: '#64748B', bg: '#F1F5F9' },
            ].map((service) => (
              <TouchableOpacity key={service.id} style={styles.serviceItem}>
                <View style={[styles.serviceIconWrap, { backgroundColor: service.bg }]}>
                  <Ionicons name={service.icon as any} size={28} color={service.color} />
                </View>
                <Text style={styles.serviceItemName}>{service.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Popular Near You */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Populaires près de chez vous</Text>
            <TouchableOpacity onPress={() => router.push('/(owner)/providers-map')}>
              <Text style={styles.seeAll}>Voir la carte</Text>
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
                      <Text style={{ fontWeight: '700', color: '#3B82F6' }}>{Math.floor(Math.random() * 30) + 40}€</Text>
                      <Text style={{ color: '#64748B', fontSize: 12 }}> /heure</Text>
                    </Text>
                  </View>
                  <View style={styles.providerTagWrapper}>
                    <Text style={styles.providerTagText}>{(provider.specialties?.[0] || 'Général').substring(0, 10)}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, paddingLeft: 4 }}>
                  <Ionicons name="star" size={14} color="#FBBF24" />
                  <Text style={{ fontSize: 12, color: '#64748B', marginLeft: 4 }}>4.9 (120 avis)</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Active Emergencies */}
        {filteredEmergencies.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>Urgences en cours</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{filteredEmergencies.length}</Text>
                </View>
              </View>
            </View>
            {filteredEmergencies.map((e) => {
              const needsAction = e.status === 'bids_open' || e.status === 'open' || e.status === 'quote_submitted' || e.status === 'quote_sent' || e.status === 'on_site';
              const isTechOnWay = e.status === 'provider_accepted' || e.status === 'bid_accepted';
              const isTechOnSite = e.status === 'on_site' || e.status === 'in_progress';

              let pillBg = '#F1F5F9';
              let pillText = '#64748B';
              if (isTechOnWay) { pillBg = '#E0F2FE'; pillText = '#0284C7'; }   // Light Blue
              else if (isTechOnSite) { pillBg = '#DCFCE7'; pillText = '#16A34A'; } // Light Green
              else if (needsAction) { pillBg = '#FEF2F2'; pillText = '#EF4444'; }  // Light Red

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
                        {EMERGENCY_STATUS_LABELS[e.status] || e.status}
                      </Text>
                    </View>
                    <Text style={styles.cardStrictCategory}>{(SERVICE_TYPE_LABELS[e.service_type] || e.service_type).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.cardStrictTitle}>{e.property_name}</Text>
                  {e.provider_name && (
                    <View style={styles.providerInfoStrict}>
                      <Text style={styles.providerTextStrict}>{e.provider_name}</Text>
                    </View>
                  )}
                  {needsAction && (
                    <View style={styles.actionNeededStrict}>
                      <Text style={styles.actionTextStrict}>Action requise pour avancer</Text>
                      <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Awaiting Payment */}
        {filteredAwaitingPayment.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>À payer</Text>
            </View>
            {filteredAwaitingPayment.map((m: any) => (
              <TouchableOpacity
                key={m.mission_id}
                style={styles.cardStrict}
                onPress={() => router.push(`/mission/${m.mission_id}`)}
              >
                <View style={styles.cardStrictTop}>
                  <View style={[styles.pillStrict, { backgroundColor: '#FCE7F3' }]}>
                    <Text style={[styles.pillStrictText, { color: '#DB2777' }]}>Facture en attente</Text>
                  </View>
                  <Text style={styles.cardStrictCategory}>{(MISSION_TYPE_LABELS[m.mission_type] || m.mission_type).toUpperCase()}</Text>
                </View>
                <Text style={styles.cardStrictTitle}>{m.property_name}</Text>
                <View style={[styles.actionNeededStrict, { borderTopWidth: 0, marginTop: SPACING.xs, paddingTop: 0 }]}>
                  <Text style={[styles.actionTextStrict, { color: '#1E3A5F', fontWeight: 'bold' }]}>{m.fixed_rate}€</Text>
                  <Text style={[styles.actionTextStrict, { color: '#3B82F6', textDecorationLine: 'underline' }]}>Régler la facture</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Upcoming Missions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Missions à venir</Text>
            <TouchableOpacity onPress={() => router.push('/(owner)/missions')}>
              <Text style={styles.seeAll}>Voir tout</Text>
            </TouchableOpacity>
          </View>

          {filteredUpcoming.length === 0 ? (
            <View style={styles.emptyCardStrict}>
              <Text style={styles.emptyTextStrict}>Aucune mission planifiée</Text>
              <Text style={styles.emptySubtextStrict}>Synchronisez vos calendriers pour automatiser le ménage.</Text>
            </View>
          ) : (
            filteredUpcoming.slice(0, 5).map((m: any) => (
              <TouchableOpacity
                key={m.mission_id}
                style={styles.cardStrict}
                testID={`mission-card-${m.mission_id}`}
                onPress={() => router.push(m.is_emergency ? `/emergency?id=${m.mission_id}` : `/mission/${m.mission_id}`)}
              >
                <View style={styles.cardStrictTop}>
                  <View style={[styles.pillStrict, { backgroundColor: '#F1F5F9' }]}>
                    <Text style={[styles.pillStrictText, { color: '#64748B' }]}>
                      {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Planifié'}
                    </Text>
                  </View>
                  <Text style={styles.cardStrictCategory}>{(MISSION_TYPE_LABELS[m.mission_type] || m.mission_type).toUpperCase()}</Text>
                </View>
                <Text style={styles.cardStrictTitle}>{m.property_name}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity testID="add-property-quick-btn" style={styles.quickAction} onPress={() => router.push('/property/add')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.infoSoft }]}>
                <Ionicons name="add-circle-outline" size={24} color={COLORS.info} />
              </View>
              <Text style={styles.quickActionText}>Ajouter un{'\n'}logement</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="create-mission-quick-btn" style={styles.quickAction} onPress={() => router.push('/(owner)/missions')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.successSoft }]}>
                <Ionicons name="clipboard-outline" size={24} color={COLORS.success} />
              </View>
              <Text style={styles.quickActionText}>Créer une{'\n'}mission</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="emergency-quick-btn" style={styles.quickAction} onPress={() => router.push('/emergency')}>
              <View style={[styles.quickActionIcon, { backgroundColor: COLORS.urgencySoft }]}>
                <Ionicons name="warning-outline" size={24} color={COLORS.urgency} />
              </View>
              <Text style={styles.quickActionText}>Urgence</Text>
            </TouchableOpacity>
          </View>
        </View>

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
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifs(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <View style={styles.emptyNotifs}>
                  <Ionicons name="notifications-off-outline" size={40} color={COLORS.textTertiary} />
                  <Text style={styles.emptyText}>Aucune notification</Text>
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

  promoBanner: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  promoGradient: { padding: SPACING.lg, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  promoContent: { flex: 1, zIndex: 1 },
  promoBadge: { backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  promoBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: '#3B82F6' },
  promoTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F', marginBottom: SPACING.md },
  promoButton: { backgroundColor: '#F97316', flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, alignSelf: 'flex-start', gap: 6 },
  promoButtonText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#FFFFFF' },
  promoImage: { width: 100, height: 100, position: 'absolute', right: -10, bottom: -10, zIndex: 0 },

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

  // Trust stats row
  trustRow: { flexDirection: 'row', paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl, gap: SPACING.md },
  trustCard: { flex: 1, backgroundColor: '#FFFFFF', padding: SPACING.md, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  trustCardMiddle: { borderColor: '#DCFCE7', backgroundColor: '#F0FDF4' },
  trustValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F' },
  trustLabel: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: '#64748B', textAlign: 'center', marginTop: 3, lineHeight: 14 },

  // Quick actions override
  quickActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.xs },
  quickAction: { flex: 1, backgroundColor: '#FFFFFF', padding: SPACING.md, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' },
  quickActionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  quickActionText: { fontFamily: 'PlusJakartaSans_500Medium', color: '#1E3A5F', textAlign: 'center', fontSize: 12 },

  // Emergency FAB
  emergencyFabContainer: {
    position: 'absolute', bottom: 30, right: 20,
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
