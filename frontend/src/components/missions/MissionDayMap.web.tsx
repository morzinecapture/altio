import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS, FONTS } from '../../theme';
import type { DayMission } from '../../types/api';

interface MissionDayMapProps {
  confirmedMissions: DayMission[];
  newMission: DayMission;
  height?: number;
}

export default function MissionDayMap({ height = 200 }: MissionDayMapProps) {
  return (
    <View style={[styles.container, { height }]}>
      <Text style={styles.text}>Carte disponible uniquement sur mobile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    ...FONTS.bodySmall,
    color: COLORS.textTertiary,
  },
});
