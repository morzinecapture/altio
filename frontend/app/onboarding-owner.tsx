import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { useAuth } from '../src/auth';
import { completeOwnerOnboarding } from '../src/api';

const OWNER_TYPES = [
  { id: 'airbnb_owner', icon: 'home-outline' as const, label: 'Propriétaire Airbnb / Booking', desc: 'Je loue via des plateformes en ligne' },
  { id: 'lmnp', icon: 'document-text-outline' as const, label: 'Loueur LMNP', desc: 'Location Meublée Non Professionnelle' },
  { id: 'sci', icon: 'business-outline' as const, label: 'SCI / Société', desc: 'Je gère mes biens via une société' },
  { id: 'concierge', icon: 'briefcase-outline' as const, label: 'Conciergerie', desc: 'Je gère les biens de plusieurs propriétaires' },
  { id: 'individual', icon: 'person-outline' as const, label: 'Particulier', desc: 'Je loue mon logement occasionnellement' },
];

export default function OnboardingOwner() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [selectedType, setSelectedType] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    if (!selectedType) return;
    setSaving(true);
    try {
      const updated = await completeOwnerOnboarding({ owner_type: selectedType });
      setUser(updated);
      router.replace('/(owner)/dashboard');
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <LinearGradient
          colors={['#4A6CF7', '#6C63FF']}
          style={styles.logoCircle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="snow" size={18} color={COLORS.textInverse} />
        </LinearGradient>
        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>
        <Text style={styles.stepCount}>1/1</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.stepTitle}>Votre profil propriétaire</Text>
        <Text style={styles.stepSub}>
          Quelle est votre situation ? Cela nous permet d'adapter la plateforme à vos besoins.
        </Text>

        {OWNER_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[styles.typeCard, selectedType === type.id && styles.typeCardSelected]}
            onPress={() => setSelectedType(type.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.typeIconWrap, selectedType === type.id && styles.typeIconWrapSelected]}>
              <Ionicons
                name={type.icon}
                size={22}
                color={selectedType === type.id ? COLORS.textInverse : COLORS.brandPrimary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.typeLabel, selectedType === type.id && styles.typeLabelSelected]}>
                {type.label}
              </Text>
              <Text style={styles.typeDesc}>{type.desc}</Text>
            </View>
            {selectedType === type.id && (
              <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.nextBtn, !selectedType && styles.nextBtnDisabled]}
          onPress={handleFinish}
          disabled={!selectedType || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.textInverse} />
          ) : (
            <>
              <Text style={styles.nextBtnText}>Accéder au tableau de bord</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.textInverse} />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl * 2, paddingTop: SPACING.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.lg,
  },
  logoCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: { flex: 1, height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  progressFill: { height: 4, width: '100%', backgroundColor: COLORS.brandPrimary, borderRadius: 2 },
  stepCount: { ...FONTS.caption, color: COLORS.textTertiary },
  stepTitle: { ...FONTS.h2, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  stepSub: { ...FONTS.body, color: COLORS.textSecondary, marginBottom: SPACING.xl, lineHeight: 22 },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOWS.card,
    gap: SPACING.md,
  },
  typeCardSelected: { borderColor: COLORS.brandPrimary, backgroundColor: '#F8FAFC' },
  typeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  typeIconWrapSelected: { backgroundColor: COLORS.brandPrimary },
  typeLabel: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 2 },
  typeLabelSelected: { color: COLORS.brandPrimary },
  typeDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.brandPrimary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.xl,
    ...SHADOWS.float,
  },
  nextBtnDisabled: { backgroundColor: COLORS.textTertiary, opacity: 0.6 },
  nextBtnText: { ...FONTS.h3, color: COLORS.textInverse },
});
