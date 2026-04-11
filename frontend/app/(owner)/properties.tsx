import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../../src/theme';
import { SkeletonList } from '../../src/components/Skeleton';
import { useProperties, useDeleteProperty, useSyncIcal } from '../../src/hooks';
import type { Property } from '../../src/types/api';

export default function PropertiesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data: properties = [], isLoading, refetch } = useProperties();
  const [syncing, setSyncing] = useState<string | null>(null);
  const deleteMut = useDeleteProperty();
  const syncMut = useSyncIcal();

  const handleSync = async (propertyId: string) => {
    setSyncing(propertyId);
    try {
      const result = await syncMut.mutateAsync(propertyId);
      Alert.alert(t('owner.properties.sync_done'), result.message);
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally { setSyncing(null); }
  };

  const handleDelete = (propertyId: string, name: string) => {
    Alert.alert(t('common.delete'), t('owner.properties.delete_confirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          try { await deleteMut.mutateAsync(propertyId); } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
        }
      },
    ]);
  };

  if (isLoading) return <SafeAreaView style={styles.container}><SkeletonList count={3} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} testID="properties-screen">
      <FlatList
        data={properties}
        keyExtractor={(prop) => prop.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <LinearGradient
            colors={GRADIENT.header}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Text style={styles.title}>{t('owner.properties.title')}</Text>
            <TouchableOpacity testID="add-property-btn" style={styles.addBtn} onPress={() => router.push('/property/add')}>
              <Ionicons name="add" size={24} color={COLORS.textInverse} />
            </TouchableOpacity>
          </LinearGradient>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="home-outline" size={60} color={COLORS.textTertiary} />
            <Text style={styles.emptyTitle}>{t('owner.properties.empty')}</Text>
            <Text style={styles.emptySubtext}>{t('owner.properties.empty_sub')}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/property/add')}>
              <Text style={styles.emptyBtnText}>{t('owner.properties.add')}</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: prop }) => (
          <TouchableOpacity
            testID={`property-card-${prop.id}`}
            style={styles.card}
            onPress={() => router.push(`/property/${prop.id}`)}
          >
            <View style={styles.cardHeader}>
              <Image
                source={{ uri: `https://ui-avatars.com/api/?name=${prop.name.replace(/\s/g, '+')}&background=random&color=fff&size=200&font-size=0.4` }}
                style={styles.propIcon}
              />
              <View style={styles.cardInfo}>
                <Text style={styles.propName}>{prop.name}</Text>
                <Text style={styles.propAddress}>{prop.address}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(prop.id, prop.name)}>
                <Ionicons name="trash-outline" size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.cardMeta}>
              {prop.fixed_rate && (
                <View style={styles.metaItem}>
                  <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                  <Text style={styles.metaText}>{t('owner.properties.rate_per_mission', { rate: prop.fixed_rate })}</Text>
                </View>
              )}
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.info} />
                <Text style={styles.metaText}>{t('owner.properties.reservations_count', { count: (prop as Property & { reservation_count?: number }).reservation_count || 0 })}</Text>
              </View>
            </View>

            {prop.ical_url && (
              <TouchableOpacity
                testID={`sync-ical-${prop.id}`}
                style={styles.syncBtn}
                onPress={() => handleSync(prop.id)}
                disabled={syncing === prop.id}
              >
                {syncing === prop.id ? (
                  <ActivityIndicator size="small" color={COLORS.info} />
                ) : (
                  <Ionicons name="sync-outline" size={16} color={COLORS.info} />
                )}
                <Text style={styles.syncText}>{t('owner.properties.sync_ical')}</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card
  },
  title: { ...FONTS.h1, color: COLORS.textPrimary },
  addBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center', ...SHADOWS.float },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl * 2, paddingHorizontal: SPACING.xxl },
  emptyTitle: { ...FONTS.h2, color: COLORS.textSecondary, marginTop: SPACING.lg },
  emptySubtext: { ...FONTS.body, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
  emptyBtn: { marginTop: SPACING.xl, backgroundColor: COLORS.brandPrimary, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.lg, borderRadius: RADIUS.xl, ...SHADOWS.cardHover },
  emptyBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  card: { backgroundColor: COLORS.paper, marginHorizontal: SPACING.xl, marginBottom: SPACING.lg, padding: SPACING.xl, borderRadius: RADIUS.xl, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  propIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.brandPrimary + '15', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md, borderWidth: 1, borderColor: COLORS.brandPrimary + '30' },
  cardInfo: { flex: 1 },
  propName: { ...FONTS.h2, color: COLORS.textPrimary, fontSize: 18, marginBottom: 2 },
  propAddress: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 4 },
  cardMeta: { flexDirection: 'row', gap: SPACING.xl, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  syncText: { ...FONTS.bodySmall, color: COLORS.info, fontWeight: '600' },
});
