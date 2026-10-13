import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { SkeletonList } from '../../src/components/Skeleton';
import { EmptyState } from '../../src/components/ui';
import { getFavoriteProviders, removeFavoriteProvider } from '../../src/api';
import type { FavoriteProvider } from '../../src/types/api';

export default function FavoritesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);

  const { data: favorites = [] as FavoriteProvider[], isLoading: loading } = useQuery({
    queryKey: ['favorite-providers'],
    queryFn: getFavoriteProviders,
  });

  const removeMutation = useMutation({
    mutationFn: removeFavoriteProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorite-providers'] });
    },
  });

  const handleRemove = (providerId: string, name: string) => {
    Alert.alert(
      t('owner.favorites.remove_title'),
      t('owner.favorites.remove_msg', { name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('owner.favorites.remove_confirm'),
          style: 'destructive',
          onPress: async () => {
            setRemoving(providerId);
            try {
              await removeMutation.mutateAsync(providerId);
            } catch (e: unknown) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
            } finally {
              setRemoving(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('owner.favorites.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <SkeletonList count={4} />
      ) : favorites.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="star-outline"
            title={t('owner.favorites.empty_title')}
            subtitle={t('owner.favorites.empty_desc')}
            testID="owner-favorites-empty"
          />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>{t('owner.favorites.subtitle', { count: favorites.length })}</Text>

          {favorites.map((fav) => {
            const provider = fav.provider;
            const rawProfile = provider?.profile;
            const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
            const specialties: string[] = profile?.specialties || [];
            const rating = profile?.rating || 0;
            const totalReviews = profile?.total_reviews || 0;

            return (
              <View key={fav.provider_id} style={styles.card}>
                {/* Priority badge */}
                <View style={styles.priorityBadge}>
                  <Ionicons name="flash" size={11} color="#D97706" />
                  <Text style={styles.priorityText}>{t('owner.favorites.priority_label')}</Text>
                </View>

                <View style={styles.cardMain}>
                  <Image
                    source={provider?.picture ? { uri: provider.picture } : require('../../assets/images/icon.png')}
                    style={styles.avatar}
                  />
                  <View style={styles.info}>
                    <Text style={styles.name}>{provider?.name || '—'}</Text>

                    {/* Rating */}
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={13} color={COLORS.warning} />
                      <Text style={styles.ratingText}>
                        {rating > 0 ? `${rating.toFixed(1)} (${totalReviews})` : t('owner.favorites.no_reviews')}
                      </Text>
                    </View>

                    {/* Specialties */}
                    {specialties.length > 0 && (
                      <View style={styles.tagsRow}>
                        {specialties.slice(0, 3).map((s) => (
                          <View key={s} style={styles.tag}>
                            <Text style={styles.tagText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Remove button */}
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemove(fav.provider_id, provider?.name ?? '')}
                    disabled={removing === fav.provider_id}
                  >
                    {removing === fav.provider_id ? (
                      <ActivityIndicator size="small" color={COLORS.urgency} />
                    ) : (
                      <Ionicons name="heart-dislike-outline" size={20} color={COLORS.urgency} />
                    )}
                  </TouchableOpacity>
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={() => router.push(`/provider/${fav.provider_id}` as never)}
                  >
                    <Ionicons name="person-outline" size={16} color={COLORS.brandPrimary} />
                    <Text style={styles.actionTextSecondary}>{t('owner.favorites.see_profile')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnPrimary}
                    onPress={() => router.push(`/(owner)/book/${fav.provider_id}` as never)}
                  >
                    <Ionicons name="clipboard-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.actionTextPrimary}>{t('owner.favorites.request_intervention')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: SPACING.lg,
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: COLORS.textPrimary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md },
  subtitle: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.xl, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.card, overflow: 'hidden',
  },
  priorityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: COLORS.warningSoft,
  },
  priorityText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, color: '#D97706' },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', padding: SPACING.lg, gap: SPACING.md },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  info: { flex: 1 },
  name: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: COLORS.textPrimary, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  ratingText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: '#64748B' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: COLORS.subtle, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  tagText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: COLORS.textSecondary },
  removeBtn: { padding: SPACING.sm },
  actions: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, paddingTop: 0,
  },
  actionBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.brandPrimary,
  },
  actionTextSecondary: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: COLORS.brandPrimary },
  actionBtnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.brandPrimary,
  },
  actionTextPrimary: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#FFFFFF' },
});
