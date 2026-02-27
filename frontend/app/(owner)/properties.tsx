import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getProperties, syncIcal, deleteProperty } from '../../src/api';

export default function PropertiesScreen() {
  const router = useRouter();
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const result = await getProperties();
      setProperties(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const handleSync = async (propertyId: string) => {
    setSyncing(propertyId);
    try {
      const result = await syncIcal(propertyId);
      Alert.alert('Sync terminée', result.message);
      fetchData();
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    } finally { setSyncing(null); }
  };

  const handleDelete = (propertyId: string, name: string) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { await deleteProperty(propertyId); fetchData(); } catch (e: any) { Alert.alert('Erreur', e.message); }
      }},
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="properties-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Mes logements</Text>
          <TouchableOpacity testID="add-property-btn" style={styles.addBtn} onPress={() => router.push('/property/add')}>
            <Ionicons name="add" size={24} color={COLORS.textInverse} />
          </TouchableOpacity>
        </View>

        {properties.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="home-outline" size={60} color={COLORS.textTertiary} />
            <Text style={styles.emptyTitle}>Aucun logement</Text>
            <Text style={styles.emptySubtext}>Ajoutez votre premier logement pour commencer</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/property/add')}>
              <Text style={styles.emptyBtnText}>Ajouter un logement</Text>
            </TouchableOpacity>
          </View>
        ) : (
          properties.map((prop) => (
            <TouchableOpacity
              key={prop.property_id}
              testID={`property-card-${prop.property_id}`}
              style={styles.card}
              onPress={() => router.push(`/property/${prop.property_id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.propIcon}>
                  <Ionicons name={prop.property_type === 'chalet' ? 'home' : 'business'} size={24} color={COLORS.brandPrimary} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.propName}>{prop.name}</Text>
                  <Text style={styles.propAddress}>{prop.address}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(prop.property_id, prop.name)}>
                  <Ionicons name="trash-outline" size={20} color={COLORS.textTertiary} />
                </TouchableOpacity>
              </View>

              <View style={styles.cardMeta}>
                {prop.fixed_rate && (
                  <View style={styles.metaItem}>
                    <Ionicons name="cash-outline" size={14} color={COLORS.success} />
                    <Text style={styles.metaText}>{prop.fixed_rate}€/mission</Text>
                  </View>
                )}
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.info} />
                  <Text style={styles.metaText}>{prop.reservation_count || 0} réservations</Text>
                </View>
              </View>

              {prop.ical_url && (
                <TouchableOpacity
                  testID={`sync-ical-${prop.property_id}`}
                  style={styles.syncBtn}
                  onPress={() => handleSync(prop.property_id)}
                  disabled={syncing === prop.property_id}
                >
                  {syncing === prop.property_id ? (
                    <ActivityIndicator size="small" color={COLORS.info} />
                  ) : (
                    <Ionicons name="sync-outline" size={16} color={COLORS.info} />
                  )}
                  <Text style={styles.syncText}>Synchroniser iCal</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  title: { ...FONTS.h2, color: COLORS.textPrimary },
  addBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center', ...SHADOWS.float },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxxl * 2, paddingHorizontal: SPACING.xxl },
  emptyTitle: { ...FONTS.h3, color: COLORS.textSecondary, marginTop: SPACING.lg },
  emptySubtext: { ...FONTS.body, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.sm },
  emptyBtn: { marginTop: SPACING.xl, backgroundColor: COLORS.brandPrimary, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderRadius: RADIUS.lg },
  emptyBtnText: { ...FONTS.bodySmall, color: COLORS.textInverse },
  card: { backgroundColor: COLORS.paper, marginHorizontal: SPACING.xl, marginBottom: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, ...SHADOWS.card },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  propIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  cardInfo: { flex: 1 },
  propName: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  propAddress: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  metaText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  syncText: { ...FONTS.bodySmall, color: COLORS.info },
});
