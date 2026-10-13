import { StatusBadge } from '../../src/components/ui';
import { PageHeader } from '../../src/components/alpine/AlpineHeader';
import { useTranslation } from 'react-i18next';
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Modal, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { RADIUS, COLORS, SPACING, SHADOWS } from '../../src/theme';
import { useProperties, useMonthReservations, useMissions } from '../../src/hooks';
import { useReservationActions } from '../../src/hooks/useReservationActions';
import { getFavoriteProviders } from '../../src/api/partners';
import type { MonthReservation, ReservationMissionStatus, ReservationWithMission } from '../../src/api/properties';
import { localDateKey, isUrgentMission } from '../../src/utils/missionPresentation';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';

// ── Constants ────────────────────────────────────────────────────────────────

const EVENT_COLORS = {
  checkIn:      { bg: '#FFFFFF', text: '#2563EB', dot: '#2563EB' },
  checkOut:     { bg: '#FFFFFF', text: '#EF4444', dot: '#EF4444' },
  cleanOk:      { bg: '#FFFFFF', text: '#059669', dot: '#10B981' },
  cleanMissing: { bg: '#FFFFFF', text: '#D97706', dot: '#F59E0B' },
  mission:      { bg: '#FFFFFF', text: '#16233A', dot: '#16233A' },
} as const;

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];


// ── Types ────────────────────────────────────────────────────────────────────

interface PlanningEvent {
  key: string;
  date: string;          // YYYY-MM-DD
  type: 'check_in' | 'check_out' | 'cleaning_ok' | 'cleaning_missing' | 'direct_mission';
  title: string;
  subtitle: string;
  reservationId: string;
  propertyId: string;
  propertyName: string;
  guestName: string;
  source: string | null;
  checkIn: string;
  checkOut: string;
  missionId?: string | null;
  missionStatus?: string | null;
  missionProviderName?: string | null;
  isEmergency?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildEvents(reservations: MonthReservation[]): PlanningEvent[] {
  const events: PlanningEvent[] = [];

  for (const r of reservations) {
    const propLabel = r.property_name || 'Logement';
    const guestLabel = r.guest_name || 'Voyageur';
    const srcLabel = r.source ? ` (${r.source.toUpperCase()})` : '';

    const base = {
      reservationId: r.id,
      propertyId: r.property_id,
      propertyName: propLabel,
      guestName: guestLabel,
      source: r.source,
      checkIn: r.check_in,
      checkOut: r.check_out,
    };

    // Check-in
    events.push({
      ...base,
      key: `in-${r.id}`,
      date: r.check_in,
      type: 'check_in',
      title: `${guestLabel} arrive`,
      subtitle: `${propLabel}${srcLabel}`,
    });

    // Check-out
    events.push({
      ...base,
      key: `out-${r.id}`,
      date: r.check_out,
      type: 'check_out',
      title: `${guestLabel} part`,
      subtitle: propLabel,
    });

    // Cleaning mission (on check_out date)
    if (r.mission_id) {
      const provLabel = r.mission_provider_name || 'prestataire';
      events.push({
        ...base,
        key: `clean-${r.id}`,
        date: r.check_out,
        type: 'cleaning_ok',
        title: `Ménage — ${provLabel}`,
        subtitle: propLabel,
        missionId: r.mission_id,
        missionStatus: r.mission_status,
        missionProviderName: r.mission_provider_name,
      });
    } else {
      events.push({
        ...base,
        key: `noclean-${r.id}`,
        date: r.check_out,
        type: 'cleaning_missing',
        title: 'Pas de ménage prévu',
        subtitle: `après le départ de ${guestLabel}`,
      });
    }
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const order: Record<string, number> = { check_in: 0, check_out: 1, cleaning_ok: 2, cleaning_missing: 3, direct_mission: 4 };
    return (order[a.type] ?? 9) - (order[b.type] ?? 9);
  });

