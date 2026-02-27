import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getProperty, updateProperty, syncIcal } from '../../src/api';

export default function PropertyDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const data = await getProperty(id!);
      setProperty(data);
      setForm(data);
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      const updated = await updateProperty(id!, {
        name: form.name,
        address: form.address,
        access_code: form.access_code,
        instructions: form.instructions,
        fixed_rate: form.fixed_rate ? parseFloat(form.fixed_rate) : undefined,
        ical_url: form.ical_url,
        linen_instructions: form.linen_instructions,
        deposit_location: form.deposit_location,
      });
      setProperty(updated);
      setEditing(false);
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncIcal(id!);
      Alert.alert('Sync terminée', result.message);
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setSyncing(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.container} testID="property-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{property?.name}</Text>
        <TouchableOpacity onPress={() => editing ? handleSave() : setEditing(true)}>
          <Text style={styles.editText}>{editing ? 'Sauver' : 'Modifier'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Info Card */}
        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons name={property?.property_type === 'chalet' ? 'home' : 'business'} size={28} color={COLORS.brandPrimary} />
          </View>
          {editing ? (
            <>
              <TextInput style={styles.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Nom" placeholderTextColor={COLORS.textTertiary} />
              <TextInput style={styles.input} value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholder="Adresse" placeholderTextColor={COLORS.textTertiary} />
            </>
          ) : (
            <>
              <Text style={styles.propName}>{property?.name}</Text>
              <Text style={styles.propAddr}>{property?.address}</Text>
            </>
          )}
        </View>

        {/* Details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Informations d'accès</Text>
          {editing ? (
            <>
              <Text style={styles.fieldLabel}>Code boîte à clé</Text>
              <TextInput style={styles.input} value={form.access_code || ''} onChangeText={(v) => setForm({ ...form, access_code: v })} placeholder="Code" placeholderTextColor={COLORS.textTertiary} />
              <Text style={styles.fieldLabel}>Instructions</Text>
              <TextInput style={[styles.input, styles.textArea]} value={form.instructions || ''} onChangeText={(v) => setForm({ ...form, instructions: v })} placeholder="Instructions" placeholderTextColor={COLORS.textTertiary} multiline />
              <Text style={styles.fieldLabel}>Tarif fixe (€)</Text>
              <TextInput style={styles.input} value={String(form.fixed_rate || '')} onChangeText={(v) => setForm({ ...form, fixed_rate: v })} placeholder="Tarif" placeholderTextColor={COLORS.textTertiary} keyboardType="numeric" />
            </>
          ) : (
            <>
              <DetailRow icon="key-outline" label="Code d'accès" value={property?.access_code || 'Non défini'} />
              <DetailRow icon="document-text-outline" label="Instructions" value={property?.instructions || 'Non définies'} />
              <DetailRow icon="cash-outline" label="Tarif fixe" value={property?.fixed_rate ? `${property.fixed_rate}€` : 'Non défini'} />
              <DetailRow icon="shirt-outline" label="Instructions linge" value={property?.linen_instructions || 'Non définies'} />
              <DetailRow icon="location-outline" label="Dépôt linge" value={property?.deposit_location || 'Non défini'} />
            </>
          )}
        </View>

        {/* iCal Sync */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Synchronisation iCal</Text>
          {editing ? (
            <TextInput style={styles.input} value={form.ical_url || ''} onChangeText={(v) => setForm({ ...form, ical_url: v })} placeholder="URL iCal" placeholderTextColor={COLORS.textTertiary} autoCapitalize="none" />
          ) : (
            <Text style={styles.icalUrl} numberOfLines={2}>{property?.ical_url || 'URL non configurée'}</Text>
          )}
          {property?.ical_url && (
            <TouchableOpacity testID="sync-ical-btn" style={styles.syncBtn} onPress={handleSync} disabled={syncing}>
              {syncing ? <ActivityIndicator size="small" color={COLORS.info} /> : <Ionicons name="sync-outline" size={18} color={COLORS.info} />}
              <Text style={styles.syncText}>Synchroniser maintenant</Text>
            </TouchableOpacity>
          )}
          {property?.last_sync && (
            <Text style={styles.lastSync}>Dernière sync: {new Date(property.last_sync).toLocaleString('fr-FR')}</Text>
          )}
          <Text style={styles.resCount}>{property?.reservation_count || 0} réservation(s) importées</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={drStyles.row}>
      <Ionicons name={icon as any} size={18} color={COLORS.textTertiary} />
      <View style={drStyles.rowContent}>
        <Text style={drStyles.rowLabel}>{label}</Text>
        <Text style={drStyles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const drStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowContent: { flex: 1 },
  rowLabel: { ...FONTS.caption, color: COLORS.textTertiary, marginBottom: 2 },
  rowValue: { ...FONTS.body, color: COLORS.textPrimary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  title: { ...FONTS.h3, color: COLORS.textPrimary, flex: 1, textAlign: 'center' },
  editText: { ...FONTS.bodySmall, color: COLORS.info, fontWeight: '600' },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
  card: { backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl, marginTop: SPACING.lg, ...SHADOWS.card },
  cardIcon: { width: 50, height: 50, borderRadius: 15, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  propName: { ...FONTS.h2, color: COLORS.textPrimary },
  propAddr: { ...FONTS.body, color: COLORS.textSecondary, marginTop: 4 },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md, fontSize: 16 },
  fieldLabel: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: SPACING.md, marginBottom: SPACING.xs },
  input: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.md, ...FONTS.body, color: COLORS.textPrimary },
  textArea: { minHeight: 60, textAlignVertical: 'top' },
  icalUrl: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingVertical: SPACING.sm },
  syncText: { ...FONTS.bodySmall, color: COLORS.info, fontWeight: '600' },
  lastSync: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: SPACING.sm, fontSize: 11 },
  resCount: { ...FONTS.bodySmall, color: COLORS.success, marginTop: SPACING.xs },
});
