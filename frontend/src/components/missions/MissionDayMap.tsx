import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { COLORS, RADIUS, FONTS, SPACING } from '../../theme';
import type { DayMission } from '../../types/api';

interface MissionDayMapProps {
  confirmedMissions: DayMission[];
  newMission: DayMission;
  height?: number;
}

export default function MissionDayMap({ confirmedMissions, newMission, height = 200 }: MissionDayMapProps) {
  const mapRef = useRef<MapView>(null);

  const confirmedWithCoords = confirmedMissions.filter(
    (m) => m.property?.latitude != null && m.property?.longitude != null,
  );
  const newHasCoords = newMission.property?.latitude != null && newMission.property?.longitude != null;

  const allMarkerIds: string[] = [
    ...confirmedWithCoords.map((m) => m.id),
    ...(newHasCoords ? [newMission.id] : []),
  ];

  if (allMarkerIds.length === 0) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>Adresses non géolocalisées</Text>
      </View>
    );
  }

  const onlyNew = confirmedWithCoords.length === 0 && newHasCoords;

  const formatTime = (d: string) => {
    try {
      return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, { height }]}
      initialRegion={
        onlyNew
          ? {
              latitude: newMission.property!.latitude!,
              longitude: newMission.property!.longitude!,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }
          : undefined
      }
      onLayout={() => {
        if (!onlyNew && allMarkerIds.length > 0) {
          setTimeout(() => {
            mapRef.current?.fitToSuppliedMarkers(allMarkerIds, {
              edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
              animated: false,
            });
          }, 100);
        }
      }}
    >
      {confirmedWithCoords.map((m) => (
        <Marker
          key={m.id}
          identifier={m.id}
          coordinate={{
            latitude: m.property!.latitude!,
            longitude: m.property!.longitude!,
          }}
          pinColor={COLORS.success}
        >
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{m.property?.name}</Text>
              <Text style={styles.calloutSub}>{formatTime(m.scheduled_date)}</Text>
            </View>
          </Callout>
        </Marker>
      ))}

      {newHasCoords && (
        <Marker
          key={newMission.id}
          identifier={newMission.id}
          coordinate={{
            latitude: newMission.property!.latitude!,
            longitude: newMission.property!.longitude!,
          }}
          pinColor={COLORS.warning}
        >
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{newMission.property?.name}</Text>
              <Text style={styles.calloutSub}>Nouvelle mission</Text>
            </View>
          </Callout>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  fallback: {
    width: '100%',
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    ...FONTS.bodySmall,
    color: COLORS.textTertiary,
  },
  callout: {
    padding: SPACING.sm,
    minWidth: 120,
  },
  calloutTitle: {
    ...FONTS.bodySmall,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  calloutSub: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