  return events;
}

function buildDirectMissionEvents(missions: {
  mission_id?: string; id?: string; scheduled_date?: string | null;
  status: string; mission_type?: string; property_name?: string;
  property_id?: string; assigned_provider_name?: string; services?: string[]; is_emergency?: boolean; priority?: 'normal' | 'urgent'; raw_status?: string;
}[]): PlanningEvent[] {
  return missions
    .filter((m) => !!m.scheduled_date)
    .map((m) => {
      const mId = (m.mission_id ?? m.id) as string;
      const date = localDateKey(new Date(m.scheduled_date as string));
      const timeStr = (m.scheduled_date as string).length > 10
        ? new Date(m.scheduled_date as string).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '';
      const typeLabel = m.mission_type ? getMissionTypeLabel(m.mission_type, m.services) : 'Mission';
      return {
        key: `dmission-${mId}`,
        date,
        type: 'direct_mission' as const,
        title: `${isUrgentMission(m) ? 'Urgente · ' : ''}${typeLabel}${m.property_name ? ` — ${m.property_name}` : ''}`,
        subtitle: timeStr,
        reservationId: mId,
        propertyId: m.property_id || '',
        propertyName: m.property_name || '',
        guestName: m.assigned_provider_name || '',
        source: null,
        checkIn: date,
        checkOut: date,
        missionId: mId,
        missionStatus: m.raw_status || m.status,
        isEmergency: m.is_emergency,
        missionProviderName: m.assigned_provider_name || null,
      };
    });
}

function safeDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const dateStr = raw.length > 10 ? raw.substring(0, 10) : raw;
  const d = new Date(dateStr + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function groupByDate(events: PlanningEvent[]): { date: string; label: string; events: PlanningEvent[] }[] {
  const map = new Map<string, PlanningEvent[]>();
  for (const e of events) {
    const arr = map.get(e.date) || [];
    arr.push(e);
    map.set(e.date, arr);
  }

  return Array.from(map.entries()).map(([date, evts]) => {
    const d = safeDate(date);
    if (!d) {
      return { date, label: 'Date inconnue', events: evts };
    }
    const dayName = d.toLocaleDateString('fr-FR', { weekday: 'long' });
    const dayNum = d.getDate();
    const monthName = d.toLocaleDateString('fr-FR', { month: 'long' });
    return {
      date,
      label: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum} ${monthName}`,
      events: evts,
    };
  });
}


// ── Component ────────────────────────────────────────────────────────────────

export default function PlanningScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(undefined);
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [showFavoritePicker, setShowFavoritePicker] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<PlanningEvent | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: properties = [] } = useProperties();
  const { data: reservations = [], isLoading, refetch } = useMonthReservations(year, month, selectedPropertyId);
  const { data: allMissions = [] } = useMissions();
  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: getFavoriteProviders,
  });
  const { createCleaningMission, sendToFavorite, publishToNetwork } = useReservationActions();

  const missingCleaningReservations = useMemo(
    () => reservations.filter((r) => !r.mission_id),
    [reservations],
  );

  // Missions directes du mois (sans réservation iCal liée)
  const directMissions = useMemo(() => {
    const reservationMissionIds = new Set(reservations.map((r) => r.mission_id).filter(Boolean));
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
    return allMissions.filter((m) => {
      if (!m.scheduled_date) return false;
      const d = new Date(m.scheduled_date);
      if (d < monthStart || d > monthEnd) return false;
      if (['cancelled', 'expired', 'rejected', 'refunded'].includes(m.status)) return false;
      if (reservationMissionIds.has(m.mission_id ?? m.id)) return false;
      if (selectedPropertyId && m.property_id !== selectedPropertyId) return false;
      return true;
    });
  }, [allMissions, reservations, year, month, selectedPropertyId]);

  // Événements fusionnés : réservations iCal + missions directes, triés par date
  const events = useMemo(() => {
    const resEvents = buildEvents(reservations);
    const missionEvents = buildDirectMissionEvents(directMissions);
    return [...resEvents, ...missionEvents].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const order: Record<string, number> = { check_in: 0, check_out: 1, cleaning_ok: 2, direct_mission: 3, cleaning_missing: 4 };
      return (order[a.type] ?? 9) - (order[b.type] ?? 9);
    });
  }, [reservations, directMissions]);

  const days = useMemo(() => groupByDate(events), [events]);
  const plannedCount = reservations.length - missingCleaningReservations.length;
  const progressPct = reservations.length > 0 ? (plannedCount / reservations.length) * 100 : 100;

  const selectedPropertyName = selectedPropertyId
    ? properties.find((p) => p.id === selectedPropertyId)?.name || 'Logement'
    : 'Tous les logements';

  // Month navigation
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const eventStyle = (type: PlanningEvent['type']) => {
    switch (type) {
      case 'check_in': return EVENT_COLORS.checkIn;
      case 'check_out': return EVENT_COLORS.checkOut;
      case 'cleaning_ok': return EVENT_COLORS.cleanOk;
      case 'cleaning_missing': return EVENT_COLORS.cleanMissing;
      case 'direct_mission': return EVENT_COLORS.mission;
    }
  };

  const eventIcon = (type: PlanningEvent['type']): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'check_in': return 'log-in-outline';
      case 'check_out': return 'log-out-outline';
      case 'cleaning_ok': return 'checkmark-circle';
      case 'cleaning_missing': return 'alert-circle';
      case 'direct_mission': return 'briefcase-outline';
    }
  };

  // ── Property lookup helper ──────────────────────────────────────────────
  const getPropertyInfo = (propertyId: string) => {
    const p = properties.find((prop) => prop.id === propertyId);
    return {
      id: propertyId,
      name: p?.name || '',
      fixed_rate: p?.fixed_rate ?? null,
      address: p?.address || '',
    };
  };

  // ── Action helpers (adapt MonthReservation → hook types) ────────────────
  const toReservationWithMission = (r: MonthReservation | PlanningEvent): ReservationWithMission => ({
    id: 'reservationId' in r ? r.reservationId : r.id,
    property_id: 'propertyId' in r ? r.propertyId : r.property_id,
    guest_name: 'guestName' in r ? r.guestName : r.guest_name,
    check_in: 'checkIn' in r ? r.checkIn : r.check_in,
    check_out: 'checkOut' in r ? r.checkOut : r.check_out,
    source: r.source,
    mission: null,
  });

  const toReservationMissionStatus = (r: MonthReservation | PlanningEvent): ReservationMissionStatus => ({
    id: 'reservationId' in r ? r.reservationId : r.id,
    property_id: 'propertyId' in r ? r.propertyId : r.property_id,
    guest_name: ('guestName' in r ? r.guestName : r.guest_name) || null,
    check_in: 'checkIn' in r ? r.checkIn : r.check_in,
    check_out: 'checkOut' in r ? r.checkOut : r.check_out,
    source: r.source || null,
    has_mission: false,
    mission_id: null,
    mission_provider_name: null,
  });

  const handleCreateAuto = async (r: MonthReservation | PlanningEvent) => {
    const propId = 'propertyId' in r ? r.propertyId : r.property_id;
    const key = 'reservationId' in r ? r.reservationId : r.id;
    setActionLoading(`auto-${key}`);
    try {
      await createCleaningMission(toReservationWithMission(r), getPropertyInfo(propId));
      refetch();
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublishNetwork = async (r: MonthReservation | PlanningEvent) => {
    const propId = 'propertyId' in r ? r.propertyId : r.property_id;
    const key = 'reservationId' in r ? r.reservationId : r.id;
    setActionLoading(`network-${key}`);
    try {
      await publishToNetwork(toReservationMissionStatus(r), getPropertyInfo(propId));
      refetch();
    } finally {
      setActionLoading(null);
    }
  };

  const openFavoritePicker = (evt: PlanningEvent) => {
    if (favorites.length === 0) {
      Alert.alert('Aucun favori', 'Ajoutez d\'abord un prestataire favori depuis votre profil.');
      return;
    }
    setSelectedEvent(evt);
    setShowFavoritePicker(true);
  };

  const openFavoritePickerForReservation = (r: MonthReservation) => {
    if (favorites.length === 0) {
      Alert.alert('Aucun favori', 'Ajoutez d\'abord un prestataire favori depuis votre profil.');
      return;
    }
    // Build a synthetic PlanningEvent to reuse the same picker
    setSelectedEvent({
      key: `pick-${r.id}`,
      date: r.check_out,
      type: 'cleaning_missing',
      title: '',
      subtitle: '',
      reservationId: r.id,
      propertyId: r.property_id,
      propertyName: r.property_name || 'Logement',
      guestName: r.guest_name || 'Voyageur',
      source: r.source,
      checkIn: r.check_in,
      checkOut: r.check_out,
    });
    setShowFavoritePicker(true);
  };

  const handleSendToFav = async (favoriteProviderId: string, favoriteProviderName: string) => {
    if (!selectedEvent) return;
    setActionLoading(`fav-${selectedEvent.reservationId}`);
    try {
      await sendToFavorite(
        toReservationMissionStatus(selectedEvent),
        getPropertyInfo(selectedEvent.propertyId),
        favoriteProviderId,
        favoriteProviderName,
      );
      setShowFavoritePicker(false);
      setSelectedEvent(null);
      refetch();
    } finally {
      setActionLoading(null);
    }
  };

  // ── Source badge helper ──────────────────────────────────────────────────
  const sourceBadge = (source: string | null) => {
    if (!source) return null;
    const color = source === 'airbnb' ? '#FF585D' : source === 'booking' ? '#003B95' : COLORS.textSecondary;
    const label = source === 'airbnb' ? 'AIRBNB' : source === 'booking' ? 'BOOKING' : source.toUpperCase();
    return (
      <View style={[s.sourceBadge, { backgroundColor: color }]}>
        <Text style={s.sourceBadgeText}>{label}</Text>
      </View>
    );
  };

  // ── Render action buttons for a reservation/event ───────────────────────
  const renderActionButtons = (r: MonthReservation | PlanningEvent) => {
    const key = 'reservationId' in r ? r.reservationId : r.id;
    return (
      <View style={s.actionRow}>
        <TouchableOpacity
          style={s.actionBtnFav}
          disabled={actionLoading !== null}
          onPress={() => 'reservationId' in r ? openFavoritePicker(r as PlanningEvent) : openFavoritePickerForReservation(r as MonthReservation)}
        >
          <Ionicons name="star" size={14} color={COLORS.brandPrimary} />
          <Text style={s.actionBtnFavText}>Favori</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.actionBtnNetwork}
          disabled={actionLoading !== null}
          onPress={() => handlePublishNetwork(r)}
        >
          {actionLoading === `network-${key}` ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="globe-outline" size={14} color="#FFFFFF" />
              <Text style={s.actionBtnNetworkText}>Réseau</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={s.actionBtnAuto}
          disabled={actionLoading !== null}
          onPress={() => handleCreateAuto(r)}
        >
          {actionLoading === `auto-${key}` ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={14} color="#FFFFFF" />
              <Text style={s.actionBtnAutoText}>Auto</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <PageHeader title={t('alpine.planning')} subtitle={t('alpine.planningSubtitle')} />
      <View style={s.planningHero}>
        <View style={s.monthSelector}>
          <TouchableOpacity onPress={prevMonth} style={s.monthArrow}>
            <Ionicons name="chevron-back" size={21} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={s.monthArrow}>
            <Ionicons name="chevron-forward" size={21} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Property filter */}
      <TouchableOpacity style={s.propertyFilter} onPress={() => setShowPropertyPicker(true)}>
        <Ionicons name="home-outline" size={16} color="#FFFFFF" />
        <Text style={s.propertyFilterText} numberOfLines={1}>{selectedPropertyName}</Text>
        <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Content */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.info} />
        </View>
      ) : (
        <ScrollView
          style={s.scrollView}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
        >
          {/* ── Section A: Actions requises ─────────────────────────────── */}
          <View style={s.sectionContainer}>
            {missingCleaningReservations.length > 0 && (<View style={s.sectionHeader}>
              <Ionicons name="warning" size={18} color={missingCleaningReservations.length > 0 ? '#F59E0B' : COLORS.success} />
              <Text style={s.sectionTitle}>
                {missingCleaningReservations.length > 0 ? 'Actions requises' : t('alpine.yourDay')}
              </Text>
            </View>)}

            {missingCleaningReservations.length > 0 ? (
              missingCleaningReservations.map((r) => {
                const checkIn = new Date(r.check_in + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                const checkOut = new Date(r.check_out + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                return (
                  <View key={r.id} style={s.actionCard}>
                    <View style={s.actionCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.actionCardGuest}>{r.guest_name || 'Voyageur'}</Text>
                        <Text style={s.actionCardProp}>{r.property_name || 'Logement'}</Text>
                      </View>
                      {sourceBadge(r.source)}
                    </View>
                    <View style={s.actionCardDates}>
                      <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                      <Text style={s.actionCardDatesText}>{checkIn} → {checkOut}</Text>
                    </View>
                    {renderActionButtons(r)}
                  </View>
                );
              })
            ) : (
              <View style={s.allPlannedBanner}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={s.allPlannedText}>Tous les ménages sont planifiés ce mois-ci</Text>
              </View>
            )}
          </View>

          {/* ── Section B: Planning du mois (réservations + missions directes) ── */}
          <View style={s.sectionContainer}>
            <View style={s.sectionHeader}>
              <Ionicons name="calendar" size={18} color={COLORS.brandPrimary} />
              <Text style={s.sectionTitle}>Planning du mois</Text>
            </View>

            {days.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="calendar-outline" size={56} color="#CBD5E1" />
                <Text style={s.emptyTitle}>Aucun événement ce mois-ci</Text>
                <Text style={s.emptySub}>Vos missions planifiées et réservations iCal apparaîtront ici.</Text>
              </View>
            ) : (
              days.map((day) => (
                <View key={day.date} style={s.dayGroup}>
                  <Text style={s.dayLabel}>{day.label}</Text>
                  {day.events.map((evt) => {
                    const colors = eventStyle(evt.type);
                    const isDirect = evt.type === 'direct_mission';
                    const isMissing = evt.type === 'cleaning_missing';
                    return (
                      <View key={evt.key} style={[s.eventCard, { backgroundColor: colors.bg, borderLeftColor: colors.dot }]}>
                        <TouchableOpacity
                          style={s.eventRow}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (evt.missionId) {
                              router.push(evt.isEmergency ? `/emergency?id=${evt.missionId}` : `/mission/${evt.missionId}`);
                            } else if (!isMissing) {
                              router.push(`/property/${evt.propertyId}`);
                            }
                          }}
                          disabled={isMissing}
                        >
                          <Ionicons name={eventIcon(evt.type)} size={18} color={colors.text} />
                          <View style={s.eventContent}>
                            <Text style={[s.eventTitle, { color: colors.text }]}>
                              {isMissing ? 'Pas de ménage prévu' : evt.title}
                            </Text>
                            <Text style={s.eventSub}>
                              {isMissing ? evt.propertyName : evt.subtitle}
                            </Text>
                          </View>
                          {((evt.type === 'cleaning_ok' && evt.missionId) || isDirect) && (
                            <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
                          )}
                        </TouchableOpacity>
                        {(evt.type === 'cleaning_ok' || isDirect) && evt.missionStatus && <StatusBadge emergency={evt.isEmergency} status={evt.missionStatus} size="sm" style={{ marginTop: SPACING.sm, marginLeft: SPACING.xxxl }} />}
                        {isMissing && renderActionButtons(evt)}
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>

          {/* ── Section D: Résumé ───────────────────────────────────────── */}
          {reservations.length > 0 && (
            <View style={s.sectionContainer}>
              <View style={s.sectionHeader}>
                <Ionicons name="stats-chart" size={18} color={COLORS.brandPrimary} />
                <Text style={s.sectionTitle}>Résumé</Text>
              </View>
              <View style={s.summaryCard}>
                <View style={s.summaryRow}>
                  <View style={s.summaryItem}>
                    <Text style={s.summaryNumber}>{reservations.length}</Text>
                    <Text style={s.summaryLabel}>Réservations</Text>
                  </View>
                  <View style={s.summaryItem}>
                    <Text style={[s.summaryNumber, { color: COLORS.success }]}>{plannedCount}</Text>
                    <Text style={s.summaryLabel}>Planifiés</Text>
                  </View>
                  <View style={s.summaryItem}>
                    <Text style={[s.summaryNumber, { color: missingCleaningReservations.length > 0 ? '#F59E0B' : COLORS.success }]}>
                      {missingCleaningReservations.length}
                    </Text>
                    <Text style={s.summaryLabel}>Manquants</Text>
                  </View>
                </View>
                <View style={s.progressBarBg}>
                  <View style={[s.progressBarFill, { width: `${progressPct}%` }]} />
                </View>
                <Text style={s.progressLabel}>
                  {plannedCount}/{reservations.length} ménages planifiés
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Property picker modal */}
      <Modal visible={showPropertyPicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Filtrer par logement</Text>
              <TouchableOpacity onPress={() => setShowPropertyPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[s.pickerItem, !selectedPropertyId && s.pickerItemActive]}
              onPress={() => { setSelectedPropertyId(undefined); setShowPropertyPicker(false); }}
            >
              <Text style={[s.pickerItemText, !selectedPropertyId && s.pickerItemTextActive]}>
                Tous les logements
              </Text>
              {!selectedPropertyId && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
            </TouchableOpacity>
            <FlatList
              data={properties}
              keyExtractor={(p) => p.id}
              renderItem={({ item: p }) => (
                <TouchableOpacity
                  style={[s.pickerItem, selectedPropertyId === p.id && s.pickerItemActive]}
                  onPress={() => { setSelectedPropertyId(p.id); setShowPropertyPicker(false); }}
                >
                  <Text style={[s.pickerItemText, selectedPropertyId === p.id && s.pickerItemTextActive]}>
                    {p.name}
                  </Text>
                  {selectedPropertyId === p.id && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Favorite picker modal */}
      <Modal visible={showFavoritePicker} animationType="slide" transparent onRequestClose={() => setShowFavoritePicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: '70%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Choisir un prestataire favori</Text>
              <TouchableOpacity onPress={() => { setShowFavoritePicker(false); setSelectedEvent(null); }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {selectedEvent && (
              <Text style={s.modalSubtitle}>
                Ménage le {new Date(selectedEvent.checkOut + 'T12:00:00').toLocaleDateString('fr-FR')} — {selectedEvent.guestName}
              </Text>
            )}
            {actionLoading?.startsWith('fav-') ? (
              <ActivityIndicator size="large" color={COLORS.brandPrimary} style={{ marginVertical: SPACING.xl }} />
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {favorites.map((fav: any) => {
                  const provName = fav.provider?.name || 'Prestataire';
                  const rating = fav.provider?.profile?.rating;
                  const reviews = fav.provider?.profile?.total_reviews;
                  return (
                    <TouchableOpacity
                      key={fav.id}
                      style={s.favoriteItem}
                      onPress={() => handleSendToFav(fav.provider_id, provName)}
                    >
                      <View style={s.favoriteAvatar}>
                        <Ionicons name="person" size={20} color={COLORS.brandPrimary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.favoriteName}>{provName}</Text>
                        {rating != null && reviews != null && reviews > 0 && (
                          <Text style={s.favoriteRating}>{rating.toFixed(1)} ({reviews} avis)</Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },

  planningHero: { backgroundColor: COLORS.paper, paddingBottom: SPACING.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.sm,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
  },
  headerCopy: { alignItems: 'center' },
  headerEyebrow: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 8, letterSpacing: 1, color: '#FFFFFF', opacity: 0.7 },
  headerTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 24, color: '#FFFFFF', marginTop: 2 },

  // Month selector
  monthSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.sm, gap: SPACING.lg,
  },
  monthArrow: {
    width: 48, height: 48, borderRadius: RADIUS.full,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
  },
  monthLabel: { minWidth: 170, textAlign: 'center', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: COLORS.textPrimary },

  // Property filter
  propertyFilter: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    backgroundColor: '#2563EB', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 99, gap: 6, marginTop: SPACING.md, marginBottom: SPACING.md,
    maxWidth: '84%',
  },
  propertyFilterText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: '#FFFFFF', flexShrink: 1 },

  // Sections
  sectionContainer: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.lg },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: COLORS.textPrimary },

  // Action required cards
  actionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: SPACING.lg,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: '#F59E0B',
    ...SHADOWS.card,
  },
  actionCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm },
  actionCardGuest: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
  actionCardProp: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  actionCardDates: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md,
  },
  actionCardDatesText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: COLORS.textSecondary },

  // Source badge
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sourceBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, letterSpacing: 0.5 },

  // All planned banner
  allPlannedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.successSoft, borderRadius: RADIUS.lg, padding: SPACING.lg,
  },
  allPlannedText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: COLORS.success, flex: 1 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  actionBtnFav: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#2563EB',
  },
  actionBtnFavText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: COLORS.brandPrimary },
  actionBtnNetwork: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.brandPrimary,
  },
  actionBtnNetworkText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: '#FFFFFF' },
  actionBtnAuto: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#F59E0B',
  },
  actionBtnAutoText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: '#FFFFFF' },

  // Day groups
  dayGroup: { marginBottom: SPACING.lg },
  dayLabel: {
    fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: '#94A3B8',
    marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Event cards
  eventCard: {
    borderLeftWidth: 4, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  eventContent: { flex: 1 },
  eventTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
  eventSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#64748B', marginTop: 2 },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: '#FFFFFF' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: SPACING.xxl },
  emptyTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: COLORS.textPrimary, marginTop: SPACING.lg },
  emptySub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20 },

  // Summary
  summaryCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: SPACING.lg,
    borderWidth: 1, borderColor: '#E2E8F0', ...SHADOWS.card,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.lg },
  summaryItem: { alignItems: 'center' },
  summaryNumber: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: COLORS.textPrimary },
  summaryLabel: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  progressBarBg: {
    height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: SPACING.sm,
  },
  progressBarFill: { height: '100%', backgroundColor: COLORS.success, borderRadius: 4 },
  progressLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 29, 46, 0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.xl, maxHeight: '60%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.textPrimary },
  modalSubtitle: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.lg },

  pickerItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: SPACING.md, borderRadius: 12, marginBottom: 4,
  },
  pickerItemActive: { backgroundColor: '#EFF6FF' },
  pickerItemText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, color: COLORS.textPrimary },
  pickerItemTextActive: { fontFamily: 'PlusJakartaSans_700Bold', color: '#3B82F6' },

  // Favorite picker items
  favoriteItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  favoriteAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center',
  },
  favoriteName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
  favoriteRating: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});
