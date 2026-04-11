import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { supabase } from '../../src/lib/supabase';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useTranslation } from 'react-i18next';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert(t('auth.fields_required'), t('auth.fill_all_fields'));
      return;
    }

    setLoading(true);
    try {
      const redirectTo = Linking.createURL('auth/reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      );
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      Alert.alert('Erreur', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.content}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Ionicons name="lock-closed-outline" size={32} color={COLORS.textInverse} />
            </View>
            <Text style={styles.title}>{t('auth.forgot_title')}</Text>
            <Text style={styles.subtitle}>
              {sent
                ? t('auth.reset_email_sent_msg')
                : t('auth.forgot_subtitle')}
            </Text>
          </View>

          {sent ? (
            <View style={styles.successCard}>
              <Ionicons name="checkmark-circle" size={40} color={COLORS.success} />
              <Text style={styles.successText}>{t('auth.reset_email_sent_title')}</Text>
              <Text style={styles.successEmail}>{email}</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/')} activeOpacity={0.8}>
                <Text style={styles.primaryBtnText}>{t('auth.back_to_login')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>{t('auth.email_label')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('auth.email_placeholder')}
                placeholderTextColor={COLORS.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={handleReset} disabled={loading} activeOpacity={0.8}>
                {loading ? (
                  <ActivityIndicator color={COLORS.textInverse} />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={20} color={COLORS.textInverse} />
                    <Text style={styles.primaryBtnText}>{t('auth.send_reset_link')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkBtn} onPress={() => router.back()}>
                <Text style={styles.linkText}>{t('auth.back_to_login')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: SPACING.xxl },
  backBtn: { marginTop: SPACING.lg, marginBottom: SPACING.lg, width: 40, height: 40, justifyContent: 'center' },
  logoArea: { alignItems: 'center', marginBottom: SPACING.xxxl },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.brandPrimary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.lg, ...SHADOWS.float,
  },
  title: { ...FONTS.h1, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  subtitle: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  form: { gap: SPACING.xs },
  label: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg,
    ...FONTS.body, color: COLORS.textPrimary,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg, gap: SPACING.md, marginTop: SPACING.xl, ...SHADOWS.float,
  },
  primaryBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  linkBtn: { alignItems: 'center', marginTop: SPACING.xl },
  linkText: { ...FONTS.body, color: COLORS.textSecondary },
  linkBold: { color: COLORS.brandPrimary, fontWeight: '700' },
  successCard: {
    alignItems: 'center', backgroundColor: COLORS.paper,
    padding: SPACING.xxl, borderRadius: RADIUS.xxl,
    borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md, ...SHADOWS.float,
  },
  successText: { ...FONTS.body, color: COLORS.textSecondary },
  successEmail: { ...FONTS.h3, color: COLORS.textPrimary, fontWeight: '700' },
});
