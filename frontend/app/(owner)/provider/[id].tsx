import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/theme';
import { supabase } from '../../../src/lib/supabase';
import { useProviderReviews } from '../../../src/hooks';
import type { Review } from '../../../src/types/api';

export default function ProviderProfileScreen() {
    const { id, fromEmergencyId } = useLocalSearchParams<{ id: string; fromEmergencyId?: string }>();
    const router = useRouter();
    const { t } = useTranslation();
    const providerId = id as string;
    const { data: provider = null, isLoading: providerLoading } = useQuery({
        queryKey: ['owner-provider-profile', providerId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('provider_profiles')
                .select('*, user:users(*)')
                .eq('provider_id', providerId)
                .single();
            if (error || !data) return null;
            return data as { provider_id: string; specialties: string[]; rating?: number; average_rating?: number; total_reviews?: number; bio?: string; zone?: string; company_name?: string; radius_km?: number; weekly_availability?: string[]; hourly_rate?: number; user?: { name?: string; picture?: string } };
        },
        enabled: !!providerId,
    });
    const { data: reviews = [] as Review[], isLoading: reviewsLoading } = useProviderReviews(providerId);
    const loading = providerLoading || reviewsLoading;

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color={COLORS.brandPrimary} /></View>;
    }

    if (!provider) {
        return (
            <View style={styles.center}>
                <Text>{t('provider_detail.not_found')}</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
                    <Text style={{ color: COLORS.brandPrimary }}>{t('common.back')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const avatarUrl = provider.user?.picture || undefined;
    const mainSpecialty = provider.specialties?.[0] || 'Artisan';
    const distance = provider.radius_km ? t('provider_detail.km_max', { km: provider.radius_km }) : t('provider_detail.all_region');
    const rating = Number(provider.average_rating || 0).toFixed(1);
    const totalReviews = provider.total_reviews || 0;

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {/* Header / Cover */}
                <View style={styles.coverWrapper}>
                    <View style={styles.navHeader}>
                        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={24} color="#1E3A5F" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.favoriteBtn}>
                            <Ionicons name="bookmark-outline" size={24} color="#1E3A5F" />
                        </TouchableOpacity>
                    </View>

                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatarLarge} />
                    ) : (
                        <View style={[styles.avatarLarge, { backgroundColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ fontSize: 48, color: '#FFFFFF', fontWeight: '700' }}>
                                {(provider.user?.name || 'P').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Info Box */}
                <View style={styles.infoWrapper}>
                    <Text style={styles.nameText}>{provider.user?.name}</Text>
                    <View style={styles.badgeRow}>
                        <View style={styles.badgeWrapper}>
                            <Text style={styles.badgeText}>{mainSpecialty}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="star" size={16} color="#FBBF24" />
                            <Text style={styles.ratingText}>{rating} ({t('provider_detail.reviews_count', { count: totalReviews })})</Text>
                        </View>
                    </View>

                    <View style={styles.locationRow}>
                        <Ionicons name="location-outline" size={16} color="#64748B" />
                        <Text style={styles.locationText}>{distance}</Text>
                    </View>

                    {provider.hourly_rate ? (
                        <View style={styles.priceContainer}>
                            <View style={styles.priceBlock}>
                                <Text style={styles.priceLabel}>{t('provider_detail.hourly_rate')}</Text>
                                <Text style={styles.priceValue}>{provider.hourly_rate}€ <Text style={styles.priceUnit}>{t('provider_detail.per_hour')}</Text></Text>
                            </View>
                        </View>
                    ) : null}
                </View>

                {/* Disponibilités (Planning) */}
                <View style={[styles.section, { marginTop: SPACING.xl }]}>
                    <Text style={styles.sectionTitle}>{t('provider_detail.availability')}</Text>
                    <View style={styles.availabilityGrid}>
                        {[t('provider_detail.day_mon'), t('provider_detail.day_tue'), t('provider_detail.day_wed'), t('provider_detail.day_thu'), t('provider_detail.day_fri')].map((day, ix) => {
                            // Mocking availability logic from provider.weekly_availability or generic
                            const isAvailable = provider.weekly_availability ? provider.weekly_availability.length > ix : true;
                            return (
                                <View key={day} style={[styles.dayChip, isAvailable ? styles.dayAvailable : styles.dayUnavailable]}>
                                    <Text style={[styles.dayText, isAvailable ? styles.dayTextAvailable : styles.dayTextUnavailable]}>{day.substring(0, 3)}</Text>
                                    <View style={[styles.statusDot, { backgroundColor: isAvailable ? '#10B981' : '#CBD5E1' }]} />
                                </View>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.divider} />

                {/* About Me */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('provider_detail.about')}</Text>
                    <Text style={styles.aboutText}>
                        {provider.bio || t('provider_detail.default_bio', { name: provider.user?.name, specialty: mainSpecialty })}
                    </Text>
                </View>

                {/* Avis clients */}
                {reviews.length > 0 && (
                    <>
                        <View style={styles.divider} />
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('provider_detail.client_reviews', { count: totalReviews })}</Text>
                            {reviews.slice(0, 5).map((r) => (
                                <View key={r.id} style={styles.reviewCard}>
                                    <View style={styles.reviewHeader}>
                                        <Text style={styles.reviewAuthor}>{r.owner?.name || t('provider_detail.owner_label')}</Text>
                                        <View style={{ flexDirection: 'row', gap: 2 }}>
                                            {[1, 2, 3, 4, 5].map(s => (
                                                <Ionicons
                                                    key={s}
                                                    name={s <= r.rating ? 'star' : 'star-outline'}
                                                    size={12}
                                                    color="#FBBF24"
                                                />
                                            ))}
                                        </View>
                                    </View>
                                    {r.comment ? (
                                        <Text style={styles.reviewComment}>{r.comment}</Text>
                                    ) : null}
                                    <Text style={styles.reviewDate}>
                                        {new Date(r.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Floating Action Bar */}
            <View style={styles.bottomBar}>
                {fromEmergencyId ? (
                    <TouchableOpacity style={styles.bookBtn} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                        <Text style={styles.bookBtnText}>Retour à l&apos;urgence en cours</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.bookBtn} onPress={() => router.push(`/(owner)/book/${provider.provider_id}`)}>
                        <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.bookBtnText}>{t('provider_detail.request_intervention')}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    coverWrapper: { alignItems: 'center', paddingTop: 60, paddingBottom: 20, backgroundColor: '#E0F2FE', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
    navHeader: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
    backBtn: { width: 44, height: 44, backgroundColor: '#FFFFFF', borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    favoriteBtn: { width: 44, height: 44, backgroundColor: '#FFFFFF', borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },

    avatarLarge: { width: 140, height: 140, borderRadius: 70, borderWidth: 4, borderColor: '#FFFFFF' },

    infoWrapper: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, alignItems: 'flex-start' },
    nameText: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1E3A5F', marginBottom: SPACING.sm },

    badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: SPACING.sm },
    badgeWrapper: { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#EF4444' },
    ratingText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#64748B', marginLeft: 6 },

    locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
    locationText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B', marginLeft: 6 },

    priceContainer: { flexDirection: 'row', backgroundColor: '#FFFFFF', padding: SPACING.md, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', width: '100%', marginBottom: SPACING.sm },
    priceBlock: { flex: 1 },
    priceLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#64748B', marginBottom: 4 },
    priceValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#1E3A5F' },
    priceUnit: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B' },
    priceDivider: { width: 1, backgroundColor: '#F1F5F9', marginHorizontal: SPACING.md },

    availabilityGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.md },
    dayChip: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md, borderRadius: 12, marginHorizontal: 2, borderWidth: 1 },
    dayAvailable: { backgroundColor: '#FFFFFF', borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
    dayUnavailable: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', opacity: 0.6 },
    dayText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: SPACING.sm },
    dayTextAvailable: { color: '#1E3A5F' },
    dayTextUnavailable: { color: '#94A3B8' },
    statusDot: { width: 6, height: 6, borderRadius: 3 },

    divider: { height: 1, backgroundColor: '#E2E8F0', marginHorizontal: SPACING.xl, marginVertical: SPACING.xl },

    section: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
    sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#1E3A5F', marginBottom: SPACING.sm },
    aboutText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#64748B', lineHeight: 24 },
    seeAllText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#64748B' },

    bottomBar: { backgroundColor: '#FFFFFF', paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.xl, flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    bookBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#3B82F6', paddingVertical: SPACING.md, borderRadius: RADIUS.full, gap: SPACING.sm },
    bookBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFFFFF' },

    reviewCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: '#F1F5F9' },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    reviewAuthor: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#1E3A5F' },
    reviewComment: { fontSize: 13, color: '#64748B', lineHeight: 20, marginBottom: 4 },
    reviewDate: { fontSize: 11, color: '#94A3B8' },
});
