import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAdminEmergencies } from '../../src/api';
import { supabase } from '../../src/lib/supabase';

const EMERGENCY_STATUS_LABELS: Record<string, string> = {
  open: 'En attente',
  bids_open: 'Candidatures ouvertes',
  bid_accepted: 'Prestataire sélectionné',
  provider_accepted: 'En route',
  displacement_paid: 'En route',
  on_site: 'Sur place',
  quote_sent: 'Devis envoyé',
  quote_submitted: 'Devis soumis',
  quote_paid: 'Travaux en cours',
  quote_accepted: 'Travaux en cours',
  in_progress: 'En cours',
  quote_refused: 'Devis refusé',
  completed: 'Terminée',
};

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

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

export default function AdminEmergencies() {
  const router = useRouter();
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const channelRef = useRef<any>(null);

  const fetchData = async () => {
    try {
      const result = await getAdminEmergencies();
      setEmergencies(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    fetchData();

    // Realtime subscription
    channelRef.current = supabase
      .channel('admin-emergencies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_requests' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []));

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
            <Text style={styles.title}>Urgences</Text>
            <View style={styles.realtimeBadge}>
              <View style={styles.realtimeDot} />
              <Text style={styles.realtimeText}>Temps réel</Text>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
        >
          {active.length === 0 && history.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={50} color={COLORS.success} />
              <Text style={styles.emptyText}>Aucune urgence active</Text>
            </View>
          ) : (
            <>
              {active.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Actives ({active.length})</Text>
                  {active.map(e => <EmergencyCard key={e.id} item={e} router={router} />)}
                </>
              )}
              {history.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Historique ({history.length})</Text>
                  {history.slice(0, 10).map(e => <EmergencyCard key={e.id} item={e} router={router} />)}
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

function EmergencyCard({ item: e, router }: { item: any; router: any }) {
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
            {EMERGENCY_STATUS_LABELS[e.status] || e.status}
          </Text>
        </View>
        <Text style={styles.cardTime}>{formatRelative(e.created_at)}</Text>
      </View>
      <Text style={styles.cardTitle}>{e.property?.name || 'Logement'}</Text>
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
            <Text style={styles.metaText}>{e.service_type}</Text>
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
  title: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#1E3A5F' },
  realtimeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  realtimeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  realtimeText: { ...FONTS.caption, color: COLORS.success, fontSize: 9 },
  countBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.urgency, justifyContent: 'center', alignItems: 'center' },
  countBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.textInverse },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.textSecondary, paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, paddingBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#FFFFFF', marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, ...SHADOWS.card, borderWidth: 1, borderColor: '#F1F5F9' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 3, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption, fontSize: 9 },
  cardTime: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  cardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1E3A5F' },
  cardAddr: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  empty: { alignItems: 'center', paddingVertical: 80, gap: SPACING.md },
  emptyText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
});
