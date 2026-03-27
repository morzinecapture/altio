import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { completeProviderOnboarding, geocodeAddress } from '../src/api';

const validateSiret = (v: string) => /^\d{14}$/.test(v.replace(/\s/g, ''));

const HOW_IT_WORKS = [
  { icon: 'notifications-outline' as const, titleKey: 'onboarding.provider.feature1_title', descKey: 'onboarding.provider.feature1_desc' },
  { icon: 'hand-left-outline' as const, titleKey: 'onboarding.provider.feature2_title', descKey: 'onboarding.provider.feature2_desc' },
  { icon: 'document-text-outline' as const, titleKey: 'onboarding.provider.feature3_title', descKey: 'onboarding.provider.feature3_desc' },
  { icon: 'card-outline' as const, titleKey: 'onboarding.provider.feature4_title', descKey: 'onboarding.provider.feature4_desc' },
];

const SPECIALTIES = [
  { id: 'cleaning', icon: 'sparkles-outline' as const, labelKey: 'mission_types.cleaning' },
  { id: 'linen', icon: 'shirt-outline' as const, labelKey: 'mission_types.linen' },
  { id: 'plumbing', icon: 'water-outline' as const, labelKey: 'mission_types.plumbing' },
  { id: 'electrical', icon: 'flash-outline' as const, labelKey: 'mission_types.electrical' },
  { id: 'locksmith', icon: 'key-outline' as const, labelKey: 'mission_types.locksmith' },
  { id: 'jacuzzi', icon: 'water-outline' as const, labelKey: 'mission_types.jacuzzi' },
  { id: 'repair', icon: 'construct-outline' as const, labelKey: 'mission_types.repair' },
];

const COMPANY_TYPES = [
  { id: 'auto_entrepreneur', labelKey: 'onboarding.provider.structure_ae', descKey: 'onboarding.provider.structure_ae_desc' },
  { id: 'artisan', labelKey: 'onboarding.provider.structure_artisan', descKey: 'onboarding.provider.structure_artisan_desc' },
  { id: 'eurl_sasu', labelKey: 'onboarding.provider.structure_eurl', descKey: 'onboarding.provider.structure_eurl_desc' },
  { id: 'sarl_sas', labelKey: 'onboarding.provider.structure_sarl', descKey: 'onboarding.provider.structure_sarl_desc' },
];

const RADIUS_OPTIONS = [5, 10, 20, 30, 50];

const DAYS = [
  { id: 'monday', labelKey: 'onboarding.provider.days_mon' },
  { id: 'tuesday', labelKey: 'onboarding.provider.days_tue' },
  { id: 'wednesday', labelKey: 'onboarding.provider.days_wed' },
  { id: 'thursday', labelKey: 'onboarding.provider.days_thu' },
  { id: 'friday', labelKey: 'onboarding.provider.days_fri' },
  { id: 'saturday', labelKey: 'onboarding.provider.days_sat' },
  { id: 'sunday', labelKey: 'onboarding.provider.days_sun' },
];

const TOTAL_STEPS = 4;

