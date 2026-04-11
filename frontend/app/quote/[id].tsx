import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Image, Modal, TextInput, Linking, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, SERVICE_TYPE_LABELS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getQuoteDetails, acceptQuote, acceptEmergencyQuote, refuseQuote, createPaymentIntent, supabase } from '../../src/api';
import { useStripe } from '@stripe/stripe-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { missionKeys } from '../../src/hooks/useMissions';
import { emergencyKeys } from '../../src/hooks/useEmergencies';
import type { QuoteDetailEnriched, QuoteLineItem, PaymentMetadata } from '../../src/types/api';
import { viewOrShareDocument, isPrintAvailable } from '../../src/utils/pdf-helper';
import { COMMISSION_RATE } from '../../src/utils/commission';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number): string => {
  // Manual formatting to avoid Hermes/Android toLocaleString issues
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const sign = amount < 0 ? '-' : '';
  // Add thousands separator (space in French convention)
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return `${sign}${formatted},${decPart} \u20AC`;
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return dateStr; }
};

const SPECIALTY_LABELS: Record<string, string> = {
  plumbing: 'Plomberie',
  electrical: 'Electricite',
  locksmith: 'Serrurerie',
  jacuzzi: 'Jacuzzi/Spa',
  repair: 'Reparation',
  cleaning: 'Menage',
  linen: 'Linge',
  maintenance: 'Maintenance',
};

const ALTIO_SERVICE_FEE_RATE = COMMISSION_RATE; // 10% frais de service (cf. src/utils/commission.ts)

// ─── Component ───────────────────────────────────────────────────────────────

