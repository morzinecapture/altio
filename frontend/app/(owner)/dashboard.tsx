import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS, SERVICE_TYPE_LABELS } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getOwnerDashboard, getEmergencies, getNotifications, markNotificationRead } from '../../src/api';

const EMERGENCY_STATUS_LABELS: Record<string, string> = {
  open: 'En attente de technicien',
  provider_accepted: 'Paiement requis',
  displacement_paid: 'Technicien en route',
  quote_sent: 'Devis à valider',
  quote_paid: 'Travaux en cours',
  in_progress: 'Travaux en cours',
  completed: 'Terminée',
};

export default function OwnerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);

  const fetchData = async () => {
    try {
      const [dashboard, emerg, notifs] = await Promise.all([
        getOwnerDashboard(),
        getEmergencies(),
        getNotifications(),
      ]);
      setData(dashboard);
      setEmergencies(emerg);
      setNotifications(notifs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotifTap = async (notif: any) => {
    if (!notif.read) {
      try { await markNotificationRead(notif.notification_id); } catch {}
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

  const stats = [
    { label: 'Logements', value: data?.total_properties || 0, icon: 'home-outline', color: COLORS.brandPrimary },
    { label: 'En attente', value: data?.pending_missions || 0, icon: 'time-outline', color: COLORS.warning },
    { label: 'En cours', value: data?.active_missions || 0, icon: 'play-outline', color: COLORS.info },
    { label: 'Urgences', value: emergencies.filter(e => e.status !== 'completed').length, icon: 'warning-outline', color: COLORS.urgency },
  ];

  const activeEmergencies = emergencies.filter(e => e.status !== 'completed');

  return (
    <SafeAreaView style={styles.container} testID="owner-dashboard">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.userName}>{user?.name?.split(' ')[0]} 👋</Text>
          </View>
          <TouchableOpacity testID="notifications-btn" onPress={() => setShowNotifs(true)} style={styles.notifBtn}>
            <Ionicons name="notifications-outline" size={24} color={COLORS.textPrimary} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat, i) => (
            <View key={i} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: stat.color + '15' }]}>
                <Ionicons name={stat.icon as any} size={20} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Active Emergencies */}
        {activeEmergencies.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: COLORS.urgency }]}>🚨 Urgences en cours</Text>
            </View>
            {activeEmergencies.map((e) => {
              const needsAction = e.status === 'provider_accepted' || e.status === 'quote_sent';
              return (
                <TouchableOpacity
                  key={e.request_id}
                  testID={`emergency-card-${e.request_id}`}
                  style={[styles.emergencyCard, needsAction && styles.emergencyCardAction]}
                  onPress={() => router.push(`/emergency?id=${e.request_id}`)}
                >
                  <View style={styles.emergencyTop}>
                    <View style={[styles.statusChip, { backgroundColor: needsAction ? COLORS.urgencySoft : COLORS.infoSoft }]}>
                      <Text style={[styles.statusChipText, { color: needsAction ? COLORS.urgency : COLORS.info }]}>
                        {EMERGENCY_STATUS_LABELS[e.status] || e.status}
                      </Text>
                    </View>
                    <Text style={styles.emergencyType}>{SERVICE_TYPE_LABELS[e.service_type] || e.service_type}</Text>
                  </View>
                  <Text style={styles.emergencyProp}>{e.property_name}</Text>
                  {e.provider_name && (
                    <View style={styles.providerInfo}>
                      <Ionicons name="person-outline" size={14} color={COLORS.textTertiary} />
                      <Text style={styles.providerText}>{e.provider_name}</Text>
                      {e.eta_minutes && e.status === 'provider_accepted' && (
                        <>
                          <Ionicons name="time-outline" size={14} color={COLORS.info} />
                          <Text style={[styles.providerText, { color: COLORS.info }]}>{e.eta_minutes} min</Text>
                        </>
                      )}
                    </View>
                  )}
                  {needsAction && (
                    <View style={styles.actionNeeded}>
                      <Ionicons name="arrow-forward-circle" size={18} color={COLORS.urgency} />
                      <Text style={styles.actionText}>
                        {e.status === 'provider_accepted' ? 'Payer les frais de déplacement' : 'Valider le devis'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
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

          {(data?.upcoming_missions || []).length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={40} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>Aucune mission planifiée</Text>
              <Text style={styles.emptySubtext}>Ajoutez un logement et synchronisez votre calendrier iCal</Text>
            </View>
          ) : (
            (data?.upcoming_missions || []).slice(0, 5).map((m: any) => (
              <TouchableOpacity
                key={m.mission_id}
                style={styles.missionCard}
                testID={`mission-card-${m.mission_id}`}
                onPress={() => router.push(`/mission/${m.mission_id}`)}
              >
                <View style={styles.missionTop}>
                  <View style={[styles.statusChip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg }]}>
                    <Text style={[styles.statusChipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                      {STATUS_LABELS[m.status] || m.status}
                    </Text>
                  </View>
                  <Text style={styles.missionType}>{MISSION_TYPE_LABELS[m.mission_type] || m.mission_type}</Text>
                </View>
                <Text style={styles.missionProperty}>{m.property_name}</Text>
                <View style={styles.missionMeta}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                  <Text style={styles.missionDate}>
                    {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Non planifiée'}
                  </Text>
                  {m.fixed_rate && (
                    <>
                      <Ionicons name="cash-outline" size={14} color={COLORS.textTertiary} />
                      <Text style={styles.missionDate}>{m.fixed_rate}€</Text>
                    </>
                  )}
                </View>
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

      {/* Floating Emergency Button */}
      <TouchableOpacity
        testID="emergency-fab"
        style={styles.emergencyFab}
        onPress={() => router.push('/emergency')}
        activeOpacity={0.8}
      >
        <Ionicons name="warning" size={28} color={COLORS.textInverse} />
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
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  greeting: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  userName: { ...FONTS.h2, color: COLORS.textPrimary },
  notifBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  notifBadge: { position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.urgency, justifyContent: 'center', alignItems: 'center' },
  notifBadgeText: { ...FONTS.caption, color: COLORS.textInverse, fontSize: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.xl, gap: SPACING.md, marginTop: SPACING.md },
  statCard: { width: '47%', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, ...SHADOWS.card },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  statValue: { ...FONTS.h2, color: COLORS.textPrimary },
  statLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: SPACING.xl, marginTop: SPACING.xxl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary },
  seeAll: { ...FONTS.bodySmall, color: COLORS.info },
  // Emergency cards
  emergencyCard: { backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.info, ...SHADOWS.card },
  emergencyCardAction: { borderLeftColor: COLORS.urgency, backgroundColor: '#FFFBFB' },
  emergencyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  emergencyType: { ...FONTS.caption, color: COLORS.textTertiary },
  emergencyProp: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  providerInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  providerText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  actionNeeded: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionText: { ...FONTS.bodySmall, color: COLORS.urgency, fontWeight: '600' },
  // Missions
  emptyCard: { backgroundColor: COLORS.paper, padding: SPACING.xxl, borderRadius: RADIUS.lg, alignItems: 'center', ...SHADOWS.card },
  emptyText: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md },
  emptySubtext: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.sm },
  missionCard: { backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.md, ...SHADOWS.card },
  missionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  statusChip: { paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.full },
  statusChipText: { ...FONTS.caption, fontSize: 10 },
  missionType: { ...FONTS.caption, color: COLORS.textTertiary },
  missionProperty: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.sm, fontSize: 16 },
  missionMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  missionDate: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  // Quick actions
  quickActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  quickAction: { flex: 1, backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, alignItems: 'center', ...SHADOWS.card },
  quickActionIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  quickActionText: { ...FONTS.bodySmall, color: COLORS.textPrimary, textAlign: 'center', fontSize: 12 },
  // Emergency FAB
  emergencyFab: {
    position: 'absolute', bottom: 80, right: 20,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.urgency,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.urgency,
  },
  // Notifications modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.paper, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  emptyNotifs: { alignItems: 'center', paddingVertical: SPACING.xxxl },
  notifItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.background },
  notifItemUnread: { backgroundColor: COLORS.infoSoft },
  notifIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  notifContent: { flex: 1 },
  notifTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  notifBody: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2, fontSize: 12 },
  notifTime: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: 4, fontSize: 9 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.urgency, marginLeft: SPACING.sm },
});
