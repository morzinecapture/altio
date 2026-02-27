import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, SERVICE_TYPE_LABELS } from '../src/theme';
import { useAuth } from '../src/auth';
import { createEmergency, getEmergency, getProperties, createQuote, handleQuote } from '../src/api';

const SERVICE_TYPES = [
  { id: 'plumbing', icon: 'water-outline', label: 'Plomberie' },
  { id: 'electrical', icon: 'flash-outline', label: 'Électricité' },
  { id: 'locksmith', icon: 'key-outline', label: 'Serrurerie' },
  { id: 'jacuzzi', icon: 'water-outline', label: 'Jacuzzi/Spa' },
  { id: 'repair', icon: 'construct-outline', label: 'Réparation' },
];

export default function EmergencyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const emergencyId = params.id as string | undefined;

  // Owner: create emergency form
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedProp, setSelectedProp] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  // Detail view
  const [emergency, setEmergency] = useState<any>(null);
  const [loading, setLoading] = useState(!!emergencyId);

  // Provider: quote form
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteLines, setQuoteLines] = useState([{ description: '', quantity: '1', unit_price: '' }]);
  const [tvaRate, setTvaRate] = useState('20');

  useEffect(() => {
    if (emergencyId) {
      fetchEmergency();
    }
    if (isOwner) {
      fetchProperties();
    }
  }, [emergencyId]);

  const fetchProperties = async () => {
    try {
      const p = await getProperties();
      setProperties(p);
      if (p.length > 0) setSelectedProp(p[0].property_id);
    } catch (e) { console.error(e); }
  };

  const fetchEmergency = async () => {
    try {
      const data = await getEmergency(emergencyId!);
      setEmergency(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreateEmergency = async () => {
    if (!selectedProp || !selectedType || !description.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setSending(true);
    try {
      await createEmergency({
        property_id: selectedProp,
        service_type: selectedType,
        description: description.trim(),
      });
      Alert.alert('Urgence envoyée !', 'Les techniciens de la zone ont été alertés.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
      setSending(false);
    }
  };

  const handleSendQuote = async () => {
    const lines = quoteLines.filter(l => l.description && l.unit_price).map(l => ({
      description: l.description,
      quantity: parseInt(l.quantity) || 1,
      unit_price: parseFloat(l.unit_price) || 0,
    }));
    if (lines.length === 0) { Alert.alert('Erreur', 'Ajoutez au moins une ligne'); return; }

    try {
      await createQuote({
        emergency_request_id: emergencyId,
        lines,
        tva_rate: parseFloat(tvaRate) || 20,
      });
      Alert.alert('Devis envoyé !');
      setShowQuoteForm(false);
      fetchEmergency();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleQuoteAction = async (quoteId: string, action: string) => {
    try {
      await handleQuote(quoteId, action);
      Alert.alert(action === 'accept' ? 'Devis accepté' : 'Devis refusé');
      fetchEmergency();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const addLine = () => setQuoteLines([...quoteLines, { description: '', quantity: '1', unit_price: '' }]);

  const totalHT = quoteLines.reduce((sum, l) => sum + (parseInt(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
  const tvaAmount = totalHT * ((parseFloat(tvaRate) || 0) / 100);
  const totalTTC = totalHT + tvaAmount;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.urgency} /></View>;

  // Detail view (for both roles)
  if (emergencyId && emergency) {
    return (
      <SafeAreaView style={styles.container} testID="emergency-detail-screen">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Urgence</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={[styles.card, styles.urgentCard]}>
            <View style={styles.urgentBadge}>
              <Ionicons name="warning" size={20} color={COLORS.urgency} />
              <Text style={styles.urgentText}>{SERVICE_TYPE_LABELS[emergency.service_type] || emergency.service_type}</Text>
            </View>
            <Text style={styles.propName}>{emergency.property_name}</Text>
            <Text style={styles.propAddr}>{emergency.property_address}</Text>
            <Text style={styles.emergDesc}>{emergency.description}</Text>
          </View>

          {/* Quotes */}
          {emergency.quotes && emergency.quotes.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Devis reçus ({emergency.quotes.length})</Text>
              {emergency.quotes.map((q: any) => (
                <View key={q.quote_id} style={styles.quoteItem}>
                  <View style={styles.quoteTop}>
                    <Text style={styles.quoteName}>{q.provider_name || 'Technicien'}</Text>
                    <Text style={styles.quoteTotal}>{q.total_ttc}€ TTC</Text>
                  </View>
                  {q.lines?.map((line: any, i: number) => (
                    <Text key={i} style={styles.quoteLine}>• {line.description} x{line.quantity} - {line.unit_price}€</Text>
                  ))}
                  <Text style={styles.quoteTva}>TVA {q.tva_rate}%: {q.tva_amount}€</Text>
                  {isOwner && q.status === 'pending' && (
                    <View style={styles.quoteActions}>
                      <TouchableOpacity testID={`accept-quote-${q.quote_id}`} style={styles.acceptQuoteBtn} onPress={() => handleQuoteAction(q.quote_id, 'accept')}>
                        <Text style={styles.acceptQuoteText}>Accepter</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectQuoteBtn} onPress={() => handleQuoteAction(q.quote_id, 'reject')}>
                        <Text style={styles.rejectQuoteText}>Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {q.status !== 'pending' && (
                    <Text style={[styles.quoteStatus, { color: q.status === 'accepted' ? COLORS.success : COLORS.urgency }]}>
                      {q.status === 'accepted' ? '✓ Accepté' : '✗ Refusé'}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Provider: Send Quote */}
          {!isOwner && !showQuoteForm && (
            <TouchableOpacity testID="send-quote-btn" style={styles.quoteBtn} onPress={() => setShowQuoteForm(true)}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.quoteBtnText}>Envoyer un devis</Text>
            </TouchableOpacity>
          )}

          {showQuoteForm && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Nouveau devis</Text>
              {quoteLines.map((line, i) => (
                <View key={i} style={styles.lineRow}>
                  <TextInput style={[styles.lineInput, { flex: 2 }]} value={line.description} onChangeText={(v) => { const n = [...quoteLines]; n[i].description = v; setQuoteLines(n); }} placeholder="Description" placeholderTextColor={COLORS.textTertiary} />
                  <TextInput style={styles.lineInput} value={line.quantity} onChangeText={(v) => { const n = [...quoteLines]; n[i].quantity = v; setQuoteLines(n); }} placeholder="Qté" placeholderTextColor={COLORS.textTertiary} keyboardType="numeric" />
                  <TextInput style={styles.lineInput} value={line.unit_price} onChangeText={(v) => { const n = [...quoteLines]; n[i].unit_price = v; setQuoteLines(n); }} placeholder="Prix €" placeholderTextColor={COLORS.textTertiary} keyboardType="numeric" />
                </View>
              ))}
              <TouchableOpacity onPress={addLine} style={styles.addLineBtn}>
                <Ionicons name="add" size={18} color={COLORS.info} />
                <Text style={styles.addLineText}>Ajouter une ligne</Text>
              </TouchableOpacity>

              <View style={styles.totals}>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Total HT</Text><Text style={styles.totalValue}>{totalHT.toFixed(2)}€</Text></View>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>TVA ({tvaRate}%)</Text><Text style={styles.totalValue}>{tvaAmount.toFixed(2)}€</Text></View>
                <View style={[styles.totalRow, styles.totalFinal]}><Text style={styles.totalFinalLabel}>Total TTC</Text><Text style={styles.totalFinalValue}>{totalTTC.toFixed(2)}€</Text></View>
              </View>

              <TouchableOpacity testID="submit-quote-btn" style={styles.submitQuoteBtn} onPress={handleSendQuote}>
                <Text style={styles.submitQuoteText}>Envoyer le devis</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Owner: Create emergency form
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
              <TouchableOpacity
                key={p.property_id}
                style={[styles.propChip, selectedProp === p.property_id && styles.propChipActive]}
                onPress={() => setSelectedProp(p.property_id)}
              >
                <Text style={[styles.propChipText, selectedProp === p.property_id && styles.propChipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  headerTitle: { ...FONTS.h3, color: COLORS.textPrimary },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
  urgentBanner: { alignItems: 'center', backgroundColor: COLORS.urgencySoft, padding: SPACING.xxl, borderRadius: RADIUS.xl, marginBottom: SPACING.xl },
  urgentBannerTitle: { ...FONTS.h2, color: COLORS.urgency, marginTop: SPACING.md },
  urgentBannerDesc: { ...FONTS.body, color: COLORS.urgency, opacity: 0.7, textAlign: 'center', marginTop: SPACING.sm },
  fieldLabel: { ...FONTS.caption, color: COLORS.textSecondary, marginTop: SPACING.xl, marginBottom: SPACING.sm },
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
  input: { backgroundColor: COLORS.paper, borderRadius: RADIUS.md, padding: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: COLORS.urgency, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.xxl, ...SHADOWS.urgency },
  emergencyBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  // Detail styles
  card: { backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.lg, ...SHADOWS.card },
  urgentCard: { borderLeftWidth: 4, borderLeftColor: COLORS.urgency },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  urgentText: { ...FONTS.caption, color: COLORS.urgency },
  propName: { ...FONTS.h2, color: COLORS.textPrimary },
  propAddr: { ...FONTS.body, color: COLORS.textSecondary, marginTop: 4 },
  emergDesc: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md, fontSize: 16 },
  quoteItem: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  quoteTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quoteName: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  quoteTotal: { ...FONTS.h3, color: COLORS.brandPrimary },
  quoteLine: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 4 },
  quoteTva: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 4 },
  quoteActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  acceptQuoteBtn: { flex: 1, backgroundColor: COLORS.success, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  acceptQuoteText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
  rejectQuoteBtn: { flex: 1, backgroundColor: COLORS.urgencySoft, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  rejectQuoteText: { ...FONTS.bodySmall, color: COLORS.urgency, fontWeight: '600' },
  quoteStatus: { ...FONTS.bodySmall, fontWeight: '600', marginTop: SPACING.sm },
  quoteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.urgency, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.md, ...SHADOWS.urgency },
  quoteBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  lineRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  lineInput: { flex: 1, backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.md, ...FONTS.bodySmall, color: COLORS.textPrimary },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm },
  addLineText: { ...FONTS.bodySmall, color: COLORS.info },
  totals: { marginTop: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  totalValue: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  totalFinal: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.sm, paddingTop: SPACING.sm },
  totalFinalLabel: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  totalFinalValue: { ...FONTS.h3, color: COLORS.brandPrimary, fontSize: 16 },
  submitQuoteBtn: { backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, alignItems: 'center', marginTop: SPACING.lg },
  submitQuoteText: { ...FONTS.h3, color: COLORS.textInverse },
});
