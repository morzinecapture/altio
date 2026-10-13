import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';
import { Button } from './Button';

interface EmptyStateProps {
  /** Icône Ionicons. Rendue dans un halo circulaire pour éviter l'effet « icône perdue ». */
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Libellé du CTA. Sans onAction, aucun bouton n'est rendu. */
  actionLabel?: string;
  onAction?: () => void;
  /** Version resserrée pour un état vide dans une section, pas en plein écran. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  compact = false,
  style,
  testID,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact, style]} testID={testID}>
      <View style={[styles.halo, compact && styles.haloCompact]}>
        <Ionicons
          name={icon}
          size={compact ? 26 : 38}
          color={COLORS.brandSecondary}
        />
      </View>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          size={compact ? 'sm' : 'md'}
          fullWidth={false}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl * 2,
    paddingHorizontal: SPACING.xxl,
  },
  compact: { paddingVertical: SPACING.xxl },
  halo: {
    width: 88,
    height: 88,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  haloCompact: { width: 60, height: 60, marginBottom: SPACING.md },
  title: {
    ...FONTS.h3,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  titleCompact: { ...FONTS.body, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    maxWidth: 300,
  },
  action: { marginTop: SPACING.xl },
});

export default EmptyState;
