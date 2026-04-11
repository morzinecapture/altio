import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUpcomingReservations } from '../../hooks/useProperties';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';
import type { UpcomingReservation } from '../../api/properties';

const SOURCE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  airbnb:  { bg: '#FCE7F3', color: '#DB2777', label: 'AIRBNB' },
  booking: { bg: '#F1F5F9', color: '#475569', label: 'BOOKING' },
  manual:  { bg: '#EFF6FF', color: '#3B82F6', label: 'MANUEL' },
};

function safeDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const dateStr = raw.length > 10 ? raw.substring(0, 10) : raw;
  const d = new Date(dateStr + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(iso: string | null | undefined): string {
  const d = safeDate(iso);
  if (!d) return 'Date inconnue';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function ReservationCard({ r }: { r: UpcomingReservation }) {
  const router = useRouter();
  const badge = SOURCE_BADGE[r.source || ''] || SOURCE_BADGE.manual;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/property/${r.property_id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.guestName}>{r.guest_name || 'Réservation'}</Text>
          <Text style={styles.propertyName}>{r.property_name || 'Logement'}</Text>
        </View>
        <View style={[styles.sourceBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.sourceBadgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.dates}>
          <Ionicons name="calendar-outline" size={14} color="#64748B" />
          <Text style={styles.dateText}>
            {formatDate(r.check_in)} → {formatDate(r.check_out)}
          </Text>
        </View>
        {r.has_mission ? (
          <View style={styles.missionOk}>
            <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
            <Text style={styles.missionOkText}>Ménage planifié</Text>
          </View>
        ) : (
          <View style={styles.missionWarn}>
            <Ionicons name="alert-circle" size={14} color="#D97706" />
            <Text style={styles.missionWarnText}>Pas de mission</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function UpcomingReservations() {
  const { data: reservations = [], isLoading } = useUpcomingReservations();

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prochaines réservations</Text>
        <ActivityIndicator color={COLORS.info} style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  if (reservations.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Prochaines réservations</Text>
      {reservations.map((r) => (
        <ReservationCard key={r.id} r={r} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xxl },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F', marginBottom: SPACING.lg },

  card: {
    backgroundColor: '#FFFFFF',
    padding: SPACING.lg,
    borderRadius: 16,
    marginBottom: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  guestName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#1E3A5F' },
  propertyName: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#94A3B8', marginTop: 2 },

  sourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sourceBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, letterSpacing: 0.5 },

  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dates: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: '#64748B' },

  missionOk: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  missionOkText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: '#16A34A' },
  missionWarn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  missionWarnText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: '#D97706' },
});
