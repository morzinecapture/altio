/**
 * PropertyCalendar — Agenda list of upcoming reservations for a property.
 * For each reservation, shows dates + platform + linked-mission status badge.
 * Tap on a reservation with a linked mission → navigates to /mission/[id].
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme';
import { usePropertyReservations } from '../hooks/useProperties';
import type { ReservationWithMission } from '../api/properties';

interface Props {
  propertyId: string;
  onCreateMission?: (reservation: ReservationWithMission) => void;
}

const MONTH_LABELS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function formatDateRange(checkIn: string, checkOut: string): string {
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  const sameMonth = ci.getMonth() === co.getMonth() && ci.getFullYear() === co.getFullYear();
  const ciStr = sameMonth
    ? String(ci.getDate())
    : ci.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const coStr = co.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${ciStr} → ${coStr}`;
}

function groupByMonth(reservations: ReservationWithMission[]): Array<{ key: string; label: string; items: ReservationWithMission[] }> {
  const groups = new Map<string, ReservationWithMission[]>();
  for (const r of reservations) {
    const d = new Date(r.check_in);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => {
      const [year, monthIdx] = key.split('-');
      return {
        key,
        label: `${MONTH_LABELS_FR[parseInt(monthIdx, 10)]} ${year}`,
        items,
      };
    });
}

export function PropertyCalendar({ propertyId, onCreateMission }: Props) {
  const router = useRouter();
  const { data: reservations = [], isLoading } = usePropertyReservations(propertyId);

  const todayISO = new Date().toISOString().slice(0, 10);
  const upcoming = reservations.filter((r) => r.check_out >= todayISO);
  const groups = groupByMonth(upcoming);

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color={COLORS.brandPrimary} />
      </View>
    );
  }

  if (upcoming.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="calendar-outline" size={32} color={COLORS.textTertiary} />
        <Text style={styles.emptyText}>Aucune réservation à venir</Text>
        <Text style={styles.emptyHint}>Synchronisez votre calendrier Airbnb/Booking pour les voir ici.</Text>
      </View>
    );
  }

  const handlePress = (r: ReservationWithMission) => {
    if (r.mission?.id) {
      router.push(`/mission/${r.mission.id}` as never);
    } else if (onCreateMission) {
      onCreateMission(r);
    }
  };

  return (
    <View>
      {groups.map((group) => (
        <View key={group.key} style={styles.monthBlock}>
          <Text style={styles.monthLabel}>{group.label}</Text>
          {group.items.map((r) => {
            const hasMission = !!r.mission?.id;
            const platformLabel =
              r.source === 'airbnb' ? 'Airbnb' : r.source === 'booking' ? 'Booking' : 'Manuel';
            return (
              <TouchableOpacity
                key={r.id}
                style={styles.row}
                onPress={() => handlePress(r)}
                activeOpacity={0.7}
              >
                <View style={styles.rowHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.guestName} numberOfLines={1}>
                      {r.guest_name || 'Réservation'}
                    </Text>
                    <Text style={styles.dates}>{formatDateRange(r.check_in, r.check_out)}</Text>
                  </View>
                  <View
                    style={[
                      styles.platformBadge,
                      r.source === 'airbnb'
                        ? styles.badgeAirbnb
                        : r.source === 'booking'
                        ? styles.badgeBooking
                        : styles.badgeManual,
                    ]}
                  >
                    <Text style={styles.platformText}>{platformLabel}</Text>
                  </View>
                </View>

                <View style={styles.statusRow}>
                  {hasMission ? (
                    <View style={[styles.statusBadge, styles.statusGreen]}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                      <Text style={[styles.statusText, { color: COLORS.success }]}>Ménage planifié</Text>
                    </View>
                  ) : (
                    <View style={styles.statusWrap}>
                      <View style={[styles.statusBadge, styles.statusOrange]}>
                        <Ionicons name="alert-circle" size={14} color={COLORS.warning} />
                        <Text style={[styles.statusText, { color: COLORS.warning }]}>Pas de mission</Text>
                      </View>
                      {onCreateMission && (
                        <TouchableOpacity
                          style={styles.createBtn}
                          onPress={() => onCreateMission(r)}
                        >
                          <Text style={styles.createBtnText}>Créer la mission</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  {hasMission && (
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: { paddingVertical: SPACING.xl, alignItems: 'center' },
  emptyBox: { paddingVertical: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
  emptyText: { ...FONTS.body, color: COLORS.textSecondary, fontWeight: '600' },
  emptyHint: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center' },
  monthBlock: { marginBottom: SPACING.lg },
  monthLabel: {
    ...FONTS.caption,
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    fontWeight: '700',
  },
  row: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  guestName: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },
  dates: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 2 },
  platformBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm },
  badgeAirbnb: { backgroundColor: '#FF585D20' },
  badgeBooking: { backgroundColor: '#003B9520' },
  badgeManual: { backgroundColor: COLORS.subtle },
  platformText: { ...FONTS.caption, fontWeight: '600', color: COLORS.textSecondary },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1, flexWrap: 'wrap' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  statusGreen: { backgroundColor: COLORS.successSoft },
  statusOrange: { backgroundColor: COLORS.warningSoft },
  statusText: { ...FONTS.caption, fontWeight: '600' },
  createBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.brandPrimary,
  },
  createBtnText: { ...FONTS.caption, color: COLORS.textInverse, fontWeight: '600' },
});
