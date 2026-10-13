import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import {
  COLORS,
  FONTS,
  SPACING,
  RADIUS,
  STATUS_COLORS,
  STATUS_LABELS,
  EMERGENCY_STATUS_LABELS,
} from '../../theme';

interface StatusBadgeProps {
  status: string;
  /** Utilise EMERGENCY_STATUS_LABELS au lieu de STATUS_LABELS (parcours urgence). */
  emergency?: boolean;
  /** Libellé imposé. À n'utiliser que si le texte ne vient pas des tables du thème. */
  label?: string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  multiline?: boolean;
}

/**
 * Affichage seul : ce composant ne décide jamais d'un statut ni d'une transition.
 * Les couleurs et libellés viennent exclusivement de src/theme.ts.
 */
export function StatusBadge({
  status,
  emergency = false,
  label,
  size = 'md',
  style,
  testID,
  multiline = false,
}: StatusBadgeProps) {
  const palette = STATUS_COLORS[status] ?? { bg: COLORS.subtle, text: COLORS.textSecondary };
  const labels = emergency ? EMERGENCY_STATUS_LABELS : STATUS_LABELS;
  const text = label ?? labels[status] ?? STATUS_LABELS[status] ?? status;

  return (
    <View
      style={[styles.badge, size === 'sm' && styles.badgeSm, { backgroundColor: palette.bg }, style]}
      testID={testID}
    >
      <Text
        style={[styles.text, size === 'sm' && styles.textSm, { color: palette.text }]}
        numberOfLines={multiline ? undefined : 1}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  badgeSm: { paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  text: { ...FONTS.caption, fontSize: 11 },
  textSm: { fontSize: 10 },
});

export default StatusBadge;
