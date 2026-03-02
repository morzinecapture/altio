import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, SERVICE_TYPE_LABELS } from '../src/theme';
import { useStripe } from '@stripe/stripe-react-native';
import { useAuth } from '../src/auth';
import {
  createEmergency, getEmergency, getProperties,
  submitEmergencyBid, acceptEmergencyBid,
  markEmergencyArrived, submitEmergencyQuote,
  acceptEmergencyQuote, refuseEmergencyQuote,
  completeEmergencyWithCapture, createPaymentIntent,
} from '../src/api';

const SERVICE_TYPES = [
  { id: 'plumbing', icon: 'water-outline', label: 'Plomberie' },
  { id: 'electrical', icon: 'flash-outline', label: 'Électricité' },
  { id: 'locksmith', icon: 'key-outline', label: 'Serrurerie' },
  { id: 'jacuzzi', icon: 'water-outline', label: 'Jacuzzi/Spa' },
  { id: 'repair', icon: 'construct-outline', label: 'Réparation' },
];

const STATUS_FLOW: Record<string, { label: string; color: string; icon: string }> = {
  bids_open: { label: 'En attente de candidatures', color: COLORS.warning, icon: 'time-outline' },
  open: { label: 'En attente de candidatures', color: COLORS.warning, icon: 'time-outline' },
  bid_accepted: { label: 'Technicien en route', color: COLORS.info, icon: 'car-outline' },
  provider_accepted: { label: 'Technicien en route', color: COLORS.info, icon: 'car-outline' },
  displacement_paid: { label: 'Technicien en route', color: COLORS.info, icon: 'car-outline' },
  on_site: { label: 'Technicien sur place', color: COLORS.brandPrimary, icon: 'person-outline' },
  quote_submitted: { label: 'Devis à valider', color: COLORS.warning, icon: 'document-text-outline' },
  quote_sent: { label: 'Devis à valider', color: COLORS.warning, icon: 'document-text-outline' },
  quote_accepted: { label: 'Travaux en cours', color: COLORS.info, icon: 'construct-outline' },
  quote_paid: { label: 'Travaux en cours', color: COLORS.info, icon: 'construct-outline' },
  in_progress: { label: 'Travaux en cours', color: COLORS.info, icon: 'construct-outline' },
  quote_refused: { label: 'Devis refusé', color: COLORS.urgency, icon: 'close-circle-outline' },
  completed: { label: 'Intervention terminée', color: COLORS.success, icon: 'checkmark-circle-outline' },
};

const ARRIVAL_OPTIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '1h30', minutes: 90 },
  { label: '2h+', minutes: 120 },
];

