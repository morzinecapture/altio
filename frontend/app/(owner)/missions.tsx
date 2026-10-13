import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, RefreshControl, Modal, TextInput, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MARKETPLACE } from '../../src/components/alpine/MarketplaceKit';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useQueryClient } from '@tanstack/react-query';
import { computeOwnerTotal } from '../../src/utils/commission';
import { createEmergency } from '../../src/api/emergencies';
import { MISSION_SERVICES, LINEN_OPTIONS, toggleMissionService, isRepairService, isUrgentMission, validateMissionServices } from '../../src/utils/missionPresentation';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { SkeletonList } from '../../src/components/Skeleton';
import { Button, Card, EmptyState, StatusBadge } from '../../src/components/ui';
import OwnerPageHeader from '../../src/components/owner/OwnerPageHeader';
import { useMissions, useCreateMission } from '../../src/hooks';
import { useProperties } from '../../src/hooks/useProperties';
import { useTranslation } from 'react-i18next';

export default function OwnerMissionsScreen() {
  const router = useRouter();
  const { create, service, property, priority: initialPriority } = useLocalSearchParams<{ create?: string; service?: string; property?: string; priority?: string }>();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const { data: missions = [], isLoading, isError, isRefetching, refetch } = useMissions();
  const { data: properties = [] } = useProperties();
  const createMut = useCreateMission();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  useEffect(() => {
    if (create !== '1') return;
    setServices(service && (MISSION_SERVICES as readonly string[]).includes(service) ? [service] : []);
    setPriority(initialPriority === 'urgent' ? 'urgent' : 'normal');
    if (property) setSelectedProp(property);
    setStep(0); setShowCreate(true);
    router.setParams({ create: undefined, service: undefined, property: undefined, priority: undefined });
  }, [create, service, property, initialPriority, router]);

  // Create mission form
  const [selectedProp, setSelectedProp] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [linenService, setLinenService] = useState<string>(LINEN_OPTIONS[0]);
  const missionType = services.includes('cleaning') ? 'cleaning' : services[0] || '';
  const isRepair = isRepairService(missionType);
  const [mode, setMode] = useState('bidding');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState('');
  const [requirePhotos, setRequirePhotos] = useState(true);
  const [creating, setCreating] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const handleCreate = async () => {
    if (!selectedProp) { Alert.alert('Erreur', 'Sélectionnez un logement'); return; }
    if (priority === 'normal' && scheduledDate.getTime() <= Date.now()) { Alert.alert(t('common.error'), t('alpine.invalidDate')); return; }
    const validation = validateMissionServices(services);
    if (validation) { Alert.alert(t('common.error'), validation); return; }
    if (isRepair && !description.trim()) { Alert.alert(t('common.error'), 'Décrivez le problème à résoudre.'); return; }
    if (!isRepair && mode === 'fixed' && !rate.trim()) { Alert.alert(t('common.error'), 'Indiquez le budget total ou choisissez une proposition de prestataire.'); return; }
    const parsedRate = !isRepair && mode === 'fixed' && rate.trim() ? Number(rate.replace(',', '.')) : undefined;
    if (parsedRate !== undefined && (!Number.isFinite(parsedRate) || parsedRate <= 0)) { Alert.alert(t('common.error'), t('alpine.invalidRate')); return; }
    if (creating) return;
    setCreating(true);
    try {
      if (isRepair) {
        await createEmergency({
          property_id: selectedProp, service_type: missionType, priority,
          description: description.trim(),
          ...(priority === 'normal' ? { scheduled_date: scheduledDate.toISOString() } : {}),
        });
        await queryClient.invalidateQueries({ queryKey: ['missions'] });
      } else await createMut.mutateAsync({
        property_id: selectedProp,
        mission_type: missionType,
        services, priority,
        linen_service: services.includes('linen') ? linenService : undefined,
        mode,
        description: description || undefined,
        fixed_rate: parsedRate,
        scheduled_date: priority === 'normal' ? scheduledDate.toISOString() : undefined,
        require_photos: requirePhotos,
      });
      setShowCreate(false); setStep(0);
      setDescription(''); setRate(''); setSelectedProp(''); setServices([]); setPriority('normal'); setMode('bidding'); setLinenService(LINEN_OPTIONS[0]);
      setFilter(null);
    } catch (e: unknown) { Alert.alert('Erreur', e instanceof Error ? e.message : String(e)); }
    finally { setCreating(false); }
  };

  const filters = [
    { key: null, label: t('owner.missions.filter_all') },
    { key: 'urgent', label: 'Urgentes' },
    { key: 'pending', label: t('owner.missions.filter_pending') },
    { key: 'assigned', label: t('owner.missions.filter_assigned') },
    { key: 'in_progress', label: t('owner.missions.filter_in_progress') },
    { key: 'awaiting_payment', label: t('owner.missions.filter_payment') },
    { key: 'completed', label: t('owner.missions.filter_history') },
    { key: 'cancelled', label: 'Annulées' },
  ];

  const visibleMissions = missions.filter(m => !filter || (filter === 'urgent' ? isUrgentMission(m) : filter === 'completed' ? ['completed', 'paid'].includes(m.status) : filter === 'awaiting_payment' ? ['awaiting_payment', 'validated'].includes(m.status) : m.status === filter));

  if (isError) return <SafeAreaView style={styles.container}><EmptyState title="Impossible de charger vos missions" subtitle="Réessayez pour afficher les missions et les interventions." actionLabel="Réessayer" onAction={() => refetch()} /></SafeAreaView>;
  if (isLoading) return <SafeAreaView style={styles.container} edges={['top']}><SkeletonList count={4} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} testID="owner-missions-screen" edges={['top']}>
      <OwnerPageHeader
        title="Mes missions"
        subtitle={`${missions.length} intervention${missions.length !== 1 ? 's' : ''} dans votre suivi`}
        icon="construct-outline"
        actionIcon="add"
        actionLabel="Créer"
        onAction={() => setShowCreate(true)}
        testID="create-mission-btn"
      />

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key || 'all'}
            testID={`filter-${f.key || 'all'}`}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={visibleMissions}
        keyExtractor={(m) => `${m.is_emergency ? 'repair' : 'mission'}-${m.mission_id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-outline"
            title={t('owner.missions.empty')}
            subtitle={t('owner.missions.empty_sub')}
            actionLabel={t('owner.missions.empty_cta')}
            onAction={() => setShowCreate(true)}
            testID="owner-missions-empty"
          />
        }
        renderItem={({ item: m }) => {
          const isCancelled = m.status === 'cancelled' || m.status === 'refunded';
          return (
          <Card
            testID={`mission-item-${m.mission_id}`}
            style={[styles.card, isCancelled && styles.cardCancelled]}
            onPress={() => router.push(m.is_emergency ? `/emergency?id=${m.mission_id}` : `/mission/${m.mission_id}`)}
          >
            <View style={styles.cardTop}>
              <View style={{ gap: SPACING.xs }}><StatusBadge status={m.raw_status || m.status} emergency={m.is_emergency} size="sm" />{isUrgentMission(m) && <Text style={{ ...FONTS.caption, color: COLORS.urgency }}>Urgente</Text>}</View>
              <View style={styles.typeLabelRow}>
                <Ionicons name="construct-outline" size={13} color="#2563EB" />
                <Text style={styles.typeLabel}>{getMissionTypeLabel(m.mission_type, m.services)}</Text>
              </View>
            </View>
            <Text style={styles.cardTitle}>{m.property_name || 'Logement'}</Text>
            {!!m.description && <Text style={styles.cardDesc} numberOfLines={2}>{m.description}</Text>}
            <View style={styles.cardMeta}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
              <Text style={styles.metaText}>
                {m.scheduled_date
                  ? `${new Date(m.scheduled_date).toLocaleDateString('fr-FR')} à ${new Date(m.scheduled_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                  : isUrgentMission(m) ? 'Dès que possible · délai à confirmer' : 'Date à confirmer'}
              </Text>
              {!!m.fixed_rate && !m.is_emergency && (
                <>
                  <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                  <Text style={styles.metaText}>{m.fixed_rate}€</Text>
                </>
              )}
              <Ionicons name="people-outline" size={14} color={COLORS.textTertiary} />
              <Text style={styles.metaText}>{m.is_emergency ? m.bids_count || 0 : m.applications_count || 0}</Text>
            </View>
          </Card>
          );
        }}
      />

      {/* Create Mission Modal */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => { if (!creating) setShowCreate(false); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('owner.missions.new')}</Text>
              <TouchableOpacity disabled={creating} accessibilityLabel={t('alpine.close')} style={styles.closeButton} onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.wizardSteps}>{['stepProperty', 'stepDate', 'stepReview'].map((key, index) => <View key={key} style={styles.wizardStep}><View style={[styles.stepLine, index <= step && styles.stepLineActive]} /><Text style={[styles.stepLabel, index === step && styles.stepLabelActive]}>{index + 1}. {t(`alpine.${key}`)}</Text></View>)}</View>
            <ScrollView key={step} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: SPACING.xl }}>
              {step === 0 && <>
              <Text style={styles.inputLabel}>{t('owner.missions.modal_property')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.propSelect}>
                {properties.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.propChip, selectedProp === p.id && styles.propChipActive]}
                    onPress={() => {
                      setSelectedProp(p.id);

                    }}
                  >
                    <Text style={[styles.propChipText, selectedProp === p.id && styles.propChipTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>De quoi avez-vous besoin ?</Text>
              <Text style={styles.switchDesc}>Le ménage et le linge peuvent être regroupés. Chaque autre métier fait l’objet d’une mission distincte.</Text>
              <View style={[styles.typeRow, { flexWrap: 'wrap' }]}>
                {MISSION_SERVICES.map(service => <TouchableOpacity key={service} accessibilityRole="checkbox" accessibilityState={{ checked: services.includes(service) }} testID={`service-${service}`} style={[styles.typeChip, { flexBasis: '44%' }, services.includes(service) && styles.typeChipActive]} onPress={() => { setServices(toggleMissionService(services, service)); setRate(''); }}>
                  <Text style={[styles.typeChipText, services.includes(service) && styles.typeChipTextActive]}>{services.includes(service) ? '✓ ' : ''}{getMissionTypeLabel(service)}</Text>
                </TouchableOpacity>)}
              </View>
              {services.includes('linen') && <>
                <Text style={styles.inputLabel}>Que faut-il faire avec le linge ?</Text>
                {LINEN_OPTIONS.map(option => <TouchableOpacity key={option} accessibilityRole="radio" accessibilityState={{ checked: linenService === option }} style={[styles.typeChip, { marginBottom: SPACING.sm }, linenService === option && styles.typeChipActive]} onPress={() => setLinenService(option)}><Text style={[styles.typeChipText, linenService === option && styles.typeChipTextActive]}>{option}</Text></TouchableOpacity>)}
              </>}

              <Text style={styles.inputLabel}>{t('owner.missions.modal_description')}</Text>
              <TextInput
                testID="mission-desc-input"
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('owner.missions.modal_instructions_placeholder')}
                placeholderTextColor={COLORS.textTertiary}
                multiline
                numberOfLines={3}
              />

              {!isRepair && <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Photos obligatoires</Text>
                  <Text style={styles.switchDesc}>Le prestataire devra prendre au moins une photo avant de terminer la mission</Text>
                </View>
                <Switch
                  value={requirePhotos}
                  onValueChange={setRequirePhotos}
                  trackColor={{ false: COLORS.border, true: COLORS.brandPrimary }}
                  thumbColor={COLORS.textInverse}
                />
              </View>}

              </>}
              {step === 1 && <>
              <Text style={styles.inputLabel}>Quand en avez-vous besoin ?</Text>
              {[{ key: 'normal', label: 'À une date précise', detail: 'Choisissez le créneau souhaité.' }, { key: 'urgent', label: 'Urgent · dès que possible', detail: 'Le délai sera confirmé par le prestataire.' }].map(option => <TouchableOpacity key={option.key} accessibilityRole="radio" accessibilityState={{ checked: priority === option.key }} style={[styles.priorityChoice, priority === option.key && styles.prioritySelected]} onPress={() => setPriority(option.key as 'normal' | 'urgent')}><Text style={styles.inputLabel}>{option.label}</Text><Text style={styles.switchDesc}>{option.detail}</Text></TouchableOpacity>)}
              {!isRepair && <>
              <Text style={styles.inputLabel}>{t('owner.missions.modal_mode')}</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity style={[styles.typeChip, mode === 'fixed' && styles.typeChipActive]} onPress={() => setMode('fixed')}>
                  <Text style={[styles.typeChipText, mode === 'fixed' && styles.typeChipTextActive]}>{t('owner.missions.modal_fixed')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeChip, mode === 'bidding' && styles.typeChipActive]} onPress={() => setMode('bidding')}>
                  <Text style={[styles.typeChipText, mode === 'bidding' && styles.typeChipTextActive]}>{t('owner.missions.modal_quote')}</Text>
                </TouchableOpacity>
              </View>

              </>}
              {priority === 'normal' && <>
              <Text style={styles.inputLabel}>{t('owner.missions.modal_datetime')}</Text>

              {/* Résumé date sélectionnée */}
              <TouchableOpacity
                style={styles.dateDisplay}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <Ionicons name="calendar-outline" size={18} color={COLORS.brandPrimary} />
                <Text style={styles.dateDisplayText}>
                  {scheduledDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {' à '}
                  {scheduledDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textTertiary} />
              </TouchableOpacity>

              {/* Calendrier custom — 100% React Native, aucun composant natif */}
              {showDatePicker && (
                <View style={styles.calendarContainer}>
                  {/* Navigation mois */}
                  <View style={styles.calMonthRow}>
                    <TouchableOpacity
                      style={styles.calNavBtn}
                      onPress={() => {
                        const d = new Date(pickerMonth.year, pickerMonth.month - 1);
                        setPickerMonth({ year: d.getFullYear(), month: d.getMonth() });
                      }}
                    >
                      <Ionicons name="chevron-back" size={20} color={COLORS.brandPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.calMonthLabel}>
                      {new Date(pickerMonth.year, pickerMonth.month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                      style={styles.calNavBtn}
                      onPress={() => {
                        const d = new Date(pickerMonth.year, pickerMonth.month + 1);
                        setPickerMonth({ year: d.getFullYear(), month: d.getMonth() });
                      }}
                    >
                      <Ionicons name="chevron-forward" size={20} color={COLORS.brandPrimary} />
                    </TouchableOpacity>
                  </View>

                  {/* Jours de la semaine */}
                  <View style={styles.calDaysHeader}>
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                      <Text key={i} style={styles.calDayName}>{d}</Text>
                    ))}
                  </View>

                  {/* Grille des jours */}
                  <View style={styles.calGrid}>
                    {(() => {
                      const firstDay = new Date(pickerMonth.year, pickerMonth.month, 1);
                      const lastDay = new Date(pickerMonth.year, pickerMonth.month + 1, 0);
                      const today = new Date(); today.setHours(0,0,0,0);
                      // Lundi=0, on décale le premier jour
                      const startOffset = (firstDay.getDay() + 6) % 7;
                      const cells: React.ReactElement[] = [];

                      for (let i = 0; i < startOffset; i++) {
                        cells.push(<View key={`e-${i}`} style={styles.calCell} />);
                      }
                      for (let day = 1; day <= lastDay.getDate(); day++) {
                        const date = new Date(pickerMonth.year, pickerMonth.month, day);
                        const isPast = date < today;
                        const isSelected =
                          scheduledDate.getDate() === day &&
                          scheduledDate.getMonth() === pickerMonth.month &&
                          scheduledDate.getFullYear() === pickerMonth.year;
                        cells.push(
                          <TouchableOpacity
                            key={day}
                            style={[styles.calCell, isSelected && styles.calCellSelected, isPast && styles.calCellPast]}
                            onPress={() => {
                              if (isPast) return;
                              const merged = new Date(scheduledDate);
                              merged.setFullYear(pickerMonth.year, pickerMonth.month, day);
                              setScheduledDate(merged);
                            }}
                            disabled={isPast}
                          >
                            <Text style={[styles.calCellText, isSelected && styles.calCellTextSelected, isPast && styles.calCellTextPast]}>
                              {day}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                      return cells;
                    })()}
                  </View>

                  {/* Sélecteur heure */}
                  <View style={styles.timeRow}>
                    <Ionicons name="time-outline" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.timeLabel}>Heure :</Text>
                    <TouchableOpacity style={styles.timeStepBtn} onPress={() => {
                      const d = new Date(scheduledDate);
                      d.setHours(Math.max(0, d.getHours() - 1));
                      setScheduledDate(d);
                    }}>
                      <Ionicons name="remove" size={18} color={COLORS.brandPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.timeValue}>{String(scheduledDate.getHours()).padStart(2, '0')}</Text>
                    <TouchableOpacity style={styles.timeStepBtn} onPress={() => {
                      const d = new Date(scheduledDate);
                      d.setHours(Math.min(23, d.getHours() + 1));
                      setScheduledDate(d);
                    }}>
                      <Ionicons name="add" size={18} color={COLORS.brandPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.timeValue}>:</Text>
                    <TouchableOpacity style={styles.timeStepBtn} onPress={() => {
                      const d = new Date(scheduledDate);
                      d.setMinutes(d.getMinutes() <= 0 ? 45 : d.getMinutes() - 15);
                      setScheduledDate(d);
                    }}>
                      <Ionicons name="remove" size={18} color={COLORS.brandPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.timeValue}>{String(scheduledDate.getMinutes()).padStart(2, '0')}</Text>
                    <TouchableOpacity style={styles.timeStepBtn} onPress={() => {
                      const d = new Date(scheduledDate);
                      d.setMinutes(d.getMinutes() >= 45 ? 0 : d.getMinutes() + 15);
                      setScheduledDate(d);
                    }}>
                      <Ionicons name="add" size={18} color={COLORS.brandPrimary} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.calConfirmBtn} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.calConfirmText}>Confirmer</Text>
                  </TouchableOpacity>
                </View>
              )}

              </>}
              {!isRepair && mode === 'fixed' && <>
              <Text style={styles.inputLabel}>Tarif proposé pour toutes les prestations, hors frais Altio (€)</Text>
              <TextInput
                testID="mission-rate-input"
                style={styles.input}
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
                placeholder={t('owner.missions.modal_rate_placeholder')}
                placeholderTextColor={COLORS.textTertiary}
              />

              </>}
              {isRepair && <Text style={styles.switchDesc}>Le prestataire propose ses frais de déplacement et de diagnostic. Les travaux éventuels font l’objet d’un devis à valider séparément.</Text>}
              {!isRepair && mode === 'bidding' && <Text style={styles.switchDesc}>Chaque candidature doit couvrir toutes les prestations sélectionnées. Vous choisissez le prestataire et sa proposition.</Text>}
              </>}
              {step === 2 && <View style={styles.review}>
                <Text style={styles.reviewTitle}>{t('alpine.reviewTitle')}</Text><Text style={styles.reviewSubtitle}>{t('alpine.reviewSubtitle')}</Text>
                {[
                  [t('owner.missions.modal_property'), properties.find(p => p.id === selectedProp)?.name || '—'],
                  [t('owner.missions.modal_type'), getMissionTypeLabel(missionType, services)],
                  ['Délai souhaité', priority === 'urgent' ? 'Urgent · dès que possible, à confirmer' : scheduledDate.toLocaleString()],
                  ...(services.includes('linen') ? [['Linge', linenService]] : []),
                  [t('owner.missions.modal_mode'), isRepair ? 'Diagnostic puis devis si nécessaire' : t(mode === 'fixed' ? 'owner.missions.modal_fixed' : 'owner.missions.modal_quote')],
                  ['Tarif des prestations', !isRepair && mode === 'fixed' && rate ? `${rate} € pour l’ensemble` : 'À proposer par le prestataire'],
                  ...(!isRepair && mode === 'fixed' && rate ? [['Total maximal, frais Altio inclus', `${computeOwnerTotal(Number(rate.replace(',', '.'))).toFixed(2)} €`]] : []),
                  ...(!isRepair ? [[t('alpine.requiredPhotos'), t(requirePhotos ? 'alpine.yes' : 'alpine.no')]] : []),
                ].map(([label, value]) => <View key={label} style={styles.reviewRow}><Text style={styles.reviewLabel}>{label}</Text><Text style={styles.reviewValue}>{value}</Text></View>)}
                {!!description && <Text style={styles.reviewDescription}>{description}</Text>}
              </View>}
            </ScrollView>
            <View style={styles.wizardActions}>
              {step > 0 && <Button label={t('alpine.back')} variant="outline" fullWidth={false} disabled={creating} onPress={() => setStep(step - 1)} />}
              <Button style={{ flex: 1 }} testID={step === 2 ? 'submit-mission-btn' : 'next-mission-step'} label={step === 2 ? t('owner.missions.modal_create') : t('alpine.continue')} loading={creating} onPress={() => {
                if (step === 0 && !selectedProp) { Alert.alert(t('common.error'), t('alpine.chooseProperty')); return; }
                if (step === 0) {
                  const validation = validateMissionServices(services);
                  if (validation) { Alert.alert(t('common.error'), validation); return; }
                  if (isRepair && !description.trim()) { Alert.alert(t('common.error'), 'Décrivez le problème à résoudre.'); return; }
                }
                if (step === 1) {
                  if (!isRepair && mode === 'fixed' && !rate.trim()) { Alert.alert(t('common.error'), 'Indiquez le budget total ou choisissez une proposition de prestataire.'); return; }
                  if (priority === 'normal' && scheduledDate.getTime() <= Date.now()) { Alert.alert(t('common.error'), t('alpine.invalidDate')); return; }
                  if (!isRepair && mode === 'fixed' && rate && (!Number.isFinite(Number(rate.replace(',', '.'))) || Number(rate.replace(',', '.')) <= 0)) { Alert.alert(t('common.error'), t('alpine.invalidRate')); return; }
                }
                if (step < 2) { setShowDatePicker(false); setStep(step + 1); } else handleCreate();
              }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  priorityChoice: { padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, marginBottom: SPACING.sm },
  prioritySelected: { borderColor: COLORS.brandPrimary, backgroundColor: COLORS.infoSoft },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  wizardSteps: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  wizardStep: { flex: 1 },
  stepLine: { height: 3, borderRadius: 9, backgroundColor: COLORS.border, marginBottom: SPACING.sm },
  stepLineActive: { backgroundColor: COLORS.navy },
  stepLabel: { ...FONTS.bodySmall, fontSize: 10, color: COLORS.textSecondary },
  stepLabelActive: { fontFamily: FONTS.h2.fontFamily, color: COLORS.textPrimary },
  wizardActions: { flexDirection: 'row', gap: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  review: { backgroundColor: COLORS.background, padding: SPACING.lg, borderRadius: RADIUS.xl },
  reviewTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  reviewSubtitle: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginVertical: SPACING.md },
  reviewRow: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.xs },
  reviewLabel: { ...FONTS.caption, fontSize: 10, color: COLORS.textSecondary },
  reviewValue: { ...FONTS.body, fontFamily: FONTS.h3.fontFamily, color: COLORS.textPrimary },
  reviewDescription: { ...FONTS.bodySmall, color: COLORS.textPrimary, marginTop: SPACING.lg },
  container: { flex: 1, backgroundColor: MARKETPLACE.canvas },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  filterBar: { maxHeight: 62 },
  filterContent: { paddingHorizontal: SPACING.xl, paddingVertical: 11, gap: SPACING.sm, alignItems: 'center' },
  filterChip: { paddingHorizontal: SPACING.lg, paddingVertical: 9, borderRadius: RADIUS.full, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  filterChipActive: { backgroundColor: COLORS.textPrimary },
  filterText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  filterTextActive: { color: COLORS.textInverse },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl * 2 },
  emptyText: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md, fontWeight: '600' },
  card: { marginHorizontal: SPACING.xl, marginTop: SPACING.md, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 18 },
  cardCancelled: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption, fontSize: 11 },
  solidStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  solidStatusText: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 9, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.35 },
  typeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeLabel: { ...FONTS.caption, color: '#2563EB' },
  cardTitle: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 18, marginBottom: 2 },
  cardDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.xs, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  metaText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 29, 46, 0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.paper, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACING.xl, maxHeight: '85%', ...SHADOWS.float },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  modalTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  inputLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginTop: SPACING.lg, marginBottom: SPACING.sm },
  propSelect: { maxHeight: 44 },
  propChip: { paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.subtle, marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  propChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  propChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  propChipTextActive: { color: COLORS.textInverse },
  typeRow: { flexDirection: 'row', gap: SPACING.sm },
  typeChip: { paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border },
  typeChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  typeChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  typeChipTextActive: { color: COLORS.textInverse },
  // Custom calendar picker
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.subtle,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.brandPrimary,
  },
  dateDisplayText: { ...FONTS.body, color: COLORS.textPrimary, flex: 1 },
  calendarContainer: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
  },
  calMonthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  calNavBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center' },
  calMonthLabel: { ...FONTS.h3, color: COLORS.textPrimary, textTransform: 'capitalize' },
  calDaysHeader: { flexDirection: 'row', marginBottom: SPACING.sm },
  calDayName: { flex: 1, textAlign: 'center', ...FONTS.caption, color: COLORS.textTertiary, fontWeight: '600' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: RADIUS.sm },
  calCellSelected: { backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.full },
  calCellPast: { opacity: 0.3 },
  calCellText: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '500' },
  calCellTextSelected: { color: COLORS.textInverse, fontWeight: '700' },
  calCellTextPast: { color: COLORS.textTertiary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.lg, paddingTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border },
  timeLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginRight: SPACING.xs },
  timeStepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  timeValue: { ...FONTS.h3, color: COLORS.textPrimary, minWidth: 28, textAlign: 'center' },
  calConfirmBtn: { backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.lg },
  calConfirmText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '700' },
  input: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.xl, alignItems: 'center', marginTop: SPACING.xxl, marginBottom: SPACING.xxxl, ...SHADOWS.card },
  submitText: { ...FONTS.h3, color: COLORS.textInverse },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.lg, gap: SPACING.md },
  switchDesc: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 2 },
});
