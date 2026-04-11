import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getServiceTypeLabel } from '../../src/utils/serviceLabels';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAdminEmergencies } from '../../src/api';
import type { EmergencyRequest } from '../../src/types/api';
import { supabase } from '../../src/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface AdminEmergencyItem {
  id: string;
  owner_id: string;
  service_type: string;
  description?: string;
  status: string;
  created_at: string;
  property?: { name?: string; address?: string; latitude?: number; longitude?: number };
  owner?: { name?: string };
}

const EMERGENCY_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:             { bg: COLORS.urgencySoft, text: COLORS.urgency },
  bids_open:        { bg: COLORS.urgencySoft, text: COLORS.urgency },
  bid_accepted:     { bg: COLORS.warningSoft, text: COLORS.warning },
  provider_accepted:{ bg: COLORS.warningSoft, text: COLORS.warning },
  displacement_paid:{ bg: COLORS.warningSoft, text: COLORS.warning },
  on_site:          { bg: COLORS.infoSoft, text: COLORS.info },
  quote_sent:       { bg: COLORS.warningSoft, text: COLORS.warning },
  quote_submitted:  { bg: COLORS.warningSoft, text: COLORS.warning },
  quote_paid:       { bg: COLORS.successSoft, text: COLORS.success },
  quote_accepted:   { bg: COLORS.successSoft, text: COLORS.success },
  in_progress:      { bg: COLORS.infoSoft, text: COLORS.info },
  completed:        { bg: COLORS.successSoft, text: COLORS.success },
};

export default function AdminEmergencies() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const { data: emergencies = [] as EmergencyRequest[], isLoading: loading, refetch } = useQuery({
    queryKey: ['admin-emergencies'],
    queryFn: getAdminEmergencies,
  });

  const EMERGENCY_STATUS_LABELS: Record<string, string> = {
    open: t('admin.emergencies.status_open'),
    bids_open: t('admin.emergencies.status_bids_open'),
    bid_accepted: t('admin.emergencies.status_bid_accepted'),
    provider_accepted: t('admin.emergencies.status_provider_accepted'),
    displacement_paid: t('admin.emergencies.status_displacement_paid'),
    on_site: t('admin.emergencies.status_on_site'),
    quote_sent: t('admin.emergencies.status_quote_sent'),
    quote_submitted: t('admin.emergencies.status_quote_submitted'),
    quote_paid: t('admin.emergencies.status_quote_paid'),
    quote_accepted: t('admin.emergencies.status_quote_accepted'),
    in_progress: t('admin.emergencies.status_in_progress'),
    quote_refused: t('admin.emergencies.status_quote_refused'),
    completed: t('admin.emergencies.status_completed'),
  };

  function formatRelative(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return t('admin.emergencies.time_ago_min', { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('admin.emergencies.time_ago_hours', { count: hrs });
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  // Realtime subscription to invalidate query on changes
  useEffect(() => {
    channelRef.current = supabase
      .channel('admin-emergencies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-emergencies'] });
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);

  const active = emergencies.filter(e => !['completed', 'cancelled'].includes(e.status));
  const history = emergencies.filter(e => ['completed', 'cancelled'].includes(e.status));

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={COLORS.purple} /></View>
  );

  return (
    <AdminGuard>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{t('admin.emergencies.title')}</Text>
            <View style={styles.realtimeBadge}>
              <View style={styles.realtimeDot} />
              <Text style={styles.realtimeText}>{t('admin.emergencies.realtime')}</Text>
            </View>
          </View>
          {active.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{active.length}</Text>
            </View>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
        >
          {active.length === 0 && history.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={50} color={COLORS.success} />
              <Text style={styles.emptyText}>{t('admin.emergencies.no_active')}</Text>
            </View>
          ) : (
            <>
              {active.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>{t('admin.emergencies.active', { count: active.length })}</Text>
                  {active.map(e => <EmergencyCard key={e.id} item={e} router={router} statusLabels={EMERGENCY_STATUS_LABELS} formatRelative={formatRelative} propertyDefault={t('admin.emergencies.property_default')} />)}
                </>
              )}
              {history.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>{t('admin.emergencies.history', { count: history.length })}</Text>
                  {history.slice(0, 10).map(e => <EmergencyCard key={e.id} item={e} router={router} statusLabels={EMERGENCY_STATUS_LABELS} formatRelative={formatRelative} propertyDefault={t('admin.emergencies.property_default')} />)}
                </>
              )}
            </>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </AdminGuard>
  );
}

function EmergencyCard({ item: e, router, statusLabels, formatRelative, propertyDefault }: { item: { id: string; status: string; service_type: string; description?: string; property_name?: string; provider_name?: string; created_at: string; property?: { name?: string; address?: string } | null; owner?: { name?: string; email?: string } | null }; router: ReturnType<typeof useRouter>; statusLabels: Record<string, string>; formatRelative: (d: string) => string; propertyDefault: string }) {
  const colors = EMERGENCY_STATUS_COLORS[e.status] || { bg: COLORS.warningSoft, text: COLORS.warning };
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/emergency?id=${e.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <View style={[styles.chip, { backgroundColor: colors.bg }]}>
          <Text style={[styles.chipText, { color: colors.text }]}>
            {statusLabels[e.status] || e.status}
          </Text>
        </View>
        <Text style={styles.cardTime}>{formatRelative(e.created_at)}</Text>
      </View>
      <Text style={styles.cardTitle}>{e.property?.name || propertyDefault}</Text>
      {e.property?.address && <Text style={styles.cardAddr}>{e.property.address}</Text>}
      <View style={styles.cardMeta}>
        {e.owner && (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={13} color={COLORS.textTertiary} />
            <Text style={styles.metaText}>{e.owner.name}</Text>
          </View>
        )}
        {e.service_type && (
          <View style={styles.metaItem}>
            <Ionicons name="construct-outline" size={13} color={COLORS.textTertiary} />
            <Text style={styles.metaText}>{getServiceTypeLabel(e.service_type)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F' },
  realtimeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  realtimeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  realtimeText: { ...FONTS.caption, color: COLORS.success, fontSize: 9 },
  countBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.urgency, justifyContent: 'center', alignItems: 'center' },
  countBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: COLORS.textInverse },
  sectionTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: COLORS.textSecondary, paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#FFFFFF', marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, ...SHADOWS.card, borderWidth: 1, borderColor: '#F1F5F9' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 3, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption, fontSize: 9 },
  cardTime: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  cardTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#1E3A5F' },
  cardAddr: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  empty: { alignItems: 'center', paddingVertical: 80, gap: SPACING.md },
  emptyText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
});
