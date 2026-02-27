import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { createProperty } from '../../src/api';

export default function AddPropertyScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('apartment');
  const [icalUrl, setIcalUrl] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [fixedRate, setFixedRate] = useState('');
  const [linenInstructions, setLinenInstructions] = useState('');
  const [depositLocation, setDepositLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !address.trim()) {
      Alert.alert('Erreur', 'Nom et adresse sont requis');
      return;
    }
    setSaving(true);
    try {
      await createProperty({
        name: name.trim(),
        address: address.trim(),
        property_type: propertyType,
        ical_url: icalUrl.trim() || undefined,
        access_code: accessCode.trim() || undefined,
        instructions: instructions.trim() || undefined,
        fixed_rate: fixedRate ? parseFloat(fixedRate) : undefined,
        linen_instructions: linenInstructions.trim() || undefined,
        deposit_location: depositLocation.trim() || undefined,
      });
      Alert.alert('Logement ajouté !', '', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
      setSaving(false);
    }
  };

  const types = [
    { id: 'apartment', label: 'Appartement', icon: 'business-outline' },
    { id: 'chalet', label: 'Chalet', icon: 'home-outline' },
    { id: 'studio', label: 'Studio', icon: 'bed-outline' },
  ];

  return (
    <SafeAreaView style={styles.container} testID="add-property-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Nouveau logement</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
          <Text style={styles.label}>Nom du logement *</Text>
          <TextInput testID="property-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="ex: Chalet Les Aigles" placeholderTextColor={COLORS.textTertiary} />

          <Text style={styles.label}>Adresse *</Text>
          <TextInput testID="property-address-input" style={styles.input} value={address} onChangeText={setAddress} placeholder="ex: 123 Route des Gets, Morzine" placeholderTextColor={COLORS.textTertiary} />

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {types.map((t) => (
              <TouchableOpacity key={t.id} style={[styles.typeChip, propertyType === t.id && styles.typeChipActive]} onPress={() => setPropertyType(t.id)}>
                <Ionicons name={t.icon as any} size={18} color={propertyType === t.id ? COLORS.textInverse : COLORS.textSecondary} />
                <Text style={[styles.typeText, propertyType === t.id && styles.typeTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>URL iCal (Airbnb/Booking)</Text>
          <TextInput testID="ical-url-input" style={styles.input} value={icalUrl} onChangeText={setIcalUrl} placeholder="https://www.airbnb.fr/calendar/ical/..." placeholderTextColor={COLORS.textTertiary} autoCapitalize="none" />

          <Text style={styles.label}>Code boîte à clé</Text>
          <TextInput testID="access-code-input" style={styles.input} value={accessCode} onChangeText={setAccessCode} placeholder="ex: 4589" placeholderTextColor={COLORS.textTertiary} />

          <Text style={styles.label}>Tarif fixe ménage (€)</Text>
          <TextInput testID="fixed-rate-input" style={styles.input} value={fixedRate} onChangeText={setFixedRate} placeholder="ex: 60" placeholderTextColor={COLORS.textTertiary} keyboardType="numeric" />

          <Text style={styles.label}>Instructions ménage</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instructions} onChangeText={setInstructions} placeholder="Instructions spécifiques..." placeholderTextColor={COLORS.textTertiary} multiline numberOfLines={3} />

          <Text style={styles.label}>Instructions linge</Text>
          <TextInput style={[styles.input, styles.textArea]} value={linenInstructions} onChangeText={setLinenInstructions} placeholder="Lieu de dépôt linge..." placeholderTextColor={COLORS.textTertiary} multiline numberOfLines={2} />

          <Text style={styles.label}>Emplacement dépôt linge</Text>
          <TextInput style={styles.input} value={depositLocation} onChangeText={setDepositLocation} placeholder="ex: Pressing Morzine Centre" placeholderTextColor={COLORS.textTertiary} />

          <TouchableOpacity testID="save-property-btn" style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  title: { ...FONTS.h3, color: COLORS.textPrimary },
  form: { paddingHorizontal: SPACING.xl },
  label: { ...FONTS.caption, color: COLORS.textSecondary, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.paper, borderRadius: RADIUS.md, padding: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: SPACING.sm },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border },
  typeChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  typeText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  typeTextActive: { color: COLORS.textInverse },
  saveBtn: { backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, alignItems: 'center', marginTop: SPACING.xxl, ...SHADOWS.float },
  saveBtnText: { ...FONTS.h3, color: COLORS.textInverse },
});
