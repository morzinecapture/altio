import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  /** Occupe toute la largeur disponible. Défaut : true (cas majoritaire des CTA d'écran). */
  fullWidth?: boolean;
  /** Rend le fond en dégradé de marque plutôt qu'en aplat. Réservé aux CTA principaux. */
  gradient?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

// Hauteurs : sm reste sous 48px, compensé par un hitSlop pour garder la zone tactile conforme.
const SIZES: Record<ButtonSize, { height: number; font: number; icon: number; padding: number }> = {
  sm: { height: 40, font: 13, icon: 16, padding: SPACING.lg },
  md: { height: 48, font: 15, icon: 18, padding: SPACING.xl },
  lg: { height: 56, font: 17, icon: 20, padding: SPACING.xxl },
};

const HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

function useVariantStyle(variant: ButtonVariant, disabled: boolean) {
  const container: ViewStyle[] = [styles.base];
  let content = COLORS.textInverse;

  switch (variant) {
    case 'primary':
      container.push({ backgroundColor: COLORS.brandPrimary }, SHADOWS.card);
      break;
    case 'success':
      container.push({ backgroundColor: COLORS.success }, SHADOWS.success);
      break;
    case 'danger':
      container.push({ backgroundColor: COLORS.urgency }, SHADOWS.urgency);
      break;
    case 'secondary':
      container.push({ backgroundColor: COLORS.subtle });
      content = COLORS.textPrimary;
      break;
    case 'outline':
      container.push({
        backgroundColor: COLORS.paper,
        borderWidth: 1,
        borderColor: COLORS.border,
      });
      content = COLORS.brandPrimary;
      break;
    case 'ghost':
      container.push({ backgroundColor: 'transparent' });
      content = COLORS.brandPrimary;
      break;
  }

  if (disabled) {
    container.push(styles.disabled);
  }

  return { container, content };
}

const GRADIENT_BY_VARIANT: Partial<Record<ButtonVariant, readonly [string, string]>> = {
  primary: GRADIENT.brandButton,
  danger: GRADIENT.urgencyButton,
  success: GRADIENT.successButton,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = true,
  gradient = false,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const isBlocked = disabled || loading;
  const dims = SIZES[size];
  const { container, content } = useVariantStyle(variant, isBlocked);
  const gradientColors = gradient ? GRADIENT_BY_VARIANT[variant] : undefined;

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={content} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={dims.icon} color={content} />
          )}
          <Text style={[styles.label, { color: content, fontSize: dims.font }]} numberOfLines={1}>
            {label}
          </Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={dims.icon} color={content} />
          )}
        </>
      )}
    </>
  );

  const shape: ViewStyle = {
    height: dims.height,
    paddingHorizontal: dims.padding,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isBlocked}
      activeOpacity={0.85}
      hitSlop={size === 'sm' ? HIT_SLOP : undefined}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        gradientColors ? [styles.base, shape, isBlocked && styles.disabled] : [...container, shape],
        style,
      ]}
    >
      {gradientColors ? (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientFill}
        >
          <View style={styles.gradientRow}>{inner}</View>
        </LinearGradient>
      ) : (
        inner
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  label: { ...FONTS.h3, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
});

export default Button;