export default function EmergencyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const emergencyId = params.id as string | undefined;

  const [emergency, setEmergency] = useState<any>(null);
  const [loading, setLoading] = useState(!!emergencyId);
  const [properties, setProperties] = useState<any[]>([]);

  // Create form
  const [selectedProp, setSelectedProp] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  // Provider bid form
  const [travelCost, setTravelCost] = useState('');
  const [diagnosticCost, setDiagnosticCost] = useState('');
  const [selectedArrival, setSelectedArrival] = useState<number | null>(null);

  // Provider quote form
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteDesc, setQuoteDesc] = useState('');
  const [repairCost, setRepairCost] = useState('');
  const [repairDays, setRepairDays] = useState('1');

  // Timer
  const [timeLeft, setTimeLeft] = useState('');

  // Stripe
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  useEffect(() => {
    if (emergencyId) fetchEmergency();
    else if (isOwner) fetchProperties();
  }, [emergencyId]);

  // Countdown timer
  useEffect(() => {
    if (!emergency?.response_deadline) return;
    const interval = setInterval(() => {
      const diff = new Date(emergency.response_deadline).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Expiré'); clearInterval(interval); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [emergency?.response_deadline]);

  const fetchEmergency = async () => {
    try {
      const data = await getEmergency(emergencyId!);
      setEmergency(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchProperties = async () => {
    try {
      const p = await getProperties();
      setProperties(p);
      if (p.length > 0) setSelectedProp(p[0].id);
    } catch (e) { console.error(e); }
  };

  // ===== CREATE =====
  const handleCreateEmergency = async () => {
    if (!selectedProp || !selectedType || !description.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setSending(true);
    try {
      await createEmergency({ property_id: selectedProp, service_type: selectedType, description: description.trim() });
      Alert.alert('Urgence envoyée !', 'Les techniciens de la zone ont été alertés avec l\'adresse du logement. Vous avez 24h pour sélectionner un prestataire.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) { Alert.alert('Erreur', e.message); setSending(false); }
  };

  // ===== PROVIDER: Submit bid =====
  const handleSubmitBid = async () => {
    if (!travelCost || !diagnosticCost || selectedArrival === null) {
      Alert.alert('Erreur', 'Remplissez tous les champs');
      return;
    }
    const arrivalTime = new Date(Date.now() + selectedArrival * 60 * 1000).toISOString();
    try {
      await submitEmergencyBid(emergencyId!, {
        travel_cost: parseFloat(travelCost),
        diagnostic_cost: parseFloat(diagnosticCost),
        estimated_arrival: arrivalTime,
      });
      Alert.alert('Candidature envoyée !', 'La propriétaire sera notifiée de votre offre.');
      fetchEmergency();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  // ===== OWNER: Accept bid =====
  const handleAcceptBid = (bid: any) => {
    const total = (bid.travel_cost || 0) + (bid.diagnostic_cost || 0);
    const arrivalStr = new Date(bid.estimated_arrival).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    Alert.alert(
      'Accepter cette offre ?',
      `Technicien : ${bid.provider_name}\nFrais totaux : ${total}€\nArrivée estimée : ${arrivalStr}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Payer & Confirmer', onPress: async () => {
            try {
              setLoading(true);
              const { clientSecret } = await createPaymentIntent(total, { emergencyId, bidId: bid.id }, 'automatic');

              const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'MontRTO',
                paymentIntentClientSecret: clientSecret,
                allowsDelayedPaymentMethods: true,
              });
              if (initError) throw new Error(initError.message);

              const { error: presentError } = await presentPaymentSheet();
              if (presentError) throw new Error(presentError.message);

              await acceptEmergencyBid(emergencyId!, bid.id, bid.provider_id);
              Alert.alert('Paiement réussi', 'Le technicien a été notifié et est en route !');
              fetchEmergency();
            } catch (e: any) { Alert.alert('Erreur', e.message); setLoading(false); }
          }
        },
      ]
    );
  };

  // ===== PROVIDER: Mark arrived =====
  const handleMarkArrived = async () => {
    try {
      await markEmergencyArrived(emergencyId!);
      Alert.alert('Arrivée confirmée', 'Vous pouvez maintenant saisir votre devis.');
      fetchEmergency();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  // ===== PROVIDER: Submit quote =====
  const handleSubmitQuote = async () => {
    if (!quoteDesc.trim() || !repairCost || !repairDays) {
      Alert.alert('Erreur', 'Remplissez tous les champs');
      return;
    }
    try {
      await submitEmergencyQuote(emergencyId!, {
        description: quoteDesc.trim(),
        repair_cost: parseFloat(repairCost),
        repair_delay_days: parseInt(repairDays),
      });
      Alert.alert('Devis envoyé !', 'La propriétaire doit valider votre devis.');
      setShowQuoteForm(false);
      fetchEmergency();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  // ===== OWNER: Accept quote =====
  const handleAcceptQuote = () => {
    const quote = emergency.quote;
    if (!quote) return;
    Alert.alert(
      'Accepter le devis ?',
      `Montant : ${quote.repair_cost}€\nDélai : ${quote.repair_delay_days} jour(s)\n\nUne empreinte bancaire de ${quote.repair_cost}€ sera posée. Le paiement sera capturé à la fin des travaux (7j max).`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Placer l\'empreinte', onPress: async () => {
            try {
              setLoading(true);
              const { clientSecret, paymentIntentId } = await createPaymentIntent(quote.repair_cost, { emergencyId, quoteId: quote.id }, 'manual');

              const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'MontRTO',
                paymentIntentClientSecret: clientSecret,
                allowsDelayedPaymentMethods: true,
              });
              if (initError) throw new Error(initError.message);

              const { error: presentError } = await presentPaymentSheet();
              if (presentError) throw new Error(presentError.message);

              await acceptEmergencyQuote(emergencyId!, quote.id, paymentIntentId);
              Alert.alert('Devis accepté !', `Empreinte bancaire de ${quote.repair_cost}€ posée. Le technicien peut commencer.`);
              fetchEmergency();
            } catch (e: any) { Alert.alert('Erreur', e.message); setLoading(false); }
          }
        },
      ]
    );
  };

  // ===== OWNER: Refuse quote =====
  const handleRefuseQuote = () => {
    Alert.alert(
      'Refuser le devis ?',
      'Seuls les frais de déplacement et de diagnostic déjà réglés resteront dus. L\'intervention s\'arrêtera là.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Refuser', style: 'destructive', onPress: async () => {
            try {
              await refuseEmergencyQuote(emergencyId!, emergency.quote.id);
              Alert.alert('Devis refusé', 'L\'intervention est terminée.');
              fetchEmergency();
            } catch (e: any) { Alert.alert('Erreur', e.message); }
          }
        },
      ]
    );
  };

  // ===== PROVIDER: Complete =====
  const handleComplete = () => {
    Alert.alert('Terminer l\'intervention ?', 'Confirmez que les travaux sont terminés. Le paiement sera encaissé.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer', onPress: async () => {
          try {
            await completeEmergencyWithCapture(emergencyId!);
            Alert.alert('Intervention terminée !', 'Le paiement a été encaissé. Bravo !');
            fetchEmergency();
          } catch (e: any) { Alert.alert('Erreur', e.message); }
        }
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.urgency} />
      </View>
    );
  }

  // ──────────────────────────────────────────────────
  // DETAIL VIEW
  // ──────────────────────────────────────────────────
  if (emergencyId && emergency) {
    const statusInfo = STATUS_FLOW[emergency.status] || STATUS_FLOW.bids_open;
    const isMyEmergency = emergency.accepted_provider_id === user?.id;
    const myBid = emergency.bids?.find((b: any) => b.provider_id === user?.id);
    const quote = emergency.quote;

    return (
      <SafeAreaView style={styles.container} testID="emergency-detail-screen">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Urgence</Text>
          <TouchableOpacity onPress={fetchEmergency}>
            <Ionicons name="refresh-outline" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Status banner */}
          <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '18' }]}>
            <Ionicons name={statusInfo.icon as any} size={22} color={statusInfo.color} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>

          {/* Emergency info */}
          <View style={[styles.card, styles.urgentCard]}>
            <View style={styles.urgentBadge}>
              <Ionicons name="warning" size={18} color={COLORS.urgency} />
              <Text style={styles.urgentLabel}>{SERVICE_TYPE_LABELS[emergency.service_type] || emergency.service_type}</Text>
            </View>
            <Text style={styles.propName}>{emergency.property_name}</Text>
            {emergency.property_address ? (
              <View style={styles.addrRow}>
                <Ionicons name="location-outline" size={14} color={COLORS.textTertiary} />
                <Text style={styles.propAddr}>{emergency.property_address}</Text>
              </View>
            ) : null}
            <Text style={styles.emergDesc}>{emergency.description}</Text>
          </View>

          {/* ━━━ OWNER: Timer + bids ━━━ */}
          {isOwner && (emergency.status === 'bids_open' || emergency.status === 'open') && (
            <>
              {timeLeft ? (
                <View style={[styles.card, styles.timerCard]}>
                  <View style={styles.timerRow}>
                    <Ionicons name="hourglass-outline" size={18} color={COLORS.warning} />
                    <Text style={styles.timerLabel}>Temps restant pour choisir</Text>
                    <Text style={styles.timerValue}>{timeLeft}</Text>
                  </View>
                </View>
              ) : null}

              {emergency.bids && emergency.bids.length > 0 ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Candidatures ({emergency.bids.length})</Text>
                  {emergency.bids.map((bid: any) => (
                    <View key={bid.id} style={styles.bidItem}>
                      <View style={styles.bidTop}>
                        <View style={styles.bidProvider}>
                          <View style={styles.bidAvatar}>
                            <Text style={styles.bidAvatarText}>{bid.provider_name?.[0] || 'P'}</Text>
                          </View>
                          <View>
                            <Text style={styles.bidName}>{bid.provider_name || 'Prestataire'}</Text>
                            {bid.provider_rating > 0 && (
                              <View style={styles.ratingRow}>
                                <Ionicons name="star" size={12} color={COLORS.warning} />
                                <Text style={styles.ratingText}>{bid.provider_rating}/5</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <View style={styles.bidPriceCol}>
                          <Text style={styles.bidTotal}>{(bid.travel_cost || 0) + (bid.diagnostic_cost || 0)}€</Text>
                          <Text style={styles.bidPriceSub}>dépla. + diag.</Text>
                        </View>
                      </View>
                      <View style={styles.bidDetails}>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="car-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>Déplacement : {bid.travel_cost}€</Text>
                        </View>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="search-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>Diagnostic : {bid.diagnostic_cost}€</Text>
                        </View>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="time-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>
                            Arrivée : {new Date(bid.estimated_arrival).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity style={styles.acceptBidBtn} onPress={() => handleAcceptBid(bid)}>
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
                        <Text style={styles.acceptBidBtnText}>Accepter cette offre</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[styles.card, { borderLeftColor: COLORS.warning, borderLeftWidth: 3 }]}>
                  <View style={styles.waitRow}>
                    <ActivityIndicator size="small" color={COLORS.warning} />
                    <Text style={styles.waitText}>En attente de candidatures des techniciens...</Text>
                  </View>
                </View>
              )}
            </>
          )}

          {/* ━━━ OWNER: Provider en route ━━━ */}
          {isOwner && (emergency.status === 'bid_accepted' || emergency.status === 'provider_accepted' || emergency.status === 'displacement_paid') && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Technicien sélectionné</Text>
              {emergency.provider_name ? (
                <View style={styles.providerRow}>
                  <View style={styles.providerAvatar}>
                    <Text style={styles.providerAvatarText}>{emergency.provider_name[0]}</Text>
                  </View>
                  <Text style={[styles.providerName, { flex: 1 }]}>{emergency.provider_name}</Text>
                  <View style={styles.etaBadge}>
                    <Ionicons name="car-outline" size={14} color={COLORS.info} />
                    <Text style={styles.etaText}>En route</Text>
                  </View>
                </View>
              ) : null}
              <View style={[styles.waitRow, { marginTop: SPACING.md }]}>
                <ActivityIndicator size="small" color={COLORS.info} />
                <Text style={styles.waitText}>Le technicien est en route. Il saisira son devis une fois sur place.</Text>
              </View>
            </View>
          )}

          {/* ━━━ OWNER: On site, awaiting quote ━━━ */}
          {isOwner && emergency.status === 'on_site' && !quote && (
            <View style={[styles.card, { borderLeftColor: COLORS.info, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={COLORS.info} />
                <Text style={styles.waitText}>Le technicien est sur place. Il prépare son devis après diagnostic.</Text>
              </View>
            </View>
          )}

          {/* ━━━ OWNER: Quote review ━━━ */}
          {isOwner && (emergency.status === 'quote_submitted' || emergency.status === 'quote_sent') && quote && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Devis de réparation</Text>
              <View style={styles.quoteDescRow}>
                <Ionicons name="document-text-outline" size={16} color={COLORS.textTertiary} />
                <Text style={styles.quoteDescText}>{quote.description}</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Coût de réparation</Text>
                <Text style={styles.amountValue}>{quote.repair_cost}€</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Délai estimé</Text>
                <Text style={styles.amountValue}>{quote.repair_delay_days} jour(s)</Text>
              </View>
              <View style={styles.quoteBanner}>
                <Ionicons name="card-outline" size={15} color={COLORS.warning} />
                <Text style={styles.quoteBannerText}>
                  En acceptant, une empreinte bancaire de {quote.repair_cost}€ sera posée. Le paiement sera capturé à la fin des travaux (7 jours max).
                </Text>
              </View>
              <TouchableOpacity style={styles.acceptBidBtn} onPress={handleAcceptQuote}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
                <Text style={styles.acceptBidBtnText}>Accepter le devis ({quote.repair_cost}€)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.refuseBtn} onPress={handleRefuseQuote}>
                <Ionicons name="close" size={18} color={COLORS.urgency} />
                <Text style={styles.refuseBtnText}>Refuser le devis</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ━━━ OWNER: Work in progress ━━━ */}
          {isOwner && emergency.status === 'quote_accepted' && (
            <View style={[styles.card, { borderLeftColor: COLORS.info, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={COLORS.info} />
                <Text style={styles.waitText}>Travaux en cours. Vous serez notifié à la fin de l'intervention.</Text>
              </View>
              {quote?.stripe_capture_deadline ? (
                <View style={styles.captureInfo}>
                  <Ionicons name="lock-closed-outline" size={13} color={COLORS.textTertiary} />
                  <Text style={styles.captureText}>
                    Empreinte de {quote.repair_cost}€ — expire le {new Date(quote.stripe_capture_deadline).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* ━━━ OWNER: Quote refused ━━━ */}
          {isOwner && emergency.status === 'quote_refused' && (
            <View style={[styles.card, { borderLeftColor: COLORS.urgency, borderLeftWidth: 3 }]}>
              <Ionicons name="close-circle" size={28} color={COLORS.urgency} />
              <Text style={[styles.sectionTitle, { color: COLORS.urgency, marginTop: SPACING.sm }]}>Devis refusé</Text>
              <Text style={styles.emergDesc}>Vous avez refusé le devis. Seuls les frais de déplacement et diagnostic ont été réglés.</Text>
            </View>
          )}

          {/* ━━━ COMPLETED ━━━ */}
          {emergency.status === 'completed' && (
            <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
              <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
              <Text style={[styles.sectionTitle, { color: COLORS.success, marginTop: SPACING.sm }]}>Intervention terminée</Text>
              <Text style={styles.emergDesc}>Les travaux ont été réalisés avec succès. Le paiement a été transféré au technicien.</Text>
            </View>
          )}

          {/* ━━━ PROVIDER: Bid form ━━━ */}
          {!isOwner && (emergency.status === 'bids_open' || emergency.status === 'open') && !myBid && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Candidater à l'urgence</Text>
              <Text style={styles.fieldLabel}>Frais de déplacement (€)</Text>
              <TextInput
                style={styles.input}
                value={travelCost}
                onChangeText={setTravelCost}
                keyboardType="numeric"
                placeholder="ex: 40"
                placeholderTextColor={COLORS.textTertiary}
              />
              <Text style={styles.fieldLabel}>Frais de diagnostic (€)</Text>
              <TextInput
                style={styles.input}
                value={diagnosticCost}
                onChangeText={setDiagnosticCost}
                keyboardType="numeric"
                placeholder="ex: 30"
                placeholderTextColor={COLORS.textTertiary}
              />
              <Text style={styles.fieldLabel}>Temps d'arrivée estimé</Text>
              <View style={styles.arrivalRow}>
                {ARRIVAL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.minutes}
                    style={[styles.arrivalChip, selectedArrival === opt.minutes && styles.arrivalChipActive]}
                    onPress={() => setSelectedArrival(opt.minutes)}
                  >
                    <Text style={[styles.arrivalChipText, selectedArrival === opt.minutes && styles.arrivalChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.mainActionBtn, (!travelCost || !diagnosticCost || selectedArrival === null) && { opacity: 0.5 }]}
                onPress={handleSubmitBid}
                disabled={!travelCost || !diagnosticCost || selectedArrival === null}
              >
                <Ionicons name="hand-left-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>Envoyer ma candidature</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ━━━ PROVIDER: Waiting after bid submitted ━━━ */}
          {!isOwner && (emergency.status === 'bids_open' || emergency.status === 'open') && myBid && (
            <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
              <View style={styles.bidSentRow}>
                <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                <Text style={[styles.sectionTitle, { flex: 1, marginBottom: 0 }]}>Candidature envoyée</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Déplacement</Text>
                <Text style={styles.amountValue}>{myBid.travel_cost}€</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Diagnostic</Text>
                <Text style={styles.amountValue}>{myBid.diagnostic_cost}€</Text>
              </View>
              <View style={[styles.waitRow, { marginTop: SPACING.md }]}>
                <ActivityIndicator size="small" color={COLORS.warning} />
                <Text style={styles.waitText}>En attente de la décision de la propriétaire...</Text>
              </View>
            </View>
          )}

          {/* ━━━ PROVIDER: Je suis arrivé ━━━ */}
          {!isOwner && isMyEmergency && (
            emergency.status === 'bid_accepted' ||
            emergency.status === 'provider_accepted' ||
            emergency.status === 'displacement_paid'
          ) && (
              <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.success }]} onPress={handleMarkArrived}>
                <Ionicons name="location" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>Je suis arrivé sur place</Text>
              </TouchableOpacity>
            )}

          {/* ━━━ PROVIDER: Not selected ━━━ */}
          {!isOwner && !isMyEmergency && myBid?.status === 'rejected' && (
            <View style={[styles.card, { borderLeftColor: COLORS.urgency, borderLeftWidth: 3 }]}>
              <Text style={[styles.sectionTitle, { color: COLORS.urgency }]}>Candidature non retenue</Text>
              <Text style={styles.emergDesc}>La propriétaire a sélectionné un autre technicien.</Text>
            </View>
          )}

          {/* ━━━ PROVIDER: Quote form (on site) ━━━ */}
          {!isOwner && isMyEmergency && emergency.status === 'on_site' && !showQuoteForm && !quote && (
            <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.brandPrimary }]} onPress={() => setShowQuoteForm(true)}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.mainActionBtnText}>Saisir mon devis</Text>
            </TouchableOpacity>
          )}

          {showQuoteForm && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Devis de réparation</Text>
              <Text style={styles.fieldLabel}>Description des travaux</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={quoteDesc}
                onChangeText={setQuoteDesc}
                placeholder="Décrivez les travaux à effectuer..."
                placeholderTextColor={COLORS.textTertiary}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.fieldLabel}>Coût de réparation (€)</Text>
              <TextInput
                style={styles.input}
                value={repairCost}
                onChangeText={setRepairCost}
                keyboardType="numeric"
                placeholder="ex: 350"
                placeholderTextColor={COLORS.textTertiary}
              />
              <Text style={styles.fieldLabel}>Délai de réparation</Text>
              <View style={styles.arrivalRow}>
                {['1', '2', '3', '7'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.arrivalChip, repairDays === d && styles.arrivalChipActive]}
                    onPress={() => setRepairDays(d)}
                  >
                    <Text style={[styles.arrivalChipText, repairDays === d && styles.arrivalChipTextActive]}>{d} jour{d !== '1' ? 's' : ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.mainActionBtn} onPress={handleSubmitQuote}>
                <Ionicons name="send-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>Envoyer le devis</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ━━━ PROVIDER: Waiting for quote validation ━━━ */}
          {!isOwner && isMyEmergency && (emergency.status === 'quote_submitted' || emergency.status === 'quote_sent') && (
            <View style={[styles.card, { borderLeftColor: COLORS.warning, borderLeftWidth: 3 }]}>
              {quote ? (
                <>
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Montant devis</Text>
                    <Text style={styles.amountValue}>{quote.repair_cost}€</Text>
                  </View>
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Délai</Text>
                    <Text style={styles.amountValue}>{quote.repair_delay_days} jour(s)</Text>
                  </View>
                </>
              ) : null}
              <View style={[styles.waitRow, { marginTop: SPACING.md }]}>
                <ActivityIndicator size="small" color={COLORS.warning} />
                <Text style={styles.waitText}>En attente de validation du devis par la propriétaire...</Text>
              </View>
            </View>
          )}

          {/* ━━━ PROVIDER: Quote accepted, do the work ━━━ */}
          {!isOwner && isMyEmergency && emergency.status === 'quote_accepted' && (
            <>
              <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
                <View style={styles.waitRow}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={[styles.waitText, { color: COLORS.success, fontWeight: '600' }]}>
                    Devis accepté ! Vous pouvez commencer les travaux.
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.success }]} onPress={handleComplete}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>Terminer l'intervention</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ━━━ PROVIDER: Quote refused ━━━ */}
          {!isOwner && isMyEmergency && emergency.status === 'quote_refused' && (
            <View style={[styles.card, { borderLeftColor: COLORS.urgency, borderLeftWidth: 3 }]}>
              <Text style={[styles.sectionTitle, { color: COLORS.urgency }]}>Devis refusé</Text>
              <Text style={styles.emergDesc}>La propriétaire a refusé votre devis. Seuls les frais de déplacement et diagnostic vous seront réglés.</Text>
            </View>
          )}

          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────
  // CREATE FORM (OWNER)
  // ──────────────────────────────────────────────────
  const selectedPropData = properties.find(p => p.id === selectedProp);

  return (
    <SafeAreaView style={styles.container} testID="emergency-create-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Urgence</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.urgentBanner}>
            <Ionicons name="warning" size={32} color={COLORS.urgency} />
            <Text style={styles.urgentBannerTitle}>Déclarer une urgence</Text>
            <Text style={styles.urgentBannerDesc}>
              L'adresse du logement sera partagée avec les techniciens. Vous avez 24h pour sélectionner un prestataire parmi les candidatures reçues.
            </Text>
          </View>

          <Text style={styles.fieldLabel}>Logement concerné</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.propScroll}>
            {properties.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.propChip, selectedProp === p.id && styles.propChipActive]}
                onPress={() => setSelectedProp(p.id)}
              >
                <Text style={[styles.propChipText, selectedProp === p.id && styles.propChipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {selectedPropData?.address ? (
            <View style={styles.addrPreview}>
              <Ionicons name="location-outline" size={14} color={COLORS.textTertiary} />
              <Text style={styles.addrPreviewText}>{selectedPropData.address}</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Type de problème</Text>
          <View style={styles.typeGrid}>
            {SERVICE_TYPES.map((st) => (
              <TouchableOpacity
                key={st.id}
                testID={`service-type-${st.id}`}
                style={[styles.serviceTypeCard, selectedType === st.id && styles.serviceTypeActive]}
                onPress={() => setSelectedType(st.id)}
              >
                <Ionicons name={st.icon as any} size={24} color={selectedType === st.id ? COLORS.textInverse : COLORS.urgency} />
                <Text style={[styles.serviceTypeText, selectedType === st.id && styles.serviceTypeTextActive]}>{st.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Description du problème</Text>
          <TextInput
            testID="emergency-description"
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Décrivez le problème en détail..."
            placeholderTextColor={COLORS.textTertiary}
            multiline
            numberOfLines={4}
          />

          <TouchableOpacity
            testID="send-emergency-btn"
            style={styles.emergencyBtn}
            onPress={handleCreateEmergency}
            disabled={sending}
          >
            {sending ? <ActivityIndicator color={COLORS.textInverse} /> : (
              <>
                <Ionicons name="warning" size={22} color={COLORS.textInverse} />
                <Text style={styles.emergencyBtnText}>Envoyer l'urgence</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  headerTitle: { ...FONTS.h3, color: COLORS.textPrimary },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
  // Status banner
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.lg },
  statusText: { ...FONTS.bodySmall, fontWeight: '600', flex: 1 },
  // Cards
  card: { backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.lg, ...SHADOWS.card },
  urgentCard: { borderLeftWidth: 4, borderLeftColor: COLORS.urgency },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  urgentLabel: { ...FONTS.caption, color: COLORS.urgency },
  propName: { ...FONTS.h2, color: COLORS.textPrimary },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 4 },
  propAddr: { ...FONTS.body, color: COLORS.textSecondary, flex: 1 },
  emergDesc: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md, fontSize: 16 },
  // Timer
  timerCard: { borderLeftWidth: 3, borderLeftColor: COLORS.warning },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  timerLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, flex: 1 },
  timerValue: { ...FONTS.h3, color: COLORS.warning, fontSize: 16 },
  // Bids
  bidItem: { paddingVertical: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  bidTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  bidProvider: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  bidAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center' },
  bidAvatarText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '700' },
  bidName: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ratingText: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontSize: 11 },
  bidPriceCol: { alignItems: 'flex-end' },
  bidTotal: { ...FONTS.h3, color: COLORS.success, fontSize: 18 },
  bidPriceSub: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontSize: 10 },
  bidDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  bidDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bidDetailText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 12 },
  acceptBidBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.success, paddingVertical: SPACING.md, borderRadius: RADIUS.lg },
  acceptBidBtnText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '700' },
  bidSentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  // Provider info
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  providerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center' },
  providerAvatarText: { ...FONTS.h3, color: COLORS.textInverse },
  providerName: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },
  etaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.infoSoft, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  etaText: { ...FONTS.bodySmall, color: COLORS.info, fontWeight: '600' },
  // Amounts
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  amountLabel: { ...FONTS.body, color: COLORS.textSecondary },
  amountValue: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },
  // Quote
  quoteDescRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start', marginBottom: SPACING.md, backgroundColor: COLORS.subtle, padding: SPACING.md, borderRadius: RADIUS.md },
  quoteDescText: { ...FONTS.body, color: COLORS.textPrimary, flex: 1 },
  quoteBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.warningSoft, padding: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.md },
  quoteBannerText: { ...FONTS.bodySmall, color: COLORS.warning, flex: 1, lineHeight: 18 },
  captureInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md },
  captureText: { ...FONTS.bodySmall, color: COLORS.textTertiary, flex: 1, fontSize: 12 },
  refuseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.urgencySoft, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, marginTop: SPACING.sm },
  refuseBtnText: { ...FONTS.bodySmall, color: COLORS.urgency, fontWeight: '700' },
  // Wait
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  waitText: { ...FONTS.body, color: COLORS.textSecondary, flex: 1 },
  // Arrival chips
  arrivalRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  arrivalChip: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.subtle, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  arrivalChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  arrivalChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  arrivalChipTextActive: { color: COLORS.textInverse },
  // Main action
  mainActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.md, ...SHADOWS.float },
  mainActionBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  // Form
  fieldLabel: { ...FONTS.caption, color: COLORS.textSecondary, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  // Create form
  urgentBanner: { alignItems: 'center', backgroundColor: COLORS.urgencySoft, padding: SPACING.xxl, borderRadius: RADIUS.xl, marginBottom: SPACING.xl },
  urgentBannerTitle: { ...FONTS.h2, color: COLORS.urgency, marginTop: SPACING.md },
  urgentBannerDesc: { ...FONTS.body, color: COLORS.urgency, opacity: 0.8, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
  propScroll: { maxHeight: 44, marginBottom: SPACING.sm },
  propChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: COLORS.paper, marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  propChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  propChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  propChipTextActive: { color: COLORS.textInverse },
  addrPreview: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.md, paddingHorizontal: SPACING.sm },
  addrPreviewText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  serviceTypeCard: { width: '31%', padding: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.paper, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: SPACING.xs },
  serviceTypeActive: { backgroundColor: COLORS.urgency, borderColor: COLORS.urgency },
  serviceTypeText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 11, textAlign: 'center' },
  serviceTypeTextActive: { color: COLORS.textInverse },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: COLORS.urgency, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.xxl, ...SHADOWS.urgency },
  emergencyBtnText: { ...FONTS.h3, color: COLORS.textInverse },
});
