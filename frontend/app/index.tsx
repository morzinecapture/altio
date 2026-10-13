import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as ExpoCrypto from 'expo-crypto';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../src/lib/supabase';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { useAuth } from '../src/auth';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../src/i18n';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Le hero reste généreux, sans prendre la place du parcours de connexion.
const HERO_HEIGHT = Math.max(344, Math.min(SCREEN_HEIGHT * 0.43, 400));

const LANGS = [
  { code: 'fr' as const, flag: '🇫🇷', label: 'Français' },
  { code: 'en' as const, flag: '🇬🇧', label: 'English' },
];

type Benefit = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  bg: string;
  title: string;
  desc: string;
};

type HeroSectionProps = {
  topInset: number;
  currentLang: (typeof LANGS)[number];
  langOpen: boolean;
  onToggleLanguage: () => void;
  onCloseLanguage: () => void;
  onSelectLanguage: (code: 'fr' | 'en') => void;
  currentLanguage: string;
  languageLabel: string;
  closeLabel: string;
  eyebrow: string;
  appName: string;
  tagline: string;
  signature: string;
};

function HeroSection({
  topInset,
  currentLang,
  langOpen,
  onToggleLanguage,
  onCloseLanguage,
  onSelectLanguage,
  currentLanguage,
  languageLabel,
  closeLabel,
  eyebrow,
  appName,
  tagline,
  signature,
}: HeroSectionProps) {
  return (
    <View style={styles.hero}>
      <Image
        source={require('../assets/images/alpine-login-mountains-v3.png')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(9, 23, 43, 0.54)', 'rgba(9, 23, 43, 0.28)', 'rgba(9, 23, 43, 0.10)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      {langOpen && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onCloseLanguage}
          accessibilityLabel={closeLabel}
        />
      )}

      <View style={[styles.heroContent, { paddingTop: topInset + SPACING.sm }]}>
        <View style={styles.langWrap}>
          <TouchableOpacity
            testID="language-switch-btn"
            style={styles.langPill}
            onPress={onToggleLanguage}
            activeOpacity={0.85}
            accessibilityLabel={languageLabel}
          >
            <Text style={styles.langFlag}>{currentLang.flag}</Text>
            <Text style={styles.langCode}>{currentLang.code.toUpperCase()}</Text>
            <Ionicons name={langOpen ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textSecondary} />
          </TouchableOpacity>

          {langOpen && (
            <View style={styles.langMenu}>
              {LANGS.map((lang, i) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langItem, i === 0 && styles.langItemDivider]}
                  onPress={() => onSelectLanguage(lang.code)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={styles.langItemLabel}>{lang.label}</Text>
                  {currentLanguage === lang.code && <Ionicons name="checkmark" size={16} color={COLORS.brandPrimary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.brand}>
          <Text style={styles.heroEyebrow}>{eyebrow}</Text>
          <View style={styles.logoTile}>
            <Ionicons name="snow" size={29} color="#2768ED" />
          </View>
          <Text style={styles.appName}>{appName}</Text>
          <Text style={styles.tagline}>{tagline}</Text>
        </View>

        <View style={styles.scriptWrap}>
          <Text style={styles.script}>{signature}</Text>
          <View style={styles.scriptUnderline} />
        </View>
      </View>

    </View>
  );
}

function BenefitsRow({ benefits, label }: { benefits: Benefit[]; label: string }) {
  return (
    <View style={styles.benefitsArea}>
      <Text style={styles.benefitsEyebrow}>{label}</Text>
      <View style={styles.features} accessibilityRole="summary">
        {benefits.map((benefit, i) => (
          <React.Fragment key={benefit.title}>
            {i > 0 && <View style={styles.featureDivider} />}
            <View style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: benefit.bg }]}>
                <Ionicons name={benefit.icon} size={21} color={benefit.color} />
              </View>
              <Text style={styles.featureTitle}>{benefit.title}</Text>
              <Text style={styles.featureDesc}>{benefit.desc}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

type SocialLoginButtonsProps = {
  showApple: boolean;
  googleLabel: string;
  emailLabel: string;
  onGoogle: () => void;
  onApple: () => void;
  onEmail: () => void;
};

function SocialLoginButtons({ showApple, googleLabel, emailLabel, onGoogle, onApple, onEmail }: SocialLoginButtonsProps) {
  return (
    <View style={styles.loginActions}>
      <TouchableOpacity testID="google-login-btn" style={[styles.authButton, styles.googleButton]} onPress={onGoogle} activeOpacity={0.85}>
        <View style={styles.authButtonInner}>
          <Ionicons name="logo-google" size={21} color={COLORS.textInverse} />
          <Text style={styles.authButtonTextLight}>{googleLabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" style={styles.authChevron} />
      </TouchableOpacity>

      {showApple && (
        <AppleAuthentication.AppleAuthenticationButton
          testID="apple-login-btn"
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={RADIUS.lg}
          style={styles.appleButton}
          onPress={onApple}
        />
      )}

      <TouchableOpacity testID="email-login-btn" style={[styles.authButton, styles.emailButton]} onPress={onEmail} activeOpacity={0.85}>
        <View style={styles.authButtonInner}>
          <Ionicons name="mail-outline" size={21} color={COLORS.brandPrimary} />
          <Text style={styles.authButtonTextBrand}>{emailLabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.brandPrimary} style={styles.authChevron} />
      </TouchableOpacity>
    </View>
  );
}

function LegalFooter({
  prefix,
  terms,
  salesTerms,
  andLabel,
  privacy,
  suffix,
  signature,
  onOpenTerms,
  onOpenSalesTerms,
  onOpenPrivacy,
}: {
  prefix: string;
  terms: string;
  salesTerms: string;
  andLabel: string;
  privacy: string;
  suffix: string;
  signature: string;
  onOpenTerms: () => void;
  onOpenSalesTerms: () => void;
  onOpenPrivacy: () => void;
}) {
  return (
    <>
      <Text style={styles.legal}>
        {prefix}{' '}
        <Text style={styles.legalLink} onPress={onOpenTerms}>{terms}</Text>
        {', '}
        <Text style={styles.legalLink} onPress={onOpenSalesTerms}>{salesTerms}</Text>{' '}
        {andLabel}{' '}
        <Text style={styles.legalLink} onPress={onOpenPrivacy}>{privacy}</Text>
        {suffix}
      </Text>
      <View style={styles.footer}>
        <Ionicons name="triangle" size={12} color={COLORS.textTertiary} style={styles.footerIcon} />
        <Text style={styles.footerText}>{signature}</Text>
      </View>
    </>
  );
}

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading, setUser } = useAuth();
  const { t, i18n } = useTranslation();
  const [processing, setProcessing] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const authRequestInFlight = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    AppleAuthentication.isAvailableAsync()
      .then(setAppleSignInAvailable)
      .catch(() => setAppleSignInAvailable(false));
  }, []);

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
    if (!loading && user && !processing) {
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
  }, [user, loading, processing, router]);

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

      const redirectUrl = Linking.createURL('auth/callback');

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

        if (browserRes.type === 'success' && browserRes.url) {
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

          if (access_token && refresh_token) {
            const { error: sessionErr } = await supabase.auth.setSession({ access_token, refresh_token });
            if (sessionErr) throw sessionErr;
            setProcessing(false);
          }
        }
      }
    } catch (err: unknown) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Connexion Google échouée');
    } finally {
      setProcessing(false);
    }
  };

  const handleAppleLogin = async () => {
    if (authRequestInFlight.current) return;
    authRequestInFlight.current = true;
    setProcessing(true);
    try {
      const rawNonce = ExpoCrypto.randomUUID();
      const hashedNonce = await ExpoCrypto.digestStringAsync(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) throw new Error('No identity token returned');

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) throw error;

      // Apple only returns the name on the very first authorization. Persist it
      // immediately so subsequent logins and profile creation do not lose it.
      const fullName = [
        credential.fullName?.givenName,
        credential.fullName?.middleName,
        credential.fullName?.familyName,
      ].filter(Boolean).join(' ');

      if (fullName && data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .upsert({
            id: data.user.id,
            email: data.user.email || credential.email || '',
            name: fullName,
          });
        if (profileError) throw profileError;

        setUser({
          id: data.user.id,
          email: data.user.email || credential.email || '',
          name: fullName,
        });
      }
    } catch (err: unknown) {
      if ((err as Record<string, unknown>)?.code !== 'ERR_REQUEST_CANCELED') {
        const authError = err as { code?: string; status?: number; message?: string };
        const isRateLimited = authError.status === 429
          || authError.code === 'over_request_rate_limit'
          || authError.message?.toLowerCase().includes('rate limit');

        Alert.alert(
          t('common.error'),
          isRateLimited
            ? t('auth.rate_limit_error')
            : err instanceof Error ? err.message : t('auth.apple_login_failed'),
        );
      }
    } finally {
      authRequestInFlight.current = false;
      setProcessing(false);
    }
  };

  const handleSelectLang = (code: 'fr' | 'en') => {
    changeLanguage(code);
    setLangOpen(false);
  };

  const openLegal = (tab: 'cgu' | 'cgv' | 'privacy') => {
    router.push({ pathname: '/legal', params: { tab } });
  };

  if (loading || processing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        <Text style={styles.loadingText}>
          {processing ? t('common.connecting') : t('common.loading')}
        </Text>
      </View>
    );
  }

  const currentLang = LANGS.find((l) => l.code === i18n.language) ?? LANGS[0];

  const FEATURES = [
    {
      icon: 'calendar-outline' as const,
      color: COLORS.brandPrimary,
      bg: COLORS.infoSoft,
      title: t('auth.feature_sync_title'),
      desc: t('auth.feature_sync_desc'),
    },
    {
      icon: 'shield-checkmark-outline' as const,
      color: COLORS.success,
      bg: COLORS.successSoft,
      title: t('auth.feature_trust_title'),
      desc: t('auth.feature_trust_desc'),
    },
    {
      icon: 'flash-outline' as const,
      color: COLORS.coral,
      bg: COLORS.coralSoft,
      title: t('auth.feature_fast_title'),
      desc: t('auth.feature_fast_desc'),
    },
  ];

  return (
    <View style={styles.container} testID="landing-screen">
      <StatusBar style="light" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <HeroSection
          topInset={insets.top}
          currentLang={currentLang}
          langOpen={langOpen}
          onToggleLanguage={() => setLangOpen((v) => !v)}
          onCloseLanguage={() => setLangOpen(false)}
          onSelectLanguage={handleSelectLang}
          currentLanguage={i18n.language}
          languageLabel={t('preferences.language_title')}
          closeLabel={t('common.close')}
          eyebrow={t('auth.hero_eyebrow')}
          appName={t('auth.app_name')}
          tagline={t('auth.tagline')}
          signature={t('auth.hero_script')}
        />

        {/* ── Feuille blanche ── */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.lg) + SPACING.lg }]}>
          <BenefitsRow benefits={FEATURES} label={t('auth.benefits_eyebrow')} />
          <SocialLoginButtons
            showApple={appleSignInAvailable}
            googleLabel={t('auth.continue_google')}
            emailLabel={t('auth.continue_email')}
            onGoogle={handleGoogleLogin}
            onApple={handleAppleLogin}
            onEmail={() => router.push('/auth/login')}
          />
          <LegalFooter
            prefix={t('auth.legal_prefix')}
            terms={t('auth.legal_cgu')}
            salesTerms={t('auth.legal_cgv')}
            andLabel={t('auth.legal_and')}
            privacy={t('auth.legal_privacy')}
            suffix={t('auth.legal_suffix')}
            signature={t('auth.brand_signature')}
            onOpenTerms={() => openLegal('cgu')}
            onOpenSalesTerms={() => openLegal('cgv')}
            onOpenPrivacy={() => openLegal('privacy')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFE',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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

  // ── Hero ──
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: '#DCEAFF',
    overflow: 'hidden',
  },
  heroContent: {
    flex: 1,
    paddingHorizontal: SPACING.xxl,
    paddingBottom: 36,
  },
  langWrap: {
    alignSelf: 'flex-end',
    zIndex: 10,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    ...SHADOWS.card,
  },
  langFlag: {
    fontSize: 15,
  },
  langCode: {
    ...FONTS.caption,
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  langMenu: {
    position: 'absolute',
    top: 42,
    right: 0,
    minWidth: 180,
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xs,
    ...SHADOWS.float,
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    minHeight: 48,
  },
  langItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.subtle,
  },
  langItemLabel: {
    ...FONTS.body,
    color: COLORS.textPrimary,
    flex: 1,
  },
  brand: {
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  heroEyebrow: {
    ...FONTS.caption,
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 10,
    letterSpacing: 2.1,
    marginBottom: SPACING.md,
  },
  logoTile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...SHADOWS.card,
  },
  appName: {
    ...FONTS.h1,
    fontSize: 34,
    lineHeight: 40,
    color: COLORS.textInverse,
    marginTop: SPACING.md,
    textShadowColor: 'rgba(15,23,42,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  tagline: {
    ...FONTS.body,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textInverse,
    textAlign: 'center',
    marginTop: SPACING.xs,
    textShadowColor: 'rgba(15,23,42,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  scriptWrap: {
    marginTop: 'auto',
    alignItems: 'center',
  },
  script: {
    ...FONTS.bodySmall,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.92)',
    textAlign: 'center',
    textShadowColor: 'rgba(15,23,42,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  scriptUnderline: {
    width: 46,
    height: 1,
    borderRadius: RADIUS.full,
    backgroundColor: '#2768ED',
    marginTop: SPACING.xs,
  },
  // ── Feuille ──
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    marginTop: -22,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.lg,
  },
  benefitsArea: {
    backgroundColor: '#F7FAFE',
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.xl,
  },
  benefitsEyebrow: {
    ...FONTS.caption,
    fontSize: 10,
    letterSpacing: 1.45,
    color: '#6B778C',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  features: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  feature: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  featureDivider: {
    width: 1,
    alignSelf: 'center',
    height: 56,
    backgroundColor: '#E8EEF7',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  featureTitle: {
    ...FONTS.h3,
    fontSize: 14,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  featureDesc: {
    ...FONTS.bodySmall,
    fontSize: 11,
    lineHeight: 15,
    // 2 lignes réservées pour que les 3 colonnes et leurs séparateurs s'alignent
    minHeight: 32,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  loginActions: {
    width: '100%',
  },
  authButton: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  authButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  authChevron: {
    position: 'absolute',
    right: SPACING.xl,
  },
  googleButton: {
    backgroundColor: '#2768ED',
    ...SHADOWS.float,
  },
  appleButton: {
    width: '100%',
    height: 58,
    marginBottom: SPACING.md,
    ...SHADOWS.float,
  },
  emailButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2768ED',
    ...SHADOWS.card,
  },
  authButtonTextLight: {
    ...FONTS.h3,
    color: COLORS.textInverse,
  },
  authButtonTextBrand: {
    ...FONTS.h3,
    color: '#2768ED',
  },
  legal: {
    ...FONTS.bodySmall,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  legalLink: {
    color: COLORS.brandPrimary,
    textDecorationLine: 'underline',
  },
  footer: {
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  footerIcon: {
    opacity: 0.5,
    marginBottom: SPACING.xs,
  },
  footerText: {
    ...FONTS.caption,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.textTertiary,
  },
});
