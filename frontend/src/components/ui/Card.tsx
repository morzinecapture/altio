import React, { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View, StyleProp, ViewStyle } from 'react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../theme';

export type CardVariant = 'default' | 'flat' | 'elevated' | 'urgent';

interface CardProps {
  children: ReactNode;
  /** Rend la card tactile. Sans onPress, la card est un simple conteneur. */
  onPress?: () => void;
  variant?: CardVariant;
  /** Padding interne. 'none' pour gérer soi-même (image pleine largeur, listes internes). */
  padding?: keyof typeof SPACING | 'none';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Card({
  children,
  onPress,
  variant = 'default',
  padding = 'lg',
  style,
  testID,
  accessibilityLabel,
}: CardProps) {
  const variantStyle: ViewStyle[] = [styles.base];

  switch (variant) {
    case 'default':
      variantStyle.push(styles.bordered, SHADOWS.card);
      break;
    case 'flat':
      variantStyle.push(styles.bordered);
      break;
    case 'elevated':
      variantStyle.push(SHADOWS.float);
      break;
    case 'urgent':
      variantStyle.push({ borderWidth: 1, borderColor: COLORS.urgency }, SHADOWS.urgency);
      break;
  }

  const composed = [
    ...variantStyle,
    padding !== 'none' && { padding: SPACING[padding] },
    style,
  ];

  if (!onPress) {
    return (
      <View style={composed} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={composed}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.xl,
  },
  bordered: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});

export default Card;
