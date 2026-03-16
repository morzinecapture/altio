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

  // Setup standard week dates
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [calendarDates, setCalendarDates] = useState<Date[]>([]);

  useEffect(() => {
    // Generate next 30 days
    const dates = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    setCalendarDates(dates);
    fetchSchedule();
  }, []);

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

  // Filter for selected date
  const selectedLabel = dateLabel(selectedDate.toISOString());
  const selectedItems = grouped[selectedLabel] || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Planning</Text>
        <TouchableOpacity onPress={fetchSchedule} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color="#1E3A5F" />
        </TouchableOpacity>
      </View>

      {/* Horizontal Calendar Ribbon */}
      <View style={styles.calendarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarScroll}>
          {calendarDates.map((date, index) => {
            const isSelected = selectedDate.getTime() === date.getTime();
            const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
            const dayNumber = date.getDate();
            return (
              <TouchableOpacity
                key={index}
                style={[styles.calendarDay, isSelected && styles.calendarDaySelected]}
                onPress={() => setSelectedDate(date)}
              >
                <Text style={[styles.calendarDayName, isSelected && styles.calendarDayNameSelected]}>
                  {dayName.toUpperCase()}
                </Text>
                <Text style={[styles.calendarDayNumber, isSelected && styles.calendarDayNumberSelected]}>
                  {dayNumber}
                </Text>
                {/* Visual dot if there is a mission this day */}
                {grouped[dateLabel(date.toISOString())] ? (
                  <View style={[styles.eventDot, isSelected && { backgroundColor: COLORS.textInverse }]} />
                ) : <View style={styles.eventDotPlaceholder} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        </View>
      ) : selectedItems.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={40} color={COLORS.brandPrimary} />
          </View>
          <Text style={styles.emptyTitle}>Rien de prévu le {selectedDate.toLocaleDateString('fr-FR')}</Text>
          <Text style={styles.emptyDesc}>Profitez de votre journée ou vérifiez les urgences disponibles.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brandPrimary} />}
        >
          <View style={styles.dateRow}>
            <Text style={styles.dateHeader}>{selectedLabel}</Text>
            <View style={styles.dateLine} />
          </View>

          {selectedItems.map((item) => (
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
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    backgroundColor: '#FFFFFF',
  },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F' },
  refreshBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.brandPrimary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.brandPrimary + '30' },
  emptyTitle: { ...FONTS.h2, color: COLORS.textPrimary, textAlign: 'center' },
  emptyDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.xxl, marginBottom: SPACING.lg },
  dateHeader: { ...FONTS.bodySmall, color: COLORS.textSecondary, flexShrink: 0, fontWeight: '600' },
  dateLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  card: { flexDirection: 'row', backgroundColor: COLORS.paper, borderRadius: RADIUS.xl, marginBottom: SPACING.md, overflow: 'hidden', ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  colorBar: { width: 6 },
  cardContent: { flex: 1, padding: SPACING.xl },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTime: { ...FONTS.h2, color: COLORS.textPrimary, fontSize: 18 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.full },
  typeText: { ...FONTS.bodySmall, fontSize: 11, fontWeight: '700' },
  cardTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', marginBottom: SPACING.sm, fontSize: 15 },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.xs },
  addrText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 13, flex: 1, fontWeight: '500' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.subtle },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationText: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 12 },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  detailLinkText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontSize: 12, fontWeight: '600' },
  calendarContainer: { backgroundColor: COLORS.background, paddingBottom: SPACING.md, paddingTop: SPACING.md },
  calendarScroll: { paddingHorizontal: SPACING.xl, gap: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
  calendarDay: { alignItems: 'center', paddingVertical: SPACING.md, width: 56, borderRadius: RADIUS.xl, backgroundColor: COLORS.paper, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  calendarDaySelected: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary, ...SHADOWS.float },
  calendarDayName: { ...FONTS.caption, color: COLORS.textSecondary, marginBottom: 4, fontWeight: '600' },
  calendarDayNameSelected: { color: COLORS.textInverse, opacity: 0.8 },
  calendarDayNumber: { ...FONTS.h2, color: COLORS.textPrimary },
  calendarDayNumberSelected: { color: COLORS.textInverse },
  eventDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.brandPrimary, marginTop: 6 },
  eventDotPlaceholder: { width: 5, height: 5, marginTop: 6 },
});
