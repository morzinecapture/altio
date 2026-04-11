import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../src/theme';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/auth';

// --- Types ---

interface Reclamation {
  id: string;
  user_id: string;
  type: string;
  mission_id: string | null;
  description: string;
  status: string;
  resolution: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

type ReclamationType = 'quality' | 'payment' | 'commission' | 'account' | 'other';
type ReclamationStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';

const RECLAMATION_TYPES: { id: ReclamationType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'quality', label: 'Qualite de service', icon: 'star-outline' },
  { id: 'payment', label: 'Paiement', icon: 'card-outline' },
  { id: 'commission', label: 'Commission', icon: 'cash-outline' },
  { id: 'account', label: 'Mon compte', icon: 'person-outline' },
  { id: 'other', label: 'Autre', icon: 'ellipsis-horizontal-outline' },
];

const STATUS_CONFIG: Record<ReclamationStatus, { label: string; bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  open: { label: 'Ouverte', bg: '#EFF6FF', text: '#2563EB', icon: 'radio-button-on-outline' },
  acknowledged: { label: 'Prise en compte', bg: '#FFFBEB', text: '#F59E0B', icon: 'checkmark-circle-outline' },
  in_progress: { label: 'En traitement', bg: '#FFF7ED', text: '#F97316', icon: 'sync-outline' },
  resolved: { label: 'Resolue', bg: '#ECFDF5', text: '#10B981', icon: 'checkmark-done-circle-outline' },
  closed: { label: 'Fermee', bg: '#F1F5F9', text: '#64748B', icon: 'lock-closed-outline' },
};

const MIN_DESCRIPTION_LENGTH = 20;

