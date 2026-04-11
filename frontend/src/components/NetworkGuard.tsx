import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { COLORS, SPACING } from '../theme';

/**
 * NetworkGuard wraps app content and shows an offline banner.
 *
 * - When offline: a subtle amber banner at the top lets the user know
 *   they're viewing cached data. The app remains fully usable.
 * - The banner is dismissible; it reappears when connectivity changes.
 */
export default function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isOnline } = useNetworkStatus();
  const [dismissed, setDismissed] = React.useState(false);

  // Reset dismissed state when connectivity changes
  React.useEffect(() => {
    if (isOnline) {
      setDismissed(false);
    }
  }, [isOnline]);

  // When going offline again, un-dismiss so the banner re-shows
  React.useEffect(() => {
    if (!isOnline) {
      setDismissed(false);
    }
  }, [isOnline]);

  return (
    <View style={styles.container}>
      {!isOnline && !dismissed && (
        <View style={styles.banner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#92400E" />
          <Text style={styles.text}>
            Mode hors-ligne {'\u2014'} les donn{'\u00E9'}es affich{'\u00E9'}es peuvent ne pas {'\u00EA'}tre {'\u00E0'} jour
          </Text>
          <TouchableOpacity
            onPress={() => setDismissed(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color="#92400E" />
          </TouchableOpacity>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warning,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  text: {
    color: '#92400E', // amber-800
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
});
