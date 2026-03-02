import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getProviderSchedule } from '../../src/api';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isTomorrow(iso: string) {
  const d = new Date(iso);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
}

function dateLabel(iso: string) {
  if (isToday(iso)) return "Aujourd'hui";
  if (isTomorrow(iso)) return 'Demain';
  return formatDate(iso);
}

export default function PlanningScreen() {
  const router = useRouter();
  const [schedule, setSchedule] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchSchedule(); }, []);

  const fetchSchedule = async () => {
    try {
      const data = await getProviderSchedule();
      setSchedule(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSchedule();
  }, []);

  // Group by date label
  const grouped: Record<string, any[]> = {};
  schedule.forEach((item) => {
    const label = dateLabel(item.scheduled_at);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(item);
  });
  const groupEntries = Object.entries(grouped);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Planning</Text>
        <TouchableOpacity onPress={fetchSchedule} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        </View>
      ) : schedule.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={40} color={COLORS.brandPrimary} />
          </View>
          <Text style={styles.emptyTitle}>Aucune mission planifiée</Text>
          <Text style={styles.emptyDesc}>Vos missions et urgences acceptées apparaîtront ici</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brandPrimary} />}
        >
          {groupEntries.map(([dateLabel, items]) => (
            <View key={dateLabel}>
              <View style={styles.dateRow}>
                <Text style={styles.dateHeader}>{dateLabel}</Text>
                <View style={styles.dateLine} />
              </View>

              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.card}
                  onPress={() => {
                    if (item.mission_id) router.push(`/mission/${item.mission_id}`);
                  }}
                  activeOpacity={item.mission_id ? 0.7 : 1}
                >
                  <View style={[styles.colorBar, { backgroundColor: item.is_emergency ? COLORS.urgency : COLORS.brandPrimary }]} />
                  <View style={styles.cardContent}>
                    <View style={styles.cardTop}>
                      <View style={styles.timeWrap}>
                        <Ionicons name="time-outline" size={14} color={COLORS.textTertiary} />
                        <Text style={styles.cardTime}>{formatTime(item.scheduled_at)}</Text>
                      </View>
                      <View style={[
                        styles.typeBadge,
                        { backgroundColor: item.is_emergency ? COLORS.urgencySoft : COLORS.subtle }
                      ]}>
                        <Ionicons
                          name={item.is_emergency ? 'warning-outline' : 'briefcase-outline'}
                          size={11}
                          color={item.is_emergency ? COLORS.urgency : COLORS.brandPrimary}
                        />
                        <Text style={[styles.typeText, { color: item.is_emergency ? COLORS.urgency : COLORS.brandPrimary }]}>
                          {item.is_emergency ? 'Urgence' : 'Mission'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.cardTitle}>{item.title}</Text>

                    {item.address ? (
                      <View style={styles.addrRow}>
                        <Ionicons name="location-outline" size={13} color={COLORS.textTertiary} />
                        <Text style={styles.addrText} numberOfLines={1}>{item.address}</Text>
                      </View>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <View style={styles.durationRow}>
                        <Ionicons name="hourglass-outline" size={13} color={COLORS.textTertiary} />
                        <Text style={styles.durationText}>{item.duration_minutes || 120} min estimées</Text>
                      </View>
                      {item.mission_id && (
                        <View style={styles.detailLink}>
                          <Text style={styles.detailLinkText}>Voir détail</Text>
                          <Ionicons name="chevron-forward" size={13} color={COLORS.brandPrimary} />
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  title: { ...FONTS.h2, color: COLORS.textPrimary },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  emptyTitle: { ...FONTS.h3, color: COLORS.textSecondary, textAlign: 'center' },
  emptyDesc: { ...FONTS.body, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.sm },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.xl, marginBottom: SPACING.md },
  dateHeader: { ...FONTS.caption, color: COLORS.textSecondary, flexShrink: 0 },
  dateLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  card: { flexDirection: 'row', backgroundColor: COLORS.paper, borderRadius: RADIUS.lg, marginBottom: SPACING.md, overflow: 'hidden', ...SHADOWS.card },
  colorBar: { width: 4 },
  cardContent: { flex: 1, padding: SPACING.lg },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTime: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  typeText: { ...FONTS.bodySmall, fontSize: 11, fontWeight: '600' },
  cardTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', marginBottom: SPACING.xs },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.xs },
  addrText: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontSize: 12, flex: 1 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.sm },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationText: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontSize: 12 },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  detailLinkText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontSize: 12, fontWeight: '600' },
});
