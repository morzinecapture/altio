import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking as RNLinking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, SERVICE_TYPE_LABELS } from '../src/theme';
import { useAuth } from '../src/auth';
import { createEmergency, getEmergency, getProperties, createQuote, handleQuote, acceptEmergency, payDisplacement, payQuote, completeEmergency, checkPaymentStatus } from '../src/api';

const SERVICE_TYPES = [
  { id: 'plumbing', icon: 'water-outline', label: 'Plomberie' },
  { id: 'electrical', icon: 'flash-outline', label: 'Électricité' },
  { id: 'locksmith', icon: 'key-outline', label: 'Serrurerie' },
  { id: 'jacuzzi', icon: 'water-outline', label: 'Jacuzzi/Spa' },
  { id: 'repair', icon: 'construct-outline', label: 'Réparation' },
];

const STATUS_FLOW: Record<string, { label: string; color: string; icon: string }> = {
  open: { label: 'En attente d\'un technicien', color: COLORS.warning, icon: 'time-outline' },
  provider_accepted: { label: 'Technicien trouvé - Paiement déplacement requis', color: COLORS.info, icon: 'person-outline' },
  displacement_paid: { label: 'Technicien en route', color: COLORS.info, icon: 'car-outline' },
  quote_sent: { label: 'Devis reçu - Validation requise', color: COLORS.warning, icon: 'document-text-outline' },
  quote_paid: { label: 'Travaux en cours', color: COLORS.info, icon: 'construct-outline' },
  in_progress: { label: 'Travaux en cours', color: COLORS.info, icon: 'construct-outline' },
  completed: { label: 'Intervention terminée', color: COLORS.success, icon: 'checkmark-circle-outline' },
};

