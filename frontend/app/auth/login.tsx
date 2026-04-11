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

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('auth.fields_required'), t('auth.fill_all_fields'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        if (error.message === 'Invalid login credentials') {
          Alert.alert(t('auth.invalid_credentials_title'), t('auth.invalid_credentials_msg'));
        } else if (error.message === 'Email not confirmed') {
          Alert.alert(
            t('auth.email_not_confirmed_title'),
            t('auth.email_not_confirmed_msg'),
            [
              { text: 'OK', style: 'cancel' },
              {
                text: 'Renvoyer l\'email',
                onPress: async () => {
                  try {
                    await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
                    Alert.alert('Email envoyé', 'Un nouvel email de confirmation a été envoyé.');
                  } catch { Alert.alert('Erreur', 'Impossible de renvoyer l\'email.'); }
                },
              },
            ]
          );
        } else {
          throw error;
        }
      }
      // onAuthStateChange in auth.tsx handles the redirect
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
            <Text style={styles.title}>{t('auth.login_title')}</Text>
            <Text style={styles.subtitle}>{t('auth.login_subtitle')}</Text>
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
                autoComplete="current-password"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push('/auth/forgot-password')}>
              <Text style={styles.forgotText}>{t('auth.forgot_password')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
              {loading ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={20} color={COLORS.textInverse} />
                  <Text style={styles.primaryBtnText}>{t('auth.login_button')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace('/auth/signup')}>
              <Text style={styles.linkText}>{t('auth.no_account')} <Text style={styles.linkBold}>{t('auth.signup_link')}</Text></Text>
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
  forgotBtn: { alignSelf: 'flex-end', marginTop: SPACING.xs, marginBottom: SPACING.sm },
  forgotText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg, gap: SPACING.md, marginTop: SPACING.md, ...SHADOWS.float,
  },
  primaryBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  linkBtn: { alignItems: 'center', marginTop: SPACING.xl },
  linkText: { ...FONTS.body, color: COLORS.textSecondary },
  linkBold: { color: COLORS.brandPrimary, fontWeight: '700' },
});
