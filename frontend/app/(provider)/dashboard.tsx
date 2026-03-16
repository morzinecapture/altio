import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert, Switch, Image, TextInput, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_LABELS, MISSION_TYPE_LABELS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getMissions, getEmergencies, toggleAvailability, getProfile, applyToMission, getProviderSchedule, getNotifications, markNotificationRead, getProviderStats } from '../../src/api';

export default function ProviderDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [missions, setMissions] = useState<any[]>([]);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [todayMissions, setTodayMissions] = useState<any[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    try {
      const [m, e, profile, schedule, notifs, provStats] = await Promise.all([
        getMissions('pending', undefined, true),
        getEmergencies(true),
        getProfile(),
        getProviderSchedule(),
        getNotifications(),
        getProviderStats(),
      ]);
      setMissions(m.filter((mi: any) => mi.status === 'pending'));
      setEmergencies(e.filter((em: any) =>
        em.status === 'open' || em.status === 'bids_open' || em.accepted_provider_id === user?.id
      ));
      setAvailable(profile?.provider_profile?.available || false);
      // Today's missions
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setTodayMissions(schedule.filter((s: any) => {
        const d = new Date(s.scheduled_at);
        return d >= today && d < tomorrow;
      }));
      setNotifications(notifs || []);
      setStats(provStats);
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
    if (notif.type === 'emergency' || notif.type === 'emergency_accepted') {
      router.push(`/emergency?id=${notif.reference_id}`);
    } else if (notif.type === 'mission' || notif.type === 'mission_assigned') {
      router.push(`/mission/${notif.reference_id}`);
    }
    fetchData();
  };

  const handleToggle = async () => {
    try {
      const result = await toggleAvailability();
      setAvailable(result.available);
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleApply = async (missionId: string, rate?: number) => {
    try {
      await applyToMission(missionId, { proposed_rate: rate, message: 'Disponible pour cette mission' });
      Alert.alert('Candidature envoyée !');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  // Search filtering
  const lowerQuery = searchQuery.toLowerCase();

  const filteredMissions = missions.filter(m => {
    if (!searchQuery) return true;
    return (
      m.property_name?.toLowerCase().includes(lowerQuery) ||
      m.property_address?.toLowerCase().includes(lowerQuery) ||
      (MISSION_TYPE_LABELS[m.mission_type] || m.mission_type)?.toLowerCase().includes(lowerQuery)
    );
  });

  const filteredEmergencies = emergencies.filter(e => {
    if (!e || (e.status !== 'open' && e.status !== 'bids_open' && e.accepted_provider_id !== user?.id)) return false;
    if (!searchQuery) return true;
    return (
      e.property_name?.toLowerCase().includes(lowerQuery) ||
      e.service_type?.toLowerCase().includes(lowerQuery) ||
      e.description?.toLowerCase().includes(lowerQuery)
    );
  });

  const filteredToday = todayMissions.filter(m => {
    if (!searchQuery) return true;
    return m.title?.toLowerCase().includes(lowerQuery) || m.address?.toLowerCase().includes(lowerQuery);
  });

  const kpiStats = [
    { label: 'Missions ce mois', value: stats?.completed_missions ?? 0, icon: 'checkmark-circle-outline', color: '#10B981', bg: '#D1FAE5' },
    { label: 'Revenus (€)', value: stats?.total_earnings ? `${Math.round(stats.total_earnings)}€` : '—', icon: 'cash-outline', color: '#3B82F6', bg: '#EFF6FF' },
    { label: 'Note moyenne', value: stats?.rating ? `${stats.rating}/5` : '—', icon: 'star-outline', color: '#F59E0B', bg: '#FEF9C3' },
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
              placeholder="Rechercher une mission..."
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

        {/* Motivation Banner */}
        <View style={styles.promoBanner}>
          <LinearGradient
            colors={['#D1FAE5', '#A7F3D0']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.promoGradient}
          >
            <View style={styles.promoContent}>
              <View style={styles.promoBadge}>
                <Text style={styles.promoBadgeText}>Performance 🏆</Text>
              </View>
              <Text style={styles.promoTitle}>Vous êtes parmi les meilleurs prestataires de votre zone !</Text>
              <TouchableOpacity style={styles.promoButton} onPress={() => router.push('/(provider)/revenue')}>
                <Ionicons name="trending-up-outline" size={16} color="#FFFFFF" />
                <Text style={styles.promoButtonText}>Voir mes stats</Text>
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
                <Ionicons name={k.icon as any} size={20} color={k.color} />
              </View>
              <Text style={styles.statValue}>{k.value}</Text>
              <Text style={styles.statLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Availability Toggle */}
        <View style={[styles.availCard, { backgroundColor: available ? '#F0FDF4' : '#FFFFFF', borderColor: available ? '#86EFAC' : '#F1F5F9' }]}>
          <View style={styles.availLeft}>
            <View style={[styles.statusDot, { backgroundColor: available ? '#10B981' : '#94A3B8' }]} />
            <View>
              <Text style={styles.availTitle}>{available ? 'Disponible' : 'Indisponible'}</Text>
              <Text style={styles.availSubtext}>{available ? 'Vous recevez les nouvelles missions' : 'Activez pour recevoir des missions'}</Text>
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

        {/* Today's Missions */}
        {filteredToday.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>Aujourd'hui</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{filteredToday.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => router.push('/(provider)/planning')}>
                <Text style={styles.seeAll}>Planning</Text>
              </TouchableOpacity>
            </View>
            {filteredToday.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.cardStrict}
                onPress={() => m.mission_id ? router.push(`/mission/${m.mission_id}`) : null}
              >
                <View style={styles.cardStrictTop}>
                  <View style={[styles.pillStrict, { backgroundColor: m.is_emergency ? '#FEF2F2' : '#F1F5F9' }]}>
                    <Text style={[styles.pillStrictText, { color: m.is_emergency ? '#EF4444' : '#64748B' }]}>
                      {m.is_emergency ? 'URGENCE' : 'PLANIFIÉ'}
                    </Text>
                  </View>
                  <Text style={styles.cardStrictCategory}>
                    {new Date(m.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.cardStrictTitle}>{m.title}</Text>
                {m.address ? <Text style={styles.providerTextStrict}>{m.address}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Available Missions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>Missions disponibles</Text>
              {filteredMissions.length > 0 && (
                <View style={[styles.countBadge, { backgroundColor: '#FBBF24' }]}>
                  <Text style={styles.countBadgeText}>{filteredMissions.length}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={() => router.push('/(provider)/my-missions')}>
              <Text style={styles.seeAll}>Voir tout</Text>
            </TouchableOpacity>
          </View>

          {filteredMissions.length === 0 ? (
            <View style={styles.emptyCardStrict}>
              <Ionicons name="briefcase-outline" size={32} color="#94A3B8" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTextStrict}>Aucune mission disponible</Text>
              <Text style={styles.emptySubtextStrict}>Revenez plus tard ou vérifiez votre rayon d'action.</Text>
            </View>
          ) : (
            filteredMissions.slice(0, 5).map((m) => (
              <View key={m.mission_id} style={styles.cardStrict}>
                <View style={styles.cardStrictTop}>
                  <View style={[styles.pillStrict, { backgroundColor: '#FEF9C3' }]}>
                    <Text style={[styles.pillStrictText, { color: '#CA8A04' }]}>
                      {(MISSION_TYPE_LABELS[m.mission_type] || m.mission_type).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.cardStrictCategory}>{m.mode === 'fixed' ? 'FIXE' : 'DEVIS'}</Text>
                </View>
                <Text style={styles.cardStrictTitle}>{m.property_name || 'Logement'}</Text>
                <Text style={styles.providerTextStrict}>{m.property_address}</Text>
                {m.description && <Text style={[styles.providerTextStrict, { marginTop: 4 }]} numberOfLines={2}>{m.description}</Text>}

                <View style={styles.actionRowStrict}>
                  <Text style={[styles.actionTextStrict, { color: '#64748B' }]}>
                    {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString('fr-FR') : 'Date à convenir'}
                  </Text>
                  {m.fixed_rate && (
                    <Text style={[styles.actionTextStrict, { color: '#16A34A', fontWeight: 'bold' }]}>{m.fixed_rate}€</Text>
                  )}
                </View>
                <TouchableOpacity
                  testID={`apply-mission-${m.mission_id}`}
                  style={styles.applyBtnStrict}
                  onPress={() => handleApply(m.mission_id, m.fixed_rate)}
                >
                  <Ionicons name="paper-plane-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.applyTextStrict}>Candidater</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Emergency Requests */}
        {filteredEmergencies.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>Urgences en cours</Text>
                <View style={[styles.countBadge, { backgroundColor: '#EF4444' }]}>
                  <Text style={styles.countBadgeText}>{filteredEmergencies.length}</Text>
                </View>
              </View>
            </View>
            {filteredEmergencies.map((e: any) => {
              const isOpen = e.status === 'open' || e.status === 'bids_open';
              const isMine = e.accepted_provider_id === user?.id;
              const statusLabel: Record<string, string> = {
                on_site: 'Sur place',
                quote_submitted: 'Attente devis',
                quote_accepted: 'Travaux',
                bid_accepted: 'En route',
                provider_accepted: 'En route',
              };
              return (
                <TouchableOpacity key={e.id} style={styles.cardStrict} onPress={() => router.push(`/emergency?id=${e.id}`)}>
                  <View style={styles.cardStrictTop}>
                    <View style={[styles.pillStrict, { backgroundColor: '#FEF2F2' }]}>
                      <Text style={[styles.pillStrictText, { color: '#EF4444' }]}>URGENCE</Text>
                    </View>
                    <Text style={styles.cardStrictCategory}>{e.service_type?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.cardStrictTitle}>{e.property_name}</Text>
                  {e.property_address ? <Text style={styles.providerTextStrict}>{e.property_address}</Text> : null}
                  <Text style={[styles.providerTextStrict, { marginTop: 4 }]} numberOfLines={2}>{e.description}</Text>
                  {isOpen ? (
                    <TouchableOpacity style={[styles.applyBtnStrict, { backgroundColor: '#EF4444' }]} onPress={() => router.push(`/emergency?id=${e.id}`)}>
                      <Ionicons name="warning-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.applyTextStrict}>Répondre à l'urgence</Text>
                    </TouchableOpacity>
                  ) : isMine ? (
                    <View style={[styles.pillStrict, { backgroundColor: '#E0F2FE', alignSelf: 'flex-start', marginTop: SPACING.md }]}>
                      <Text style={[styles.pillStrictText, { color: '#0284C7' }]}>{statusLabel[e.status] || e.status}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/(provider)/my-missions')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="clipboard-outline" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.quickActionText}>Mes{'\n'}missions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/(provider)/planning')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="calendar-outline" size={24} color="#10B981" />
              </View>
              <Text style={styles.quickActionText}>Mon{'\n'}planning</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/(provider)/revenue')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#FEF9C3' }]}>
                <Ionicons name="cash-outline" size={24} color="#CA8A04" />
              </View>
              <Text style={styles.quickActionText}>Mes{'\n'}revenus</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

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

  availCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.xl, padding: SPACING.lg, borderRadius: 16, borderWidth: 1, marginBottom: SPACING.xl, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
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
});
