import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, ActivityIndicator, TextInput, Image, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getProfile, updateProviderProfile, geocodeAddress, createStripeConnectAccount } from '../../src/api';

const SPECIALTIES = [
  { id: 'cleaning', icon: 'sparkles-outline' as const, label: 'Ménage' },
  { id: 'linen', icon: 'shirt-outline' as const, label: 'Linge' },
  { id: 'plumbing', icon: 'water-outline' as const, label: 'Plomberie' },
  { id: 'electrical', icon: 'flash-outline' as const, label: 'Électricité' },
  { id: 'locksmith', icon: 'key-outline' as const, label: 'Serrurerie' },
  { id: 'jacuzzi', icon: 'water-outline' as const, label: 'Jacuzzi / Spa' },
  { id: 'repair', icon: 'construct-outline' as const, label: 'Réparation' },
];

const RADIUS_OPTIONS = [5, 10, 20, 30, 50];

const DAYS = [
  { id: 'monday', label: 'Lun' },
  { id: 'tuesday', label: 'Mar' },
  { id: 'wednesday', label: 'Mer' },
  { id: 'thursday', label: 'Jeu' },
  { id: 'friday', label: 'Ven' },
  { id: 'saturday', label: 'Sam' },
  { id: 'sunday', label: 'Dim' },
];

const COMPANY_TYPE_LABELS: Record<string, string> = {
  auto_entrepreneur: 'Auto-entrepreneur',
  artisan: 'Artisan',
  eurl_sasu: 'EURL / SASU',
  sarl_sas: 'SARL / SAS',
};

const FAQ_PROVIDER = [
  { q: 'Comment candidater à une mission ?', a: 'Dans le tableau de bord, les missions disponibles apparaissent automatiquement selon votre zone et vos spécialités. Appuyez sur "Candidater" pour proposer votre tarif.' },
  { q: 'Comment activer ma disponibilité ?', a: 'Utilisez le switch "Disponible / Indisponible" en haut du tableau de bord. Désactivez-le quand vous n\'êtes pas disponible pour éviter de recevoir des missions.' },
  { q: 'Comment envoyer un devis pour une urgence ?', a: 'Acceptez l\'urgence depuis le tableau de bord, indiquez vos frais de déplacement et d\'arrivée estimée. Une fois sur place et après paiement du déplacement, vous pouvez envoyer votre devis réparation.' },
  { q: 'Quand suis-je payé ?', a: 'Le paiement est automatiquement transféré sur votre compte Stripe dès que le propriétaire valide l\'intervention terminée. Généralement sous 1 à 2 jours ouvrés.' },
  { q: 'Puis-je refuser une mission ?', a: 'Oui, vous êtes libre d\'accepter ou refuser chaque mission. Si vous n\'êtes pas disponible, désactivez simplement votre disponibilité.' },
];

