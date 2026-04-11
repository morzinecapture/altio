import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme';

// --- SkeletonBox ---

interface SkeletonBoxProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({ width, height, borderRadius = RADIUS.sm, style }: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: '#E2E8F0',
          opacity,
        },
        style,
      ]}
    />
  );
}

// --- SkeletonCard ---

export function SkeletonCard() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.cardTop}>
        <SkeletonBox width={100} height={22} borderRadius={RADIUS.full} />
        <SkeletonBox width={80} height={14} borderRadius={4} />
      </View>
      <SkeletonBox width="70%" height={18} borderRadius={4} style={{ marginTop: SPACING.sm }} />
      <SkeletonBox width="90%" height={14} borderRadius={4} style={{ marginTop: SPACING.sm }} />
      <View style={skeletonStyles.cardMeta}>
        <SkeletonBox width={100} height={14} borderRadius={4} />
        <SkeletonBox width={60} height={14} borderRadius={4} />
        <SkeletonBox width={30} height={14} borderRadius={4} />
      </View>
    </View>
  );
}

// --- SkeletonList ---

interface SkeletonListProps {
  count?: number;
}

export function SkeletonList({ count = 3 }: SkeletonListProps) {
  return (
    <View style={skeletonStyles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

// --- SkeletonDashboard ---

export function SkeletonDashboard() {
  return (
    <View style={skeletonStyles.dashboardContainer}>
      {/* Header area */}
      <View style={skeletonStyles.dashboardHeader}>
        <View>
          <SkeletonBox width={140} height={14} borderRadius={4} />
          <SkeletonBox width={200} height={24} borderRadius={4} style={{ marginTop: SPACING.sm }} />
        </View>
        <SkeletonBox width={44} height={44} borderRadius={22} />
      </View>

      {/* Stats row */}
      <View style={skeletonStyles.statsRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={skeletonStyles.statBox}>
            <SkeletonBox width={32} height={32} borderRadius={16} />
            <SkeletonBox width={28} height={20} borderRadius={4} style={{ marginTop: SPACING.sm }} />
            <SkeletonBox width={50} height={12} borderRadius={4} style={{ marginTop: SPACING.xs }} />
          </View>
        ))}
      </View>

      {/* Section title */}
      <SkeletonBox
        width={160}
        height={18}
        borderRadius={4}
        style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.xl, marginBottom: SPACING.md }}
      />

      {/* Card placeholders */}
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

// --- SkeletonProfile ---

export function SkeletonProfile() {
  return (
    <View style={skeletonStyles.profileContainer}>
      {/* Avatar */}
      <View style={skeletonStyles.profileHeader}>
        <SkeletonBox width={80} height={80} borderRadius={40} />
        <SkeletonBox width={180} height={22} borderRadius={4} style={{ marginTop: SPACING.lg }} />
        <SkeletonBox width={140} height={14} borderRadius={4} style={{ marginTop: SPACING.sm }} />
      </View>

      {/* Info rows */}
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={skeletonStyles.profileRow}>
          <SkeletonBox width={24} height={24} borderRadius={12} />
          <SkeletonBox width="70%" height={16} borderRadius={4} style={{ marginLeft: SPACING.md }} />
        </View>
      ))}
    </View>
  );
}

// --- Styles ---

const skeletonStyles = StyleSheet.create({
  listContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.paper,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dashboardContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xl,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  profileContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: SPACING.xxl,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.lg,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
