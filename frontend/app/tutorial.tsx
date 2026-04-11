import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const OWNER_SLIDES = [
  {
    id: '1',
    icon: 'create-outline' as const,
    titleKey: 'tutorial.owner_slide1_title',
    subtitleKey: 'tutorial.owner_slide1_sub',
    gradient: ['#4A6CF7', '#6C63FF'] as const,
    softBg: '#EEF2FF',
    accentColor: '#4A6CF7',
    decorItems: [
      { size: 120, top: 30, right: -30, opacity: 0.08 },
      { size: 80, bottom: 20, left: -20, opacity: 0.12 },
      { size: 50, top: 80, right: 60, opacity: 0.15 },
    ],
  },
  {
    id: '2',
    icon: 'people-outline' as const,
    titleKey: 'tutorial.owner_slide2_title',
    subtitleKey: 'tutorial.owner_slide2_sub',
    gradient: ['#06D6A0', '#00B4D8'] as const,
    softBg: '#E6FBF3',
    accentColor: '#06D6A0',
    decorItems: [
      { size: 100, top: 20, left: -20, opacity: 0.1 },
      { size: 60, bottom: 30, right: 10, opacity: 0.15 },
      { size: 40, top: 100, left: 60, opacity: 0.12 },
    ],
  },
  {
    id: '3',
    icon: 'checkmark-done-outline' as const,
    titleKey: 'tutorial.owner_slide3_title',
    subtitleKey: 'tutorial.owner_slide3_sub',
    gradient: ['#FF6B6B', '#FF8A65'] as const,
    softBg: '#FFF0F0',
    accentColor: '#FF6B6B',
    decorItems: [
      { size: 110, bottom: -10, right: -30, opacity: 0.1 },
      { size: 70, top: 30, left: -10, opacity: 0.12 },
      { size: 45, bottom: 60, left: 50, opacity: 0.15 },
    ],
  },
];

const PROVIDER_SLIDES = [
  {
    id: '1',
    icon: 'notifications-outline' as const,
    titleKey: 'tutorial.provider_slide1_title',
    subtitleKey: 'tutorial.provider_slide1_sub',
    gradient: ['#4A6CF7', '#6C63FF'] as const,
    softBg: '#EEF2FF',
    accentColor: '#4A6CF7',
    decorItems: [
      { size: 120, top: 30, right: -30, opacity: 0.08 },
      { size: 80, bottom: 20, left: -20, opacity: 0.12 },
      { size: 50, top: 80, right: 60, opacity: 0.15 },
    ],
  },
  {
    id: '2',
    icon: 'hand-left-outline' as const,
    titleKey: 'tutorial.provider_slide2_title',
    subtitleKey: 'tutorial.provider_slide2_sub',
    gradient: ['#06D6A0', '#00B4D8'] as const,
    softBg: '#E6FBF3',
    accentColor: '#06D6A0',
    decorItems: [
      { size: 100, top: 20, left: -20, opacity: 0.1 },
      { size: 60, bottom: 30, right: 10, opacity: 0.15 },
      { size: 40, top: 100, left: 60, opacity: 0.12 },
    ],
  },
  {
    id: '3',
    icon: 'wallet-outline' as const,
    titleKey: 'tutorial.provider_slide3_title',
    subtitleKey: 'tutorial.provider_slide3_sub',
    gradient: ['#FF6B6B', '#FF8A65'] as const,
    softBg: '#FFF0F0',
    accentColor: '#FF6B6B',
    decorItems: [
      { size: 110, bottom: -10, right: -30, opacity: 0.1 },
      { size: 70, top: 30, left: -10, opacity: 0.12 },
      { size: 45, bottom: 60, left: 50, opacity: 0.15 },
    ],
  },
];

type SlideConfig = (typeof OWNER_SLIDES)[number] | (typeof PROVIDER_SLIDES)[number];

export default function TutorialScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { role } = useLocalSearchParams<{ role: string }>();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const slides = role === 'provider' ? PROVIDER_SLIDES : OWNER_SLIDES;
  const dashboardRoute = role === 'provider' ? '/(provider)/dashboard' : '/(owner)/dashboard';

  const handleNext = () => {
    if (activeIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      router.replace(dashboardRoute as never);
    }
  };

  const handleSkip = () => {
    router.replace(dashboardRoute as never);
  };

  const handleMomentumScrollEnd = (e: { nativeEvent: { contentOffset: { x: number }; layoutMeasurement: { width: number } } }) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const isLast = activeIndex === slides.length - 1;
  const currentSlide = slides[activeIndex];

  const renderSlide = ({ item }: { item: SlideConfig }) => (
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
      </View>

      {/* Text content */}
      <View style={styles.textArea}>
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
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
        </TouchableOpacity>
      </View>

      {/* Carousel */}
      <FlatList
        ref={flatListRef}
        data={slides}
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
          {slides.map((slide, i) => {
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
            <Text style={styles.nextBtnText}>{isLast ? t('tutorial.cta') : t('auth.btn_next')}</Text>
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
  textArea: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xxl,
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
