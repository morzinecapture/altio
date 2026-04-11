import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { useAuth } from '../src/auth';
import { completeOwnerOnboarding } from '../src/api';

const OWNER_TYPES = [
  { id: 'airbnb_owner', icon: 'home-outline' as const, labelKey: 'onboarding.owner.type_airbnb_label', descKey: 'onboarding.owner.type_airbnb_desc' },
  { id: 'lmnp', icon: 'document-text-outline' as const, labelKey: 'onboarding.owner.type_lmnp_label', descKey: 'onboarding.owner.type_lmnp_desc' },
  { id: 'sci', icon: 'business-outline' as const, labelKey: 'onboarding.owner.type_sci_label', descKey: 'onboarding.owner.type_sci_desc' },
  { id: 'concierge', icon: 'briefcase-outline' as const, labelKey: 'onboarding.owner.type_concierge_label', descKey: 'onboarding.owner.type_concierge_desc' },
  { id: 'individual', icon: 'person-outline' as const, labelKey: 'onboarding.owner.type_individual_label', descKey: 'onboarding.owner.type_individual_desc' },
];

const TOTAL_STEPS = 3;

export default function OnboardingOwner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { setUser } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 2 — Legal checkboxes
  const [cguAccepted, setCguAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  const legalValid = cguAccepted && privacyAccepted;

  const handleFinish = async () => {
    if (!selectedType || !legalValid) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const updated = await completeOwnerOnboarding({
        owner_type: selectedType,
        cgu_accepted_at: now,
        marketing_consent_at: marketingAccepted ? now : null,
      });
      setUser(updated);
      router.replace('/tutorial?role=owner');
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  const progressPct = `${(step / TOTAL_STEPS) * 100}%`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        {step > 1 ? (
          <TouchableOpacity onPress={() => setStep(s => s - 1)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        ) : (
          <LinearGradient colors={['#4A6CF7', '#6C63FF']} style={styles.logoCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Ionicons name="snow" size={18} color={COLORS.textInverse} />
          </LinearGradient>
        )}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: progressPct as `${number}%` }]} />
        </View>
        <Text style={styles.stepCount}>{step}/{TOTAL_STEPS}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── STEP 1 — Type de propriétaire ── */}
        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>{t('onboarding.owner.step1_title')}</Text>
            <Text style={styles.stepSub}>{t('onboarding.owner.step1_sub')}</Text>

            {OWNER_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeCard, selectedType === type.id && styles.typeCardSelected]}
                onPress={() => setSelectedType(type.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.typeIconWrap, selectedType === type.id && styles.typeIconWrapSelected]}>
                  <Ionicons name={type.icon} size={22} color={selectedType === type.id ? COLORS.textInverse : COLORS.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeLabel, selectedType === type.id && styles.typeLabelSelected]}>{t(type.labelKey)}</Text>
                  <Text style={styles.typeDesc}>{t(type.descKey)}</Text>
                </View>
                {selectedType === type.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.nextBtn, !selectedType && styles.nextBtnDisabled]}
              onPress={() => setStep(2)}
              disabled={!selectedType}
              activeOpacity={0.8}
            >
              <Text style={styles.nextBtnText}>{t('common.continue')}</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 2 — Acceptation légale ── */}
        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>{t('onboarding.owner.step_legal_title', { defaultValue: 'Conditions et confidentialité' })}</Text>
            <Text style={styles.stepSub}>{t('onboarding.owner.step_legal_sub', { defaultValue: 'Veuillez lire et accepter les conditions suivantes pour utiliser Altio.' })}</Text>

            {/* Info card */}
            <View style={styles.legalCard}>
              <View style={styles.legalIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.legalCardTitle}>{t('onboarding.owner.legal_card_title', { defaultValue: 'Protection de vos données' })}</Text>
                <Text style={styles.legalCardDesc}>
                  {t('onboarding.owner.legal_card_desc', { defaultValue: 'Vos données personnelles sont protégées conformément au RGPD. Vous pouvez exercer vos droits à tout moment depuis les paramètres de votre compte.' })}
                </Text>
              </View>
            </View>

            {/* Checkbox 1 — CGU + CGV */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setCguAccepted(!cguAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, cguAccepted && styles.checkboxChecked]}>
                {cguAccepted && <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('onboarding.owner.cgu_accept_start', { defaultValue: "J'ai lu et j'accepte les " })}
                <Text
                  style={{ color: COLORS.brandPrimary, textDecorationLine: 'underline' }}
                  onPress={() => router.push('/legal')}
                >
                  {t('onboarding.owner.cgu_link', { defaultValue: "Conditions Générales d'Utilisation" })}
                </Text>
                {t('onboarding.owner.cgu_and', { defaultValue: ' et les ' })}
                <Text
                  style={{ color: COLORS.brandPrimary, textDecorationLine: 'underline' }}
                  onPress={() => router.push('/legal')}
                >
                  {t('onboarding.owner.cgv_link', { defaultValue: 'Conditions Générales de Vente' })}
                </Text>
              </Text>
            </TouchableOpacity>

            {/* Checkbox 2 — Politique de confidentialité */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setPrivacyAccepted(!privacyAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                {privacyAccepted && <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('onboarding.owner.privacy_accept_start', { defaultValue: "J'ai lu et j'accepte la " })}
                <Text
                  style={{ color: COLORS.brandPrimary, textDecorationLine: 'underline' }}
                  onPress={() => router.push('/legal')}
                >
                  {t('onboarding.owner.privacy_link', { defaultValue: 'Politique de confidentialité' })}
                </Text>
              </Text>
            </TouchableOpacity>

            {/* Checkbox 3 — Marketing (optional) */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setMarketingAccepted(!marketingAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, marketingAccepted && styles.checkboxChecked]}>
                {marketingAccepted && <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('onboarding.owner.marketing_accept', { defaultValue: "J'accepte de recevoir des communications commerciales de la part d'Altio (offres, nouveautés, conseils)" })}
              </Text>
            </TouchableOpacity>

            <View style={[styles.infoCard, { marginTop: SPACING.xl }]}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
              <Text style={styles.infoText}>
                {t('onboarding.owner.legal_info', { defaultValue: 'Vous pouvez retirer votre consentement marketing à tout moment depuis les paramètres de votre compte.' })}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, !legalValid && styles.nextBtnDisabled]}
              onPress={() => setStep(3)}
              disabled={!legalValid}
              activeOpacity={0.8}
            >
              <Text style={styles.nextBtnText}>{t('common.continue')}</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 3 — Summary / Ready ── */}
        {step === 3 && (
          <>
            <View style={styles.readyIconWrap}>
              <LinearGradient colors={['#4A6CF7', '#6C63FF']} style={styles.readyIconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name="checkmark-done" size={36} color={COLORS.textInverse} />
              </LinearGradient>
            </View>

            <Text style={styles.readyTitle}>{t('onboarding.owner.ready_title')}</Text>

            <View style={styles.recapCard}>
              <Text style={styles.recapLabel}>{t('onboarding.owner.ready_recap')}</Text>
              <View style={styles.recapRow}>
                <Ionicons
                  name={OWNER_TYPES.find(o => o.id === selectedType)?.icon ?? 'person-outline'}
                  size={20}
                  color={COLORS.brandPrimary}
                />
                <Text style={styles.recapValue}>
                  {t(OWNER_TYPES.find(o => o.id === selectedType)?.labelKey ?? '')}
                </Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
              <Text style={styles.infoText}>{t('onboarding.owner.ready_sub')}</Text>
            </View>

            <TouchableOpacity
              style={styles.nextBtn}
              onPress={handleFinish}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Text style={styles.nextBtnText}>{t('onboarding.billing.go_dashboard')}</Text>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl * 2, paddingTop: SPACING.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.lg },
  logoCircle: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  progressBar: { flex: 1, height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: COLORS.brandPrimary, borderRadius: 2 },
  stepCount: { ...FONTS.caption, color: COLORS.textTertiary },
  stepTitle: { ...FONTS.h2, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  stepSub: { ...FONTS.body, color: COLORS.textSecondary, marginBottom: SPACING.xl, lineHeight: 22 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.infoSoft, padding: SPACING.md, borderRadius: RADIUS.md, marginBottom: SPACING.xl },
  infoText: { ...FONTS.bodySmall, color: COLORS.info, flex: 1, lineHeight: 18 },
  typeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.md, borderWidth: 2, borderColor: COLORS.border, ...SHADOWS.card, gap: SPACING.md },
  typeCardSelected: { borderColor: COLORS.brandPrimary, backgroundColor: '#F8FAFC' },
  typeIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  typeIconWrapSelected: { backgroundColor: COLORS.brandPrimary },
  typeLabel: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 2 },
  typeLabelSelected: { color: COLORS.brandPrimary },
  typeDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  readyIconWrap: { alignItems: 'center', marginBottom: SPACING.xl },
  readyIconCircle: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', ...SHADOWS.float },
  readyTitle: { ...FONTS.h1, color: COLORS.textPrimary, textAlign: 'center', marginBottom: SPACING.xl },
  recapCard: { backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.card },
  recapLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  recapValue: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '700' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.xl, ...SHADOWS.float },
  nextBtnDisabled: { backgroundColor: COLORS.textTertiary, opacity: 0.6 },
  nextBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  // Legal step styles (matching provider onboarding)
  legalCard: { flexDirection: 'row', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.lg, ...SHADOWS.card, alignItems: 'flex-start', gap: SPACING.md },
  legalIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.infoSoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  legalCardTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 4 },
  legalCardDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary, lineHeight: 18 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  checkboxChecked: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  checkboxLabel: { ...FONTS.bodySmall, color: COLORS.textPrimary, flex: 1, lineHeight: 20 },
});