export default function QuoteDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth(); // Ensure user is authenticated
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const queryClient = useQueryClient();

  const [quote, setQuote] = useState<QuoteDetailEnriched | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [refusing, setRefusing] = useState(false);

  // Modals
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRefuseModal, setShowRefuseModal] = useState(false);
  const [acceptChecked, setAcceptChecked] = useState(false);
  const [refuseReason, setRefuseReason] = useState('');

  // ─── Data fetching ───────────────────────────────────────────────────────

  const fetchQuote = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getQuoteDetails(id);
      setQuote(data);
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de charger le devis.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchQuote(); }, [fetchQuote]);

  // ─── Computed values ─────────────────────────────────────────────────────

  const repairCostHT = quote?.repair_cost || 0;
  const lineItems: QuoteLineItem[] = quote?.line_items || [];
  const hasLineItems = lineItems.length > 0;

  // Compute sub-total from line items, or fallback to repair_cost
  const subTotalHT = hasLineItems
    ? lineItems.reduce((sum: number, item: QuoteLineItem) => sum + ((item.quantity || 1) * (Number(item.unit_price_ht) || item.unit_price || 0)), 0)
    : repairCostHT;

  // TVA computation — lire les valeurs sauvegardées en base
  const isExemptTVA = quote?.is_vat_exempt === true;
  const tvaRate = isExemptTVA ? 0 : Number(quote?.tva_rate ?? 0.20);
  const tvaAmount = Math.round(subTotalHT * tvaRate * 100) / 100;
  const totalTTC = Math.round((subTotalHT + tvaAmount) * 100) / 100;

  // Frais de service Altio = 10% du TTC de la prestation
  const fraisServiceTTC = Math.round(totalTTC * ALTIO_SERVICE_FEE_RATE * 100) / 100;

  // Total à payer par le propriétaire
  const totalAPayer = Math.round((totalTTC + fraisServiceTTC) * 100) / 100;

  // Validity
  const validUntil = quote?.valid_until || quote?.expires_at;
  const isExpired = validUntil ? (() => {
    const expiry = new Date(validUntil);
    // If the date string has no time component, treat it as end-of-day local time
    if (validUntil.length <= 10) expiry.setHours(23, 59, 59, 999);
    return expiry < new Date();
  })() : false;

  // Context info
  const missionData = quote?.mission;
  const emergencyData = quote?.emergency;
  const propertyName = missionData?.property?.name || emergencyData?.property?.name || '';
  const propertyAddress = missionData?.property?.address || emergencyData?.property?.address || '';
  const missionType = missionData?.mission_type || emergencyData?.service_type || '';
  const missionDescription = missionData?.description || emergencyData?.description || '';
  const isEmergency = !!emergencyData;

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleAcceptConfirm = async () => {
    if (!acceptChecked) {
      Alert.alert('Attention', 'Veuillez accepter les conditions du devis avant de confirmer.');
      return;
    }
    setAccepting(true);
    try {
      // Create payment intent
      const metadata: PaymentMetadata = { quoteId: id };
      if (missionData?.id) metadata.missionId = missionData.id as string;
      if (emergencyData?.id) metadata.emergencyId = emergencyData.id as string;

      const { clientSecret, paymentIntentId } = await createPaymentIntent(
        totalAPayer,
        metadata,
        'manual' // manual capture for quotes
      );

      // Init Stripe payment sheet
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Altio',
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: true,
      });
      if (initError) throw new Error(initError.message);

      // Present payment sheet
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.message !== 'The payment has been canceled' && presentError.message !== 'Canceled') {
          throw new Error(presentError.message);
        }
        setAccepting(false);
        return; // User cancelled payment
      }

      // Accept the quote — use the correct function for emergencies vs missions
      if (emergencyData?.id) {
        await acceptEmergencyQuote(emergencyData.id, id!, paymentIntentId);
      } else {
        await acceptQuote(id!, missionData?.id);
      }

      // Invalidate caches so both sides see the update immediately
      if (emergencyData?.id) {
        queryClient.invalidateQueries({ queryKey: emergencyKeys.detail(emergencyData.id) });
        queryClient.invalidateQueries({ queryKey: emergencyKeys.all });
      }
      if (missionData?.id) {
        queryClient.invalidateQueries({ queryKey: missionKeys.detail(missionData.id as string) });
        queryClient.invalidateQueries({ queryKey: missionKeys.all });
      }

      setShowAcceptModal(false);
      Alert.alert(
        'Devis accepte',
        'Le prestataire a ete notifie et va planifier son intervention.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setAccepting(false);
    }
  };

  const handleRefuseConfirm = async () => {
    setRefusing(true);
    try {
      await refuseQuote(id!, refuseReason.trim() || undefined);
      setShowRefuseModal(false);
      Alert.alert(
        'Devis refuse',
        'Le prestataire a ete notifie de votre decision.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setRefusing(false);
    }
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleDownloadPDF = async () => {
    const url = quote?.quote_document_url;
    if (!url) {
      Alert.alert('Information', 'Le document n\'est pas encore disponible. Cliquez sur "Générer le devis" d\'abord.');
      return;
    }
    const quoteNum = quote?.quote_number || id || 'devis';
    await viewOrShareDocument({ url, title: `Devis ${quoteNum}` });
  };

  const handleRegeneratePdf = async () => {
    try {
      setGeneratingPdf(true);
      const { data, error: fnError } = await supabase.functions.invoke('generate-quote', {
        body: { quoteId: id },
      });

      if (fnError) {
        console.error('[generate-quote] fnError:', fnError);
        // Lire le vrai body d'erreur depuis FunctionsHttpError
        let errMsg = 'Erreur inconnue';
        try {
          if (fnError.context && typeof fnError.context.json === 'function') {
            const body = await fnError.context.json();
            errMsg = body?.error || JSON.stringify(body);
          } else {
            errMsg = fnError.message || String(fnError);
          }
        } catch {
          errMsg = fnError.message || String(fnError);
        }
        Alert.alert('Erreur', `Échec PDF : ${errMsg}`);
        return;
      }

      const generatedUrl = data?.document_url || data?.url;
      if (generatedUrl) {
        setQuote(prev => prev ? { ...prev, quote_document_url: generatedUrl, quote_number: data?.quoteNumber } : prev);
        Alert.alert('Succès', 'Le devis PDF a été généré.');
      } else {
        Alert.alert('Erreur', 'La génération du PDF a échoué (pas d\'URL retournée).');
      }
    } catch (e) {
      console.error('[generate-quote] catch:', e);
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Échec génération PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // ─── Loading / Error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        <Text style={[styles.loadingText, { marginTop: SPACING.md }]}>Chargement du devis...</Text>
      </SafeAreaView>
    );
  }

  if (!quote) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="document-text-outline" size={48} color={COLORS.textTertiary} />
        <Text style={[styles.loadingText, { marginTop: SPACING.md }]}>Devis introuvable</Text>
        <TouchableOpacity style={styles.backBtnLarge} onPress={() => router.back()}>
          <Text style={styles.backBtnLargeText}>Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isPending = quote.status === 'pending' || quote.status === 'sent';
  const isAccepted = quote.status === 'accepted';
  const isRefused = quote.status === 'refused';
  const isProvider = user?.id === quote.provider_id;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ━━━ Header ━━━ */}
      <LinearGradient colors={GRADIENT.header as readonly [string, string, string]} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isProvider ? 'Mon devis' : 'Devis reçu'}</Text>
        <View style={{ width: 48 }} />
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ━━━ Quote number ━━━ */}
        {quote.quote_number && (
          <View style={{ backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.md, alignItems: 'center' }}>
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: COLORS.textPrimary }}>{quote.quote_number}</Text>
          </View>
        )}

        {/* ━━━ Validity badge ━━━ */}
        {validUntil && (
          <View style={[styles.validityBadge, isExpired && styles.validityExpired]}>
            <Ionicons
              name={isExpired ? 'time-outline' : 'checkmark-circle-outline'}
              size={16}
              color={isExpired ? COLORS.urgency : COLORS.success}
            />
            <Text style={[styles.validityText, isExpired && { color: COLORS.urgency }]}>
              {isExpired ? `Expire le ${formatDate(validUntil)}` : `Valide jusqu'au ${formatDate(validUntil)}`}
            </Text>
          </View>
        )}

        {/* Status badge for already processed quotes */}
        {isAccepted && (
          <View style={[styles.statusBanner, { backgroundColor: COLORS.successSoft }]}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={[styles.statusBannerText, { color: COLORS.success }]}>
              Devis accepte{quote.accepted_at ? ` le ${formatDate(quote.accepted_at)}` : ''}
            </Text>
          </View>
        )}
        {isRefused && (
          <View style={[styles.statusBanner, { backgroundColor: COLORS.urgencySoft }]}>
            <Ionicons name="close-circle" size={20} color={COLORS.urgency} />
            <Text style={[styles.statusBannerText, { color: COLORS.urgency }]}>Devis refuse</Text>
          </View>
        )}

        {/* ━━━ Provider info card ━━━ */}
        <View style={styles.card}>
          <View style={styles.providerRow}>
            {quote.provider_picture ? (
              <Image source={{ uri: quote.provider_picture }} style={styles.providerAvatar} />
            ) : (
              <View style={styles.providerAvatarFallback}>
                <Text style={styles.providerAvatarText}>
                  {(quote.provider_name || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{quote.provider_name || 'Prestataire'}</Text>
              {quote.provider_company && (
                <Text style={styles.providerCompany}>{quote.provider_company}</Text>
              )}
              {quote.provider_siret && (
                <Text style={styles.providerSiret}>SIRET : {quote.provider_siret}</Text>
              )}
            </View>
            {/* Rating */}
            {(quote.provider_rating ?? 0) > 0 && (quote.provider_reviews ?? 0) > 0 && (
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={14} color={COLORS.warning} />
                <Text style={styles.ratingValue}>{quote.provider_rating!.toFixed(1)}</Text>
                <Text style={styles.ratingCount}>({quote.provider_reviews})</Text>
              </View>
            )}
          </View>

          {/* Specialties */}
          {(quote.provider_specialties?.length ?? 0) > 0 && (
            <View style={styles.specialtiesRow}>
              {quote.provider_specialties!.map((s: string) => (
                <View key={s} style={styles.specialtyChip}>
                  <Text style={styles.specialtyChipText}>
                    {SPECIALTY_LABELS[s] || s}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ━━━ Mission context ━━━ */}
        <View style={styles.card}>
          <View style={styles.contextRow}>
            <Ionicons name={isEmergency ? 'alert-circle' : 'home-outline'} size={18} color={isEmergency ? COLORS.urgency : COLORS.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.contextLabel}>
                {isEmergency ? 'Urgence' : 'Mission'} {SERVICE_TYPE_LABELS[missionType] || missionType}
              </Text>
              {propertyName ? <Text style={styles.contextProperty}>{propertyName}</Text> : null}
              {propertyAddress ? <Text style={styles.contextAddress}>{propertyAddress}</Text> : null}
            </View>
          </View>
          {missionDescription ? (
            <Text style={styles.contextDescription} numberOfLines={3}>{missionDescription}</Text>
          ) : null}
        </View>

        {/* ━━━ Quote details — Line items ━━━ */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Detail du devis</Text>

          {/* Line items table header */}
          {hasLineItems && (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Description</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>Qte</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>P.U. HT</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.5, textAlign: 'right' }]}>Total HT</Text>
              </View>

              {lineItems.map((item: QuoteLineItem, index: number) => {
                const qty = item.quantity || 1;
                const unitPrice = Number(item.unit_price_ht) || item.unit_price || 0;
                const lineTotal = qty * unitPrice;
                return (
                  <View key={item.id || index} style={styles.tableRow}>
                    <View style={{ flex: 3 }}>
                      <Text style={styles.tableCell}>{item.description}</Text>
                      {item.unit && <Text style={styles.tableCellUnit}>{item.unit}</Text>}
                    </View>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{qty}</Text>
                    <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right' }]}>{formatCurrency(unitPrice)}</Text>
                    <Text style={[styles.tableCellBold, { flex: 1.5, textAlign: 'right' }]}>{formatCurrency(lineTotal)}</Text>
                  </View>
                );
              })}
            </>
          )}

          {/* If no line items, show single amount */}
          {!hasLineItems && (
            <View style={styles.singleAmountRow}>
              <Text style={styles.singleAmountLabel}>
                {quote.description || 'Prestation'}
              </Text>
              <Text style={styles.singleAmountValue}>{formatCurrency(repairCostHT)}</Text>
            </View>
          )}

          {/* ━━━ Totals ━━━ */}
          <View style={styles.separator} />

          {/* Sous-total HT */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Sous-total HT</Text>
            <Text style={styles.totalValue}>{formatCurrency(subTotalHT)}</Text>
          </View>

          {/* TVA */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {isExemptTVA
                ? 'TVA non applicable (art. 293 B du CGI)'
                : `TVA (${Math.round(tvaRate * 100)}%)`
              }
            </Text>
            <Text style={styles.totalValue}>
              {isExemptTVA ? '0,00 \u20AC' : formatCurrency(tvaAmount)}
            </Text>
          </View>

          {/* Total TTC prestation */}
          <View style={[styles.totalRow, styles.totalRowBold]}>
            <Text style={styles.totalLabelBold}>Total prestation TTC</Text>
            <Text style={styles.totalValueBold}>{formatCurrency(totalTTC)}</Text>
          </View>

          <View style={styles.separatorLight} />

          {/* Frais de service Altio */}
          <View style={styles.totalRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
              <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.textTertiary} />
              <Text style={styles.totalLabel}>Frais de service Altio</Text>
            </View>
            <Text style={styles.totalValue}>{formatCurrency(fraisServiceTTC)}</Text>
          </View>

          {/* TOTAL A PAYER */}
          <View style={styles.grandTotalContainer}>
            <Text style={styles.grandTotalLabel}>TOTAL A PAYER</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(totalAPayer)}</Text>
          </View>
        </View>

        {/* ━━━ Additional info ━━━ */}
        <View style={styles.card}>
          {quote.estimated_start_date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.textTertiary} />
              <Text style={styles.infoLabel}>Debut estime</Text>
              <Text style={styles.infoValue}>{formatDate(quote.estimated_start_date)}</Text>
            </View>
          )}
          {(quote.repair_delay_days != null && quote.repair_delay_days > 0) && (
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={COLORS.textTertiary} />
              <Text style={styles.infoLabel}>Duree estimee</Text>
              <Text style={styles.infoValue}>
                {quote.repair_delay_days} {quote.repair_delay_days > 1 ? 'jours' : 'jour'}
              </Text>
            </View>
          )}
          {validUntil && (
            <View style={styles.infoRow}>
              <Ionicons name="hourglass-outline" size={16} color={COLORS.textTertiary} />
              <Text style={styles.infoLabel}>Validite du devis</Text>
              <Text style={[styles.infoValue, isExpired && { color: COLORS.urgency }]}>
                {formatDate(validUntil)}
              </Text>
            </View>
          )}
          {quote.conditions && (
            <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
              <Ionicons name="document-text-outline" size={16} color={COLORS.textTertiary} style={{ marginTop: 2 }} />
              <Text style={[styles.infoLabel, { flex: 0 }]}>Conditions</Text>
              <Text style={[styles.infoValue, { flex: 1 }]}>{quote.conditions}</Text>
            </View>
          )}
        </View>

        {/* ━━━ Description block ━━━ */}
        {quote.description && !hasLineItems && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Description des travaux</Text>
            <View style={styles.descriptionBlock}>
              <Ionicons name="document-text-outline" size={16} color={COLORS.textTertiary} />
              <Text style={styles.descriptionText}>{quote.description}</Text>
            </View>
          </View>
        )}

        {/* ━━━ PDF Download button ━━━ */}
        {quote.quote_document_url ? (
          <TouchableOpacity
            style={styles.pdfButton}
            onPress={handleDownloadPDF}
            disabled={generatingPdf}
          >
            {generatingPdf ? (
              <ActivityIndicator size="small" color={COLORS.brandPrimary} />
            ) : (
              <Ionicons name="download-outline" size={20} color={COLORS.brandPrimary} />
            )}
            <Text style={styles.pdfButtonText}>
              {generatingPdf ? 'Génération...' : (isPrintAvailable() ? 'Télécharger le PDF' : 'Voir le devis')}
            </Text>
            {!generatingPdf && <Ionicons name="share-outline" size={16} color={COLORS.brandPrimary} />}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.pdfButton}
            onPress={handleRegeneratePdf}
            disabled={generatingPdf}
          >
            {generatingPdf ? (
              <ActivityIndicator size="small" color={COLORS.brandPrimary} />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={COLORS.brandPrimary} />
            )}
            <Text style={styles.pdfButtonText}>
              {generatingPdf ? 'Generation du PDF...' : 'Generer le devis (PDF)'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Spacer for sticky buttons */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ━━━ Sticky action buttons ━━━ */}
      {isPending && !isExpired && !isProvider && (
        <View style={styles.stickyActions}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => { setAcceptChecked(false); setShowAcceptModal(true); }}
          >
            <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
            <Text style={styles.acceptButtonText}>Accepter le devis</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refuseButton}
            onPress={() => { setRefuseReason(''); setShowRefuseModal(true); }}
          >
            <Ionicons name="close-circle-outline" size={20} color={COLORS.urgency} />
            <Text style={styles.refuseButtonText}>Refuser</Text>
          </TouchableOpacity>
        </View>
      )}

      {isPending && isExpired && !isProvider && (
        <View style={styles.stickyActions}>
          <View style={[styles.expiredBanner]}>
            <Ionicons name="time-outline" size={18} color={COLORS.urgency} />
            <Text style={styles.expiredBannerText}>
              Ce devis a expire. Contactez le prestataire pour un nouveau devis.
            </Text>
          </View>
        </View>
      )}

      {/* ━━━ Accept confirmation modal ━━━ */}
      <Modal visible={showAcceptModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirmer l'acceptation</Text>

            {/* Recap */}
            <View style={styles.modalRecap}>
              <View style={styles.modalRecapRow}>
                <Text style={styles.modalRecapLabel}>Prestation TTC</Text>
                <Text style={styles.modalRecapValue}>{formatCurrency(totalTTC)}</Text>
              </View>
              <View style={styles.modalRecapRow}>
                <Text style={styles.modalRecapLabel}>Frais de service</Text>
                <Text style={styles.modalRecapValue}>{formatCurrency(fraisServiceTTC)}</Text>
              </View>
              <View style={[styles.modalRecapRow, styles.modalRecapTotal]}>
                <Text style={styles.modalRecapTotalLabel}>Total</Text>
                <Text style={styles.modalRecapTotalValue}>{formatCurrency(totalAPayer)}</Text>
              </View>
            </View>

            {/* Checkbox */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAcceptChecked(!acceptChecked)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, acceptChecked && styles.checkboxChecked]}>
                {acceptChecked && <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />}
              </View>
              <Text style={styles.checkboxLabel}>
                Bon pour accord — Devis recu avant l'execution des travaux
              </Text>
            </TouchableOpacity>

            {/* Legal text — electronic signature */}
            <Text style={styles.legalText}>
              En acceptant ce devis, vous signez electroniquement ce document
              (horodatage et consentement enregistres conformement au reglement eIDAS).
              Vous autorisez le prelevement de {formatCurrency(totalAPayer)} via Stripe.
              Conformement a l'art. L221-28 du Code de la consommation, vous renoncez a votre droit
              de retractation pour cette prestation une fois l'intervention commencee.
            </Text>

            {/* Buttons */}
            <TouchableOpacity
              style={[styles.modalConfirmBtn, !acceptChecked && styles.modalConfirmBtnDisabled]}
              onPress={handleAcceptConfirm}
              disabled={!acceptChecked || accepting}
            >
              {accepting ? (
                <ActivityIndicator size="small" color={COLORS.textInverse} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
                  <Text style={styles.modalConfirmBtnText}>Confirmer et payer</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowAcceptModal(false)}
              disabled={accepting}
            >
              <Text style={styles.modalCancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ━━━ Refuse modal ━━━ */}
      <Modal visible={showRefuseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Refuser le devis</Text>
            <Text style={styles.modalSubtitle}>
              Vous pouvez indiquer un motif de refus (optionnel). Le prestataire sera notifie.
            </Text>

            <TextInput
              style={styles.refuseInput}
              value={refuseReason}
              onChangeText={setRefuseReason}
              placeholder="Motif du refus (optionnel)"
              placeholderTextColor={COLORS.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={styles.modalRefuseConfirmBtn}
              onPress={handleRefuseConfirm}
              disabled={refusing}
            >
              {refusing ? (
                <ActivityIndicator size="small" color={COLORS.textInverse} />
              ) : (
                <>
                  <Ionicons name="close-circle" size={18} color={COLORS.textInverse} />
                  <Text style={styles.modalConfirmBtnText}>Confirmer le refus</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowRefuseModal(false)}
              disabled={refusing}
            >
              <Text style={styles.modalCancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { ...FONTS.body, color: COLORS.textSecondary },
  backBtnLarge: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.brandPrimary,
    borderRadius: RADIUS.xl,
  },
  backBtnLargeText: { ...FONTS.h3, color: COLORS.textInverse },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.xl,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    ...SHADOWS.card,
  },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.paper,
    justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.card,
  },
  headerTitle: { ...FONTS.h2, color: COLORS.textPrimary },

  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl, paddingTop: SPACING.lg },

  // Validity badge
  validityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.successSoft, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full, marginBottom: SPACING.lg,
  },
  validityExpired: { backgroundColor: COLORS.urgencySoft },
  validityText: { ...FONTS.bodySmall, color: COLORS.success, fontWeight: '600' },

  // Status banner
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.lg, borderRadius: RADIUS.xl, marginBottom: SPACING.lg,
  },
  statusBannerText: { ...FONTS.h3, fontSize: 15 },

  // Card
  card: {
    backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl,
    marginBottom: SPACING.md, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border,
  },

  // Provider
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  providerAvatar: { width: 56, height: 56, borderRadius: 28 },
  providerAvatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.brandPrimary + '20',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.brandPrimary + '40',
  },
  providerAvatarText: { ...FONTS.h2, color: COLORS.brandPrimary },
  providerName: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 17 },
  providerCompany: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  providerSiret: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 10, marginTop: 2 },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.warningSoft, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  ratingValue: { ...FONTS.h3, color: COLORS.warning, fontSize: 14 },
  ratingCount: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 10, textTransform: 'none' },

  // Specialties
  specialtiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg },
  specialtyChip: {
    backgroundColor: COLORS.infoSoft, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  specialtyChipText: { ...FONTS.caption, color: COLORS.info, fontSize: 10 },

  // Context
  contextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  contextLabel: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 15 },
  contextProperty: { ...FONTS.body, color: COLORS.textSecondary, marginTop: 2 },
  contextAddress: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 2 },
  contextDescription: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md, lineHeight: 22 },

  // Section
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.lg, fontSize: 18 },

  // Table
  tableHeader: {
    flexDirection: 'row', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.subtle, borderRadius: RADIUS.sm, marginBottom: SPACING.xs,
  },
  tableHeaderCell: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 10 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.subtle,
  },
  tableCell: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontSize: 13 },
  tableCellUnit: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 10, textTransform: 'none', marginTop: 2 },
  tableCellBold: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },

  // Single amount (no line items)
  singleAmountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.md, backgroundColor: COLORS.subtle, padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  singleAmountLabel: { ...FONTS.body, color: COLORS.textPrimary, flex: 1 },
  singleAmountValue: { ...FONTS.h3, color: COLORS.textPrimary },

  // Totals
  separator: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.lg },
  separatorLight: { height: 1, backgroundColor: COLORS.subtle, marginVertical: SPACING.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm },
  totalRowBold: { paddingVertical: SPACING.md },
  totalLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  totalValue: { ...FONTS.body, color: COLORS.textPrimary },
  totalLabelBold: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 15 },
  totalValueBold: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 17 },

  // Grand total
  grandTotalContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.brandPrimary + '10', padding: SPACING.lg,
    borderRadius: RADIUS.lg, marginTop: SPACING.md,
    borderWidth: 1, borderColor: COLORS.brandPrimary + '30',
  },
  grandTotalLabel: { ...FONTS.h3, color: COLORS.brandPrimary, fontSize: 15 },
  grandTotalValue: { ...FONTS.h1, color: COLORS.brandPrimary, fontSize: 24 },

  // Info rows
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.subtle,
  },
  infoLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', flex: 1 },
  infoValue: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },

  // Description
  descriptionBlock: {
    flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start',
    backgroundColor: COLORS.subtle, padding: SPACING.lg, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  descriptionText: { ...FONTS.body, color: COLORS.textPrimary, flex: 1, lineHeight: 22 },

  // PDF button
  pdfButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md,
    backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.xl,
    marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.brandPrimary,
    ...SHADOWS.card,
  },
  pdfButtonText: { ...FONTS.h3, color: COLORS.brandPrimary, fontSize: 15 },

  // Sticky actions
  stickyActions: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.paper, paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg, paddingBottom: Platform.OS === 'ios' ? SPACING.xxxl : SPACING.lg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    flexDirection: 'row', gap: SPACING.md,
    ...SHADOWS.float,
  },
  acceptButton: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.success, paddingVertical: SPACING.lg,
    borderRadius: RADIUS.xxl, ...SHADOWS.success,
  },
  acceptButtonText: { ...FONTS.h3, color: COLORS.textInverse, fontSize: 15 },
  refuseButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, backgroundColor: COLORS.paper, paddingVertical: SPACING.lg,
    borderRadius: RADIUS.xxl, borderWidth: 1.5, borderColor: COLORS.urgency,
  },
  refuseButtonText: { ...FONTS.bodySmall, color: COLORS.urgency, fontWeight: '700' },

  // Expired banner
  expiredBanner: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.urgencySoft, padding: SPACING.lg, borderRadius: RADIUS.xl,
  },
  expiredBannerText: { ...FONTS.bodySmall, color: COLORS.urgency, flex: 1, fontWeight: '500', lineHeight: 20 },

  // ─── Modals ────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.paper, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl,
    padding: SPACING.xxl, paddingBottom: Platform.OS === 'ios' ? SPACING.xxxxl : SPACING.xxl,
  },
  modalTitle: { ...FONTS.h2, color: COLORS.textPrimary, marginBottom: SPACING.md },
  modalSubtitle: { ...FONTS.body, color: COLORS.textSecondary, marginBottom: SPACING.lg, lineHeight: 22 },

  // Recap
  modalRecap: {
    backgroundColor: COLORS.subtle, borderRadius: RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  modalRecapRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  modalRecapLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  modalRecapValue: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },
  modalRecapTotal: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    marginTop: SPACING.sm, paddingTop: SPACING.md,
  },
  modalRecapTotalLabel: { ...FONTS.h3, color: COLORS.textPrimary },
  modalRecapTotalValue: { ...FONTS.h2, color: COLORS.brandPrimary },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary,
  },
  checkboxLabel: { ...FONTS.bodySmall, color: COLORS.textPrimary, flex: 1, fontWeight: '500' },

  // Legal
  legalText: {
    ...FONTS.bodySmall, color: COLORS.textTertiary, fontSize: 11,
    lineHeight: 18, marginBottom: SPACING.xl,
  },

  // Modal buttons
  modalConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.success,
    paddingVertical: SPACING.lg, borderRadius: RADIUS.xxl,
    marginBottom: SPACING.sm, ...SHADOWS.success,
  },
  modalConfirmBtnDisabled: { opacity: 0.5 },
  modalConfirmBtnText: { ...FONTS.h3, color: COLORS.textInverse, fontSize: 15 },
  modalRefuseConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.urgency,
    paddingVertical: SPACING.lg, borderRadius: RADIUS.xxl,
    marginBottom: SPACING.sm, ...SHADOWS.urgency,
  },
  modalCancelBtn: {
    alignItems: 'center', paddingVertical: SPACING.md,
  },
  modalCancelBtnText: { ...FONTS.body, color: COLORS.textSecondary, fontWeight: '600' },

  // Refuse input
  refuseInput: {
    backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.lg,
    ...FONTS.body, color: COLORS.textPrimary, marginBottom: SPACING.xl,
    borderWidth: 1, borderColor: COLORS.border, minHeight: 90,
  },
});
