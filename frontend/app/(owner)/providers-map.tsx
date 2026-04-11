import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getProviders } from '../../src/api';
import type { ProviderProfile } from '../../src/types/api';

const SPECIALTY_CONFIG: Record<string, { color: string; bg: string; icon: string; labelKey: string }> = {
  plumbing:   { color: '#3B82F6', bg: '#EFF6FF', icon: 'water-outline',    labelKey: 'providers_map.specialty_plumbing'   },
  electrical: { color: '#EAB308', bg: '#FEF9C3', icon: 'flash-outline',    labelKey: 'providers_map.specialty_electrical' },
  cleaning:   { color: '#10B981', bg: '#D1FAE5', icon: 'sparkles-outline', labelKey: 'providers_map.specialty_cleaning'   },
  repair:     { color: '#F97316', bg: '#FFEDD5', icon: 'hammer-outline',   labelKey: 'providers_map.specialty_repair'     },
  locksmith:  { color: '#8B5CF6', bg: '#EDE9FE', icon: 'key-outline',      labelKey: 'providers_map.specialty_locksmith'  },
  jacuzzi:    { color: '#06B6D4', bg: '#CFFAFE', icon: 'sunny-outline',    labelKey: 'providers_map.specialty_jacuzzi'    },
  linen:      { color: '#EC4899', bg: '#FCE7F3', icon: 'shirt-outline',    labelKey: 'providers_map.specialty_linen'      },
};

const FALLBACK_COORDS = [
  { latitude: 46.0037, longitude: 6.7952 },  // Morzine
  { latitude: 45.9237, longitude: 6.8694 },  // Chamonix
  { latitude: 45.8326, longitude: 6.8652 },  // Argentière
  { latitude: 46.0769, longitude: 7.0854 },  // Verbier area
  { latitude: 45.6979, longitude: 6.7682 },  // Megève
];

const DEFAULT_REGION = {
  latitude: 45.92,
  longitude: 6.87,
  latitudeDelta: 1.0,
  longitudeDelta: 1.0,
};