export default function ProviderProfile() {
  const router = useRouter();
  const { user, handleLogout } = useAuth();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Spécialités & Zone state
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [radiusKm, setRadiusKm] = useState(20);
  const [availability, setAvailability] = useState<string[]>([]);
  const [locationLabel, setLocationLabel] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);

  const onLogout = async () => {
    await handleLogout();
    setTimeout(() => router.replace('/'), 0);
  };

  const loadProviderProfile = async () => {
    setLoadingProfile(true);
    try {
      const profile = await getProfile();
      const pp = profile?.provider_profile;
      if (pp) {
        setSpecialties(pp.specialties || []);
        setRadiusKm(pp.radius_km || 20);
        setAvailability(pp.weekly_availability || []);
        setLocationLabel(pp.location_label || '');
      }
    } catch (e) { console.error(e); }
    finally { setLoadingProfile(false); }
  };

  const handleOpenZone = () => {
    loadProviderProfile();
    setActiveModal('zone');
  };

  const handleSaveZone = async () => {
    setSaving(true);
    try {
      let geoUpdate: { latitude?: number; longitude?: number; location_label?: string } = {};
      if (locationLabel.trim()) {
        const coords = await geocodeAddress(locationLabel.trim());
        if (coords) {
          geoUpdate = { latitude: coords.lat, longitude: coords.lng, location_label: locationLabel.trim() };
        } else {
          geoUpdate = { location_label: locationLabel.trim() };
        }
      }
      await updateProviderProfile({ specialties, radius_km: radiusKm, weekly_availability: availability, ...geoUpdate });
      Alert.alert('Enregistré !', 'Votre profil prestataire a été mis à jour.');
      setActiveModal(null);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally { setSaving(false); }
  };

  const handleConnectStripe = async () => {
    setConnectingStripe(true);
    try {
      const { url } = await createStripeConnectAccount();
      if (url) {
        Linking.openURL(url);
        setActiveModal(null);
      }
    } catch (e: any) {
      Alert.alert('Erreur Stripe', e.message);
    } finally {
      setConnectingStripe(false);
    }
  };

  const toggleSpecialty = (id: string) =>
    setSpecialties(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const toggleDay = (id: string) =>
    setAvailability(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  const menuItems = [
    { id: 'notifications', icon: 'notifications-outline' as const, label: 'Notifications' },
    { id: 'zone', icon: 'settings-outline' as const, label: 'Spécialités & Zone', onPress: handleOpenZone },
    { id: 'paiements', icon: 'card-outline' as const, label: 'Paiements' },
    { id: 'aide', icon: 'help-circle-outline' as const, label: 'Aide & FAQ' },
  ];

  return (
    <SafeAreaView style={styles.container} testID="provider-profile">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}><Text style={styles.title}>Profil</Text></View>

        <View style={styles.userCard}>
          <Image
            source={{ uri: `https://ui-avatars.com/api/?name=${user?.name || 'Provider'}&background=FF6B6B&color=fff&size=150&font-size=0.4&rounded=true` }}
            style={styles.avatar}
          />
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="construct-outline" size={14} color={COLORS.brandPrimary} />
            <Text style={styles.roleText}>Prestataire</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuItem, i === menuItems.length - 1 && { borderBottomWidth: 0 }]}
              onPress={item.onPress || (() => setActiveModal(item.id))}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon} size={20} color={COLORS.brandPrimary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity testID="provider-logout-btn" style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.urgency} />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
        <Text style={styles.version}>MontRTO v1.0 — Prestataire</Text>
      </ScrollView>

      {/* ── Notifications Modal ── */}
      <Modal visible={activeModal === 'notifications'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.comingSoonWrap}>
              <View style={styles.bigIconWrap}>
                <Ionicons name="notifications-outline" size={44} color={COLORS.brandPrimary} />
              </View>
              <Text style={styles.comingSoonTitle}>Bientôt disponible</Text>
              <Text style={styles.comingSoonDesc}>Les alertes push arrivent dans la prochaine mise à jour.</Text>
            </View>
            {['Nouvelles missions dans votre zone', 'Confirmation de candidature acceptée', 'Alertes d\'urgences', 'Paiements reçus'].map((item, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="time-outline" size={16} color={COLORS.textTertiary} />
                <Text style={styles.featureRowText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Spécialités & Zone Modal (fonctionnel) ── */}
      <Modal visible={activeModal === 'zone'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Spécialités & Zone</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {loadingProfile ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={COLORS.brandPrimary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Spécialités</Text>
                <View style={styles.specialtyGrid}>
                  {SPECIALTIES.map((s) => {
                    const selected = specialties.includes(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.specialtyChip, selected && styles.specialtyChipSelected]}
                        onPress={() => toggleSpecialty(s.id)}
                      >
                        <Ionicons name={s.icon} size={16} color={selected ? COLORS.textInverse : COLORS.brandPrimary} />
                        <Text style={[styles.specialtyChipText, selected && styles.specialtyChipTextSelected]}>{s.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Rayon d'intervention</Text>
                <View style={styles.chipRow}>
                  {RADIUS_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, radiusKm === r && styles.chipSelected]}
                      onPress={() => setRadiusKm(r)}
                    >
                      <Text style={[styles.chipText, radiusKm === r && styles.chipTextSelected]}>{r} km</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Commune de départ</Text>
                <TextInput
                  style={styles.locationInput}
                  placeholder="Ex: Megève, Chamonix, Annecy..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={locationLabel}
                  onChangeText={setLocationLabel}
                  autoCorrect={false}
                />
                <Text style={styles.locationHint}>Votre lieu de départ pour calculer les distances</Text>

                <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Disponibilités habituelles</Text>
                <View style={styles.chipRow}>
                  {DAYS.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dayChip, availability.includes(d.id) && styles.chipSelected]}
                      onPress={() => toggleDay(d.id)}
                    >
                      <Text style={[styles.chipText, availability.includes(d.id) && styles.chipTextSelected]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveZone} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color={COLORS.textInverse} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textInverse} />
                      <Text style={styles.saveBtnText}>Enregistrer</Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={{ height: SPACING.xxxl }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Paiements Modal ── */}
      <Modal visible={activeModal === 'paiements'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Paiements</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.comingSoonWrap}>
              <View style={styles.bigIconWrap}>
                <Ionicons name="card-outline" size={44} color={COLORS.brandPrimary} />
              </View>
              <Text style={styles.comingSoonTitle}>Stripe Connect</Text>
              <Text style={styles.comingSoonDesc}>Connectez votre compte bancaire pour recevoir vos paiements automatiquement.</Text>
            </View>
            {[
              { icon: 'flash-outline' as const, text: 'Virement automatique après chaque mission validée' },
              { icon: 'bar-chart-outline' as const, text: 'Tableau de bord de vos revenus' },
              { icon: 'document-text-outline' as const, text: 'Factures générées en votre nom' },
              { icon: 'shield-checkmark-outline' as const, text: 'Conforme aux obligations fiscales françaises' },
            ].map((item, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name={item.icon} size={16} color={COLORS.info} />
                <Text style={styles.featureRowText}>{item.text}</Text>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#635BFF', marginTop: SPACING.xxl }]}
              onPress={handleConnectStripe}
              disabled={connectingStripe}
            >
              {connectingStripe ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Ionicons name="link-outline" size={20} color={COLORS.textInverse} />
                  <Text style={styles.saveBtnText}>Connecter mon compte Stripe</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Aide Modal ── */}
      <Modal visible={activeModal === 'aide'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Aide & FAQ</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {FAQ_PROVIDER.map((faq, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.faqItem}
                  onPress={() => setOpenFaq(openFaq === i ? null : i)}
                  activeOpacity={0.7}
                >
                  <View style={styles.faqQuestion}>
                    <Text style={styles.faqQ}>{faq.q}</Text>
                    <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textTertiary} />
                  </View>
                  {openFaq === i && <Text style={styles.faqA}>{faq.a}</Text>}
                </TouchableOpacity>
              ))}
              <View style={{ height: SPACING.xxxl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxl, paddingBottom: SPACING.lg },
  title: { ...FONTS.h1, color: COLORS.textPrimary },
  userCard: { alignItems: 'center', backgroundColor: COLORS.paper, marginHorizontal: SPACING.xl, padding: SPACING.xxl, borderRadius: RADIUS.xxl, ...SHADOWS.float, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg, ...SHADOWS.card },
  avatarText: { ...FONTS.h1, color: COLORS.textInverse },
  userName: { ...FONTS.h2, color: COLORS.textPrimary },
  userEmail: { ...FONTS.body, color: COLORS.textSecondary, marginTop: 4 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, backgroundColor: COLORS.subtle, paddingHorizontal: SPACING.lg, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  roleText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  menuSection: { marginTop: SPACING.xxl, marginHorizontal: SPACING.xl, backgroundColor: COLORS.paper, borderRadius: RADIUS.xxl, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.subtle, gap: SPACING.md },
  menuIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  menuLabel: { flex: 1, ...FONTS.body, color: COLORS.textPrimary, fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, padding: SPACING.lg, backgroundColor: COLORS.paper, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.urgency, ...SHADOWS.card },
  logoutText: { ...FONTS.h3, color: COLORS.urgency, fontSize: 16 },
  version: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.xxxl, marginBottom: SPACING.xxxl, letterSpacing: 1 },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(26,29,46,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.paper, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACING.xl, maxHeight: '85%', ...SHADOWS.float },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  sheetTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  loadingWrap: { height: 150, justifyContent: 'center', alignItems: 'center' },
  comingSoonWrap: { alignItems: 'center', paddingVertical: SPACING.lg, marginBottom: SPACING.lg },
  bigIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  comingSoonTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  comingSoonDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
  comingSoonBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, alignSelf: 'center', marginTop: SPACING.xl, backgroundColor: COLORS.warningSoft, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full },
  comingSoonBadgeText: { ...FONTS.bodySmall, color: COLORS.warning, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  featureRowText: { ...FONTS.body, color: COLORS.textSecondary, flex: 1, fontWeight: '500' },
  fieldLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginBottom: SPACING.sm, fontWeight: '600' },
  specialtyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  specialtyChip: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border },
  specialtyChipSelected: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary, ...SHADOWS.float },
  specialtyChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 13, fontWeight: '500' },
  specialtyChipTextSelected: { color: COLORS.textInverse, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: SPACING.xl, paddingVertical: 12, borderRadius: RADIUS.full, backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border },
  chipSelected: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary, ...SHADOWS.card },
  chipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextSelected: { color: COLORS.textInverse, fontWeight: '600' },
  dayChip: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.xxl, marginTop: SPACING.xl, ...SHADOWS.float },
  saveBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  locationInput: { backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  locationHint: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 12, marginBottom: SPACING.sm },
  faqItem: { backgroundColor: COLORS.subtle, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  faqQuestion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACING.md },
  faqQ: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', flex: 1, fontSize: 13 },
  faqA: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md, lineHeight: 22 },
});
