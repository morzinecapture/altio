import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, SERVICE_TYPE_LABELS } from '../../src/theme';
import { useProviderProfile } from '../../src/hooks';
import { useIsBlocked, useBlockUser, useUnblockUser } from '../../src/hooks/useBlocking';

export default function ProviderProfileScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { data: profileData, isLoading: loading } = useProviderProfile(id!);
    const profile = profileData as { name?: string; picture?: string; specialties?: string[]; rating?: number; total_reviews?: number; bio?: string; zone?: string; company_name?: string; rc_pro_verified?: boolean; decennale_verified?: boolean } | null;
    const { data: isBlocked, isLoading: blockLoading } = useIsBlocked(id!);
    const blockMutation = useBlockUser();
    const unblockMutation = useUnblockUser();
    const [menuVisible, setMenuVisible] = useState(false);

    const handleToggleBlock = () => {
        setMenuVisible(false);
        if (isBlocked) {
            Alert.alert(
                t('blocking.unblock_title'),
                t('blocking.unblock_confirm'),
                [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('blocking.unblock'), onPress: () => unblockMutation.mutate(id!) },
                ],
            );
        } else {
            Alert.alert(
                t('blocking.block_title'),
                t('blocking.block_confirm'),
                [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                        text: t('blocking.block'),
                        style: 'destructive',
                        onPress: () => blockMutation.mutate({ blockedId: id! }),
                    },
                ],
            );
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.brandPrimary} />
            </View>
        );
    }

    if (!profile || !profile.name) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{t('public_provider.not_found')}</Text>
                <TouchableOpacity style={styles.backButtonCenter} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>{t('public_provider.back')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const rating = profile.rating || 0;
    const reviewsCount = profile.total_reviews || 0;
    const specialties = profile.specialties || [];
    const hasInsurance = profile.rc_pro_verified || profile.decennale_verified;
    const isNew = reviewsCount === 0;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
                    <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Context menu modal */}
            <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
                    <View style={styles.menuPopover}>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={handleToggleBlock}
                            disabled={blockLoading || blockMutation.isPending || unblockMutation.isPending}
                        >
                            <Ionicons
                                name={isBlocked ? 'person-add' : 'ban'}
                                size={20}
                                color={isBlocked ? COLORS.info : COLORS.urgency}
                            />
                            <Text style={[styles.menuItemText, !isBlocked && { color: COLORS.urgency }]}>
                                {isBlocked ? t('blocking.unblock_user') : t('blocking.block_user')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

                {/* Avatar & Identité */}
                <View style={styles.profileHeader}>
                    {profile.picture ? (
                        <Image source={{ uri: profile.picture }} style={styles.avatarLarge} />
                    ) : (
                        <View style={styles.avatarLargePlaceholder}>
                            <Text style={styles.avatarLargeText}>{(profile.name || 'P')[0]}</Text>
                        </View>
                    )}
                    <Text style={styles.name}>{profile.name}</Text>

                    {isNew ? (
                        <View style={styles.newBadge}>
                            <Ionicons name="sparkles" size={14} color="#2563EB" />
                            <Text style={styles.newBadgeText}>
                                {hasInsurance ? t('public_provider.new_verified') : t('public_provider.new_on_altio')}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.ratingBadge}>
                            <Ionicons name="star" size={16} color={COLORS.warning} />
                            <Text style={styles.ratingText}>{rating.toFixed(2)}</Text>
                            <Text style={styles.reviewsText}>{t('public_provider.reviews_count', { count: reviewsCount })}</Text>
                        </View>
                    )}
                </View>

                {/* Vérifications — assurances */}
                {hasInsurance && (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>{t('public_provider.verifications')}</Text>
                        <View style={styles.badgesRow}>
                            {profile.rc_pro_verified && (
                                <View style={styles.insuranceBadge}>
                                    <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                                    <Text style={styles.insuranceBadgeText}>{t('public_provider.rc_pro_badge')}</Text>
                                    <TouchableOpacity onPress={() => Alert.alert(t('public_provider.rc_pro_badge'), t('public_provider.rc_pro_info'))}>
                                        <Ionicons name="information-circle-outline" size={16} color="#10B981" />
                                    </TouchableOpacity>
                                </View>
                            )}
                            {profile.decennale_verified && (
                                <View style={styles.insuranceBadge}>
                                    <Ionicons name="construct" size={16} color="#10B981" />
                                    <Text style={styles.insuranceBadgeText}>{t('public_provider.decennale_badge')}</Text>
                                    <TouchableOpacity onPress={() => Alert.alert(t('public_provider.decennale_badge'), t('public_provider.decennale_info'))}>
                                        <Ionicons name="information-circle-outline" size={16} color="#10B981" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </View>
                )}

                {/* Localisation */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>{t('public_provider.intervention_zone')}</Text>
                    <View style={styles.row}>
                        <Ionicons name="location" size={20} color={COLORS.info} />
                        <Text style={styles.rowText}>{profile.zone || t('public_provider.not_specified')}</Text>
                    </View>
                </View>

                {/* Bio */}
                {profile.bio && (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>{t('public_provider.about_me')}</Text>
                        <Text style={styles.bioText}>{profile.bio}</Text>
                    </View>
                )}

                {/* Spécialités */}
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>{t('public_provider.specialties')}</Text>
                    {specialties.length > 0 ? (
                        <View style={styles.skillsContainer}>
                            {specialties.map((s: string) => (
                                <View key={s} style={styles.skillChip}>
                                    <Text style={styles.skillText}>{SERVICE_TYPE_LABELS[s] || s}</Text>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <Text style={styles.emptyText}>{t('public_provider.no_specialties')}</Text>
                    )}
                </View>

                {/* Reviews — hidden when user is blocked */}
                {reviewsCount > 0 && !isBlocked && (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>{t('public_provider.recent_reviews')}</Text>
                        <View style={styles.reviewItem}>
                            <View style={styles.reviewTop}>
                                <View style={styles.reviewStars}>
                                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={12} color={i <= 5 ? COLORS.warning : COLORS.border} />)}
                                </View>
                                <Text style={styles.reviewDate}>{t('public_provider.review_ago_2w')}</Text>
                            </View>
                            <Text style={styles.reviewText}>{t('public_provider.review_text_1')}</Text>
                        </View>

                        {reviewsCount > 1 && (
                            <View style={styles.reviewItem}>
                                <View style={styles.reviewTop}>
                                    <View style={styles.reviewStars}>
                                        {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={12} color={i <= 4 ? COLORS.warning : COLORS.border} />)}
                                    </View>
                                    <Text style={styles.reviewDate}>{t('public_provider.review_ago_1m')}</Text>
                                </View>
                                <Text style={styles.reviewText}>{t('public_provider.review_text_2')}</Text>
                            </View>
                        )}
                    </View>
                )}

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
    backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
    menuBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
    content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
    errorText: { ...FONTS.body, color: COLORS.textSecondary, marginBottom: SPACING.lg },
    backButtonCenter: { backgroundColor: COLORS.brandPrimary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
    backButtonText: { ...FONTS.h3, color: COLORS.textInverse },

    profileHeader: { alignItems: 'center', marginBottom: SPACING.xl, marginTop: SPACING.lg },
    avatarLarge: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.subtle },
    avatarLargePlaceholder: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center' },
    avatarLargeText: { ...FONTS.h1, color: COLORS.brandPrimary, fontSize: 36 },
    name: { ...FONTS.h2, color: COLORS.textPrimary, marginTop: SPACING.md, marginBottom: SPACING.xs },

    ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.paper, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, ...SHADOWS.card },
    ratingText: { ...FONTS.h3, color: COLORS.textPrimary, marginLeft: 4 },
    reviewsText: { ...FONTS.caption, color: COLORS.textSecondary, marginLeft: 4 },

    sectionCard: { backgroundColor: COLORS.paper, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.lg, ...SHADOWS.card },
    sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    rowText: { ...FONTS.body, color: COLORS.textPrimary },
    bioText: { ...FONTS.body, color: COLORS.textSecondary, lineHeight: 22 },

    skillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    skillChip: { backgroundColor: COLORS.subtle, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.md },
    skillText: { ...FONTS.bodySmall, color: COLORS.textPrimary },
    emptyText: { ...FONTS.body, color: COLORS.textTertiary, fontStyle: 'italic' },

    reviewItem: { borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: SPACING.md, gap: SPACING.xs },
    reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    reviewStars: { flexDirection: 'row', gap: 2 },
    reviewDate: { ...FONTS.caption, color: COLORS.textTertiary },
    reviewText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 4 },

    newBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, gap: 6 },
    newBadgeText: { ...FONTS.bodySmall, color: '#2563EB', fontWeight: '600' as const },

    badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    insuranceBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1FAE5', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, gap: 6 },
    insuranceBadgeText: { ...FONTS.bodySmall, color: '#10B981', fontWeight: '600' as const },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 100, paddingRight: SPACING.xl },
    menuPopover: { backgroundColor: COLORS.paper, borderRadius: RADIUS.lg, paddingVertical: SPACING.sm, minWidth: 200, ...SHADOWS.float },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm },
    menuItemText: { ...FONTS.body, color: COLORS.textPrimary },
});
