import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { useAuth } from '../src/auth';
import { exchangeSession } from '../src/api';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading, setUser, checkAuth } = useAuth();
  const [processing, setProcessing] = useState(false);
  const hasProcessed = useRef(false);

  // Handle OAuth callback - detect session_id in URL hash (web)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && hash.includes('session_id=') && !hasProcessed.current) {
        hasProcessed.current = true;
        const sessionId = hash.split('session_id=')[1]?.split('&')[0];
        if (sessionId) {
          handleAuthCallback(sessionId);
        }
      }
    }
  }, []);

  // Handle deep link for native (Expo Go)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleUrl = (event: { url: string }) => {
      const url = event.url;
      if (url && url.includes('session_id=')) {
        const sessionId = url.split('session_id=')[1]?.split('&')[0];
        if (sessionId && !hasProcessed.current) {
          hasProcessed.current = true;
          handleAuthCallback(sessionId);
        }
      }
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    // Check if app was opened with a URL
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    return () => subscription.remove();
  }, []);

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && user && !processing) {
      if (!user.role) {
        router.replace('/role-select');
      } else if (user.role === 'owner') {
        router.replace('/(owner)/dashboard');
      } else {
        router.replace('/(provider)/dashboard');
      }
    }
  }, [user, loading, processing]);

  const handleAuthCallback = async (sessionId: string) => {
    setProcessing(true);
    try {
      const result = await exchangeSession(sessionId);
      await AsyncStorage.setItem('session_token', result.session_token);
      setUser(result.user);
      // Clean URL hash on web
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (error) {
      console.error('Auth error:', error);
      setProcessing(false);
    }
  };

  const handleGoogleLogin = async () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (Platform.OS === 'web') {
      // Web: direct redirect
      if (typeof window !== 'undefined') {
        const redirectUrl = window.location.origin + '/';
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      }
    } else {
      // Native (Expo Go): use WebBrowser with redirect back to app
      const redirectUrl = Linking.createURL('/');
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === 'success' && result.url) {
        const url = result.url;
        if (url.includes('session_id=')) {
          const sessionId = url.split('session_id=')[1]?.split('&')[0]?.split('#')[0];
          if (sessionId) {
            handleAuthCallback(sessionId);
          }
        }
      }
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
          En continuant, vous acceptez nos conditions d'utilisation
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
