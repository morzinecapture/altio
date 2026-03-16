import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS, GRADIENT } from '../../src/theme';
import { getMissions, createMission, getProperties } from '../../src/api';

export default function OwnerMissionsScreen() {
  const router = useRouter();
  const [missions, setMissions] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  // Create mission form
  const [selectedProp, setSelectedProp] = useState('');
  const [missionType, setMissionType] = useState('cleaning');
  const [mode, setMode] = useState('fixed');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState('');
  const [creating, setCreating] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  });

  const fetchData = async () => {
    try {
      const [m, p] = await Promise.all([getMissions(filter || undefined), getProperties()]);
      setMissions(m);
      setProperties(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [filter]));

  const handleCreate = async () => {
    if (!selectedProp) { Alert.alert('Erreur', 'Sélectionnez un logement'); return; }
    setCreating(true);
    try {
      await createMission({
        property_id: selectedProp,
        mission_type: missionType,
        mode,
        description: description || undefined,
        fixed_rate: rate ? parseFloat(rate) : undefined,
        scheduled_date: scheduledDate.toISOString(),
      });
      setShowCreate(false);
      setDescription(''); setRate(''); setSelectedProp('');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setCreating(false); }
  };

  const filters = [
    { key: null, label: 'Toutes' },
    { key: 'pending', label: 'En attente' },
    { key: 'assigned', label: 'Assignées' },
    { key: 'in_progress', label: 'En cours' },
    { key: 'awaiting_payment', label: 'À payer' },
    { key: 'completed', label: 'Historique' },
  ];

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="owner-missions-screen" edges={['top']}>
      <LinearGradient
        colors={GRADIENT.header}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.title}>Missions</Text>
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        {missions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={50} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>Aucune mission</Text>
          </View>
        ) : (
          missions.map((m) => (
            <TouchableOpacity
              key={m.mission_id}
              testID={`mission-item-${m.mission_id}`}
              style={styles.card}
              onPress={() => router.push(m.is_emergency ? `/emergency?id=${m.mission_id}` : `/mission/${m.mission_id}`)}
            >
              <View style={styles.cardTop}>
                <View style={[styles.chip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg }]}>
                  <Text style={[styles.chipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                    {STATUS_LABELS[m.status] || m.status}
                  </Text>
                </View>
                <Text style={styles.typeLabel}>📌 {MISSION_TYPE_LABELS[m.mission_type] || m.mission_type}</Text>
              </View>
              <Text style={styles.cardTitle}>{m.property_name || 'Logement'}</Text>
              {m.description && <Text style={styles.cardDesc} numberOfLines={2}>{m.description}</Text>}
              <View style={styles.cardMeta}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                <Text style={styles.metaText}>
                  {m.scheduled_date
                    ? `${new Date(m.scheduled_date).toLocaleDateString('fr-FR')} à ${new Date(m.scheduled_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                    : '-'}
                </Text>
                {m.fixed_rate && (
                  <>
                    <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                    <Text style={styles.metaText}>{m.fixed_rate}€</Text>
                  </>
                )}
                <Ionicons name="people-outline" size={14} color={COLORS.textTertiary} />
                <Text style={styles.metaText}>{m.applications_count || 0}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create Mission Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle mission</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Logement *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.propSelect}>
                {properties.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.propChip, selectedProp === p.id && styles.propChipActive]}
                    onPress={() => setSelectedProp(p.id)}
                  >
                    <Text style={[styles.propChipText, selectedProp === p.id && styles.propChipTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Type de mission</Text>
              <View style={styles.typeRow}>
                {['cleaning', 'linen', 'maintenance'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, missionType === t && styles.typeChipActive]}
                    onPress={() => setMissionType(t)}
                  >
                    <Text style={[styles.typeChipText, missionType === t && styles.typeChipTextActive]}>
                      {MISSION_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Mode</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity style={[styles.typeChip, mode === 'fixed' && styles.typeChipActive]} onPress={() => setMode('fixed')}>
                  <Text style={[styles.typeChipText, mode === 'fixed' && styles.typeChipTextActive]}>Tarif fixe</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeChip, mode === 'bidding' && styles.typeChipActive]} onPress={() => setMode('bidding')}>
                  <Text style={[styles.typeChipText, mode === 'bidding' && styles.typeChipTextActive]}>Appel d'offres</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Date et Heure *</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateBtn}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.brandPrimary} />
                  <DateTimePicker
                    value={scheduledDate}
                    mode="date"
                    display="compact"
                    minimumDate={new Date()}
                    locale="fr-FR"
                    onChange={(_, selected) => {
                      if (selected) {
                        const merged = new Date(selected);
                        merged.setHours(scheduledDate.getHours(), scheduledDate.getMinutes());
                        setScheduledDate(merged);
                      }
                    }}
                    themeVariant="light"
                  />
                </View>
                <View style={[styles.dateBtn, styles.timeBtn]}>
                  <Ionicons name="time-outline" size={18} color={COLORS.brandPrimary} />
                  <DateTimePicker
                    value={scheduledDate}
                    mode="time"
                    display="compact"
                    is24Hour
                    onChange={(_, selected) => {
                      if (selected) {
                        const merged = new Date(scheduledDate);
                        merged.setHours(selected.getHours(), selected.getMinutes());
                        setScheduledDate(merged);
                      }
                    }}
                    themeVariant="light"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Tarif (€)</Text>
              <TextInput
                testID="mission-rate-input"
                style={styles.input}
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
                placeholder="ex: 60"
                placeholderTextColor={COLORS.textTertiary}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                testID="mission-desc-input"
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Instructions spécifiques..."
                placeholderTextColor={COLORS.textTertiary}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity testID="submit-mission-btn" style={styles.submitBtn} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.submitText}>Créer la mission</Text>}
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
  dateRow: { flexDirection: 'row', gap: SPACING.md },
  dateBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.subtle,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeBtn: { flex: 1 },
  dateBtnText: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '500', flex: 1 },
  input: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.xl, alignItems: 'center', marginTop: SPACING.xxl, marginBottom: SPACING.xxxl, ...SHADOWS.card },
  submitText: { ...FONTS.h3, color: COLORS.textInverse },
});