export default function ReclamationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { missionId: paramMissionId, emergencyId: paramEmergencyId } = useLocalSearchParams<{
    missionId?: string;
    emergencyId?: string;
  }>();

  // Form state
  const [selectedType, setSelectedType] = useState<ReclamationType | null>(null);
  const [missionId, setMissionId] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // List state
  const [reclamations, setReclamations] = useState<Reclamation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');

  // Pre-fill mission/emergency reference from params
  useEffect(() => {
    if (paramMissionId) {
      setMissionId(paramMissionId);
    } else if (paramEmergencyId) {
      setMissionId(paramEmergencyId);
    }
  }, [paramMissionId, paramEmergencyId]);

  const fetchReclamations = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('reclamations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReclamations(data || []);
    } catch (err) {
      // Silent fail — list is non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchReclamations();
  }, [fetchReclamations]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReclamations();
  };

  const isFormValid = selectedType !== null && description.trim().length >= MIN_DESCRIPTION_LENGTH;

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert('Type requis', 'Veuillez selectionner un type de reclamation.');
      return;
    }
    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      Alert.alert(
        'Description trop courte',
        `Veuillez decrire votre reclamation en detail (minimum ${MIN_DESCRIPTION_LENGTH} caracteres).`
      );
      return;
    }
    if (!user?.id) {
      Alert.alert('Erreur', 'Vous devez etre connecte pour soumettre une reclamation.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        user_id: user.id,
        type: selectedType,
        description: description.trim(),
        status: 'open',
      };
      if (missionId.trim()) {
        payload.mission_id = missionId.trim();
      }

      const { error } = await supabase.from('reclamations').insert(payload);
      if (error) throw error;

      setSubmitted(true);

      // Reset form after a short delay to let user see the success state
      setTimeout(() => {
        setSelectedType(null);
        setMissionId(paramMissionId || paramEmergencyId || '');
        setDescription('');
        setSubmitted(false);
        fetchReclamations();
      }, 3000);
    } catch (err: unknown) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncate = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trimEnd() + '...';
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status as ReclamationStatus] || STATUS_CONFIG.open;
  };

  const getTypeLabel = (type: string) => {
    const found = RECLAMATION_TYPES.find((t) => t.id === type);
    return found?.label || type;
  };

  const getTypeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    const found = RECLAMATION_TYPES.find((t) => t.id === type);
    return found?.icon || 'help-outline';
  };

  const charCount = description.trim().length;
  const charCountColor = charCount >= MIN_DESCRIPTION_LENGTH
    ? COLORS.success
    : charCount > 0
      ? COLORS.warning
      : COLORS.textTertiary;

  // ─── Success confirmation view ────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={GRADIENT.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Reclamation</Text>
            <View style={{ width: 40 }} />
          </View>
        </LinearGradient>

        <View style={styles.successContainer}>
          <View style={styles.successIconWrap}>
            <LinearGradient
              colors={GRADIENT.successButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.successIcon}
            >
              <Ionicons name="checkmark" size={40} color={COLORS.textInverse} />
            </LinearGradient>
          </View>
          <Text style={styles.successTitle}>Reclamation envoyee</Text>
          <Text style={styles.successMessage}>
            Votre reclamation a ete enregistree avec succes. Nous accusons reception et vous
            repondrons dans un delai de 48 heures ouvrables.
          </Text>
          <Text style={styles.successRef}>
            Vous pouvez suivre l'avancement dans l'onglet "Historique".
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main view ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={GRADIENT.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reclamation</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'form' && styles.tabActive]}
          onPress={() => setActiveTab('form')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="create-outline"
            size={16}
            color={activeTab === 'form' ? COLORS.brandPrimary : COLORS.textTertiary}
          />
          <Text style={[styles.tabText, activeTab === 'form' && styles.tabTextActive]}>
            Nouvelle
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={activeTab === 'history' ? COLORS.brandPrimary : COLORS.textTertiary}
          />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Historique
            {reclamations.length > 0 && (
              <Text style={styles.tabBadgeText}> ({reclamations.length})</Text>
            )}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.brandPrimary}
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'form' ? (
            <>
              {/* ─── Form Section ──────────────────────────────────────── */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Soumettre une reclamation</Text>
                    <Text style={styles.sectionSubtitle}>
                      Decrivez votre probleme et nous vous repondrons dans les meilleurs delais.
                    </Text>
                  </View>
                </View>

                {/* Type Picker */}
                <Text style={styles.fieldLabel}>Type de reclamation *</Text>
                <View style={styles.typePicker}>
                  {RECLAMATION_TYPES.map((type) => {
                    const isSelected = selectedType === type.id;
                    return (
                      <TouchableOpacity
                        key={type.id}
                        style={[
                          styles.typeChip,
                          isSelected && styles.typeChipSelected,
                        ]}
                        onPress={() => setSelectedType(type.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={type.icon}
                          size={16}
                          color={isSelected ? COLORS.textInverse : COLORS.textSecondary}
                        />
                        <Text
                          style={[
                            styles.typeChipText,
                            isSelected && styles.typeChipTextSelected,
                          ]}
                        >
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Mission/Emergency ID reference */}
                <Text style={styles.fieldLabel}>
                  Reference mission ou urgence{' '}
                  <Text style={styles.fieldOptional}>(optionnel)</Text>
                </Text>
                <View style={styles.inputRow}>
                  <Ionicons name="briefcase-outline" size={18} color={COLORS.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInputWithIcon}
                    value={missionId}
                    onChangeText={setMissionId}
                    placeholder="Ex: abc123-def456..."
                    placeholderTextColor={COLORS.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!paramMissionId && !paramEmergencyId}
                  />
                  {(paramMissionId || paramEmergencyId) && (
                    <View style={styles.autoFilledBadge}>
                      <Text style={styles.autoFilledText}>Auto</Text>
                    </View>
                  )}
                </View>

                {/* Description */}
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Description *</Text>
                  <Text style={[styles.charCount, { color: charCountColor }]}>
                    {charCount}/{MIN_DESCRIPTION_LENGTH} min
                  </Text>
                </View>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.textArea,
                    description.trim().length > 0 && description.trim().length < MIN_DESCRIPTION_LENGTH && styles.textInputWarning,
                  ]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Decrivez votre reclamation en detail (minimum 20 caracteres)..."
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />

                {/* Submit */}
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    !isFormValid && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!isFormValid || submitting}
                  activeOpacity={0.8}
                >
                  {submitting ? (
                    <ActivityIndicator color={COLORS.textInverse} size="small" />
                  ) : (
                    <>
                      <Ionicons name="send-outline" size={18} color={COLORS.textInverse} />
                      <Text style={styles.submitButtonText}>Envoyer la reclamation</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* ─── Mediation info ──────────────────────────────────── */}
              <View style={styles.mediationCard}>
                <View style={styles.mediationHeader}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.brandPrimary} />
                  <Text style={styles.mediationTitle}>Mediation</Text>
                </View>
                <Text style={styles.mediationText}>
                  En cas de litige non resolu, vous pouvez saisir le mediateur de la consommation :
                </Text>
                <View style={styles.mediationAddress}>
                  <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.mediationAddressText}>
                    CMAP — 39 avenue Franklin D. Roosevelt, 75008 Paris
                  </Text>
                </View>
                <Text style={styles.mediationNote}>
                  Conformement aux articles L.611-1 et R.612-1 du Code de la consommation,
                  tout consommateur a le droit de recourir gratuitement a un mediateur de la
                  consommation en vue de la resolution amiable d'un litige.
                </Text>
              </View>
            </>
          ) : (
            <>
              {/* ─── History Section ───────────────────────────────────── */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name="folder-open-outline" size={20} color={COLORS.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Mes reclamations</Text>
                    <Text style={styles.sectionSubtitle}>
                      Retrouvez l'historique et le statut de vos reclamations.
                    </Text>
                  </View>
                </View>

                {loading ? (
                  <ActivityIndicator
                    color={COLORS.brandPrimary}
                    size="large"
                    style={{ marginTop: SPACING.xxxxl }}
                  />
                ) : reclamations.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIconWrap}>
                      <Ionicons
                        name="chatbox-ellipses-outline"
                        size={48}
                        color={COLORS.textTertiary}
                      />
                    </View>
                    <Text style={styles.emptyTitle}>Aucune reclamation</Text>
                    <Text style={styles.emptyText}>
                      Vous n'avez pas encore soumis de reclamation.
                    </Text>
                    <TouchableOpacity
                      style={styles.emptyAction}
                      onPress={() => setActiveTab('form')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={COLORS.brandPrimary} />
                      <Text style={styles.emptyActionText}>Creer une reclamation</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  reclamations.map((item) => {
                    const statusCfg = getStatusConfig(item.status);
                    return (
                      <View key={item.id} style={styles.card}>
                        {/* Card header */}
                        <View style={styles.cardHeader}>
                          <View style={styles.cardTypeRow}>
                            <View style={[styles.cardTypeIconWrap, { backgroundColor: COLORS.infoSoft }]}>
                              <Ionicons
                                name={getTypeIcon(item.type)}
                                size={16}
                                color={COLORS.brandPrimary}
                              />
                            </View>
                            <Text style={styles.cardType}>{getTypeLabel(item.type)}</Text>
                          </View>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: statusCfg.bg },
                            ]}
                          >
                            <Ionicons name={statusCfg.icon} size={12} color={statusCfg.text} />
                            <Text style={[styles.statusBadgeText, { color: statusCfg.text }]}>
                              {statusCfg.label}
                            </Text>
                          </View>
                        </View>

                        {/* Description */}
                        <Text style={styles.cardDescription}>
                          {truncate(item.description)}
                        </Text>

                        {/* Resolution */}
                        {item.resolution && (
                          <View style={styles.resolutionBox}>
                            <Ionicons
                              name="checkmark-circle-outline"
                              size={16}
                              color={COLORS.success}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.resolutionLabel}>Resolution</Text>
                              <Text style={styles.resolutionText}>
                                {truncate(item.resolution, 150)}
                              </Text>
                            </View>
                          </View>
                        )}

                        {/* Footer timeline */}
                        <View style={styles.cardFooter}>
                          <View style={styles.footerItem}>
                            <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                            <Text style={styles.cardDate}>
                              {formatDate(item.created_at)}
                            </Text>
                          </View>

                          {item.acknowledged_at && (
                            <View style={styles.footerItem}>
                              <View style={styles.footerDot} />
                              <Ionicons name="checkmark-outline" size={14} color={COLORS.warning} />
                              <Text style={styles.cardDate}>
                                Prise en compte {formatDate(item.acknowledged_at)}
                              </Text>
                            </View>
                          )}

                          {item.resolved_at && (
                            <View style={styles.footerItem}>
                              <View style={styles.footerDot} />
                              <Ionicons name="checkmark-done-outline" size={14} color={COLORS.success} />
                              <Text style={styles.cardDate}>
                                Resolue {formatDate(item.resolved_at)}
                              </Text>
                            </View>
                          )}

                          {item.mission_id && (
                            <View style={styles.footerItem}>
                              <View style={styles.footerDot} />
                              <Ionicons name="briefcase-outline" size={14} color={COLORS.textTertiary} />
                              <Text style={styles.cardDate}>Mission liee</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Mediation info also visible in history tab */}
              {reclamations.length > 0 && (
                <View style={styles.mediationCard}>
                  <View style={styles.mediationHeader}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.brandPrimary} />
                    <Text style={styles.mediationTitle}>Mediation</Text>
                  </View>
                  <Text style={styles.mediationText}>
                    En cas de litige non resolu, vous pouvez saisir le mediateur de la consommation :
                  </Text>
                  <View style={styles.mediationAddress}>
                    <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.mediationAddressText}>
                      CMAP — 39 avenue Franklin D. Roosevelt, 75008 Paris
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}

          <View style={{ height: SPACING.xxxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ─── Header ─────────────────────────────────────────────────────────────────
  headerGradient: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper,
    ...SHADOWS.card,
  },
  headerTitle: {
    ...FONTS.h2,
    color: COLORS.textPrimary,
  },

  // ─── Tab bar ────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.paper,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.brandPrimary,
  },
  tabText: {
    ...FONTS.bodySmall,
    fontWeight: '500',
    color: COLORS.textTertiary,
  },
  tabTextActive: {
    color: COLORS.brandPrimary,
    fontWeight: '600',
  },
  tabBadgeText: {
    color: COLORS.textTertiary,
    fontWeight: '400',
  },

  // ─── Scroll ─────────────────────────────────────────────────────────────────
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
  },

  // ─── Section ────────────────────────────────────────────────────────────────
  section: {
    marginBottom: SPACING.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  // ─── Form fields ────────────────────────────────────────────────────────────
  fieldLabel: {
    ...FONTS.bodySmall,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  fieldOptional: {
    fontWeight: '400',
    color: COLORS.textTertiary,
  },
  charCount: {
    ...FONTS.bodySmall,
    fontSize: 12,
    fontWeight: '500',
  },

  // ─── Type chips ─────────────────────────────────────────────────────────────
  typePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.paper,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeChipSelected: {
    backgroundColor: COLORS.brandPrimary,
    borderColor: COLORS.brandPrimary,
  },
  typeChipText: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  typeChipTextSelected: {
    color: COLORS.textInverse,
    fontWeight: '600',
  },

  // ─── Inputs ─────────────────────────────────────────────────────────────────
  textInput: {
    backgroundColor: COLORS.paper,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    ...FONTS.body,
    color: COLORS.textPrimary,
  },
  textInputWarning: {
    borderColor: COLORS.warning,
  },
  textArea: {
    minHeight: 130,
    paddingTop: SPACING.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  textInputWithIcon: {
    flex: 1,
    ...FONTS.body,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.md,
  },
  autoFilledBadge: {
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  autoFilledText: {
    ...FONTS.caption,
    fontSize: 9,
    color: COLORS.brandPrimary,
  },

  // ─── Submit button ──────────────────────────────────────────────────────────
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.brandPrimary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.xxl,
    ...SHADOWS.card,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    ...FONTS.body,
    fontWeight: '600',
    color: COLORS.textInverse,
  },

  // ─── Success state ──────────────────────────────────────────────────────────
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxxl,
  },
  successIconWrap: {
    marginBottom: SPACING.xxl,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    ...FONTS.h2,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  successMessage: {
    ...FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.lg,
  },
  successRef: {
    ...FONTS.bodySmall,
    color: COLORS.textTertiary,
    textAlign: 'center',
  },

  // ─── Empty state ────────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxxl,
    gap: SPACING.sm,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
  },
  emptyText: {
    ...FONTS.body,
    color: COLORS.textTertiary,
    textAlign: 'center',
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.infoSoft,
  },
  emptyActionText: {
    ...FONTS.bodySmall,
    color: COLORS.brandPrimary,
    fontWeight: '600',
  },

  // ─── Reclamation cards ──────────────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  cardTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  cardTypeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardType: {
    ...FONTS.bodySmall,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  statusBadgeText: {
    ...FONTS.caption,
    fontSize: 10,
  },
  cardDescription: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },

  // ─── Resolution box ─────────────────────────────────────────────────────────
  resolutionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.successSoft,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  resolutionLabel: {
    ...FONTS.caption,
    color: COLORS.success,
    marginBottom: 2,
  },
  resolutionText: {
    ...FONTS.bodySmall,
    color: COLORS.success,
    lineHeight: 20,
  },

  // ─── Card footer ────────────────────────────────────────────────────────────
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  cardDate: {
    ...FONTS.bodySmall,
    color: COLORS.textTertiary,
    fontSize: 12,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.textTertiary,
    marginHorizontal: 2,
  },

  // ─── Mediation card ─────────────────────────────────────────────────────────
  mediationCard: {
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.brandPrimary,
  },
  mediationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  mediationTitle: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
  },
  mediationText: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  mediationAddress: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.subtle,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  mediationAddressText: {
    ...FONTS.bodySmall,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
  mediationNote: {
    ...FONTS.bodySmall,
    color: COLORS.textTertiary,
    lineHeight: 18,
    fontSize: 12,
  },
});
