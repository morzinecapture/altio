import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useProviderSchedule } from '../../src/hooks';
import type { ScheduleItem } from '../../src/types/api';
import { useTranslation } from 'react-i18next';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MONTH_CELL_SIZE = (SCREEN_WIDTH - SPACING.xl * 2) / 7;
const WEEK_DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const PLANNING_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  displacement_paid: { label: 'En route', color: '#3B82F6', icon: 'car-outline' },
  on_site: { label: 'Sur place', color: '#8B5CF6', icon: 'location' },
  in_progress: { label: 'En cours', color: '#F59E0B', icon: 'construct-outline' },
  quote_submitted: { label: 'Devis envoyé', color: '#6366F1', icon: 'document-text-outline' },
  quote_sent: { label: 'Devis envoyé', color: '#6366F1', icon: 'document-text-outline' },
  quote_accepted: { label: 'Travaux', color: '#F59E0B', icon: 'construct-outline' },
  completed: { label: 'Terminé', color: '#10B981', icon: 'checkmark-circle' },
  assigned: { label: 'Assigné', color: '#3B82F6', icon: 'person-outline' },
};

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

function dateLabel(iso: string, tFn?: (key: string) => string) {
  if (isToday(iso)) return tFn ? tFn('provider.planning.today') : "Aujourd'hui";
  if (isTomorrow(iso)) return tFn ? tFn('provider.planning.tomorrow') : 'Demain';
  return formatDate(iso);
}

