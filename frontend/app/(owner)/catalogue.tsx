import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getPartners } from '../../src/api';
import type { LocalPartner } from '../../src/types/api';

const CATEGORY_ICONS: Record<string, { icon: string; color: string; bg: string; labelKey: string }> = {
  restaurant:   { icon: 'restaurant-outline',  color: '#F97316', bg: '#FFEDD5', labelKey: 'catalogue.category_restaurant' },
  activite:     { icon: 'bicycle-outline',      color: '#10B981', bg: '#D1FAE5', labelKey: 'catalogue.category_activite' },
  spa:          { icon: 'sparkles-outline',     color: '#8B5CF6', bg: '#EDE9FE', labelKey: 'catalogue.category_spa' },
  transport:    { icon: 'car-outline',          color: '#3B82F6', bg: '#EFF6FF', labelKey: 'catalogue.category_transport' },
  shopping:     { icon: 'bag-outline',          color: '#EC4899', bg: '#FCE7F3', labelKey: 'catalogue.category_shopping' },
  location:     { icon: 'key-outline',          color: '#EAB308', bg: '#FEF9C3', labelKey: 'catalogue.category_location' },
  autre:        { icon: 'ellipsis-horizontal-outline', color: '#64748B', bg: '#F1F5F9', labelKey: 'catalogue.category_autre' },
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
          <Ionicons name="arrow-back" size={22} color="#1E3A5F" />
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
            <ActivityIndicator size="large" color={COLORS.brandPrimary} style={{ marginTop: 40 }} />
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="storefront-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>{t('catalogue.empty_title')}</Text>
              <Text style={styles.emptyText}>{t('catalogue.empty_text')}</Text>
            </View>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: '#F8FAFC',
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
  title: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1E3A5F' },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#64748B', marginTop: 2 },

  filtersBlock: { backgroundColor: '#F8FAFC', paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.lg, marginTop: SPACING.sm,
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#1E3A5F' },

  pills: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  pillActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  pillText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B' },
  pillTextActive: { color: '#FFFFFF' },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  chipActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B' },
  chipTextActive: { color: '#FFFFFF' },

  content: { padding: SPACING.lg, gap: SPACING.md },

  empty: { alignItems: 'center', paddingVertical: 60, gap: SPACING.sm },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#94A3B8' },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#CBD5E1', textAlign: 'center' },

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
  cardName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1E3A5F', flex: 1 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  cardDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', lineHeight: 17 },
  cardMeta: { flexDirection: 'row', gap: SPACING.md, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#94A3B8' },
});
