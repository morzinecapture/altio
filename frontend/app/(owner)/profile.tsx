import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';

const OWNER_TYPE_LABELS: Record<string, string> = {
  airbnb_owner: 'Propriétaire Airbnb / Booking',
  lmnp: 'Loueur LMNP',
  sci: 'SCI / Société',
  concierge: 'Conciergerie',
  individual: 'Particulier',
};

const FAQ = [
  { q: 'Comment synchroniser mon calendrier Airbnb ?', a: 'Dans "Mes logements", ouvrez un logement et ajoutez votre URL iCal Airbnb. Appuyez ensuite sur "Synchroniser iCal" pour importer vos réservations.' },
  { q: 'Comment créer une mission manuellement ?', a: 'Dans l\'onglet "Missions", appuyez sur le bouton "+" en haut à droite. Sélectionnez le logement, le type de mission et le mode (tarif fixe ou appel d\'offres).' },
  { q: 'Que faire en cas d\'urgence ?', a: 'Appuyez sur le bouton rouge "Urgence" visible depuis le tableau de bord. Décrivez le problème — les techniciens disponibles dans votre zone seront alertés immédiatement.' },
  { q: 'Comment choisir un prestataire ?', a: 'En mode "Appel d\'offres", les prestataires candidatent et vous pouvez comparer leurs tarifs et avis. En mode "Tarif fixe", le premier prestataire disponible accepte automatiquement.' },
  { q: 'Quand suis-je débité ?', a: 'Le paiement est effectué lors de la validation du devis (urgences) ou lors de l\'acceptation d\'une candidature. Stripe sécurise la transaction jusqu\'à la fin de l\'intervention.' },
];

export default function OwnerProfile() {
  const router = useRouter();
  const { user, handleLogout } = useAuth();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const onLogout = async () => {
    await handleLogout();
    setTimeout(() => router.replace('/'), 0);
  };

  const menuItems = [
    { id: 'notifications', icon: 'notifications-outline' as const, label: 'Notifications' },
    { id: 'paiements', icon: 'card-outline' as const, label: 'Paiements' },
    { id: 'aide', icon: 'help-circle-outline' as const, label: 'Aide & FAQ' },
    { id: 'apropos', icon: 'information-circle-outline' as const, label: 'À propos' },
    ...(user?.is_admin
      ? [{ id: 'admin', icon: 'shield-outline' as const, label: 'Administration' }]
      : []),
  ];

  return (
    <SafeAreaView style={styles.container} testID="owner-profile">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Profil</Text>
        </View>

        <View style={styles.userCard}>
          <LinearGradient colors={GRADIENT.brandButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0] || 'U'}</Text>
          </LinearGradient>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          {user?.owner_type && (
            <Text style={styles.ownerTypeText}>{OWNER_TYPE_LABELS[user.owner_type] || user.owner_type}</Text>
          )}
          <View style={styles.roleBadge}>
            <Ionicons name="home-outline" size={14} color={COLORS.brandPrimary} />
            <Text style={styles.roleText}>Propriétaire</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuItem, i === menuItems.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => item.id === 'admin' ? router.push('/admin/index') : setActiveModal(item.id)}
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

        <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.urgency} />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MontRTO v1.0 — Morzine, France</Text>
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
            {['Nouvelles candidatures prestataires', 'Confirmations d\'urgences', 'Rappels de missions', 'Alertes de paiement'].map((item, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="time-outline" size={16} color={COLORS.textTertiary} />
                <Text style={styles.featureRowText}>{item}</Text>
              </View>
            ))}
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
              <Text style={styles.comingSoonTitle}>Paiements Stripe</Text>
              <Text style={styles.comingSoonDesc}>Réglez vos prestataires directement depuis l'app — en toute sécurité.</Text>
            </View>
            {[
              { icon: 'shield-checkmark-outline' as const, text: 'Paiement sécurisé par carte bancaire' },
              { icon: 'ban-outline' as const, text: 'Aucun échange d\'espèces ou de chèque' },
              { icon: 'receipt-outline' as const, text: 'Factures générées automatiquement' },
              { icon: 'download-outline' as const, text: 'Historique exportable pour votre comptable' },
            ].map((item, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name={item.icon} size={16} color={COLORS.info} />
                <Text style={styles.featureRowText}>{item.text}</Text>
              </View>
            ))}
            <View style={styles.comingSoonBadge}>
              <Ionicons name="time-outline" size={14} color={COLORS.warning} />
              <Text style={styles.comingSoonBadgeText}>Activation prochainement</Text>
            </View>
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
              {FAQ.map((faq, i) => (
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

      {/* ── À propos Modal ── */}
      <Modal visible={activeModal === 'apropos'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>À propos</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.aboutWrap}>
              <View style={styles.aboutLogo}>
                <Ionicons name="snow" size={36} color={COLORS.textInverse} />
              </View>
              <Text style={styles.aboutAppName}>MontRTO</Text>
              <Text style={styles.aboutVersion}>Version 1.0.0</Text>
              <Text style={styles.aboutDesc}>La plateforme de gestion opérationnelle pour les locations saisonnières en montagne.</Text>
              <View style={styles.aboutTable}>
                {[
                  { label: 'Zone cible', value: 'Morzine / Alpes' },
                  { label: 'Stack', value: 'Supabase + Expo + Stripe' },
                  { label: 'Contact', value: 'contact@montrto.fr' },
                ].map((row, i) => (
                  <View key={i} style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>{row.label}</Text>
                    <Text style={styles.aboutValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
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
  ownerTypeText: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: SPACING.xs },
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
  comingSoonWrap: { alignItems: 'center', paddingVertical: SPACING.lg, marginBottom: SPACING.lg },
  bigIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  comingSoonTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  comingSoonDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
  comingSoonBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, alignSelf: 'center', marginTop: SPACING.xl, backgroundColor: COLORS.warningSoft, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full },
  comingSoonBadgeText: { ...FONTS.bodySmall, color: COLORS.warning, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  featureRowText: { ...FONTS.body, color: COLORS.textSecondary, flex: 1, fontWeight: '500' },
  faqItem: { backgroundColor: COLORS.subtle, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  faqQuestion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACING.md },
  faqQ: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', flex: 1, fontSize: 13 },
  faqA: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md, lineHeight: 22 },
  aboutWrap: { alignItems: 'center', paddingVertical: SPACING.lg },
  aboutLogo: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg, ...SHADOWS.card },
  aboutAppName: { ...FONTS.h1, color: COLORS.textPrimary },
  aboutVersion: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 4, fontWeight: '600' },
  aboutDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.lg, marginBottom: SPACING.xxl, lineHeight: 22 },
  aboutTable: { width: '100%', gap: SPACING.sm, backgroundColor: COLORS.subtle, padding: SPACING.lg, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  aboutLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  aboutValue: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700' },
});
