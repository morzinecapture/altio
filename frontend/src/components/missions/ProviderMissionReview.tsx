import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS } from '../../theme';
import { getMissionTypeLabel } from '../../utils/serviceLabels';
import { useAuth } from '../../auth';
import { useProviderDaySchedule } from '../../hooks/useMissions';
import MissionDayMap from './MissionDayMap';
import type { MergedMission, DayMission } from '../../types/api';

interface ProviderMissionReviewProps {
  mission: MergedMission;
  onAccept: () => void;
  onDecline: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Assignée',
  in_progress: 'En cours',
  completed: 'Terminée',
  pending_provider_approval: 'Proposition',
};

function formatDateFR(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ProviderMissionReview({ mission, onAccept, onDecline }: ProviderMissionReviewProps) {
  const { user } = useAuth();

  const scheduledDate = mission.scheduled_date
    ? mission.scheduled_date.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const { data: dayMissions = [], isLoading: scheduleLoading } = useProviderDaySchedule(
    user?.id || '',
    scheduledDate,
  );

  // Separate confirmed missions from the current one
  const confirmedMissions = dayMissions.filter(
    (m) => m.id !== mission.id && m.status !== 'pending_provider_approval',
  );

  // Build a DayMission representation of the current mission for the map
  const currentDayMission: DayMission = {
    id: mission.id,
    status: mission.status as string,
    scheduled_date: mission.scheduled_date || new Date().toISOString(),
    mission_type: mission.mission_type,
    property: mission.property_lat != null && mission.property_lng != null
      ? {
          id: mission.property_id,
          name: mission.property_name || 'Propriété',
          address: mission.property_address || '',
          latitude: mission.property_lat,
          longitude: mission.property_lng,
        }
      : {
          id: mission.property_id,
          name: mission.property_name || 'Propriété',
          address: mission.property_address || '',
          latitude: null,
          longitude: null,
        },
  };

  // All missions for timeline (insert current mission at correct position)
  const allForTimeline = [...dayMissions.filter((m) => m.id !== mission.id), currentDayMission]
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());

  const providerAmount = mission.fixed_rate
    ? Math.round(mission.fixed_rate * 0.9 * 100) / 100
    : null;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* A) Header */}
        <Text style={styles.headerTitle}>Mission proposée</Text>
        {mission.assigned_provider_name && (
          <Text style={styles.headerSub}>par {mission.assigned_provider_name}</Text>
        )}
        <View style={styles.typeBadge}>
          <Ionicons name="briefcase-outline" size={14} color={COLORS.brandPrimary} />
          <Text style={styles.typeBadgeText}>{getMissionTypeLabel(mission.mission_type)}</Text>
        </View>

        {/* B) Mission details */}
        <View style={styles.card}>
          {mission.property_address ? (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>{mission.property_address}</Text>
            </View>
          ) : null}

          {mission.scheduled_date ? (
            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>
                {formatDateFR(mission.scheduled_date)} à {formatTime(mission.scheduled_date)}
              </Text>
            </View>
          ) : null}

          {mission.description ? (
            <View style={styles.row}>
              <Ionicons name="document-text-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>{mission.description}</Text>
            </View>
          ) : null}

          {providerAmount != null && (
            <View style={styles.row}>
              <Ionicons name="cash-outline" size={16} color={COLORS.success} />
              <Text style={[styles.detailText, { color: COLORS.success, fontWeight: '700' }]}>
                Net perçu : {providerAmount.toFixed(2)} €
              </Text>
            </View>
          )}
        </View>

        {/* C) Day schedule */}
        <Text style={styles.sectionTitle}>
          Votre journée du {formatDateFR(mission.scheduled_date || new Date().toISOString())}
        </Text>

        {scheduleLoading ? (
          <ActivityIndicator size="small" color={COLORS.brandPrimary} style={{ marginVertical: SPACING.lg }} />
        ) : confirmedMissions.length === 0 ? (
          <View style={styles.emptyDay}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={styles.emptyDayText}>
              Aucune autre mission ce jour — vous êtes disponible !
            </Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {allForTimeline.map((m, idx) => {
              const isNew = m.id === mission.id;
              const isLast = idx === allForTimeline.length - 1;
              const statusLabel = STATUS_LABEL[m.status] || m.status;
              const statusColor = STATUS_COLORS[m.status] || STATUS_COLORS.pending;

              return (
                <View key={m.id} style={[styles.timelineItem, isNew && styles.timelineItemHighlight]}>
                  {/* Vertical line */}
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { backgroundColor: isNew ? COLORS.warning : COLORS.success }]} />
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>

                  {/* Content */}
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineTime}>
                      {formatTime(m.scheduled_date)}
                    </Text>
                    <Text style={styles.timelineProperty} numberOfLines={1}>
                      {m.property?.name || 'Propriété'}
                    </Text>
                    <View style={[styles.timelineStatusBadge, { backgroundColor: statusColor.bg }]}>
                      <Text style={[styles.timelineStatusText, { color: statusColor.text }]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* D) Mini-carte */}
        <Text style={styles.sectionTitle}>Localisation de vos missions</Text>
        <MissionDayMap
          confirmedMissions={confirmedMissions.map((m) => ({
            ...m,
            property: m.property
              ? {
                  id: m.property.id,
                  name: m.property.name,
                  address: m.property.address,
                  latitude: m.property.latitude,
                  longitude: m.property.longitude,
                }
              : null,
          }))}
          newMission={currentDayMission}
          height={200}
        />

        {/* Spacer for sticky buttons */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* E) Sticky buttons */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.8}>
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={styles.acceptBtnText}>Accepter la mission</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.8}>
          <Text style={styles.declineBtnText}>Décliner</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  headerTitle: {
    ...FONTS.h2,
    color: COLORS.textPrimary,
  },
  headerSub: {
    ...FONTS.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    marginTop: SPACING.md,
  },
  typeBadgeText: {
    ...FONTS.bodySmall,
    fontWeight: '700',
    color: COLORS.brandPrimary,
  },
  card: {
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginTop: SPACING.lg,
    gap: SPACING.md,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  detailText: {
    ...FONTS.body,
    color: COLORS.textPrimary,
    flex: 1,
  },
  sectionTitle: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
    marginTop: SPACING.xxl,
    marginBottom: SPACING.md,
  },
  emptyDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.successSoft,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  emptyDayText: {
    ...FONTS.body,
    color: COLORS.success,
    fontWeight: '600',
    flex: 1,
  },
  // Timeline
  timeline: {
    paddingLeft: SPACING.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  timelineItemHighlight: {
    backgroundColor: COLORS.warningSoft + '40',
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.border,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    marginLeft: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  timelineTime: {
    ...FONTS.bodySmall,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  timelineProperty: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  timelineStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginTop: SPACING.xs,
  },
  timelineStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Buttons
  buttonsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.brandPrimary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.xl,
    ...SHADOWS.card,
  },
  acceptBtnText: {
    ...FONTS.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  declineBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  declineBtnText: {
    ...FONTS.body,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