export default function OnboardingProvider() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [companyType, setCompanyType] = useState('');
  const [baseAddress, setBaseAddress] = useState('');
  const [radiusKm, setRadiusKm] = useState(20);
  const [availability, setAvailability] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Step 3 — Insurance & documents
  const [rcProDoc, setRcProDoc] = useState<string | null>(null);
  const [decennaleDoc, setDecennaleDoc] = useState<string | null>(null);
  const [siren, setSiren] = useState('');

  // Step 4 — Legal validation
  const [cguAccepted, setCguAccepted] = useState(false);
  const [mandateAccepted, setMandateAccepted] = useState(false);
  const [dsaCertification, setDsaCertification] = useState(false);

  const siretError = siren.length > 0 && !validateSiret(siren);

  const toggleSpecialty = (id: string) =>
    setSpecialties(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const toggleDay = (id: string) =>
    setAvailability(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  const pickDocument = async (setter: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const getFileName = (uri: string) => {
    const parts = uri.split('/');
    return parts[parts.length - 1];
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      let locationData: { latitude?: number; longitude?: number; location_label?: string } = {};
      if (baseAddress.trim()) {
        const coords = await geocodeAddress(baseAddress.trim());
        if (coords) {
          locationData = { latitude: coords.lat, longitude: coords.lng, location_label: baseAddress.trim() };
        } else {
          locationData = { location_label: baseAddress.trim() };
        }
      }
      await completeProviderOnboarding({
        specialties,
        company_type:       companyType,
        radius_km:          radiusKm,
        weekly_availability: availability,
        ...locationData,
        cgu_accepted_at:     new Date().toISOString(),
        mandate_accepted_at: new Date().toISOString(),
        dsa_certified_at:    new Date().toISOString(),
      });
      router.replace('/tutorial?role=provider');
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  const progressPct = `${(step / TOTAL_STEPS) * 100}%`;

  if (step === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerSection}>
            <View style={[styles.logoCircle, { backgroundColor: COLORS.info }]}>
              <Ionicons name="construct-outline" size={32} color={COLORS.textInverse} />
            </View>
            <Text style={styles.welcomeTitle}>{t('onboarding.provider.step1_title')}</Text>
            <Text style={styles.welcomeSub}>{t('onboarding.provider.step1_sub')}</Text>
          </View>

          {HOW_IT_WORKS.map((item, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={item.icon} size={24} color={COLORS.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{t(item.titleKey)}</Text>
                <Text style={styles.featureDesc}>{t(item.descKey)}</Text>
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(1)}>
            <Text style={styles.nextBtnText}>{t('onboarding.provider.cta')}</Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setStep(s => s - 1)} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: progressPct as `${number}%` }]} />
        </View>
        <Text style={styles.stepCount}>{step}/{TOTAL_STEPS}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* STEP 1 — Votre identité pro */}
        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>{t('onboarding.provider.step2_title')}</Text>
            <Text style={styles.stepSub}>{t('onboarding.provider.step2_sub')}</Text>
            <View style={styles.specialtyGrid}>
              {SPECIALTIES.map((s) => {
                const selected = specialties.includes(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.specialtyCard, selected && styles.specialtyCardSelected]}
                    onPress={() => toggleSpecialty(s.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={s.icon} size={28} color={selected ? COLORS.textInverse : COLORS.brandPrimary} />
                    <Text style={[styles.specialtyLabel, selected && styles.specialtyLabelSelected]}>{t(s.labelKey)}</Text>
                    {selected && (
                      <View style={styles.checkDot}>
                        <Ionicons name="checkmark" size={10} color={COLORS.textInverse} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.stepTitle, { marginTop: SPACING.xl }]}>{t('onboarding.provider.step3_title')}</Text>
            <Text style={styles.stepSub}>{t('onboarding.provider.step3_sub')}</Text>
            {COMPANY_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeCard, companyType === type.id && styles.typeCardSelected]}
                onPress={() => setCompanyType(type.id)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeLabel, companyType === type.id && styles.typeLabelSelected]}>{t(type.labelKey)}</Text>
                  <Text style={styles.typeDesc}>{t(type.descKey)}</Text>
                </View>
                {companyType === type.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.nextBtn, (specialties.length === 0 || !companyType) && styles.nextBtnDisabled]}
              onPress={() => setStep(2)}
              disabled={specialties.length === 0 || !companyType}
            >
              <Text style={styles.nextBtnText}>{t('common.continue')}</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
            </TouchableOpacity>
          </>
        )}

        {/* STEP 2 — Zone & disponibilités */}
        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>{t('onboarding.provider.step4_title')}</Text>
            <Text style={styles.stepSub}>{t('onboarding.provider.step4_sub')}</Text>

            <Text style={styles.fieldLabel}>{t('onboarding.provider.base_address_label', { defaultValue: 'Votre commune de départ' })}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('onboarding.provider.base_address_placeholder', { defaultValue: 'Ex : Megève, Chamonix, Annecy...' })}
              placeholderTextColor={COLORS.textTertiary}
              value={baseAddress}
              onChangeText={setBaseAddress}
              autoCorrect={false}
            />
            <Text style={styles.baseAddressHint}>
              {t('onboarding.provider.base_address_hint', { defaultValue: 'Votre lieu de départ pour calculer les distances vers les missions' })}
            </Text>

            <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>{t('onboarding.provider.radius_label')}</Text>
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

            {baseAddress.trim() ? (
              <View style={styles.radiusExplainer}>
                <Ionicons name="navigate-circle-outline" size={18} color={COLORS.info} />
                <Text style={styles.radiusExplainerText}>
                  {t('onboarding.provider.radius_explainer', {
                    defaultValue: 'Les missions dans un rayon de {{km}} km autour de {{city}} vous seront proposées',
                    km: radiusKm,
                    city: baseAddress.trim(),
                  })}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>{t('onboarding.provider.availability_label')}</Text>
            <View style={styles.chipRow}>
              {DAYS.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.dayChip, availability.includes(d.id) && styles.chipSelected]}
                  onPress={() => toggleDay(d.id)}
                >
                  <Text style={[styles.chipText, availability.includes(d.id) && styles.chipTextSelected]}>{t(d.labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{t('onboarding.provider.step5_title')}</Text>
              <Text style={styles.summaryLine}>
                {specialties.length > 1
                  ? `🔧 ${t('onboarding.provider.summary_specialties_other', { count: specialties.length })}`
                  : `🔧 ${t('onboarding.provider.summary_specialties_one', { count: specialties.length })}`}
              </Text>
              <Text style={styles.summaryLine}>
                📍 {baseAddress.trim()
                  ? t('onboarding.provider.summary_radius_with_city', { defaultValue: '{{km}} km autour de {{city}}', km: radiusKm, city: baseAddress.trim() })
                  : t('onboarding.provider.summary_radius', { km: radiusKm })}
              </Text>
              <Text style={styles.summaryLine}>
                📅 {availability.length > 0
                  ? (availability.length > 1
                    ? t('onboarding.provider.summary_days_other', { count: availability.length })
                    : t('onboarding.provider.summary_days_one', { count: availability.length }))
                  : t('onboarding.provider.no_availability')}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, !baseAddress.trim() && styles.nextBtnDisabled]}
              onPress={() => setStep(3)}
              disabled={!baseAddress.trim()}
            >
              <Text style={styles.nextBtnText}>{t('common.continue')}</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
            </TouchableOpacity>
          </>
        )}

        {/* STEP 3 — Assurances & documents */}
        {step === 3 && (
          <>
            <Text style={styles.stepTitle}>{t('onboarding.provider.step_insurance_title')}</Text>
            <Text style={styles.stepSub}>{t('onboarding.provider.step_insurance_sub')}</Text>

            <View style={styles.infoCard}>
              <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.info} />
              <Text style={styles.infoText}>{t('onboarding.provider.insurance_banner')}</Text>
            </View>

            {/* RC Pro upload */}
            <Text style={styles.fieldLabel}>{t('onboarding.provider.rc_pro_label')}</Text>
            <Text style={styles.uploadDesc}>{t('onboarding.provider.rc_pro_desc')}</Text>
            {rcProDoc ? (
              <View style={styles.uploadedRow}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={styles.uploadedText} numberOfLines={1}>{getFileName(rcProDoc)}</Text>
                <TouchableOpacity onPress={() => setRcProDoc(null)}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textTertiary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setRcProDoc)} activeOpacity={0.7}>
                <Ionicons name="cloud-upload-outline" size={20} color={COLORS.brandPrimary} />
                <Text style={styles.uploadBtnText}>{t('onboarding.provider.rc_pro_add')}</Text>
              </TouchableOpacity>
            )}

            {/* Décennale upload */}
            <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>
              {t('onboarding.provider.decennale_label')} <Text style={styles.optional}>{t('onboarding.provider.decennale_optional')}</Text>
            </Text>
            <Text style={styles.uploadDesc}>{t('onboarding.provider.decennale_desc')}</Text>
            {decennaleDoc ? (
              <View style={styles.uploadedRow}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={styles.uploadedText} numberOfLines={1}>{getFileName(decennaleDoc)}</Text>
                <TouchableOpacity onPress={() => setDecennaleDoc(null)}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textTertiary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickDocument(setDecennaleDoc)} activeOpacity={0.7}>
                <Ionicons name="cloud-upload-outline" size={20} color={COLORS.brandPrimary} />
                <Text style={styles.uploadBtnText}>{t('onboarding.provider.decennale_add')}</Text>
              </TouchableOpacity>
            )}

            {/* SIRET field */}
            <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>
              {t('onboarding.provider.siret_label')} <Text style={styles.optional}>{t('onboarding.provider.siret_hint')}</Text>
            </Text>
            <TextInput
              style={[styles.input, siretError && styles.inputError]}
              placeholder={t('onboarding.provider.siret_placeholder')}
              placeholderTextColor={COLORS.textTertiary}
              value={siren}
              onChangeText={setSiren}
              keyboardType="number-pad"
              maxLength={17}
            />
            {siretError && <Text style={styles.errorText}>{t('onboarding.billing.siren_error')}</Text>}

            <TouchableOpacity
              style={[styles.nextBtn, siretError && styles.nextBtnDisabled]}
              onPress={() => setStep(4)}
              disabled={siretError}
            >
              <Text style={styles.nextBtnText}>{t('common.continue')}</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(4)}>
              <Text style={styles.skipText}>{t('onboarding.provider.skip_later')}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* STEP 4 — Validation légale (mandat + CGU + DSA) */}
        {step === 4 && (
          <>
            <Text style={styles.stepTitle}>{t('onboarding.provider.step_legal_title', { defaultValue: 'Validation légale' })}</Text>
            <Text style={styles.stepSub}>{t('onboarding.provider.step_legal_sub', { defaultValue: 'Pour exercer sur Altio, veuillez accepter les conditions suivantes.' })}</Text>

            {/* Mandat de facturation */}
            <View style={styles.legalCard}>
              <View style={styles.legalIconWrap}>
                <Ionicons name="document-text-outline" size={24} color={COLORS.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.legalCardTitle}>{t('onboarding.provider.mandate_title', { defaultValue: 'Mandat de facturation' })}</Text>
                <Text style={styles.legalCardDesc}>
                  {t('onboarding.provider.mandate_desc', { defaultValue: 'Altio émet les factures de prestation en votre nom et pour votre compte (art. 289-I-2 du CGI). Vous restez redevable de la TVA sur vos prestations. Une copie de chaque facture sera disponible dans votre espace.' })}
                </Text>
              </View>
            </View>

            {/* Checkbox — Mandat */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setMandateAccepted(!mandateAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, mandateAccepted && styles.checkboxChecked]}>
                {mandateAccepted && <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('onboarding.provider.mandate_accept', { defaultValue: 'Je mandate Altio pour émettre les factures de prestation en mon nom et pour mon compte.' })}
              </Text>
            </TouchableOpacity>

            {/* Checkbox — CGU */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setCguAccepted(!cguAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, cguAccepted && styles.checkboxChecked]}>
                {cguAccepted && <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('onboarding.provider.cgu_accept', { defaultValue: 'J\'accepte les ' })}
                <Text
                  style={{ color: COLORS.brandPrimary, textDecorationLine: 'underline' }}
                  onPress={() => router.push('/legal')}
                >
                  {t('onboarding.provider.cgu_link', { defaultValue: 'CGU, CGV et la Politique de confidentialité' })}
                </Text>
                {t('onboarding.provider.cgu_accept_end', { defaultValue: ' d\'Altio.' })}
              </Text>
            </TouchableOpacity>

            {/* Checkbox — Auto-certification DSA (art. 30) */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setDsaCertification(!dsaCertification)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, dsaCertification && styles.checkboxChecked]}>
                {dsaCertification && <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('onboarding.provider.dsa_certify', { defaultValue: 'Je certifie que les informations fournies sont exactes et que je respecte le droit applicable aux prestations que je propose.' })}
              </Text>
            </TouchableOpacity>

            {/* Info fiscale — art. 242 bis CGI */}
            <View style={[styles.infoCard, { marginTop: SPACING.xl }]}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
              <Text style={styles.infoText}>
                {t('onboarding.provider.fiscal_info', { defaultValue: 'Les revenus perçus via Altio sont soumis à l\'impôt sur le revenu et aux cotisations sociales. Pour plus d\'informations : impots.gouv.fr et urssaf.fr' })}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, (!cguAccepted || !mandateAccepted || !dsaCertification) && styles.nextBtnDisabled]}
              onPress={handleFinish}
              disabled={saving || !cguAccepted || !mandateAccepted || !dsaCertification}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Text style={styles.nextBtnText}>{t('onboarding.provider.finish_btn')}</Text>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
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
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  progressBar: { flex: 1, height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: COLORS.brandPrimary, borderRadius: 2 },
  stepCount: { ...FONTS.caption, color: COLORS.textTertiary },
  headerSection: { alignItems: 'center', marginBottom: SPACING.xxxl },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg, ...SHADOWS.float },
  welcomeTitle: { ...FONTS.h2, color: COLORS.textPrimary, textAlign: 'center' },
  welcomeSub: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm },
  featureCard: { flexDirection: 'row', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.md, ...SHADOWS.card, alignItems: 'flex-start', gap: SPACING.md },
  featureIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  featureTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700' },
  featureDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },
  stepTitle: { ...FONTS.h2, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  stepSub: { ...FONTS.body, color: COLORS.textSecondary, marginBottom: SPACING.xl, lineHeight: 22 },
  specialtyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.xl },
  specialtyCard: { width: '30%', backgroundColor: COLORS.paper, padding: SPACING.md, borderRadius: RADIUS.lg, alignItems: 'center', borderWidth: 2, borderColor: COLORS.border, ...SHADOWS.card, gap: SPACING.sm, position: 'relative', paddingTop: SPACING.lg },
  specialtyCardSelected: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  specialtyLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, textAlign: 'center', fontSize: 11 },
  specialtyLabelSelected: { color: COLORS.textInverse },
  checkDot: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center' },
  typeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.md, borderWidth: 2, borderColor: COLORS.border, ...SHADOWS.card, gap: SPACING.md },
  typeCardSelected: { borderColor: COLORS.brandPrimary, backgroundColor: '#F8FAFC' },
  typeLabel: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 2 },
  typeLabelSelected: { color: COLORS.brandPrimary },
  typeDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  fieldLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginBottom: SPACING.xs, marginTop: SPACING.lg },
  chipRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.full, backgroundColor: COLORS.paper, borderWidth: 2, borderColor: COLORS.border },
  chipSelected: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  chipText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  chipTextSelected: { color: COLORS.textInverse },
  dayChip: { width: 46, height: 46, borderRadius: 12, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.border },
  summaryCard: { backgroundColor: COLORS.infoSoft, padding: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.xl, gap: SPACING.sm },
  summaryTitle: { ...FONTS.bodySmall, color: COLORS.info, fontWeight: '700', marginBottom: SPACING.xs },
  summaryLine: { ...FONTS.body, color: COLORS.textPrimary },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.xl, ...SHADOWS.float },
  nextBtnDisabled: { backgroundColor: COLORS.textTertiary, opacity: 0.6 },
  nextBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  // Insurance step
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.infoSoft, padding: SPACING.md, borderRadius: RADIUS.md, marginBottom: SPACING.xl },
  infoText: { ...FONTS.bodySmall, color: COLORS.info, flex: 1, lineHeight: 18 },
  uploadDesc: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginBottom: SPACING.md },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.paper, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' },
  uploadBtnText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  uploadedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.paper, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.success },
  uploadedText: { ...FONTS.bodySmall, color: COLORS.textPrimary, flex: 1 },
  optional: { fontWeight: '400', color: COLORS.textTertiary },
  input: { backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary },
  inputError: { borderColor: COLORS.urgency },
  errorText: { ...FONTS.caption, color: COLORS.urgency, marginTop: SPACING.xs },
  baseAddressHint: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: SPACING.xs },
  radiusExplainer: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.infoSoft, padding: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.md },
  radiusExplainerText: { ...FONTS.bodySmall, color: COLORS.info, flex: 1, lineHeight: 18 },
  skipBtn: { alignItems: 'center', marginTop: SPACING.lg, padding: SPACING.md },
  skipText: { ...FONTS.body, color: COLORS.textTertiary, textDecorationLine: 'underline' },
  // Legal step
  legalCard: { flexDirection: 'row', backgroundColor: COLORS.paper, padding: SPACING.lg, borderRadius: RADIUS.lg, marginBottom: SPACING.lg, ...SHADOWS.card, alignItems: 'flex-start', gap: SPACING.md },
  legalIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.infoSoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  legalCardTitle: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 4 },
  legalCardDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary, lineHeight: 18 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  checkboxChecked: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  checkboxLabel: { ...FONTS.bodySmall, color: COLORS.textPrimary, flex: 1, lineHeight: 20 },
});
