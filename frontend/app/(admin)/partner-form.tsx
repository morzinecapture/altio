import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { supabase } from '../../src/lib/supabase';
import { createPartner, updatePartner, uploadPartnerFile } from '../../src/api';

const CATEGORIES = [
  { id: 'restaurant', label: 'Restaurant', icon: 'restaurant-outline' },
  { id: 'activite',   label: 'Activité',   icon: 'bicycle-outline'   },
  { id: 'spa',        label: 'Spa',        icon: 'sparkles-outline'  },
  { id: 'transport',  label: 'Transport',  icon: 'car-outline'       },
  { id: 'shopping',   label: 'Shopping',   icon: 'bag-outline'       },
  { id: 'location',   label: 'Location',   icon: 'key-outline'       },
  { id: 'autre',      label: 'Autre',      icon: 'ellipsis-horizontal-outline' },
];

const ZONES = ['Morzine', 'Chamonix', 'Megève', 'Courchevel', "Val d'Isère", 'Les Gets', 'Autre'];

export default function PartnerForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [name, setName]             = useState('');
  const [category, setCategory]     = useState('autre');
  const [zone, setZone]             = useState(ZONES[0]);
  const [description, setDesc]      = useState('');
  const [phone, setPhone]           = useState('');
  const [website, setWebsite]       = useState('');
  const [address, setAddress]       = useState('');
  const [isActive, setIsActive]     = useState(true);
  const [logoUri, setLogoUri]       = useState<string | null>(null);
  const [existingLogoUrl, setExistingLogoUrl]   = useState<string | null>(null);
  const [brochureUrl, setBrochureUrl]           = useState<string>('');

  useEffect(() => {
    if (!isEdit) return;
    supabase.from('local_partners').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (!data) return;
        setName(data.name || '');
        setCategory(data.category || 'autre');
        setZone(data.zone || ZONES[0]);
        setDesc(data.description || '');
        setPhone(data.phone || '');
        setWebsite(data.website || '');
        setAddress(data.address || '');
        setIsActive(data.is_active ?? true);
        setExistingLogoUrl(data.logo_url || null);
        setBrochureUrl(data.brochure_url || '');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled) setLogoUri(result.assets[0].uri);
  };

const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Erreur', 'Le nom est requis.'); return; }

    setSaving(true);
    try {
      const partnerId = isEdit ? id! : crypto.randomUUID();

      let logo_url = existingLogoUrl;
      if (logoUri) {
        logo_url = await uploadPartnerFile('partner-logos', partnerId, logoUri, 'image/jpeg');
      }

      const brochure_url = brochureUrl.trim() || undefined;

      const payload = {
        name: name.trim(),
        category,
        zone,
        description: description.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        address: address.trim() || undefined,
        is_active: isActive,
        logo_url: logo_url || undefined,
        brochure_url: brochure_url || undefined,
      };

      if (isEdit) {
        await updatePartner(id!, payload);
      } else {
        await createPartner(payload);
      }

      router.back();
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de sauvegarder.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#1E3A5F" />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? 'Modifier' : 'Nouveau partenaire'}</Text>
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>

        {/* Logo */}
        <View style={styles.section}>
          <Text style={styles.label}>Logo</Text>
          <TouchableOpacity style={styles.logoPicker} onPress={pickLogo}>
            {(logoUri || existingLogoUrl) ? (
              <Image source={{ uri: logoUri || existingLogoUrl! }} style={styles.logoPreview} resizeMode="contain" />
            ) : (
              <>
                <Ionicons name="image-outline" size={28} color="#94A3B8" />
                <Text style={styles.logoPickerText}>Choisir une image</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Nom */}
        <View style={styles.section}>
          <Text style={styles.label}>Nom *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nom du partenaire"
            placeholderTextColor="#94A3B8"
          />
        </View>

        {/* Catégorie */}
        <View style={styles.section}>
          <Text style={styles.label}>Catégorie *</Text>
          <View style={styles.grid}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.gridItem, category === c.id && styles.gridItemActive]}
                onPress={() => setCategory(c.id)}
              >
                <Ionicons name={c.icon as any} size={18} color={category === c.id ? '#FFF' : '#64748B'} />
                <Text style={[styles.gridItemText, category === c.id && styles.gridItemTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Zone */}
        <View style={styles.section}>
          <Text style={styles.label}>Zone *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
            {ZONES.map(z => (
              <TouchableOpacity
                key={z}
                style={[styles.pill, zone === z && styles.pillActive]}
                onPress={() => setZone(z)}
              >
                <Text style={[styles.pillText, zone === z && styles.pillTextActive]}>{z}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDesc}
            placeholder="Décrivez le partenaire…"
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Téléphone */}
        <View style={styles.section}>
          <Text style={styles.label}>Téléphone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+33 6 00 00 00 00"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
          />
        </View>

        {/* Site web */}
        <View style={styles.section}>
          <Text style={styles.label}>Site web</Text>
          <TextInput
            style={styles.input}
            value={website}
            onChangeText={setWebsite}
            placeholder="https://…"
            placeholderTextColor="#94A3B8"
            keyboardType="url"
            autoCapitalize="none"
          />
        </View>

        {/* Adresse */}
        <View style={styles.section}>
          <Text style={styles.label}>Adresse</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="123 rue des Alpes, Morzine"
            placeholderTextColor="#94A3B8"
          />
        </View>

        {/* Brochure PDF URL */}
        <View style={styles.section}>
          <Text style={styles.label}>URL Brochure (PDF)</Text>
          <TextInput
            style={styles.input}
            value={brochureUrl}
            onChangeText={setBrochureUrl}
            placeholder="https://…/brochure.pdf"
            placeholderTextColor="#94A3B8"
            keyboardType="url"
            autoCapitalize="none"
          />
          <Text style={styles.inputHint}>Uploadez le PDF sur Supabase Storage et collez l'URL publique.</Text>
        </View>

        {/* Actif */}
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>Visible dans le catalogue</Text>
            <Text style={styles.switchSub}>Les propriétaires pourront voir ce partenaire</Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: '#1E3A5F', false: '#E2E8F0' }}
            thumbColor="#FFFFFF"
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF', gap: SPACING.md,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center',
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#1E3A5F', flex: 1 },
  saveBtn: {
    backgroundColor: '#1E3A5F', borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    minWidth: 90, alignItems: 'center',
  },
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },

  form: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 40 },

  section: { gap: SPACING.sm },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#475569' },

  input: {
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1E3A5F',
  },
  textarea: { minHeight: 80 },

  logoPicker: {
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed',
    height: 110, justifyContent: 'center', alignItems: 'center', gap: 6,
    overflow: 'hidden',
  },
  logoPreview: { width: '100%', height: '100%' },
  logoPickerText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#94A3B8' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  gridItem: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  gridItemActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  gridItemText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#64748B' },
  gridItemTextActive: { color: '#FFFFFF' },

  pill: {
    paddingHorizontal: SPACING.md, paddingVertical: 7,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  pillActive: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  pillText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#64748B' },
  pillTextActive: { color: '#FFFFFF' },

  inputHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#94A3B8', marginTop: 2 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: '#E2E8F0',
  },
  switchLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1E3A5F' },
  switchSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#94A3B8', marginTop: 2 },
});
