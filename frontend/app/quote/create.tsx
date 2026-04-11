import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { providerMultiplier } from '../../src/config/billing';
import { getServiceTypeLabel, getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { useAuth } from '../../src/auth';
import { supabase } from '../../src/lib/supabase';
import { submitQuoteWithLines } from '../../src/api';

// ─── Types ──────────────────────────────────────────────────────────────────

type LineItemUnit = 'unite' | 'heure' | 'm2' | 'forfait';

interface QuoteLine {
  id: string;
  type: 'labour' | 'parts' | 'displacement' | 'diagnostic' | 'custom';
  description: string;
  quantity: string;
  unit: LineItemUnit;
  unitPriceHT: string;
}

interface MissionSummary {
  id: string;
  description: string;
  category: string;
  propertyName: string;
  propertyCity: string;
  ownerName: string;
  ownerId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const UNIT_LABELS: Record<LineItemUnit, string> = {
  unite: 'Unité',
  heure: 'Heure',
  m2: 'm²',
  forfait: 'Forfait',
};

const LINE_TYPE_LABELS: Record<string, string> = {
  labour: "Main-d'oeuvre",
  parts: 'Fournitures',
  displacement: 'Déplacement',
  diagnostic: 'Diagnostic',
  custom: 'Autre',
};

const generateId = () => Math.random().toString(36).substring(2, 10);

const parseNum = (val: string): number => {
  const cleaned = val.replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const formatPrice = (amount: number): string => {
  return amount.toFixed(2).replace('.', ',') + ' €';
};

const computeLineTotal = (line: QuoteLine): number => {
  return parseNum(line.quantity) * parseNum(line.unitPriceHT);
};

// ─── Quick-add presets ──────────────────────────────────────────────────────

const QUICK_ADD_PRESETS: Array<{
  label: string;
  icon: string;
  type: QuoteLine['type'];
  unit: LineItemUnit;
  description: string;
}> = [
  { label: "Main-d'oeuvre", icon: 'construct-outline', type: 'labour', unit: 'heure', description: "Main-d'oeuvre" },
  { label: 'Fournitures', icon: 'cube-outline', type: 'parts', unit: 'unite', description: 'Fournitures' },
  { label: 'Déplacement', icon: 'car-outline', type: 'displacement', unit: 'forfait', description: 'Frais de déplacement' },
  { label: 'Diagnostic', icon: 'search-outline', type: 'diagnostic', unit: 'forfait', description: 'Diagnostic / Évaluation' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function CreateQuoteScreen() {
  const router = useRouter();
  const { missionId, emergencyId } = useLocalSearchParams<{ missionId?: string; emergencyId?: string }>();
  const { user } = useAuth();

  // Mission data
  const [missionData, setMissionData] = useState<MissionSummary | null>(null);
  const [loadingMission, setLoadingMission] = useState(true);

  // Provider VAT status
  const [isVatExempt, setIsVatExempt] = useState(false);

  // Line items
  const [lines, setLines] = useState<QuoteLine[]>([]);

  // Additional fields
  const [estimatedStartDate, setEstimatedStartDate] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [validityDays, setValidityDays] = useState('30');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isRenovation, setIsRenovation] = useState(false);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  // ─── Fetch mission data ─────────────────────────────────────────────────

  useEffect(() => {
    fetchMissionData();
    fetchProviderVatStatus();
  }, [missionId, emergencyId]);

  const fetchMissionData = async () => {
    try {
      setLoadingMission(true);

      if (emergencyId) {
        // Step 1: Fetch emergency data (without FK hints to avoid FK name mismatch)
        const { data, error } = await supabase
          .from('emergency_requests')
          .select('id, description, service_type, owner_id, property_id')
          .eq('id', emergencyId)
          .single();

        if (error) throw new Error(error.message);
        if (!data) throw new Error('Urgence introuvable');

        // Step 2: Fetch related data in parallel
        const [propRes, ownerRes] = await Promise.all([
          data.property_id
            ? supabase.from('properties').select('name, city').eq('id', data.property_id).single()
            : Promise.resolve({ data: null }),
          supabase.from('users').select('name').eq('id', data.owner_id).single(),
        ]);

        setMissionData({
          id: data.id,
          description: data.description || '',
          category: getServiceTypeLabel(data.service_type || ''),
          propertyName: propRes.data?.name || '',
          propertyCity: propRes.data?.city || '',
          ownerName: ownerRes.data?.name || '',
          ownerId: data.owner_id,
        });
      } else if (missionId) {
        const { data, error } = await supabase
          .from('missions')
          .select('id, description, mission_type, owner_id, property_id')
          .eq('id', missionId)
          .single();

        if (error) throw new Error(error.message);
        if (!data) throw new Error('Mission introuvable');

        const [propRes, ownerRes] = await Promise.all([
          data.property_id
            ? supabase.from('properties').select('name, city').eq('id', data.property_id).single()
            : Promise.resolve({ data: null }),
          supabase.from('users').select('name').eq('id', data.owner_id).single(),
        ]);

        setMissionData({
          id: data.id,
          description: data.description || '',
          category: getMissionTypeLabel(data.mission_type || ''),
          propertyName: propRes.data?.name || '',
          propertyCity: propRes.data?.city || '',
          ownerName: ownerRes.data?.name || '',
          ownerId: data.owner_id,
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur inconnue';
      console.warn('[Quote] Error fetching mission/emergency:', message);
      // Non-blocking: the form is still usable without mission summary
    } finally {
      setLoadingMission(false);
    }
  };

  const fetchProviderVatStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data } = await supabase
        .from('users')
        .select('is_vat_exempt')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setIsVatExempt(data.is_vat_exempt === true);
      }
    } catch {
      // Default to not exempt
    }
  };

  // ─── Line item management ──────────────────────────────────────────────

  const addLine = useCallback((preset?: typeof QUICK_ADD_PRESETS[0]) => {
    const newLine: QuoteLine = {
      id: generateId(),
      type: preset?.type || 'custom',
      description: preset?.description || '',
      quantity: '1',
      unit: preset?.unit || 'unite',
      unitPriceHT: '',
    };
    setLines(prev => [...prev, newLine]);
    setExpandedLineId(newLine.id);
  }, []);

  const updateLine = useCallback((lineId: string, field: keyof QuoteLine, value: string) => {
    setLines(prev => prev.map(l =>
      l.id === lineId ? { ...l, [field]: value } : l
    ));
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines(prev => prev.filter(l => l.id !== lineId));
    if (expandedLineId === lineId) setExpandedLineId(null);
  }, [expandedLineId]);

  // ─── Calculations ─────────────────────────────────────────────────────

  const totalHT = lines.reduce((sum, line) => sum + computeLineTotal(line), 0);

  const vatRate = isVatExempt ? 0 : (isRenovation ? 0.10 : 0.20);
  const vatAmount = totalHT * vatRate;
  const totalTTC = totalHT + vatAmount;

  const vatLabel = isVatExempt
    ? 'TVA non applicable, art. 293 B du CGI'
    : isRenovation
      ? 'TVA 10% (travaux de rénovation)'
      : 'TVA 20%';

  // ─── Submit ───────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (lines.length === 0) {
      Alert.alert('Devis incomplet', 'Ajoutez au moins une ligne au devis.');
      return;
    }

    const hasEmptyLine = lines.some(l => !l.description.trim() || parseNum(l.unitPriceHT) === 0);
    if (hasEmptyLine) {
      Alert.alert('Ligne incomplète', 'Chaque ligne doit avoir une description et un prix unitaire.');
      return;
    }

    Alert.alert(
      'Envoyer le devis ?',
      `Montant total TTC : ${formatPrice(totalTTC)}\nLe propriétaire sera notifié immédiatement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          style: 'default',
          onPress: async () => {
            try {
              setSubmitting(true);
              await submitQuoteWithLines({
                missionId: missionId || undefined,
                emergencyId: emergencyId || undefined,
                lines: lines.map(l => ({
                  type: l.type,
                  description: l.description,
                  quantity: parseNum(l.quantity),
                  unit: l.unit,
                  unit_price_ht: parseNum(l.unitPriceHT),
                })),
                validity_days: parseInt(validityDays, 10) || 30,
                estimated_start_date: estimatedStartDate || undefined,
                estimated_duration: estimatedDuration || undefined,
                description: additionalNotes || undefined,
                is_renovation: isRenovation,
                is_vat_exempt: isVatExempt,
              });

              Alert.alert(
                'Devis envoyé',
                'Le propriétaire a reçu votre devis et sera notifié.',
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (e: unknown) {
              Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'envoyer le devis.");
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handlePreview = async () => {
    if (lines.length === 0) {
      Alert.alert('Devis vide', 'Ajoutez au moins une ligne pour prévisualiser.');
      return;
    }

    // Show a summary alert — the full PDF is generated after submission
    const linesPreview = lines.map(l =>
      `• ${l.description || LINE_TYPE_LABELS[l.type]}: ${parseNum(l.quantity)} x ${formatPrice(parseNum(l.unitPriceHT))} = ${formatPrice(computeLineTotal(l))}`
    ).join('\n');

    Alert.alert(
      'Aperçu du devis',
      `${missionData?.category || 'Prestation'} — ${missionData?.propertyName || ''}\n\n` +
      `${linesPreview}\n\n` +
      `Total HT : ${formatPrice(totalHT)}\n` +
      `${vatLabel} : ${formatPrice(vatAmount)}\n` +
      `Total TTC : ${formatPrice(totalTTC)}\n\n` +
      `Validité : ${validityDays} jours\n` +
      `Le document PDF complet sera généré à l'envoi.`,
      [{ text: 'OK' }]
    );

  };

  // ─── Unit picker ──────────────────────────────────────────────────────

  const cycleUnit = (lineId: string, currentUnit: LineItemUnit) => {
    const units: LineItemUnit[] = ['unite', 'heure', 'm2', 'forfait'];
    const idx = units.indexOf(currentUnit);
    const nextUnit = units[(idx + 1) % units.length];
    updateLine(lineId, 'unit', nextUnit);
  };

  // ─── Render ───────────────────────────────────────────────────────────

  if (loadingMission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Créer un devis</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mission summary card */}
          {missionData && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.brandPrimary} />
                <Text style={styles.cardTitle}>Mission</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Bien</Text>
                <Text style={styles.summaryValue}>
                  {missionData.propertyName}{missionData.propertyCity ? ` — ${missionData.propertyCity}` : ''}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Catégorie</Text>
                <Text style={styles.summaryValue}>{missionData.category}</Text>
              </View>
              {missionData.description ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Description</Text>
                  <Text style={[styles.summaryValue, { flex: 1 }]} numberOfLines={3}>
                    {missionData.description}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Quick-add buttons */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="add-circle-outline" size={20} color={COLORS.brandPrimary} />
              <Text style={styles.cardTitle}>Ajouter une ligne</Text>
            </View>
            <View style={styles.quickAddRow}>
              {QUICK_ADD_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.type}
                  style={styles.quickAddButton}
                  onPress={() => addLine(preset)}
                >
                  <Ionicons name={preset.icon as keyof typeof Ionicons.glyphMap} size={18} color={COLORS.brandPrimary} />
                  <Text style={styles.quickAddLabel}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.quickAddButton, styles.quickAddCustom]}
                onPress={() => addLine()}
              >
                <Ionicons name="add-outline" size={18} color={COLORS.textSecondary} />
                <Text style={[styles.quickAddLabel, { color: COLORS.textSecondary }]}>Autre</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Line items */}
          {lines.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="list-outline" size={20} color={COLORS.brandPrimary} />
                <Text style={styles.cardTitle}>Lignes du devis ({lines.length})</Text>
              </View>

              {lines.map((line, index) => {
                const lineTotal = computeLineTotal(line);
                const isExpanded = expandedLineId === line.id;

                return (
                  <View key={line.id} style={styles.lineItem}>
                    {/* Line header — tap to expand/collapse */}
                    <TouchableOpacity
                      style={styles.lineHeader}
                      onPress={() => setExpandedLineId(isExpanded ? null : line.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.lineHeaderLeft}>
                        <View style={styles.lineNumberBadge}>
                          <Text style={styles.lineNumberText}>{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lineTypeBadge}>
                            {LINE_TYPE_LABELS[line.type]}
                          </Text>
                          <Text style={styles.lineDescription} numberOfLines={1}>
                            {line.description || 'Description...'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.lineHeaderRight}>
                        <Text style={styles.lineTotalText}>{formatPrice(lineTotal)}</Text>
                        <TouchableOpacity
                          onPress={() => removeLine(line.id)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={styles.removeButton}
                        >
                          <Ionicons name="close-circle" size={22} color={COLORS.urgency} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>

                    {/* Expanded editing area */}
                    {isExpanded && (
                      <View style={styles.lineExpanded}>
                        {/* Description */}
                        <Text style={styles.inputLabel}>Description</Text>
                        <TextInput
                          style={styles.textInput}
                          value={line.description}
                          onChangeText={(v) => updateLine(line.id, 'description', v)}
                          placeholder="Décrivez la prestation..."
                          placeholderTextColor={COLORS.textTertiary}
                        />

                        {/* Quantity + Unit + Price row */}
                        <View style={styles.lineFieldsRow}>
                          <View style={styles.lineFieldSmall}>
                            <Text style={styles.inputLabel}>Quantité</Text>
                            <TextInput
                              style={styles.textInput}
                              value={line.quantity}
                              onChangeText={(v) => updateLine(line.id, 'quantity', v)}
                              keyboardType="decimal-pad"
                              placeholder="1"
                              placeholderTextColor={COLORS.textTertiary}
                            />
                          </View>

                          <View style={styles.lineFieldSmall}>
                            <Text style={styles.inputLabel}>Unité</Text>
                            <TouchableOpacity
                              style={styles.unitPicker}
                              onPress={() => cycleUnit(line.id, line.unit)}
                            >
                              <Text style={styles.unitPickerText}>{UNIT_LABELS[line.unit]}</Text>
                              <Ionicons name="swap-vertical-outline" size={16} color={COLORS.brandPrimary} />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.lineFieldMedium}>
                            <Text style={styles.inputLabel}>Prix unit. HT</Text>
                            <TextInput
                              style={styles.textInput}
                              value={line.unitPriceHT}
                              onChangeText={(v) => updateLine(line.id, 'unitPriceHT', v)}
                              keyboardType="decimal-pad"
                              placeholder="0,00"
                              placeholderTextColor={COLORS.textTertiary}
                            />
                          </View>
                        </View>

                        {/* Line total */}
                        <View style={styles.lineTotalRow}>
                          <Text style={styles.lineTotalLabel}>Total HT</Text>
                          <Text style={styles.lineTotalAmount}>{formatPrice(lineTotal)}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Totals */}
          {lines.length > 0 && (
            <View style={[styles.card, styles.totalsCard]}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total HT</Text>
                <Text style={styles.totalValue}>{formatPrice(totalHT)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{vatLabel}</Text>
                <Text style={styles.totalValue}>
                  {isVatExempt ? '—' : formatPrice(vatAmount)}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalTTCLabel}>Total TTC</Text>
                <Text style={styles.totalTTCValue}>{formatPrice(totalTTC)}</Text>
              </View>
              <View style={[styles.divider, { marginTop: SPACING.sm }]} />
              <View style={styles.totalRow}>
                <Text style={{ ...FONTS.body, color: COLORS.success, fontWeight: '600' }}>💰 Vous recevrez</Text>
                <Text style={{ ...FONTS.h3, color: COLORS.success, fontWeight: '700' }}>
                  {(Math.round(totalTTC * providerMultiplier * 100) / 100).toFixed(2)}€
                </Text>
              </View>
            </View>
          )}

          {/* Additional info */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="settings-outline" size={20} color={COLORS.brandPrimary} />
              <Text style={styles.cardTitle}>Informations complémentaires</Text>
            </View>

            <Text style={styles.inputLabel}>Date de début estimée</Text>
            <TextInput
              style={styles.textInput}
              value={estimatedStartDate}
              onChangeText={setEstimatedStartDate}
              placeholder="ex: 28/03/2026"
              placeholderTextColor={COLORS.textTertiary}
            />

            <Text style={styles.inputLabel}>Durée estimée des travaux</Text>
            <TextInput
              style={styles.textInput}
              value={estimatedDuration}
              onChangeText={setEstimatedDuration}
              placeholder="ex: 2 heures, 3 jours..."
              placeholderTextColor={COLORS.textTertiary}
            />

            <Text style={styles.inputLabel}>Validité du devis (jours)</Text>
            <TextInput
              style={styles.textInput}
              value={validityDays}
              onChangeText={setValidityDays}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor={COLORS.textTertiary}
            />

            <Text style={styles.inputLabel}>Conditions particulières</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={additionalNotes}
              onChangeText={setAdditionalNotes}
              placeholder="Conditions, remarques, détails supplémentaires..."
              placeholderTextColor={COLORS.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Renovation toggle */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Travaux de rénovation (TVA 10%)</Text>
                <Text style={styles.switchHint}>
                  Applicable pour les travaux d'amélioration, transformation ou entretien dans un logement de plus de 2 ans.
                </Text>
              </View>
              <Switch
                value={isRenovation}
                onValueChange={setIsRenovation}
                trackColor={{ false: COLORS.border, true: COLORS.brandSecondary }}
                thumbColor={isRenovation ? COLORS.brandPrimary : COLORS.textTertiary}
                disabled={isVatExempt}
              />
            </View>
            {isVatExempt && (
              <Text style={styles.vatExemptNote}>
                Vous êtes en franchise de base de TVA. La TVA n'est pas applicable.
              </Text>
            )}
          </View>

          {/* Bottom spacing for buttons */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.previewButton}
          onPress={handlePreview}
          disabled={previewing || lines.length === 0}
        >
          {previewing ? (
            <ActivityIndicator size="small" color={COLORS.brandPrimary} />
          ) : (
            <>
              <Ionicons name="eye-outline" size={20} color={COLORS.brandPrimary} />
              <Text style={styles.previewButtonText}>Aperçu</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, (submitting || lines.length === 0) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || lines.length === 0}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={COLORS.textInverse} />
          ) : (
            <>
              <Ionicons name="send-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.submitButtonText}>Envoyer le devis</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    ...FONTS.body,
    color: COLORS.textSecondary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.paper,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },

  // Card
  card: {
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
  },

  // Mission summary
  summaryRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  summaryLabel: {
    ...FONTS.bodySmall,
    color: COLORS.textTertiary,
    width: 90,
  },
  summaryValue: {
    ...FONTS.body,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },

  // Quick add
  quickAddRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.infoSoft,
    borderWidth: 1,
    borderColor: COLORS.brandSecondary + '30',
  },
  quickAddCustom: {
    backgroundColor: COLORS.subtle,
    borderColor: COLORS.border,
  },
  quickAddLabel: {
    ...FONTS.bodySmall,
    color: COLORS.brandPrimary,
    fontWeight: '600',
  },

  // Line items
  lineItem: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    backgroundColor: COLORS.subtle,
  },
  lineHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  lineNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.brandPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lineNumberText: {
    ...FONTS.bodySmall,
    color: COLORS.textInverse,
    fontWeight: '700',
    fontSize: 11,
  },
  lineTypeBadge: {
    ...FONTS.caption,
    color: COLORS.brandPrimary,
    marginBottom: 2,
  },
  lineDescription: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  lineHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  lineTotalText: {
    ...FONTS.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  removeButton: {
    padding: 2,
  },

  // Line expanded
  lineExpanded: {
    padding: SPACING.md,
    backgroundColor: COLORS.paper,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  lineFieldsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  lineFieldSmall: {
    flex: 1,
  },
  lineFieldMedium: {
    flex: 1.5,
  },
  lineTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  lineTotalLabel: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  lineTotalAmount: {
    ...FONTS.body,
    color: COLORS.brandPrimary,
    fontWeight: '700',
  },

  // Unit picker
  unitPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.subtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    minHeight: 44,
  },
  unitPickerText: {
    ...FONTS.body,
    color: COLORS.textPrimary,
  },

  // Inputs
  inputLabel: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  textInput: {
    backgroundColor: COLORS.subtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    ...FONTS.body,
    color: COLORS.textPrimary,
    minHeight: 44,
  },
  textArea: {
    minHeight: 88,
    paddingTop: SPACING.md,
  },

  // Totals
  totalsCard: {
    backgroundColor: COLORS.paper,
    borderWidth: 2,
    borderColor: COLORS.brandPrimary + '20',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  totalLabel: {
    ...FONTS.body,
    color: COLORS.textSecondary,
  },
  totalValue: {
    ...FONTS.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  totalTTCLabel: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
  },
  totalTTCValue: {
    ...FONTS.h2,
    color: COLORS.brandPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },

  // Switch row
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  switchLabel: {
    ...FONTS.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  switchHint: {
    ...FONTS.bodySmall,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  vatExemptNote: {
    ...FONTS.bodySmall,
    color: COLORS.warning,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    backgroundColor: COLORS.paper,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.float,
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.brandPrimary,
    backgroundColor: COLORS.paper,
  },
  previewButtonText: {
    ...FONTS.body,
    color: COLORS.brandPrimary,
    fontWeight: '700',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.brandPrimary,
  },
  submitButtonText: {
    ...FONTS.body,
    color: COLORS.textInverse,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