export default function ProvidersMap() {
  const router = useRouter();
  const { t } = useTranslation();
  const { specialty: initialSpecialty } = useLocalSearchParams<{ specialty?: string }>();

  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(initialSpecialty ?? null);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    getProviders()
      .then((data) => setProviders(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []));

  const enriched = providers.map((p, i) => {
    if (p.latitude && p.longitude) return p;
    const fb = FALLBACK_COORDS[i % FALLBACK_COORDS.length];
    return { ...p, latitude: fb.latitude, longitude: fb.longitude };
  });

  const filtered = selectedSpecialty
    ? enriched.filter((p) => (p.specialties || []).includes(selectedSpecialty))
    : enriched;

  const allSpecialties = Array.from(
    new Set(providers.flatMap((p) => p.specialties || []))
  ).filter((s) => SPECIALTY_CONFIG[s]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ─── Carte plein écran ─── */}
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={DEFAULT_REGION}
      >
        {filtered.map((provider) => {
          const mainSpecialty = (provider.specialties || [])[0];
          const cfg = SPECIALTY_CONFIG[mainSpecialty] || { color: '#64748B', bg: '#F1F5F9', icon: 'person-outline', labelKey: 'providers_map.general_label' };
          const avatarUrl = provider.user?.picture
            || `https://ui-avatars.com/api/?name=${encodeURIComponent(provider.user?.name || 'P')}&background=1E3A5F&color=fff&size=100`;

          return (
            <Marker
              key={provider.provider_id}
              coordinate={{ latitude: provider.latitude ?? 0, longitude: provider.longitude ?? 0 }}
            >
              {/* ── Pin coloré ── */}
              <View style={styles.pinOuter} pointerEvents="none">
                <View style={[styles.pinCircle, { backgroundColor: cfg.color }]}>
                  <Ionicons name={cfg.icon as keyof typeof Ionicons.glyphMap} size={16} color="#FFF" />
                </View>
                <View style={[styles.pinArrow, { borderTopColor: cfg.color }]} />
              </View>

              {/* ── Callout (fenêtre au-dessus du pin) ── */}
              <Callout
                tooltip
                onPress={() => router.push(`/(owner)/provider/${provider.provider_id}`)}
              >
                <View style={styles.callout}>
                  {/* Flèche en bas de la card */}
                  <Image source={{ uri: avatarUrl }} style={styles.calloutAvatar} />

                  <View style={styles.calloutBody}>
                    <Text style={styles.calloutName} numberOfLines={1}>
                      {provider.user?.name || t('providers_map.provider_fallback')}
                    </Text>

                    {/* Rating */}
                    <View style={styles.calloutRating}>
                      {[1,2,3,4,5].map(i => (
                        <Ionicons key={i} name="star" size={11} color="#FBBF24" />
                      ))}
                      <Text style={styles.calloutRatingText}>4.9</Text>
                    </View>

                    {/* Spécialité principale */}
                    <View style={[styles.calloutBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.calloutBadgeText, { color: cfg.color }]}>{t(cfg.labelKey)}</Text>
                    </View>

                    {/* Zone */}
                    {(provider as ProviderProfile & { location_label?: string }).location_label ? (
                      <View style={styles.calloutLocation}>
                        <Ionicons name="location-outline" size={11} color="#94A3B8" />
                        <Text style={styles.calloutLocationText} numberOfLines={1}>
                          {(provider as ProviderProfile & { location_label?: string }).location_label}
                          {provider.radius_km ? ` · ${provider.radius_km} km` : ''}
                        </Text>
                      </View>
                    ) : null}

                    <Text style={styles.calloutCta}>{t('provider_detail.view_profile')}</Text>
                  </View>
                </View>
                {/* Triangle pointer */}
                <View style={styles.calloutArrow} />
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* ─── Header + chips (ne bloque pas la carte) ─── */}
      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">

        {/* Titre */}
        <View style={styles.headerCard} pointerEvents="auto">
          <Text style={styles.headerTitle}>{t('providers_map.title')}</Text>
          <Text style={styles.headerSub}>{t('providers_map.count_in_zone', { count: filtered.length })}</Text>
        </View>

        {/* Filtres spécialités */}
        {allSpecialties.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            pointerEvents="auto"
          >
            <TouchableOpacity
              style={[styles.chip, !selectedSpecialty && styles.chipActive]}
              onPress={() => setSelectedSpecialty(null)}
            >
              <Text style={[styles.chipText, !selectedSpecialty && styles.chipTextActive]}>{t('providers_map.all_filter')}</Text>
            </TouchableOpacity>

            {allSpecialties.map((s) => {
              const c = SPECIALTY_CONFIG[s];
              const active = selectedSpecialty === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, active && { backgroundColor: c.color, borderColor: c.color }]}
                  onPress={() => setSelectedSpecialty(active ? null : s)}
                >
                  <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={13} color={active ? '#FFF' : c.color} />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(c.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  /* Overlay header */
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerCard: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.sm,
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    alignItems: 'center', ...SHADOWS.cardHover,
  },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#1E3A5F' },
  headerSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B' },

  /* Chips */
  chips: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FFFFFF', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: '#E2E8F0', ...SHADOWS.card,
  },
  chipActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#64748B' },
  chipTextActive: { color: '#FFFFFF' },

  /* Pin sur la carte */
  pinOuter: { alignItems: 'center' },
  pinCircle: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 3, borderColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  pinArrow: {
    width: 0, height: 0, marginTop: -1,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  /* Callout card */
  callout: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: SPACING.md,
    width: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    gap: SPACING.md,
  },
  calloutArrow: {
    width: 0, height: 0,
    alignSelf: 'center',
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
    marginTop: -1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  calloutAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#F1F5F9',
  },
  calloutBody: { flex: 1, justifyContent: 'center', gap: 3 },
  calloutName: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#1E3A5F' },
  calloutRating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  calloutRatingText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#1E3A5F', marginLeft: 3 },
  calloutBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  calloutBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  calloutLocation: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  calloutLocationText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#94A3B8', flex: 1 },
  calloutCta: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#3B82F6', marginTop: 2 },
});
