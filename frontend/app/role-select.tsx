import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { useAuth } from '../src/auth';
import { setRole } from '../src/api';
import { useTranslation } from 'react-i18next';

export default function RoleSelectScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updatedUser = await setRole(selected);
      setUser(updatedUser);
      if (selected === 'owner') {
        router.replace('/onboarding-owner');
      } else {
        router.replace('/onboarding-provider');
      }
    } catch (error) {
      console.error('Role set error:', error);
      setSaving(false);
    }
  };

  const roles = [
    {
      id: 'owner',
      icon: 'home-outline' as const,
      title: t('role_select.owner_title'),
      desc: t('role_select.owner_desc'),
    },
    {
      id: 'provider',
      icon: 'construct-outline' as const,
      title: t('role_select.provider_title'),
      desc: t('role_select.provider_desc'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.greeting}>{t('role_select.greeting', { name: user?.name?.split(' ')[0] })}</Text>
        <Text style={styles.subtitle}>{t('role_select.subtitle')}</Text>

        <View style={styles.cards}>
          {roles.map((role) => (
            <TouchableOpacity
              key={role.id}
              testID={`role-${role.id}-btn`}
              style={[styles.card, selected === role.id && styles.cardSelected]}
              onPress={() => setSelected(role.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, selected === role.id && styles.iconCircleSelected]}>
                <Ionicons
                  name={role.icon}
                  size={32}
                  color={selected === role.id ? COLORS.textInverse : COLORS.brandPrimary}
                />
              </View>
              <Text style={[styles.cardTitle, selected === role.id && styles.cardTitleSelected]}>
                {role.title}
              </Text>
              <Text style={styles.cardDesc}>{role.desc}</Text>
              {selected === role.id && (
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          testID="confirm-role-btn"
          style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!selected || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.textInverse} />
          ) : (
            <Text style={styles.confirmBtnText}>{t('role_select.confirm')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: SPACING.xxl, justifyContent: 'center' },
  greeting: { ...FONTS.h1, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  subtitle: { ...FONTS.body, color: COLORS.textSecondary, marginBottom: SPACING.xxxl },
  cards: { gap: SPACING.lg, marginBottom: SPACING.xxxl },
  card: {
    backgroundColor: COLORS.paper,
    padding: SPACING.xl,
    borderRadius: RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardSelected: { borderColor: COLORS.brandPrimary, backgroundColor: '#F8FAFC' },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.subtle,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.md,
  },
  iconCircleSelected: { backgroundColor: COLORS.brandPrimary },
  cardTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  cardTitleSelected: { color: COLORS.brandPrimary },
  cardDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary, lineHeight: 20 },
  checkBadge: { position: 'absolute', top: SPACING.lg, right: SPACING.lg },
  confirmBtn: {
    backgroundColor: COLORS.brandPrimary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    ...SHADOWS.float,
  },
  confirmBtnDisabled: { backgroundColor: COLORS.textTertiary, opacity: 0.5 },
  confirmBtnText: { ...FONTS.h3, color: COLORS.textInverse },
});
