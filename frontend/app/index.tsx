import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../src/lib/supabase';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { useAuth } from '../src/auth';

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [processing, setProcessing] = useState(false);

  // Resets the processing state when the component mounts or the app regains focus
  useEffect(() => {
    if (Platform.OS === 'web') {
      WebBrowser.maybeCompleteAuthSession();
    }
    // Safety net: if we return to the screen and are stuck processing, reset it after a tiny delay
    const timeout = setTimeout(() => {
      setProcessing(false);
    }, 1000);
    return () => clearTimeout(timeout);
  }, []);

  // Redirect authenticated users
  useEffect(() => {
    console.log(`[Index] Checking redirect - loading: ${loading}, user: ${!!user}, processing: ${processing}, role: ${user?.role}`);
    if (!loading && user && !processing) {
      console.log('[Index] Conditions met! Proceeding to redirect...');
      setTimeout(() => {
        if (!user.role) {
          router.replace('/welcome');
        } else if (!user.onboarding_completed) {
          router.replace(user.role === 'owner' ? '/onboarding-owner' : '/onboarding-provider');
        } else if (user.is_admin) {
          router.replace('/(admin)/overview');
        } else if (user.role === 'owner') {
          router.replace('/(owner)/dashboard');
        } else {
          router.replace('/(provider)/dashboard');
        }
      }, 100);
    }
  }, [user, loading, processing]);

  const handleGoogleLogin = async () => {
    setProcessing(true);
    try {
      if (Platform.OS === 'web') {
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: typeof window !== 'undefined' ? window.location.origin : '/',
            queryParams: { prompt: 'select_account' },
          },
        });
        return;
      }

      // We want to avoid routing directly to a non-existent 'auth/callback' screen logic
      const redirectUrl = Linking.createURL('');
      console.log('Redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });

      if (error) throw error;

      if (data?.url) {
        // We must use 'exp://...' as the base origin if using Expo Go Native since that's what Supabase accepts
        const browserRes = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        console.log('WebBrowser result:', browserRes.type);

        if (browserRes.type === 'success' && browserRes.url) {
          console.log('Returned URL for parsing:', browserRes.url);

          let access_token = null;
          let refresh_token = null;

          // Strategy 1: standard expo-linking extract
          const params = Linking.parse(browserRes.url);
          if (params.queryParams?.access_token && params.queryParams?.refresh_token) {
            access_token = params.queryParams.access_token as string;
            refresh_token = params.queryParams.refresh_token as string;
          }

          // Strategy 2: manual hash block extract (common for implicit oauth flows)
          if (!access_token && browserRes.url.includes('#')) {
            const hashString = browserRes.url.split('#')[1];
            // Fix edge case where hash might contain ? separator incorrectly
            const cleanHash = hashString.includes('?') ? hashString.replace('?', '&') : hashString;
            const hashMap = new URLSearchParams(cleanHash);
            access_token = hashMap.get('access_token');
            refresh_token = hashMap.get('refresh_token');
          }

          console.log('[Index] Tokens extracted:', { hasAccessToken: !!access_token, hasRefreshToken: !!refresh_token });

          if (access_token && refresh_token) {
            console.log('[Index] Calling setSession...');
            const { error: sessionErr } = await supabase.auth.setSession({ access_token, refresh_token });
            if (sessionErr) console.error('[Index] Failed to set session:', sessionErr);
            console.log('[Index] setSession completed.');

            // Force processing to false early so router unblocks
            setProcessing(false);
          } else {
            console.error('[Index] Could not find tokens in redirect URL');
          }
        }
      }
    } catch (err: any) {
      console.error('[Index] Google login error:', err);
    } finally {
      console.log('[Index] Releasing processing state...');
      setProcessing(false);
    }
  };

  if (loading || processing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        <Text style={styles.loadingText}>
          {processing ? 'Connexion en cours...' : 'Chargement...'}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo Area */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Ionicons name="snow" size={40} color={COLORS.textInverse} />
          </View>
          <Text style={styles.appName}>MontRTO</Text>
          <Text style={styles.tagline}>Gestion opérationnelle{'\n'}de vos locations en montagne</Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: 'calendar-outline' as const, text: 'Sync automatique Airbnb/Booking' },
            { icon: 'people-outline' as const, text: 'Prestataires qualifiés à proximité' },
            { icon: 'warning-outline' as const, text: 'Urgences traitées en temps réel' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={20} color={COLORS.brandPrimary} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Login Button */}
        <TouchableOpacity
          testID="google-login-btn"
          style={styles.googleButton}
          onPress={handleGoogleLogin}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-google" size={22} color={COLORS.textInverse} />
          <Text style={styles.googleButtonText}>Continuer avec Google</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          En continuant, vous acceptez nos conditions d&apos;utilisation
        </Text>
      </View>

      {/* Mountain decoration */}
      <View style={styles.mountainDecor}>
        <Text style={styles.mountainEmoji}>🏔️</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.lg,
    ...FONTS.body,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xxl,
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: SPACING.xxxl,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.brandPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.float,
  },
  appName: {
    ...FONTS.h1,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  tagline: {
    ...FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  features: {
    marginBottom: SPACING.xxxl,
    gap: SPACING.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    ...SHADOWS.card,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  featureText: {
    ...FONTS.bodySmall,
    color: COLORS.textPrimary,
    flex: 1,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.brandPrimary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    gap: SPACING.md,
    ...SHADOWS.float,
  },
  googleButtonText: {
    ...FONTS.h3,
    color: COLORS.textInverse,
  },
  disclaimer: {
    ...FONTS.bodySmall,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  mountainDecor: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    opacity: 0.1,
  },
  mountainEmoji: {
    fontSize: 80,
  },
});
