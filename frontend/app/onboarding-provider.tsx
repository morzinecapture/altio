import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { completeProviderOnboarding } from '../src/api';

const HOW_IT_WORKS = [
  { icon: 'notifications-outline' as const, title: 'Missions en temps réel', desc: 'Recevez les demandes correspondant à vos compétences et votre zone d\'intervention.' },
  { icon: 'hand-left-outline' as const, title: 'Candidatez en 1 clic', desc: 'Proposez votre tarif ou acceptez directement les missions à tarif fixe.' },
  { icon: 'document-text-outline' as const, title: 'Devis depuis l\'app', desc: 'Pour les urgences, envoyez votre devis directement depuis l\'application.' },
  { icon: 'card-outline' as const, title: 'Paiement automatique', desc: 'Soyez payé sur votre compte bancaire dès validation de l\'intervention.' },
];

const SPECIALTIES = [
  { id: 'cleaning', icon: 'sparkles-outline' as const, label: 'Ménage' },
  { id: 'linen', icon: 'shirt-outline' as const, label: 'Linge' },
  { id: 'plumbing', icon: 'water-outline' as const, label: 'Plomberie' },
  { id: 'electrical', icon: 'flash-outline' as const, label: 'Électricité' },
  { id: 'locksmith', icon: 'key-outline' as const, label: 'Serrurerie' },
  { id: 'jacuzzi', icon: 'water-outline' as const, label: 'Jacuzzi / Spa' },
  { id: 'repair', icon: 'construct-outline' as const, label: 'Réparation' },
];

const COMPANY_TYPES = [
  { id: 'auto_entrepreneur', label: 'Auto-entrepreneur', desc: 'Micro-entreprise, facturation simplifiée' },
  { id: 'artisan', label: 'Artisan', desc: 'Inscrit au répertoire des métiers' },
  { id: 'eurl_sasu', label: 'EURL / SASU', desc: 'Entreprise unipersonnelle à responsabilité limitée' },
  { id: 'sarl_sas', label: 'SARL / SAS', desc: 'Société à responsabilité limitée' },
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

const TOTAL_STEPS = 3;

export default function OnboardingProvider() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [companyType, setCompanyType] = useState('');
  const [radiusKm, setRadiusKm] = useState(20);
  const [availability, setAvailability] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleSpecialty = (id: string) =>
    setSpecialties(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const toggleDay = (id: string) =>
    setAvailability(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  const handleFinish = async () => {
    setSaving(true);
    try {
      await completeProviderOnboarding({ specialties, company_type: companyType, radius_km: radiusKm, weekly_availability: availability });
      router.replace('/(provider)/dashboard');
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
            <Text style={styles.welcomeTitle}>Bienvenue prestataire</Text>
            <Text style={styles.welcomeSub}>Comment fonctionne MontRTO pour vous</Text>
          </View>

          {HOW_IT_WORKS.map((item, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={item.icon} size={24} color={COLORS.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{item.title}</Text>
                <Text style={styles.featureDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(1)}>
            <Text style={styles.nextBtnText}>Configurer mon profil</Text>
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
          <View style={[styles.progressFill, { width: progressPct as any }]} />
        </View>
        <Text style={styles.stepCount}>{step}/{TOTAL_STEPS}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* STEP 1 — Spécialités */}
        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>Vos spécialités</Text>
            <Text style={styles.stepSub}>Sélectionnez tout ce que vous proposez (multi-choix)</Text>
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
                    <Text style={[styles.specialtyLabel, selected && styles.specialtyLabelSelected]}>{s.label}</Text>
                    {selected && (
                      <View style={styles.checkDot}>
                        <Ionicons name="checkmark" size={10} color={COLORS.textInverse} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.nextBtn, specialties.length === 0 && styles.nextBtnDisabled]}
              onPress={() => setStep(2)}
              disabled={specialties.length === 0}
            >
              <Text style={styles.nextBtnText}>Continuer</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
            </TouchableOpacity>
          </>
        )}

        {/* STEP 2 — Structure */}
        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>Votre structure</Text>
            <Text style={styles.stepSub}>Pour la facturation et les paiements</Text>
            {COMPANY_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeCard, companyType === type.id && styles.typeCardSelected]}
                onPress={() => setCompanyType(type.id)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeLabel, companyType === type.id && styles.typeLabelSelected]}>{type.label}</Text>
                  <Text style={styles.typeDesc}>{type.desc}</Text>
                </View>
                {companyType === type.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.nextBtn, !companyType && styles.nextBtnDisabled]}
              onPress={() => setStep(3)}
              disabled={!companyType}
            >
              <Text style={styles.nextBtnText}>Continuer</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
            </TouchableOpacity>
          </>
        )}

        {/* STEP 3 — Zone + disponibilités */}
        {step === 3 && (
          <>
            <Text style={styles.stepTitle}>Zone & disponibilités</Text>
            <Text style={styles.stepSub}>Pour recevoir les missions qui correspondent à vous</Text>

            <Text style={styles.fieldLabel}>Rayon d'intervention</Text>
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

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Récapitulatif</Text>
              <Text style={styles.summaryLine}>
                🔧 {specialties.length} spécialité{specialties.length > 1 ? 's' : ''}
              </Text>
              <Text style={styles.summaryLine}>📍 Rayon : {radiusKm} km</Text>
              <Text style={styles.summaryLine}>
                📅 {availability.length > 0 ? `${availability.length} jour${availability.length > 1 ? 's' : ''}/semaine` : 'Disponibilités non renseignées'}
              </Text>
            </View>

            <TouchableOpacity style={styles.nextBtn} onPress={handleFinish} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Text style={styles.nextBtnText}>Accéder au tableau de bord</Text>
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
  fieldLabel: { ...FONTS.caption, color: COLORS.textSecondary, marginBottom: SPACING.md },
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
});
