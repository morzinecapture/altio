import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Platform, Switch } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, GRADIENT } from '../../src/theme';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { SkeletonList } from '../../src/components/Skeleton';
import { useMissions, useCreateMission } from '../../src/hooks';
import { useProperties } from '../../src/hooks/useProperties';
import { useTranslation } from 'react-i18next';
import type { MergedMission, Property } from '../../src/types/api';

export default function OwnerMissionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const { data: missions = [], isLoading, isRefetching, refetch } = useMissions(filter || undefined);
  const { data: properties = [] } = useProperties();
  const createMut = useCreateMission();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Create mission form
  const [selectedProp, setSelectedProp] = useState('');
  const [missionType, setMissionType] = useState('cleaning');
  const [mode, setMode] = useState('fixed');
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
    setCreating(true);
    try {
      await createMut.mutateAsync({
        property_id: selectedProp,
        mission_type: missionType,
        mode,
        description: description || undefined,
        fixed_rate: rate ? parseFloat(rate) : undefined,
        scheduled_date: scheduledDate.toISOString(),
        require_photos: requirePhotos,
      });
      setShowCreate(false);
      setDescription(''); setRate(''); setSelectedProp('');
    } catch (e: unknown) { Alert.alert('Erreur', e instanceof Error ? e.message : String(e)); }
    finally { setCreating(false); }
  };

  const filters = [
    { key: null, label: t('owner.missions.filter_all') },
    { key: 'pending', label: t('owner.missions.filter_pending') },
    { key: 'assigned', label: t('owner.missions.filter_assigned') },
    { key: 'in_progress', label: t('owner.missions.filter_in_progress') },
    { key: 'awaiting_payment', label: t('owner.missions.filter_payment') },
    { key: 'completed', label: t('owner.missions.filter_history') },
    { key: 'cancelled', label: 'Annulées' },
  ];

  if (isLoading) return <SafeAreaView style={styles.container} edges={['top']}><SkeletonList count={4} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} testID="owner-missions-screen" edges={['top']}>
      <LinearGradient
        colors={GRADIENT.header}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.title}>{t('owner.missions.title')}</Text>
        <TouchableOpacity testID="create-mission-btn" style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={24} color={COLORS.textInverse} />
        </TouchableOpacity>
      </LinearGradient>

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
        data={missions}
        keyExtractor={(m) => m.mission_id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={50} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>{t('owner.missions.empty')}</Text>
          </View>
        }
        renderItem={({ item: m }) => {
          const isCancelled = m.status === 'cancelled' || m.status === 'refunded';
          return (
          <TouchableOpacity
            testID={`mission-item-${m.mission_id}`}
            style={[styles.card, isCancelled && { opacity: 0.6 }]}
            onPress={() => router.push(m.is_emergency ? `/emergency?id=${m.mission_id}` : `/mission/${m.mission_id}`)}
          >
            <View style={styles.cardTop}>
              <View style={[styles.chip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                {isCancelled && <Ionicons name="close-circle" size={12} color={(STATUS_COLORS[m.status] || STATUS_COLORS.pending).text} />}
                <Text style={[styles.chipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                  {STATUS_LABELS[m.status] || m.status}
                </Text>
              </View>
              <Text style={styles.typeLabel}>📌 {getMissionTypeLabel(m.mission_type)}</Text>
            </View>
            <Text style={styles.cardTitle}>{m.property_name || 'Logement'}</Text>
            {!!m.description && <Text style={styles.cardDesc} numberOfLines={2}>{m.description}</Text>}
            <View style={styles.cardMeta}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
              <Text style={styles.metaText}>
                {m.scheduled_date
                  ? `${new Date(m.scheduled_date).toLocaleDateString('fr-FR')} à ${new Date(m.scheduled_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                  : '-'}
              </Text>
              {!!m.fixed_rate && (
                <>
                  <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                  <Text style={styles.metaText}>{m.fixed_rate}€</Text>
                </>
              )}
              <Ionicons name="people-outline" size={14} color={COLORS.textTertiary} />
              <Text style={styles.metaText}>{m.applications_count || 0}</Text>
            </View>
          </TouchableOpacity>
          );
        }}
      />

      {/* Create Mission Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('owner.missions.new')}</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>{t('owner.missions.modal_property')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.propSelect}>
                {properties.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.propChip, selectedProp === p.id && styles.propChipActive]}
                    onPress={() => {
                      setSelectedProp(p.id);
                      if (!rate && p.fixed_rate) {
                        setRate(String(p.fixed_rate));
                      }
                    }}
                  >
                    <Text style={[styles.propChipText, selectedProp === p.id && styles.propChipTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>{t('owner.missions.modal_type')}</Text>
              <View style={styles.typeRow}>
                {['cleaning', 'linen', 'maintenance'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, missionType === t && styles.typeChipActive]}
                    onPress={() => setMissionType(t)}
                  >
                    <Text style={[styles.typeChipText, missionType === t && styles.typeChipTextActive]}>
                      {getMissionTypeLabel(t)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{t('owner.missions.modal_mode')}</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity style={[styles.typeChip, mode === 'fixed' && styles.typeChipActive]} onPress={() => setMode('fixed')}>
                  <Text style={[styles.typeChipText, mode === 'fixed' && styles.typeChipTextActive]}>{t('owner.missions.modal_fixed')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeChip, mode === 'bidding' && styles.typeChipActive]} onPress={() => setMode('bidding')}>
                  <Text style={[styles.typeChipText, mode === 'bidding' && styles.typeChipTextActive]}>{t('owner.missions.modal_quote')}</Text>
                </TouchableOpacity>
              </View>

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

              <Text style={styles.inputLabel}>{t('owner.missions.modal_rate')}</Text>
              <TextInput
                testID="mission-rate-input"
                style={styles.input}
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
                placeholder={t('owner.missions.modal_rate_placeholder')}
                placeholderTextColor={COLORS.textTertiary}
              />

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

              <View style={styles.switchRow}>
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
              </View>

              <TouchableOpacity testID="submit-mission-btn" style={styles.submitBtn} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.submitText}>{t('owner.missions.modal_create')}</Text>}
              </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    elevation: 2,
    zIndex: 10
  },
  title: { ...FONTS.h1, color: COLORS.textPrimary },
  addBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  filterBar: { maxHeight: 50, marginTop: -SPACING.md, zIndex: 11 },
  filterContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm, alignItems: 'center' },
  filterChip: { paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.paper, ...SHADOWS.card },
  filterChipActive: { backgroundColor: COLORS.brandPrimary },
  filterText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  filterTextActive: { color: COLORS.textInverse },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl * 2 },
  emptyText: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md, fontWeight: '600' },
  card: { backgroundColor: COLORS.paper, marginHorizontal: SPACING.xl, marginTop: SPACING.lg, padding: SPACING.lg, borderRadius: RADIUS.xl, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption, fontSize: 11 },
  typeLabel: { ...FONTS.caption, color: COLORS.textTertiary },
  cardTitle: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 18, marginBottom: 2 },
  cardDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.xs, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
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
