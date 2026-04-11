import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../../src/theme';
import { supabase } from '../../../src/lib/supabase';

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; bg: string; labelKey: string }> = {
  restaurant:   { icon: 'restaurant-outline',  color: '#F97316', bg: '#FFEDD5', labelKey: 'catalogue.category_restaurant' },
  activite:     { icon: 'bicycle-outline',      color: '#10B981', bg: '#D1FAE5', labelKey: 'catalogue.category_activite' },
  spa:          { icon: 'sparkles-outline',     color: '#8B5CF6', bg: '#EDE9FE', labelKey: 'catalogue.category_spa' },
  transport:    { icon: 'car-outline',          color: '#3B82F6', bg: '#EFF6FF', labelKey: 'catalogue.category_transport' },
  shopping:     { icon: 'bag-outline',          color: '#EC4899', bg: '#FCE7F3', labelKey: 'catalogue.category_shopping' },
  location:     { icon: 'key-outline',          color: '#EAB308', bg: '#FEF9C3', labelKey: 'catalogue.category_location' },
  autre:        { icon: 'ellipsis-horizontal-outline', color: '#64748B', bg: '#F1F5F9', labelKey: 'catalogue.category_autre' },
};

export default function PartnerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [partner, setPartner] = useState<{ id: string; name: string; category: string; zone: string; description?: string; logo_url?: string; brochure_url?: string; phone?: string; website?: string; address?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    supabase
      .from('local_partners')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (!error) setPartner(data);
        setLoading(false);
      }, () => setLoading(false));
  }, [id]);

  const handleDownloadBrochure = async () => {
    if (!partner?.brochure_url) return;
    setDownloading(true);
    try {
      await Linking.openURL(partner.brochure_url);
    } catch {
      Alert.alert(t('partner_detail.error'), t('partner_detail.error_brochure'));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  if (!partner) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1E3A5F" />
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('partner_detail.not_found')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cfg = CATEGORY_CONFIG[partner.category] || CATEGORY_CONFIG.autre;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#1E3A5F" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: cfg.bg }]}>
          {partner.logo_url ? (
            <Image source={{ uri: partner.logo_url }} style={styles.heroLogo} resizeMode="contain" />
          ) : (
            <View style={[styles.heroIconBox, { backgroundColor: cfg.color + '22' }]}>
              <Ionicons name={cfg.icon as keyof typeof Ionicons.glyphMap} size={56} color={cfg.color} />
            </View>
          )}
        </View>

        <View style={styles.body}>
          {/* Name + badge */}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{partner.name}</Text>
            <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon as keyof typeof Ionicons.glyphMap} size={12} color={cfg.color} />
              <Text style={[styles.badgeText, { color: cfg.color }]}>{t(cfg.labelKey)}</Text>
            </View>
          </View>

          {/* Zone */}
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={15} color="#94A3B8" />
            <Text style={styles.metaText}>{partner.zone}</Text>
          </View>

          {/* Description */}
          {partner.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('partner_detail.about')}</Text>
              <Text style={styles.description}>{partner.description}</Text>
            </View>
          ) : null}

          {/* Contact info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('partner_detail.contact')}</Text>
            <View style={styles.infoCards}>
              {partner.phone ? (
                <TouchableOpacity
                  style={styles.infoCard}
                  onPress={() => Linking.openURL(`tel:${partner.phone}`)}
                >
                  <View style={[styles.infoIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="call-outline" size={20} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{t('partner_detail.phone')}</Text>
                    <Text style={styles.infoValue}>{partner.phone}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              ) : null}

              {partner.website ? (
                <TouchableOpacity
                  style={styles.infoCard}
                  onPress={() => Linking.openURL(partner.website || '')}
                >
                  <View style={[styles.infoIcon, { backgroundColor: '#D1FAE5' }]}>
                    <Ionicons name="globe-outline" size={20} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{t('partner_detail.website')}</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>{partner.website}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              ) : null}

              {partner.address ? (
                <View style={styles.infoCard}>
                  <View style={[styles.infoIcon, { backgroundColor: '#FFEDD5' }]}>
                    <Ionicons name="map-outline" size={20} color="#F97316" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{t('partner_detail.address')}</Text>
                    <Text style={styles.infoValue}>{partner.address}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Download brochure CTA */}
      {partner.brochure_url ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleDownloadBrochure}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="document-text-outline" size={20} color="#FFF" />
            )}
            <Text style={styles.downloadBtnText}>
              {downloading ? t('partner_detail.downloading') : t('partner_detail.download_brochure')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#94A3B8' },

  backBtn: {
    position: 'absolute', top: 52, left: SPACING.lg,
    zIndex: 10, backgroundColor: '#FFFFFF', borderRadius: 20,
    width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.card,
  },

  hero: {
    height: 200, justifyContent: 'center', alignItems: 'center',
  },
  heroLogo: { width: 160, height: 120 },
  heroIconBox: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center',
  },

  body: { padding: SPACING.lg, gap: SPACING.lg },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
  name: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#1E3A5F', flex: 1 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
  },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -SPACING.sm },
  metaText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#94A3B8' },

  section: { gap: SPACING.sm },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#334155', lineHeight: 23 },

  infoCards: { gap: SPACING.sm },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg,
    padding: SPACING.md, ...SHADOWS.card,
  },
  infoIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  infoLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#94A3B8' },
  infoValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1E3A5F' },

  footer: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: '#1E3A5F', borderRadius: RADIUS.lg, padding: SPACING.md,
  },
  downloadBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFFFFF' },
});
