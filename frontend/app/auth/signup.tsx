import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useTranslation } from 'react-i18next';

function getPasswordStrength(pw: string): { level: number; label: string; color: string } {
  if (!pw) return { level: 0, label: '', color: 'transparent' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { level: 1, label: 'Faible', color: '#EF4444' };
  if (score <= 2) return { level: 2, label: 'Moyen', color: '#F59E0B' };
  if (score <= 3) return { level: 3, label: 'Bon', color: '#3B82F6' };
  return { level: 4, label: 'Excellent', color: '#10B981' };
}

export default function SignupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = getPasswordStrength(password);

  const handleSignup = async () => {
    if (!email.trim() || !password || !confirm) {
      Alert.alert(t('auth.fields_required'), t('auth.fill_all_fields'));
      return;
    }
    if (password !== confirm) {
      Alert.alert(t('auth.fields_required'), t('auth.password_mismatch'));
      return;
    }
    if (password.length < 8) {
      Alert.alert(t('auth.fields_required'), 'Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;

      // Send welcome email (fire-and-forget, don't block signup flow)
      supabase.functions.invoke('send-welcome-email', {
        body: { email: email.trim().toLowerCase() },
      }).catch(() => { /* silent — email is nice-to-have */ });

      Alert.alert(
        t('auth.signup_success_title'),
        t('auth.signup_success_msg'),
        [{ text: 'OK', onPress: () => router.replace('/') }]
      );
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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Ionicons name="snow" size={32} color={COLORS.textInverse} />
            </View>
            <Text style={styles.title}>{t('auth.signup_title')}</Text>
            <Text style={styles.subtitle}>{t('auth.signup_subtitle')}</Text>
          </View>

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

            <Text style={styles.label}>{t('auth.password_label')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={t('auth.password_placeholder')}
                placeholderTextColor={COLORS.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            {password.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBar}>
                  {[1, 2, 3, 4].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthSegment,
                        { backgroundColor: i <= strength.level ? strength.color : COLORS.border },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}

            <Text style={styles.label}>{t('auth.confirm_password_label')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={t('auth.confirm_password_placeholder')}
                placeholderTextColor={COLORS.textTertiary}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm(v => !v)}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            {confirm.length > 0 && confirm !== password && (
              <Text style={styles.mismatchText}>Les mots de passe ne correspondent pas</Text>
            )}

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSignup} disabled={loading} activeOpacity={0.8}>
              {loading ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={20} color={COLORS.textInverse} />
                  <Text style={styles.primaryBtnText}>{t('auth.signup_button')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace('/')}>
              <Text style={styles.linkText}>{t('auth.already_account')} <Text style={styles.linkBold}>{t('auth.login_link')}</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.xxl, paddingBottom: SPACING.xxxl },
  backBtn: { marginTop: SPACING.lg, marginBottom: SPACING.lg, width: 40, height: 40, justifyContent: 'center' },
  logoArea: { alignItems: 'center', marginBottom: SPACING.xxxl },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.brandPrimary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.lg, ...SHADOWS.float,
  },
  title: { ...FONTS.h1, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  subtitle: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center' },
  form: { gap: SPACING.xs },
  label: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginBottom: SPACING.xs, marginTop: SPACING.md },
  input: {
    backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg,
    ...FONTS.body, color: COLORS.textPrimary, marginBottom: SPACING.xs,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  eyeBtn: { padding: SPACING.md },
  strengthContainer: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  strengthBar: { flex: 1, flexDirection: 'row', gap: 4, height: 4 },
  strengthSegment: { flex: 1, borderRadius: 2 },
  strengthLabel: { ...FONTS.caption, fontWeight: '600', minWidth: 60, textAlign: 'right' },
  mismatchText: { ...FONTS.bodySmall, color: '#EF4444', marginTop: SPACING.xs },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg, gap: SPACING.md, marginTop: SPACING.xl, ...SHADOWS.float,
  },
  primaryBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  linkBtn: { alignItems: 'center', marginTop: SPACING.xl },
  linkText: { ...FONTS.body, color: COLORS.textSecondary },
  linkBold: { color: COLORS.brandPrimary, fontWeight: '700' },
});
