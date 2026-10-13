import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { COLORS, SPACING, RADIUS, SHADOWS, getServiceVisual } from '../../src/theme';
import { SkeletonList } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/ui';
import { getPartners } from '../../src/api';
import type { LocalPartner } from '../../src/types/api';

const CATEGORY_ICONS: Record<string, { icon: string; color: string; bg: string; labelKey: string }> = {
  restaurant: { ...getServiceVisual('restaurant'), labelKey: 'catalogue.category_restaurant' },
  activite:   { ...getServiceVisual('activite'),   labelKey: 'catalogue.category_activite' },
  spa:        { ...getServiceVisual('spa'),        labelKey: 'catalogue.category_spa' },
  transport:  { ...getServiceVisual('transport'),  labelKey: 'catalogue.category_transport' },
  shopping:   { ...getServiceVisual('shopping'),   labelKey: 'catalogue.category_shopping' },
  location:   { ...getServiceVisual('location'),   labelKey: 'catalogue.category_location' },
  autre:      { ...getServiceVisual('autre'),      labelKey: 'catalogue.category_autre' },
};

const ZONE_NAMES = ['Morzine', 'Chamonix', 'Megève', 'Courchevel', 'Val d\'Isère', 'Les Gets'];

export default function CatalogueScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const zone = selectedZone === null ? undefined : selectedZone;
  const cat = selectedCategory || undefined;
  const { data: partners = [] as LocalPartner[], isLoading: loading } = useQuery({
    queryKey: ['partners', zone, cat],
    queryFn: () => getPartners(zone, cat),
  });

  const filtered = search.trim()
    ? partners.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : partners;

  const categories = Object.keys(CATEGORY_ICONS);
  const ALL_ZONES = [t('catalogue.all_zones'), ...ZONE_NAMES];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>{t('catalogue.title')}</Text>
          <Text style={styles.subtitle}>{t('catalogue.subtitle')}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
        {/* Sticky filters */}
        <View style={styles.filtersBlock}>
          {/* Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('catalogue.search_placeholder')}
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Zone pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            <TouchableOpacity
              style={[styles.pill, selectedZone === null && styles.pillActive]}
              onPress={() => setSelectedZone(null)}
            >
              <Text style={[styles.pillText, selectedZone === null && styles.pillTextActive]}>{t('catalogue.all_zones')}</Text>
            </TouchableOpacity>
            {ZONE_NAMES.map(z => (
              <TouchableOpacity
                key={z}
                style={[styles.pill, selectedZone === z && styles.pillActive]}
                onPress={() => setSelectedZone(z)}
              >
                <Text style={[styles.pillText, selectedZone === z && styles.pillTextActive]}>{z}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            <TouchableOpacity
              style={[styles.chip, !selectedCategory && styles.chipActive]}
              onPress={() => setSelectedCategory(null)}
            >
              <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>{t('catalogue.all_categories')}</Text>
            </TouchableOpacity>
            {categories.map(cat => {
              const cfg = CATEGORY_ICONS[cat];
              const active = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                  onPress={() => setSelectedCategory(active ? null : cat)}
                >
                  <Ionicons name={cfg.icon as keyof typeof Ionicons.glyphMap} size={13} color={active ? '#FFF' : cfg.color} />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(cfg.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {loading ? (
            <SkeletonList count={4} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="storefront-outline"
              title={t('catalogue.empty_title')}
              subtitle={t('catalogue.empty_text')}
              testID="catalogue-empty"
            />
          ) : (
            filtered.map(partner => {
              const cfg = CATEGORY_ICONS[partner.category] || CATEGORY_ICONS.autre;
              return (
                <TouchableOpacity
                  key={partner.id}
                  style={styles.card}
                  onPress={() => router.push(`/(owner)/partner/${partner.id}`)}
                  activeOpacity={0.8}
                >
                  {/* Logo */}
                  <View style={[styles.logoBox, { backgroundColor: cfg.bg }]}>
                    {partner.logo_url ? (
                      <Image source={{ uri: partner.logo_url }} style={styles.logo} resizeMode="contain" />
                    ) : (
                      <Ionicons name={cfg.icon as keyof typeof Ionicons.glyphMap} size={28} color={cfg.color} />
                    )}
                  </View>

                  {/* Info */}
                  <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardName} numberOfLines={1}>{partner.name}</Text>
                      <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.badgeText, { color: cfg.color }]}>{t(cfg.labelKey)}</Text>
                      </View>
                    </View>

                    {partner.description ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>{partner.description}</Text>
                    ) : null}

                    <View style={styles.cardMeta}>
                      <View style={styles.metaItem}>
                        <Ionicons name="location-outline" size={12} color="#94A3B8" />
                        <Text style={styles.metaText}>{partner.zone}</Text>
                      </View>
                      {partner.brochure_url && (
                        <View style={styles.metaItem}>
                          <Ionicons name="document-text-outline" size={12} color="#3B82F6" />
                          <Text style={[styles.metaText, { color: '#3B82F6' }]}>{t('catalogue.brochure')}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: COLORS.textPrimary },
  subtitle: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B', marginTop: 2 },

  filtersBlock: { backgroundColor: COLORS.background, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.lg, marginTop: SPACING.sm,
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: COLORS.textPrimary },

  pills: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  pillActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  pillText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#64748B' },
  pillTextActive: { color: '#FFFFFF' },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  chipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  chipText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#64748B' },
  chipTextActive: { color: '#FFFFFF' },

  content: { padding: SPACING.lg, gap: SPACING.md },


  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg,
    padding: SPACING.md, gap: SPACING.md,
    ...SHADOWS.card,
  },
  logoBox: {
    width: 60, height: 60, borderRadius: RADIUS.md,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  logo: { width: 56, height: 56 },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cardName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.textPrimary, flex: 1 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10 },
  cardDesc: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#64748B', lineHeight: 17 },
  cardMeta: { flexDirection: 'row', gap: SPACING.md, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: '#94A3B8' },
});
