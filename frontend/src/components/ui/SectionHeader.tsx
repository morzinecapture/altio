import React, { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING } from '../../theme';

interface SectionHeaderProps {
  title: string;
  /** Compteur ou libellé secondaire affiché sous le titre. */
  subtitle?: string;
  /** Lien d'action à droite (« Tout voir »). */
  actionLabel?: string;
  onAction?: () => void;
  /** Contenu libre à droite, prioritaire sur actionLabel. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  right,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ??
        (actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.action}
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.brandPrimary} />
          </TouchableOpacity>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  textCol: { flex: 1 },
  title: { ...FONTS.h3, color: COLORS.textPrimary },
  subtitle: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '700' },
});

export default SectionHeader;
