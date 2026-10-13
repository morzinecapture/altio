import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { EmptyState } from '../../src/components/ui';
import { SkeletonList } from '../../src/components/Skeleton';
import OwnerPageHeader from '../../src/components/owner/OwnerPageHeader';
import { useProperties, useDeleteProperty, useSyncIcal, useMissions } from '../../src/hooks';
import type { Property } from '../../src/types/api';

function PropertyThumbnail({ property }: { property: Property }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUri = property.photos?.[0];

  if (!photoUri || photoFailed) {
    return (
      <View style={styles.propIconPlaceholder}>
        <Ionicons name="home-outline" size={27} color="#FFFFFF" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: photoUri }}
      style={styles.propIcon}
      resizeMode="cover"
      onError={() => setPhotoFailed(true)}
    />
  );
}

export default function PropertiesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data: properties = [], isLoading, refetch } = useProperties();
  const { data: missions = [] } = useMissions();
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
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <OwnerPageHeader
              title={t('owner.properties.title')}
              subtitle={t('alpine.propertiesSubtitle')}
              icon="home-outline"
              actionIcon="add"
              onAction={() => router.push('/property/add')}
              testID="add-property-btn"
            />
            <Text style={styles.countLabel}>{properties.length} logement{properties.length !== 1 ? 's' : ''}</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="home-outline"
            title={t('owner.properties.empty')}
            subtitle={t('owner.properties.empty_sub')}
            actionLabel={t('owner.properties.add')}
            onAction={() => router.push('/property/add')}
            testID="owner-properties-empty"
          />
        }
        renderItem={({ item: prop }) => (
          <TouchableOpacity
            testID={`property-card-${prop.id}`}
            style={styles.card}
            onPress={() => router.push(`/property/${prop.id}`)}
          >
            <PropertyThumbnail property={prop} />
            <View style={styles.cardHeader}>
              <View style={styles.cardInfo}>
                <Text style={styles.propName}>{prop.name}</Text>
                <Text style={styles.propAddress}>{prop.address}</Text>
              </View>
              <TouchableOpacity accessibilityLabel={t('common.delete')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }} onPress={() => handleDelete(prop.id, prop.name)}>
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

            {(() => {
              const next = missions.filter(m => m.property_id === prop.id && !m.is_emergency && ['assigned', 'in_progress'].includes(m.status)).sort((a, b) => Date.parse(a.scheduled_date || '') - Date.parse(b.scheduled_date || ''))[0];
              return next ? <TouchableOpacity style={styles.nextMission} onPress={() => router.push(`/mission/${next.mission_id}`)}><Ionicons name="calendar-outline" size={18} color={COLORS.success} /><View style={{ flex: 1 }}><Text style={styles.nextTitle}>{t('alpine.nextMission')}</Text><Text style={styles.metaText}>{next.scheduled_date ? new Date(next.scheduled_date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('alpine.datePending')}</Text></View><Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} /></TouchableOpacity> : null;
            })()}
            {(prop.ical_url || prop.ical_airbnb_url || prop.ical_booking_url) && (
              <TouchableOpacity
                testID={`sync-ical-${prop.id}`}
                style={styles.syncBtn}
                onPress={() => handleSync(prop.id)}
                disabled={syncing === prop.id}
              >
                {syncing === prop.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="sync-outline" size={16} color="#FFFFFF" />
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
  nextMission: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.successSoft, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg },
  nextTitle: { ...FONTS.bodySmall, fontFamily: FONTS.h3.fontFamily, color: COLORS.success },
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  listHeader: { marginBottom: SPACING.lg },
  countLabel: { marginHorizontal: SPACING.xl, marginTop: SPACING.lg, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: COLORS.brandPrimary, textTransform: 'uppercase', letterSpacing: 0.7 },
  card: { backgroundColor: '#FFFFFF', marginHorizontal: SPACING.xl, marginBottom: SPACING.lg, padding: SPACING.lg, borderRadius: RADIUS.xl, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  propIcon: { width: '100%', height: 150, borderRadius: RADIUS.lg, backgroundColor: COLORS.navy, marginBottom: SPACING.lg },
  propIconPlaceholder: { width: '100%', height: 110, borderRadius: RADIUS.lg, backgroundColor: COLORS.navy, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  cardInfo: { flex: 1 },
  propName: { ...FONTS.h2, color: COLORS.textPrimary, fontSize: 18, marginBottom: 2 },
  propAddress: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 4 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xl, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  syncBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, backgroundColor: '#2563EB' },
  syncText: { ...FONTS.bodySmall, color: '#FFFFFF', fontWeight: '700' },
});
