import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDE_CONFIGS = [
  {
    id: '1',
    icon: 'calendar' as const,
    badgeKey: 'auth.slide1_badge',
    titleKey: 'auth.slide1_title',
    subtitleKey: 'auth.slide1_subtitle',
    gradient: ['#4A6CF7', '#6C63FF'] as const,
    softBg: '#EEF2FF',
    accentColor: COLORS.brandPrimary,
    decorItems: [
      { size: 120, top: 30, right: -30, opacity: 0.08 },
      { size: 80, bottom: 20, left: -20, opacity: 0.12 },
      { size: 50, top: 80, right: 60, opacity: 0.15 },
    ],
  },
  {
    id: '2',
    icon: 'people' as const,
    badgeKey: 'auth.slide2_badge',
    titleKey: 'auth.slide2_title',
    subtitleKey: 'auth.slide2_subtitle',
    gradient: ['#06D6A0', '#00B4D8'] as const,
    softBg: '#E6FBF3',
    accentColor: COLORS.success,
    decorItems: [
      { size: 100, top: 20, left: -20, opacity: 0.1 },
      { size: 60, bottom: 30, right: 10, opacity: 0.15 },
      { size: 40, top: 100, left: 60, opacity: 0.12 },
    ],
  },
  {
    id: '3',
    icon: 'flash' as const,
    badgeKey: 'auth.slide3_badge',
    titleKey: 'auth.slide3_title',
    subtitleKey: 'auth.slide3_subtitle',
    gradient: ['#FF6B6B', '#FF8A65'] as const,
    softBg: '#FFF0F0',
    accentColor: COLORS.urgency,
    decorItems: [
      { size: 110, bottom: -10, right: -30, opacity: 0.1 },
      { size: 70, top: 30, left: -10, opacity: 0.12 },
      { size: 45, bottom: 60, left: 50, opacity: 0.15 },
    ],
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [isOAuthUser, setIsOAuthUser] = useState(false);

  useEffect(() => {
    // Check if user signed up via OAuth (no email/password identity)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const identities = session.user.identities || [];
        const hasPasswordIdentity = identities.some((i) => i.provider === 'email');
        setIsOAuthUser(!hasPasswordIdentity);
      }
    });
  }, []);

  const goNext = () => {
    if (isOAuthUser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace('/auth/set-password' as any);
    } else {
      router.replace('/role-select');
    }
  };

  const handleNext = () => {
    if (activeIndex < SLIDE_CONFIGS.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      goNext();
    }
  };

  const handleSkip = () => {
    goNext();
  };

  const handleMomentumScrollEnd = (e: { nativeEvent: { contentOffset: { x: number }; layoutMeasurement: { width: number } } }) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const isLast = activeIndex === SLIDE_CONFIGS.length - 1;
  const currentSlide = SLIDE_CONFIGS[activeIndex];

  const renderSlide = ({ item }: { item: (typeof SLIDE_CONFIGS)[0] }) => (
    <View style={styles.slide}>
      {/* Illustration */}
      <View style={[styles.illustrationArea, { backgroundColor: item.softBg }]}>
        {/* Decorative circles */}
        {item.decorItems.map((d, i) => (
          <View
            key={i}
            style={[
              styles.decorCircle,
              {
                width: d.size,
                height: d.size,
                borderRadius: d.size / 2,
                borderColor: item.accentColor,
                opacity: d.opacity,
                top: d.top,
                bottom: d.bottom,
                left: d.left,
                right: d.right,
              },
            ]}
          />
        ))}

        {/* Center icon circle */}
        <LinearGradient
          colors={item.gradient}
          style={styles.iconCircle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name={item.icon} size={64} color="#FFFFFF" />
        </LinearGradient>

        {/* Floating mini-cards for visual depth */}
        <View style={[styles.miniCard, styles.miniCardTL, { backgroundColor: '#FFFFFF' }]}>
          <Ionicons name="checkmark-circle" size={14} color={item.accentColor} />
          <Text style={[styles.miniCardText, { color: item.accentColor }]}>{t('auth.mini_card_auto')}</Text>
        </View>
        <View style={[styles.miniCard, styles.miniCardBR, { backgroundColor: '#FFFFFF' }]}>
          <Ionicons name="star" size={14} color={COLORS.warning} />
          <Text style={[styles.miniCardText, { color: COLORS.textPrimary }]}>5.0</Text>
        </View>
      </View>

      {/* Text content */}
      <View style={styles.textArea}>
        <View style={[styles.badge, { backgroundColor: item.softBg }]}>
          <Text style={[styles.badgeText, { color: item.accentColor }]}>{t(item.badgeKey)}</Text>
        </View>
        <Text style={styles.slideTitle}>{t(item.titleKey)}</Text>
        <Text style={styles.slideSubtitle}>{t(item.subtitleKey)}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <LinearGradient
            colors={['#4A6CF7', '#6C63FF']}
            style={styles.logoCircle}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="snow" size={16} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.logoText}>{t('auth.app_name')}</Text>
        </View>
        {!isLast && (
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.skipText}>{t('auth.skip_btn')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDE_CONFIGS}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        style={styles.flatList}
      />

      {/* Bottom area */}
      <View style={styles.bottomArea}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDE_CONFIGS.map((slide, i) => {
            const inputRange = [
              (i - 1) * SCREEN_WIDTH,
              i * SCREEN_WIDTH,
              (i + 1) * SCREEN_WIDTH,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 28, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor: currentSlide.accentColor,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* CTA button */}
        <TouchableOpacity onPress={handleNext} activeOpacity={0.85} style={styles.nextBtnWrap}>
          <LinearGradient
            colors={currentSlide.gradient}
            style={styles.nextBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.nextBtnText}>{isLast ? t('auth.btn_start') : t('auth.btn_next')}</Text>
            <Ionicons
              name={isLast ? 'checkmark' : 'arrow-forward'}
              size={20}
              color="#FFFFFF"
            />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  logoCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
  },
  skipText: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  flatList: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  illustrationArea: {
    height: 320,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.xl,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  decorCircle: {
    position: 'absolute',
    borderWidth: 2,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.float,
  },
  miniCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    ...SHADOWS.card,
  },
  miniCardTL: {
    top: 36,
    left: 20,
  },
  miniCardBR: {
    bottom: 36,
    right: 20,
  },
  miniCardText: {
    ...FONTS.caption,
    fontSize: 11,
  },
  textArea: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xxl,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
  },
  badgeText: {
    ...FONTS.caption,
    fontSize: 10,
  },
  slideTitle: {
    ...FONTS.h1,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
    lineHeight: 36,
  },
  slideSubtitle: {
    ...FONTS.body,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  bottomArea: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
    paddingTop: SPACING.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  dot: {
    height: 8,
    borderRadius: RADIUS.full,
  },
  nextBtnWrap: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.float,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  nextBtnText: {
    ...FONTS.h3,
    color: '#FFFFFF',
  },
});
