import React, { useState, useEffect } from 'react';
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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const url = Linking.useURL();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Exchange the token from the deep link for a session
  useEffect(() => {
    if (!url) return;

    const exchangeToken = async (rawUrl: string) => {
      try {
        const parsed = Linking.parse(rawUrl);
        const code = parsed.queryParams?.code as string | undefined;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) setSessionReady(true);
          return;
        }

        // Fallback: implicit flow — access_token in hash
        const hash = rawUrl.includes('#') ? rawUrl.split('#')[1] : '';
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!error) setSessionReady(true);
        }
      } catch (e) {
        console.error('[ResetPassword] token exchange error:', e);
      }
    };

    exchangeToken(url);
  }, [url]);

  const handleReset = async () => {
    if (!password || !confirm) {
      Alert.alert(t('auth.fields_required'), t('auth.fill_both_fields'));
      return;
    }
    if (password !== confirm) {
      Alert.alert(t('auth.fields_required'), t('auth.password_mismatch'));
      return;
    }
    if (password.length < 8) {
      Alert.alert(t('auth.fields_required'), t('auth.fill_all_fields'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert(
        t('auth.reset_success_title'),
        t('auth.reset_success_msg'),
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
        <View style={styles.content}>
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Ionicons name="key-outline" size={32} color={COLORS.textInverse} />
            </View>
            <Text style={styles.title}>{t('auth.reset_title')}</Text>
            <Text style={styles.subtitle}>{t('auth.reset_subtitle')}</Text>
          </View>

          {!sessionReady && (
            <View style={styles.waitingCard}>
              <ActivityIndicator color={COLORS.brandPrimary} />
              <Text style={styles.waitingText}>{t('common.loading')}</Text>
            </View>
          )}

          {sessionReady && (
            <View style={styles.form}>
              <Text style={styles.label}>{t('auth.new_password_label')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={t('auth.new_password_placeholder')}
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

              <Text style={styles.label}>{t('auth.confirm_password_label')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={t('auth.confirm_new_password_placeholder')}
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

              <TouchableOpacity style={styles.primaryBtn} onPress={handleReset} disabled={loading} activeOpacity={0.8}>
                {loading ? (
                  <ActivityIndicator color={COLORS.textInverse} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textInverse} />
                    <Text style={styles.primaryBtnText}>{t('auth.reset_button')}</Text>
                  </>
                )}
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
  logoArea: { alignItems: 'center', marginTop: SPACING.xxxl, marginBottom: SPACING.xxxl },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.brandPrimary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.lg, ...SHADOWS.float,
  },
  title: { ...FONTS.h1, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  subtitle: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  waitingCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.lg,
    backgroundColor: COLORS.paper, padding: SPACING.xxl,
    borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border,
  },
  waitingText: { ...FONTS.body, color: COLORS.textSecondary },
  form: { gap: SPACING.xs },
  label: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginBottom: SPACING.xs, marginTop: SPACING.md },
  input: {
    backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg,
    ...FONTS.body, color: COLORS.textPrimary,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  eyeBtn: { padding: SPACING.md },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg, gap: SPACING.md, marginTop: SPACING.xl, ...SHADOWS.float,
  },
  primaryBtnText: { ...FONTS.h3, color: COLORS.textInverse },
});
