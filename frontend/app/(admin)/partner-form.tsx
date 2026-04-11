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
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation } from '@tanstack/react-query';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { createPartner, updatePartner, uploadPartnerFile, getPartner } from '../../src/api';

const ZONES = ['Morzine', 'Chamonix', 'Megève', 'Courchevel', "Val d'Isère", 'Les Gets', 'Autre'];

export default function PartnerForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const CATEGORIES = [
    { id: 'restaurant', label: t('admin.partner_form.category_restaurant'), icon: 'restaurant-outline' },
    { id: 'activite',   label: t('admin.partner_form.category_activite'),   icon: 'bicycle-outline'   },
    { id: 'spa',        label: t('admin.partner_form.category_spa'),        icon: 'sparkles-outline'  },
    { id: 'transport',  label: t('admin.partner_form.category_transport'),  icon: 'car-outline'       },
    { id: 'shopping',   label: t('admin.partner_form.category_shopping'),   icon: 'bag-outline'       },
    { id: 'location',   label: t('admin.partner_form.category_location'),   icon: 'key-outline'       },
    { id: 'autre',      label: t('admin.partner_form.category_autre'),      icon: 'ellipsis-horizontal-outline' },
  ];

  const { data: partnerData, isLoading: loading } = useQuery({
    queryKey: ['partner', id],
    queryFn: () => getPartner(id!),
    enabled: isEdit,
  });

  type PartnerPayload = {
    name: string;
    category: string;
    zone: string;
    description?: string;
    phone?: string;
    website?: string;
    address?: string;
    is_active?: boolean;
    logo_url?: string;
    brochure_url?: string;
  };

  const saveMut = useMutation({
    mutationFn: async (payload: { partnerId: string; data: PartnerPayload; isEdit: boolean }) => {
      if (payload.isEdit) {
        await updatePartner(payload.partnerId, payload.data);
      } else {
        await createPartner(payload.data);
      }
    },
  });

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
    if (!partnerData) return;
    setName(partnerData.name || '');
    setCategory(partnerData.category || 'autre');
    setZone(partnerData.zone || ZONES[0]);
    setDesc(partnerData.description || '');
    setPhone(partnerData.phone || '');
    setWebsite(partnerData.website || '');
    setAddress(partnerData.address || '');
    setIsActive(partnerData.is_active ?? true);
    setExistingLogoUrl(partnerData.logo_url || null);
    setBrochureUrl(partnerData.brochure_url || '');
  }, [partnerData]);

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
    if (!name.trim()) { Alert.alert(t('common.error'), t('admin.partner_form.error_name_required')); return; }

    try {
      const partnerId = isEdit ? id! : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });

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

      await saveMut.mutateAsync({ partnerId, data: payload, isEdit });

      router.back();
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('admin.partner_form.error_save'));
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
        <Text style={styles.title}>{isEdit ? t('admin.partner_form.title_edit') : t('admin.partner_form.title_new')}</Text>
        <TouchableOpacity style={[styles.saveBtn, saveMut.isPending && { opacity: 0.6 }]} onPress={handleSave} disabled={saveMut.isPending}>
          {saveMut.isPending ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>{t('admin.partner_form.save')}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>

        {/* Logo */}
        <View style={styles.section}>
          <Text style={styles.label}>{t('admin.partner_form.logo')}</Text>
          <TouchableOpacity style={styles.logoPicker} onPress={pickLogo}>
            {(logoUri || existingLogoUrl) ? (
              <Image source={{ uri: logoUri || existingLogoUrl! }} style={styles.logoPreview} resizeMode="contain" />
            ) : (
              <>
                <Ionicons name="image-outline" size={28} color="#94A3B8" />
                <Text style={styles.logoPickerText}>{t('admin.partner_form.choose_image')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Nom */}
        <View style={styles.section}>
          <Text style={styles.label}>{t('admin.partner_form.name_label')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('admin.partner_form.name_placeholder')}
            placeholderTextColor="#94A3B8"
          />
        </View>

        {/* Catégorie */}
        <View style={styles.section}>
          <Text style={styles.label}>{t('admin.partner_form.category_label')}</Text>
          <View style={styles.grid}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.gridItem, category === c.id && styles.gridItemActive]}
                onPress={() => setCategory(c.id)}
              >
                <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={18} color={category === c.id ? '#FFF' : '#64748B'} />
                <Text style={[styles.gridItemText, category === c.id && styles.gridItemTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Zone */}
        <View style={styles.section}>
          <Text style={styles.label}>{t('admin.partner_form.zone_label')}</Text>
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
          <Text style={styles.label}>{t('admin.partner_form.description_label')}</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDesc}
            placeholder={t('admin.partner_form.description_placeholder')}
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Téléphone */}
        <View style={styles.section}>
          <Text style={styles.label}>{t('admin.partner_form.phone_label')}</Text>
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
          <Text style={styles.label}>{t('admin.partner_form.website_label')}</Text>
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
          <Text style={styles.label}>{t('admin.partner_form.address_label')}</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder={t('admin.partner_form.address_placeholder')}
            placeholderTextColor="#94A3B8"
          />
        </View>

        {/* Brochure PDF URL */}
        <View style={styles.section}>
          <Text style={styles.label}>{t('admin.partner_form.brochure_label')}</Text>
          <TextInput
            style={styles.input}
            value={brochureUrl}
            onChangeText={setBrochureUrl}
            placeholder="https://…/brochure.pdf"
            placeholderTextColor="#94A3B8"
            keyboardType="url"
            autoCapitalize="none"
          />
          <Text style={styles.inputHint}>{t('admin.partner_form.brochure_hint')}</Text>
        </View>

        {/* Actif */}
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>{t('admin.partner_form.visible_label')}</Text>
            <Text style={styles.switchSub}>{t('admin.partner_form.visible_desc')}</Text>
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