export default function EmergencyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const emergencyId = params.id as string | undefined;
  const paymentParam = params.payment as string | undefined;
  const sessionIdParam = params.session_id as string | undefined;

  // State
  const [emergency, setEmergency] = useState<any>(null);
  const [loading, setLoading] = useState(!!emergencyId);
  const [properties, setProperties] = useState<any[]>([]);
  const [polling, setPolling] = useState(false);

  // Owner create form
  const [selectedProp, setSelectedProp] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  // Provider accept form
  const [showAcceptForm, setShowAcceptForm] = useState(false);
  const [displacementFee, setDisplacementFee] = useState('');
  const [diagnosticFee, setDiagnosticFee] = useState('');
  const [etaMinutes, setEtaMinutes] = useState('');

  // Provider quote form
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteLines, setQuoteLines] = useState([{ description: '', quantity: '1', unit_price: '' }]);
  const [tvaRate] = useState('20');

  useEffect(() => {
    if (emergencyId) fetchEmergency();
    if (isOwner && !emergencyId) fetchProperties();
  }, [emergencyId]);

  // Handle return from Stripe payment
  useEffect(() => {
    if (sessionIdParam && paymentParam && (paymentParam === 'displacement' || paymentParam === 'quote')) {
      pollPaymentStatus(sessionIdParam);
    }
  }, [sessionIdParam, paymentParam]);

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
      if (p.length > 0) setSelectedProp(p[0].property_id);
    } catch (e) { console.error(e); }
  };

  const pollPaymentStatus = async (sid: string, attempts = 0) => {
    const maxAttempts = 8;
    if (attempts >= maxAttempts) {
      setPolling(false);
      Alert.alert('Vérification en cours', 'Le paiement est en cours de traitement. Actualisez dans quelques instants.');
      return;
    }
    setPolling(true);
    try {
      const result = await checkPaymentStatus(sid);
      if (result.payment_status === 'paid') {
        setPolling(false);
        Alert.alert('Paiement confirmé !', 'Le paiement a été traité avec succès.');
        fetchEmergency();
        return;
      }
      // Continue polling
      setTimeout(() => pollPaymentStatus(sid, attempts + 1), 2500);
    } catch (e) {
      console.error('Poll error:', e);
      setPolling(false);
    }
  };

  // ===== OWNER: Create emergency =====
  const handleCreateEmergency = async () => {
    if (!selectedProp || !selectedType || !description.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setSending(true);
    try {
      await createEmergency({ property_id: selectedProp, service_type: selectedType, description: description.trim() });
      Alert.alert('Urgence envoyée !', 'Les techniciens de la zone ont été alertés.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) { Alert.alert('Erreur', e.message); setSending(false); }
  };

  // ===== OWNER: Pay displacement =====
  const handlePayDisplacement = async () => {
    try {
      const originUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://alpine-ops.preview.emergentagent.com';
      const result = await payDisplacement(emergencyId!, originUrl);
      if (result.checkout_url) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = result.checkout_url;
        } else {
          await WebBrowser.openBrowserAsync(result.checkout_url);
          fetchEmergency();
        }
      }
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  // ===== OWNER: Pay quote =====
  const handlePayQuote = async () => {
    try {
      const originUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://alpine-ops.preview.emergentagent.com';
      const result = await payQuote(emergencyId!, originUrl);
      if (result.checkout_url) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = result.checkout_url;
        } else {
          await WebBrowser.openBrowserAsync(result.checkout_url);
          fetchEmergency();
        }
      }
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  // ===== PROVIDER: Accept emergency =====
  const handleAcceptEmergency = async () => {
    if (!displacementFee || !diagnosticFee || !etaMinutes) {
      Alert.alert('Erreur', 'Remplissez tous les champs');
      return;
    }
    try {
      await acceptEmergency(emergencyId!, {
        displacement_fee: parseFloat(displacementFee),
        diagnostic_fee: parseFloat(diagnosticFee),
        eta_minutes: parseInt(etaMinutes),
      });
      Alert.alert('Urgence acceptée !', 'La propriétaire sera notifiée.');
      setShowAcceptForm(false);
      fetchEmergency();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  // ===== PROVIDER: Send quote =====
  const handleSendQuote = async () => {
    const lines = quoteLines.filter(l => l.description && l.unit_price).map(l => ({
      description: l.description, quantity: parseInt(l.quantity) || 1, unit_price: parseFloat(l.unit_price) || 0,
    }));
    if (lines.length === 0) { Alert.alert('Erreur', 'Ajoutez au moins une ligne'); return; }
    try {
      await createQuote({ emergency_request_id: emergencyId, lines, tva_rate: parseFloat(tvaRate) || 20 });
      Alert.alert('Devis envoyé !');
      setShowQuoteForm(false);
      fetchEmergency();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  // ===== PROVIDER: Complete emergency =====
  const handleCompleteEmergency = async () => {
    Alert.alert('Terminer l\'intervention ?', 'Confirmez que les travaux sont terminés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: async () => {
        try {
          await completeEmergency(emergencyId!, { before_photos: [], after_photos: [] });
          Alert.alert('Intervention terminée !');
          fetchEmergency();
        } catch (e: any) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  const addLine = () => setQuoteLines([...quoteLines, { description: '', quantity: '1', unit_price: '' }]);
  const totalHT = quoteLines.reduce((sum, l) => sum + (parseInt(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
  const tvaAmount = totalHT * ((parseFloat(tvaRate) || 0) / 100);
  const totalTTC = totalHT + tvaAmount;

  if (loading || polling) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.urgency} />
        <Text style={styles.loadingText}>{polling ? 'Vérification du paiement...' : 'Chargement...'}</Text>
      </View>
    );
  }

  // ============ DETAIL VIEW ============
  if (emergencyId && emergency) {
    const statusInfo = STATUS_FLOW[emergency.status] || STATUS_FLOW.open;
    const isMyEmergency = emergency.accepted_provider_id === user?.user_id;

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
          {/* Status Banner */}
          <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '15' }]}>
            <Ionicons name={statusInfo.icon as any} size={24} color={statusInfo.color} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>

          {/* Emergency Info */}
          <View style={[styles.card, styles.urgentCard]}>
            <View style={styles.urgentBadge}>
              <Ionicons name="warning" size={20} color={COLORS.urgency} />
              <Text style={styles.urgentLabel}>{SERVICE_TYPE_LABELS[emergency.service_type] || emergency.service_type}</Text>
            </View>
            <Text style={styles.propName}>{emergency.property_name}</Text>
            <Text style={styles.propAddr}>{emergency.property_address}</Text>
            <Text style={styles.emergDesc}>{emergency.description}</Text>
          </View>

          {/* Provider Info (if accepted) */}
          {emergency.provider_name && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Technicien</Text>
              <View style={styles.providerRow}>
                <View style={styles.providerAvatar}>
                  <Text style={styles.providerAvatarText}>{emergency.provider_name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.providerName}>{emergency.provider_name}</Text>
                  {emergency.provider_rating > 0 && (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={14} color={COLORS.warning} />
                      <Text style={styles.ratingText}>{emergency.provider_rating}/5 ({emergency.provider_reviews} avis)</Text>
                    </View>
                  )}
                </View>
                {emergency.eta_minutes && emergency.status === 'provider_accepted' && (
                  <View style={styles.etaBadge}>
                    <Ionicons name="time-outline" size={14} color={COLORS.info} />
                    <Text style={styles.etaText}>{emergency.eta_minutes} min</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ===== OWNER: Pay Displacement ===== */}
          {isOwner && emergency.status === 'provider_accepted' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Frais de déplacement & diagnostic</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Déplacement</Text>
                <Text style={styles.amountValue}>{emergency.displacement_fee}€</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>Diagnostic</Text>
                <Text style={styles.amountValue}>{emergency.diagnostic_fee}€</Text>
              </View>
              <View style={[styles.amountRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total à payer</Text>
                <Text style={styles.totalValue}>{emergency.displacement_amount_display}€</Text>
              </View>
              <TouchableOpacity testID="pay-displacement-btn" style={styles.payBtn} onPress={handlePayDisplacement}>
                <Ionicons name="card-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.payBtnText}>Payer {emergency.displacement_amount_display}€</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ===== OWNER: Wait for technician ===== */}
          {isOwner && emergency.status === 'displacement_paid' && (
            <View style={[styles.card, { borderLeftColor: COLORS.info, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={COLORS.info} />
                <Text style={styles.waitText}>Le technicien est en route. Il vous enverra son devis une fois sur place.</Text>
              </View>
            </View>
          )}

          {/* ===== OWNER: Pay Quote ===== */}
          {isOwner && emergency.status === 'quote_sent' && emergency.quotes?.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Devis réparation</Text>
              {emergency.quotes.filter((q: any) => q.status === 'pending').map((q: any) => (
                <View key={q.quote_id}>
                  {q.lines?.map((line: any, i: number) => (
                    <View key={i} style={styles.quoteLine}>
                      <Text style={styles.qLineDesc}>{line.description}</Text>
                      <Text style={styles.qLineAmount}>x{line.quantity} — {line.unit_price}€</Text>
                    </View>
                  ))}
                  <View style={styles.quoteTotals}>
                    <View style={styles.amountRow}><Text style={styles.amountLabel}>HT</Text><Text style={styles.amountValue}>{q.total_ht}€</Text></View>
                    <View style={styles.amountRow}><Text style={styles.amountLabel}>TVA ({q.tva_rate}%)</Text><Text style={styles.amountValue}>{q.tva_amount}€</Text></View>
                    <View style={[styles.amountRow, styles.totalRow]}>
                      <Text style={styles.totalLabel}>Total à payer</Text>
                      <Text style={styles.totalValue}>{emergency.quote_amount_display}€</Text>
                    </View>
                  </View>
                  <TouchableOpacity testID="pay-quote-btn" style={styles.payBtn} onPress={handlePayQuote}>
                    <Ionicons name="card-outline" size={20} color={COLORS.textInverse} />
                    <Text style={styles.payBtnText}>Payer {emergency.quote_amount_display}€</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.payBtn, { backgroundColor: COLORS.urgencySoft, marginTop: SPACING.sm }]}
                    onPress={() => handleQuote(emergency.quotes[0].quote_id, 'reject').then(fetchEmergency)}
                  >
                    <Ionicons name="close" size={20} color={COLORS.urgency} />
                    <Text style={[styles.payBtnText, { color: COLORS.urgency }]}>Refuser le devis</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* ===== OWNER: Work in progress ===== */}
          {isOwner && emergency.status === 'quote_paid' && (
            <View style={[styles.card, { borderLeftColor: COLORS.info, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={COLORS.info} />
                <Text style={styles.waitText}>Travaux en cours. Le technicien vous enverra les photos une fois terminé.</Text>
              </View>
            </View>
          )}

          {/* ===== COMPLETED: Photos ===== */}
          {emergency.status === 'completed' && (
            <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
              <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
              <Text style={[styles.sectionTitle, { color: COLORS.success, marginTop: SPACING.sm }]}>Intervention terminée</Text>
              <Text style={styles.emergDesc}>Les travaux ont été réalisés avec succès. Le paiement a été transféré au technicien.</Text>
            </View>
          )}

          {/* ===== PROVIDER: Accept ===== */}
          {!isOwner && emergency.status === 'open' && !showAcceptForm && (
            <TouchableOpacity testID="accept-emergency-btn" style={[styles.payBtn, { backgroundColor: COLORS.success }]} onPress={() => setShowAcceptForm(true)}>
              <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.payBtnText}>Accepter cette urgence</Text>
            </TouchableOpacity>
          )}

          {showAcceptForm && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Accepter l'urgence</Text>
              <Text style={styles.fieldLabel}>Frais de déplacement (€)</Text>
              <TextInput testID="displacement-fee-input" style={styles.input} value={displacementFee} onChangeText={setDisplacementFee} keyboardType="numeric" placeholder="ex: 40" placeholderTextColor={COLORS.textTertiary} />
              <Text style={styles.fieldLabel}>Frais de diagnostic (€)</Text>
              <TextInput testID="diagnostic-fee-input" style={styles.input} value={diagnosticFee} onChangeText={setDiagnosticFee} keyboardType="numeric" placeholder="ex: 30" placeholderTextColor={COLORS.textTertiary} />
              <Text style={styles.fieldLabel}>Temps d'arrivée estimé (minutes)</Text>
              <TextInput testID="eta-input" style={styles.input} value={etaMinutes} onChangeText={setEtaMinutes} keyboardType="numeric" placeholder="ex: 25" placeholderTextColor={COLORS.textTertiary} />
              <TouchableOpacity testID="confirm-accept-btn" style={[styles.payBtn, { backgroundColor: COLORS.success }]} onPress={handleAcceptEmergency}>
                <Text style={styles.payBtnText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ===== PROVIDER: Waiting for displacement payment ===== */}
          {!isOwner && isMyEmergency && emergency.status === 'provider_accepted' && (
            <View style={[styles.card, { borderLeftColor: COLORS.warning, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={COLORS.warning} />
                <Text style={styles.waitText}>En attente du paiement des frais de déplacement par la propriétaire.</Text>
              </View>
            </View>
          )}

          {/* ===== PROVIDER: Send quote ===== */}
          {!isOwner && isMyEmergency && emergency.status === 'displacement_paid' && !showQuoteForm && (
            <TouchableOpacity testID="send-quote-btn" style={[styles.payBtn, { backgroundColor: COLORS.brandPrimary }]} onPress={() => setShowQuoteForm(true)}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.payBtnText}>Envoyer le devis réparation</Text>
            </TouchableOpacity>
          )}

          {showQuoteForm && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Devis réparation</Text>
              {quoteLines.map((line, i) => (
                <View key={i} style={styles.lineRow}>
                  <TextInput style={[styles.lineInput, { flex: 2 }]} value={line.description} onChangeText={(v) => { const n = [...quoteLines]; n[i].description = v; setQuoteLines(n); }} placeholder="Description" placeholderTextColor={COLORS.textTertiary} />
                  <TextInput style={styles.lineInput} value={line.quantity} onChangeText={(v) => { const n = [...quoteLines]; n[i].quantity = v; setQuoteLines(n); }} placeholder="Qté" placeholderTextColor={COLORS.textTertiary} keyboardType="numeric" />
                  <TextInput style={styles.lineInput} value={line.unit_price} onChangeText={(v) => { const n = [...quoteLines]; n[i].unit_price = v; setQuoteLines(n); }} placeholder="€" placeholderTextColor={COLORS.textTertiary} keyboardType="numeric" />
                </View>
              ))}
              <TouchableOpacity onPress={addLine} style={styles.addLineBtn}>
                <Ionicons name="add-circle-outline" size={18} color={COLORS.info} />
                <Text style={styles.addLineText}>Ajouter une ligne</Text>
              </TouchableOpacity>
              <View style={styles.quoteTotals}>
                <View style={styles.amountRow}><Text style={styles.amountLabel}>Total HT</Text><Text style={styles.amountValue}>{totalHT.toFixed(2)}€</Text></View>
                <View style={styles.amountRow}><Text style={styles.amountLabel}>TVA ({tvaRate}%)</Text><Text style={styles.amountValue}>{tvaAmount.toFixed(2)}€</Text></View>
                <View style={[styles.amountRow, styles.totalRow]}><Text style={styles.totalLabel}>Total TTC</Text><Text style={styles.totalValue}>{totalTTC.toFixed(2)}€</Text></View>
              </View>
              <TouchableOpacity testID="submit-quote-btn" style={[styles.payBtn, { backgroundColor: COLORS.brandPrimary }]} onPress={handleSendQuote}>
                <Text style={styles.payBtnText}>Envoyer le devis</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ===== PROVIDER: Waiting for quote payment ===== */}
          {!isOwner && isMyEmergency && emergency.status === 'quote_sent' && (
            <View style={[styles.card, { borderLeftColor: COLORS.warning, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={COLORS.warning} />
                <Text style={styles.waitText}>En attente de validation du devis par la propriétaire.</Text>
              </View>
            </View>
          )}

          {/* ===== PROVIDER: Complete ===== */}
          {!isOwner && isMyEmergency && emergency.status === 'quote_paid' && (
            <TouchableOpacity testID="complete-emergency-btn" style={[styles.payBtn, { backgroundColor: COLORS.success }]} onPress={handleCompleteEmergency}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
              <Text style={styles.payBtnText}>Terminer l'intervention</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ============ CREATE FORM (OWNER) ============
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
            <Text style={styles.urgentBannerDesc}>Les techniciens disponibles seront alertés immédiatement</Text>
          </View>

          <Text style={styles.fieldLabel}>Logement concerné</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.propScroll}>
            {properties.map((p) => (
              <TouchableOpacity key={p.property_id} style={[styles.propChip, selectedProp === p.property_id && styles.propChipActive]} onPress={() => setSelectedProp(p.property_id)}>
                <Text style={[styles.propChipText, selectedProp === p.property_id && styles.propChipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>Type de problème</Text>
          <View style={styles.typeGrid}>
            {SERVICE_TYPES.map((st) => (
              <TouchableOpacity key={st.id} testID={`service-type-${st.id}`} style={[styles.serviceTypeCard, selectedType === st.id && styles.serviceTypeActive]} onPress={() => setSelectedType(st.id)}>
                <Ionicons name={st.icon as any} size={24} color={selectedType === st.id ? COLORS.textInverse : COLORS.urgency} />
                <Text style={[styles.serviceTypeText, selectedType === st.id && styles.serviceTypeTextActive]}>{st.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Description du problème</Text>
          <TextInput testID="emergency-description" style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Décrivez le problème en détail..." placeholderTextColor={COLORS.textTertiary} multiline numberOfLines={4} />

          <TouchableOpacity testID="send-emergency-btn" style={styles.emergencyBtn} onPress={handleCreateEmergency} disabled={sending}>
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
  loadingText: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  headerTitle: { ...FONTS.h3, color: COLORS.textPrimary },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
  // Status
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.lg },
  statusText: { ...FONTS.bodySmall, fontWeight: '600', flex: 1 },
  // Card
  card: { backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.lg, ...SHADOWS.card },
  urgentCard: { borderLeftWidth: 4, borderLeftColor: COLORS.urgency },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  urgentLabel: { ...FONTS.caption, color: COLORS.urgency },
  propName: { ...FONTS.h2, color: COLORS.textPrimary },
  propAddr: { ...FONTS.body, color: COLORS.textSecondary, marginTop: 4 },
  emergDesc: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md, fontSize: 16 },
  // Provider
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  providerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center' },
  providerAvatarText: { ...FONTS.h3, color: COLORS.textInverse },
  providerName: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  etaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.infoSoft, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  etaText: { ...FONTS.bodySmall, color: COLORS.info, fontWeight: '600' },
  // Amounts
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm },
  amountLabel: { ...FONTS.body, color: COLORS.textSecondary },
  amountValue: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.sm, paddingTop: SPACING.sm },
  totalLabel: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  totalValue: { ...FONTS.h3, color: COLORS.brandPrimary, fontSize: 16 },
  // Pay button
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.md, ...SHADOWS.float },
  payBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  // Wait
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  waitText: { ...FONTS.body, color: COLORS.textSecondary, flex: 1 },
  // Quotes
  quoteLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  qLineDesc: { ...FONTS.body, color: COLORS.textPrimary, flex: 1 },
  qLineAmount: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  quoteTotals: { marginTop: SPACING.md },
  // Form inputs
  fieldLabel: { ...FONTS.caption, color: COLORS.textSecondary, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  lineRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  lineInput: { flex: 1, backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.md, ...FONTS.bodySmall, color: COLORS.textPrimary },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm },
  addLineText: { ...FONTS.bodySmall, color: COLORS.info },
  // Create form
  urgentBanner: { alignItems: 'center', backgroundColor: COLORS.urgencySoft, padding: SPACING.xxl, borderRadius: RADIUS.xl, marginBottom: SPACING.xl },
  urgentBannerTitle: { ...FONTS.h2, color: COLORS.urgency, marginTop: SPACING.md },
  urgentBannerDesc: { ...FONTS.body, color: COLORS.urgency, opacity: 0.7, textAlign: 'center', marginTop: SPACING.sm },
  propScroll: { maxHeight: 40 },
  propChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: COLORS.paper, marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  propChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  propChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  propChipTextActive: { color: COLORS.textInverse },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  serviceTypeCard: { width: '31%', padding: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.paper, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: SPACING.xs },
  serviceTypeActive: { backgroundColor: COLORS.urgency, borderColor: COLORS.urgency },
  serviceTypeText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 11, textAlign: 'center' },
  serviceTypeTextActive: { color: COLORS.textInverse },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: COLORS.urgency, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.xxl, ...SHADOWS.urgency },
  emergencyBtnText: { ...FONTS.h3, color: COLORS.textInverse },
});