function getItemColor(item: ScheduleItem): string {
  if (item.status === 'completed') return '#10B981';
  if (item.is_reservation) return '#F59E0B';
  if (item.is_emergency) return COLORS.urgency || '#EF4444';
  return COLORS.brandPrimary;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7; // Monday = 1
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: (Date | null)[] = [];
  // Days from previous month
  for (let i = startDow - 2; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    cells.push(d);
  }
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(new Date(year, month, i));
  }
  // Fill remaining cells
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      cells.push(new Date(year, month + 1, i));
    }
  }
  // Split into rows of 7
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function PlanningScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const { data: schedule = [], isLoading, refetch } = useProviderSchedule();

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');

  // Setup standard week dates
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [calendarDates, setCalendarDates] = useState<Date[]>([]);

  // Week view state
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  // Month view state
  const [monthYear, setMonthYear] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));

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
  }, []);

  // Group by date label (for day view)
  const grouped: Record<string, ScheduleItem[]> = {};
  schedule.forEach((item) => {
    const label = dateLabel(item.scheduled_at);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(item);
  });

  // Group by date key YYYY-MM-DD (for week/month views)
  const itemsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    schedule.forEach(item => {
      const dateKey = item.scheduled_at.slice(0, 10);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(item);
    });
    return map;
  }, [schedule]);

  // Filter for selected date
  const selectedLabel = dateLabel(selectedDate.toISOString());
  const selectedItems = grouped[selectedLabel] || [];

  // Week helpers
  const weekDates = useMemo(() => {
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [weekStart]);

  const weekSunday = weekDates[6];
  const weekLabel = `Semaine du ${weekStart.getDate()} au ${weekSunday.getDate()} ${weekSunday.toLocaleDateString('fr-FR', { month: 'long' })}`;

  // Month helpers
  const monthGrid = useMemo(() => getMonthGrid(monthYear.year, monthYear.month), [monthYear]);
  const monthLabel = new Date(monthYear.year, monthYear.month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const switchToDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    setViewMode('day');
  };

  // ─── Segmented control renderer ───
  const renderSegmentedControl = () => (
    <View style={segStyles.container}>
      {(['day', 'week', 'month'] as const).map((mode) => {
        const labels = { day: 'Jour', week: 'Semaine', month: 'Mois' };
        const active = viewMode === mode;
        return (
          <TouchableOpacity
            key={mode}
            style={[segStyles.btn, active && segStyles.btnActive]}
            onPress={() => setViewMode(mode)}
          >
            <Text style={[segStyles.btnText, active && segStyles.btnTextActive]}>{labels[mode]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ─── Day view (existing) ───
  const renderDayView = () => (
    <>
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
                {grouped[dateLabel(date.toISOString())] ? (
                  <View style={[
                    styles.eventDot,
                    isSelected && { backgroundColor: COLORS.textInverse },
                    !isSelected && grouped[dateLabel(date.toISOString())]?.some((i) => i.is_reservation) && { backgroundColor: '#F59E0B' },
                  ]} />
                ) : <View style={styles.eventDotPlaceholder} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        </View>
      ) : selectedItems.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="calendar-outline" size={40} color={COLORS.brandPrimary} />
          </View>
          <Text style={styles.emptyTitle}>{t('provider.planning.nothing_planned', { date: selectedDate.toLocaleDateString('fr-FR') })}</Text>
          <Text style={styles.emptyDesc}>{t('provider.planning.nothing_planned_sub')}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={COLORS.brandPrimary} />}
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
              <View style={[styles.colorBar, {
                backgroundColor: item.is_reservation
                  ? '#F59E0B'
                  : item.status === 'completed' ? '#10B981'
                  : item.is_emergency ? COLORS.urgency : COLORS.brandPrimary
              }]} />
              <View style={styles.cardContent}>
                <View style={styles.cardTop}>
                  <View style={styles.timeWrap}>
                    <Ionicons name="time-outline" size={14} color={COLORS.textTertiary} />
                    <Text style={styles.cardTime}>{formatTime(item.scheduled_at)}</Text>
                  </View>
                  <View style={[
                    styles.typeBadge,
                    {
                      backgroundColor: item.is_reservation
                        ? '#FEF3C7'
                        : item.is_emergency ? COLORS.urgencySoft : COLORS.subtle
                    }
                  ]}>
                    <Ionicons
                      name={item.is_reservation ? 'log-out-outline' : item.is_emergency ? 'warning-outline' : 'briefcase-outline'}
                      size={11}
                      color={item.is_reservation ? '#D97706' : item.is_emergency ? COLORS.urgency : COLORS.brandPrimary}
                    />
                    <Text style={[styles.typeText, {
                      color: item.is_reservation ? '#D97706' : item.is_emergency ? COLORS.urgency : COLORS.brandPrimary
                    }]}>
                      {item.is_reservation ? (item.source === 'airbnb' ? 'Airbnb' : item.source === 'booking' ? 'Booking' : t('provider.planning.checkout')) : item.is_emergency ? t('provider.planning.emergency') : t('provider.planning.mission')}
                    </Text>
                  </View>
                </View>

                {item.status && PLANNING_STATUS[item.status] && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PLANNING_STATUS[item.status].color + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 6 }}>
                    <Ionicons name={PLANNING_STATUS[item.status].icon as any} size={12} color={PLANNING_STATUS[item.status].color} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: PLANNING_STATUS[item.status].color }}>{PLANNING_STATUS[item.status].label}</Text>
                  </View>
                )}

                <Text style={styles.cardTitle}>{item.title}</Text>

                {item.address ? (
                  <View style={styles.addrRow}>
                    <Ionicons name="location-outline" size={13} color={COLORS.textTertiary} />
                    <Text style={styles.addrText} numberOfLines={1}>{item.address}</Text>
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  {item.is_reservation ? (
                    <View style={styles.durationRow}>
                      <Ionicons name="calendar-outline" size={13} color={COLORS.textTertiary} />
                      <Text style={styles.durationText}>{t('provider.planning.guest_departure')}</Text>
                    </View>
                  ) : (
                    <View style={styles.durationRow}>
                      <Ionicons name={item.scheduled_at ? 'time-outline' : 'hourglass-outline'} size={13} color={COLORS.textTertiary} />
                      <Text style={styles.durationText}>
                        {item.scheduled_at
                          ? `Service prévu à ${formatTime(item.scheduled_at)}`
                          : t('provider.planning.estimated_min', { count: item.duration_minutes || 120 })}
                      </Text>
                    </View>
                  )}
                  {item.mission_id && (
                    <View style={styles.detailLink}>
                      <Text style={styles.detailLinkText}>{t('provider.planning.see_detail')}</Text>
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
    </>
  );

  // ─── Week view ───
  const renderWeekView = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: SPACING.xxxl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={COLORS.brandPrimary} />}
    >
      {/* Week navigation */}
      <View style={weekStyles.navRow}>
        <TouchableOpacity onPress={() => {
          const prev = new Date(weekStart);
          prev.setDate(prev.getDate() - 7);
          setWeekStart(prev);
        }} style={weekStyles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={COLORS.brandPrimary} />
        </TouchableOpacity>
        <Text style={weekStyles.navLabel}>{weekLabel}</Text>
        <TouchableOpacity onPress={() => {
          const next = new Date(weekStart);
          next.setDate(next.getDate() + 7);
          setWeekStart(next);
        }} style={weekStyles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.brandPrimary} />
        </TouchableOpacity>
      </View>

      {/* Week grid */}
      <View style={weekStyles.grid}>
        {weekDates.map((date, i) => {
          const key = toDateKey(date);
          const items = itemsByDate.get(key) || [];
          const isT = isSameDay(date, today);
          const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase();
          return (
            <TouchableOpacity key={i} style={weekStyles.column} onPress={() => switchToDay(date)} activeOpacity={0.7}>
              <Text style={[weekStyles.colDayName, isT && { color: COLORS.brandPrimary, fontWeight: '800' }]}>{dayName}</Text>
              <View style={[weekStyles.colDayCircle, isT && { backgroundColor: COLORS.brandPrimary }]}>
                <Text style={[weekStyles.colDayNum, isT && { color: '#FFF' }]}>{date.getDate()}</Text>
              </View>
              <View style={weekStyles.colItems}>
                {items.slice(0, 4).map((item) => (
                  <View key={item.id} style={[weekStyles.itemBlock, { borderLeftColor: getItemColor(item) }]}>
                    <Text style={weekStyles.itemTime}>{formatTime(item.scheduled_at)}</Text>
                    <Text style={weekStyles.itemTitle} numberOfLines={1}>{item.title}</Text>
                  </View>
                ))}
                {items.length > 4 && (
                  <Text style={weekStyles.moreText}>+{items.length - 4}</Text>
                )}
                {items.length === 0 && (
                  <Text style={weekStyles.emptyCol}>—</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  // ─── Month view ───
  const renderMonthView = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: SPACING.xxxl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={COLORS.brandPrimary} />}
    >
      {/* Month navigation */}
      <View style={monthStyles.navRow}>
        <TouchableOpacity onPress={() => {
          setMonthYear(prev => {
            const m = prev.month - 1;
            return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m };
          });
        }} style={monthStyles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={COLORS.brandPrimary} />
        </TouchableOpacity>
        <Text style={monthStyles.navLabel}>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</Text>
        <TouchableOpacity onPress={() => {
          setMonthYear(prev => {
            const m = prev.month + 1;
            return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m };
          });
        }} style={monthStyles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.brandPrimary} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={monthStyles.headerRow}>
        {WEEK_DAY_HEADERS.map((d, i) => (
          <View key={i} style={monthStyles.headerCell}>
            <Text style={monthStyles.headerText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Month grid */}
      {monthGrid.map((row, ri) => (
        <View key={ri} style={monthStyles.gridRow}>
          {row.map((date, ci) => {
            if (!date) return <View key={ci} style={monthStyles.cell} />;
            const isCurrentMonth = date.getMonth() === monthYear.month;
            const isT = isSameDay(date, today);
            const key = toDateKey(date);
            const items = itemsByDate.get(key) || [];

            // Unique colors for dots (max 3)
            const dotColors: string[] = [];
            for (const item of items) {
              const c = getItemColor(item);
              if (!dotColors.includes(c)) dotColors.push(c);
              if (dotColors.length >= 3) break;
            }

            return (
              <TouchableOpacity
                key={ci}
                style={monthStyles.cell}
                onPress={() => switchToDay(date)}
                activeOpacity={0.7}
              >
                <View style={[monthStyles.dayCircle, isT && { backgroundColor: COLORS.brandPrimary }]}>
                  <Text style={[
                    monthStyles.dayNum,
                    !isCurrentMonth && { color: COLORS.textTertiary, opacity: 0.4 },
                    isT && { color: '#FFF', fontWeight: '800' },
                  ]}>
                    {date.getDate()}
                  </Text>
                </View>
                {items.length > 0 && (
                  <View style={monthStyles.dotsRow}>
                    {dotColors.map((c, di) => (
                      <View key={di} style={[monthStyles.dot, { backgroundColor: c }]} />
                    ))}
                    {items.length > 1 && (
                      <Text style={monthStyles.countText}>{items.length}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('provider.planning.title')}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color="#1E3A5F" />
        </TouchableOpacity>
      </View>

      {renderSegmentedControl()}

      {viewMode === 'day' && renderDayView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'month' && renderMonthView()}
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

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.xl,
    padding: 3,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.xl - 2,
    alignItems: 'center',
  },
  btnActive: {
    backgroundColor: COLORS.brandPrimary,
    ...SHADOWS.card,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  btnTextActive: {
    color: '#FFFFFF',
  },
});

const weekStyles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navLabel: {
    ...FONTS.bodySmall,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontSize: 14,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.sm,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    minHeight: 200,
  },
  colDayName: {
    ...FONTS.caption,
    color: COLORS.textTertiary,
    fontWeight: '600',
    marginBottom: 4,
    fontSize: 10,
  },
  colDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  colDayNum: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  colItems: {
    width: '100%',
    paddingHorizontal: 2,
    gap: 4,
  },
  itemBlock: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.brandPrimary,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  itemTime: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textTertiary,
  },
  itemTitle: {
    fontSize: 9,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  moreText: {
    fontSize: 9,
    color: COLORS.brandPrimary,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  emptyCol: {
    fontSize: 11,
    color: COLORS.textTertiary,
    textAlign: 'center',
    opacity: 0.4,
    marginTop: 4,
  },
});

const monthStyles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navLabel: {
    ...FONTS.h2,
    color: COLORS.textPrimary,
    fontSize: 17,
  },
  headerRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  headerCell: {
    width: MONTH_CELL_SIZE,
    alignItems: 'center',
  },
  headerText: {
    ...FONTS.caption,
    color: COLORS.textTertiary,
    fontWeight: '700',
    fontSize: 12,
  },
  gridRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
  },
  cell: {
    width: MONTH_CELL_SIZE,
    height: MONTH_CELL_SIZE + 8,
    alignItems: 'center',
    paddingTop: 4,
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNum: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  countText: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.textTertiary,
    marginLeft: 1,
  },
});
