import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useCreateProperty } from '../../src/hooks';
import { geocodeAddress } from '../../src/api/profile';
import { uploadPropertyPhoto, updateProperty } from '../../src/api/properties';

export default function AddPropertyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const createMut = useCreateProperty();
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [propertyType, setPropertyType] = useState('apartment');
  const [icalAirbnbUrl, setIcalAirbnbUrl] = useState('');
  const [icalBookingUrl, setIcalBookingUrl] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [fixedRate, setFixedRate] = useState('');
  const [linenInstructions, setLinenInstructions] = useState('');
  const [depositLocation, setDepositLocation] = useState('');
  const [photoAssets, setPhotoAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);

  const handlePickPhotos = async () => {
    const remaining = 10 - photoAssets.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsMultipleSelection: true,
      quality: 1,
      selectionLimit: remaining,
    });
    if (!result.canceled) {
      setPhotoAssets(prev => [...prev, ...result.assets].slice(0, 10));
    }
  };

  const handleSave = async () => {
    console.error('[AddProperty] handleSave called');
    if (!name.trim() || !street.trim() || !postalCode.trim() || !city.trim()) {
      console.error('[AddProperty] VALIDATION FAILED — name:', !!name.trim(), 'street:', !!street.trim(), 'postal:', !!postalCode.trim(), 'city:', !!city.trim());
      Alert.alert(t('common.error'), t('owner.properties.name_required'));
      return;
    }
    const fullAddress = `${street.trim()}, ${postalCode.trim()} ${city.trim()}`;
    console.error('[AddProperty] Calling mutateAsync with address:', fullAddress);
    try {
      const coords = await geocodeAddress(fullAddress);
      const prop = await createMut.mutateAsync({
        name: name.trim(),
        address: fullAddress,
        property_type: propertyType,
        ical_airbnb_url: icalAirbnbUrl.trim() || undefined,
        ical_booking_url: icalBookingUrl.trim() || undefined,
        access_code: accessCode.trim() || undefined,
        instructions: instructions.trim() || undefined,
        fixed_rate: fixedRate ? parseFloat(fixedRate) : undefined,
        linen_instructions: linenInstructions.trim() || undefined,
        deposit_location: depositLocation.trim() || undefined,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });
      console.error('[AddProperty] SUCCESS');

      if (prop?.id && photoAssets.length > 0) {
        const photoUrls: string[] = [];
        for (const asset of photoAssets) {
          try {
            const url = await uploadPropertyPhoto(prop.id, asset.uri);
            photoUrls.push(url);
          } catch (e) {
            console.error('[AddProperty] photo upload error:', e);
          }
        }
        if (photoUrls.length > 0) {
          await updateProperty(prop.id, { photos: photoUrls });
        }
      }

      Alert.alert(t('owner.properties.added'), '', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: unknown) {
      console.error('[AddProperty] ERROR:', e);
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    }
  };

  const types = [
    { id: 'apartment', label: t('owner.properties.type_apartment'), icon: 'business-outline' },
    { id: 'chalet', label: t('owner.properties.type_chalet'), icon: 'home-outline' },
    { id: 'studio', label: t('owner.properties.type_studio'), icon: 'bed-outline' },
  ];

  return (
    <SafeAreaView style={styles.container} testID="add-property-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('owner.properties.new_title')}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
          <Text style={styles.label}>{t('owner.properties.name_label')}</Text>
          <TextInput testID="property-name-input" style={styles.input} value={name} onChangeText={setName} placeholder={t('owner.properties.name_placeholder')} placeholderTextColor={COLORS.textTertiary} textContentType="none" autoComplete="off" />

          <Text style={styles.label}>{t('owner.properties.address_label')}</Text>
          <TextInput testID="property-street-input" style={styles.input} value={street} onChangeText={setStreet} placeholder={t('owner.properties.street_placeholder')} placeholderTextColor={COLORS.textTertiary} textContentType="none" autoComplete="off" />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: SPACING.sm }}>
              <Text style={styles.label}>{t('owner.properties.postal_label')}</Text>
              <TextInput testID="property-postal-input" style={styles.input} value={postalCode} onChangeText={setPostalCode} placeholder={t('owner.properties.postal_placeholder')} keyboardType="numeric" placeholderTextColor={COLORS.textTertiary} textContentType="none" autoComplete="off" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('owner.properties.city_label')}</Text>
              <TextInput testID="property-city-input" style={styles.input} value={city} onChangeText={setCity} placeholder={t('owner.properties.city_placeholder')} placeholderTextColor={COLORS.textTertiary} textContentType="none" autoComplete="off" />
            </View>
          </View>

          <Text style={styles.label}>{t('owner.properties.type_label')}</Text>
          <View style={styles.typeRow}>
            {types.map((tp) => (
              <TouchableOpacity key={tp.id} style={[styles.typeChip, propertyType === tp.id && styles.typeChipActive]} onPress={() => setPropertyType(tp.id)}>
                <Ionicons name={tp.icon as keyof typeof Ionicons.glyphMap} size={18} color={propertyType === tp.id ? COLORS.textInverse : COLORS.textSecondary} />
                <Text style={[styles.typeText, propertyType === tp.id && styles.typeTextActive]}>{tp.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t('owner.properties.ical_airbnb')}</Text>
          <TextInput
            testID="ical-airbnb-url-input"
            style={styles.input}
            value={icalAirbnbUrl}
            onChangeText={setIcalAirbnbUrl}
            placeholder="https://www.airbnb.fr/calendar/ical/..."
            placeholderTextColor={COLORS.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="none"
            autoComplete="off"
          />

          <Text style={styles.label}>{t('owner.properties.ical_booking')}</Text>
          <TextInput
            testID="ical-booking-url-input"
            style={styles.input}
            value={icalBookingUrl}
            onChangeText={setIcalBookingUrl}
            placeholder="https://ical.booking.com/v1/export?t=..."
            placeholderTextColor={COLORS.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="none"
            autoComplete="off"
          />

          <Text style={styles.label}>{t('owner.properties.access_code')}</Text>
          <TextInput testID="access-code-input" style={styles.input} value={accessCode} onChangeText={setAccessCode} placeholder={t('owner.properties.access_code_placeholder')} placeholderTextColor={COLORS.textTertiary} textContentType="none" autoComplete="off" />

          <Text style={styles.label}>{t('owner.properties.fixed_rate')}</Text>
          <TextInput testID="fixed-rate-input" style={styles.input} value={fixedRate} onChangeText={setFixedRate} placeholder={t('owner.properties.fixed_rate_placeholder')} placeholderTextColor={COLORS.textTertiary} keyboardType="numeric" textContentType="none" autoComplete="off" />

          <Text style={styles.label}>{t('owner.properties.instructions')}</Text>
          <TextInput style={[styles.input, styles.textArea]} value={instructions} onChangeText={setInstructions} placeholder={t('owner.properties.instructions_placeholder')} placeholderTextColor={COLORS.textTertiary} multiline numberOfLines={3} textContentType="none" autoComplete="off" />

          <Text style={styles.label}>{t('owner.properties.linen')}</Text>
          <TextInput style={[styles.input, styles.textArea]} value={linenInstructions} onChangeText={setLinenInstructions} placeholder={t('owner.properties.linen_placeholder')} placeholderTextColor={COLORS.textTertiary} multiline numberOfLines={2} textContentType="none" autoComplete="off" />

          <Text style={styles.label}>{t('owner.properties.deposit')}</Text>
          <TextInput style={styles.input} value={depositLocation} onChangeText={setDepositLocation} placeholder={t('owner.properties.deposit_placeholder')} placeholderTextColor={COLORS.textTertiary} textContentType="none" autoComplete="off" />

          <Text style={styles.label}>Photos du logement</Text>
          <View style={styles.photoGrid}>
            {photoAssets.map((asset, idx) => (
              <View key={idx} style={styles.photoItem}>
                <Image source={{ uri: asset.uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => setPhotoAssets(prev => prev.filter((_, i) => i !== idx))}
                >
                  <Ionicons name="close-circle" size={22} color={COLORS.urgency} />
                </TouchableOpacity>
              </View>
            ))}
            {photoAssets.length < 10 && (
              <TouchableOpacity style={styles.photoAdd} onPress={handlePickPhotos}>
                <Ionicons name="camera-outline" size={28} color={COLORS.textTertiary} />
                <Text style={styles.photoAddText}>Ajouter</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity testID="save-property-btn" style={styles.saveBtn} onPress={handleSave} disabled={createMut.isPending}>
            {createMut.isPending ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.saveBtnText}>{t('owner.properties.save')}</Text>}
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
  row: { flexDirection: 'row', alignItems: 'center' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: SPACING.sm },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border },
  typeChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  typeText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  typeTextActive: { color: COLORS.textInverse },
  saveBtn: { backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, alignItems: 'center', marginTop: SPACING.xxl, ...SHADOWS.float },
  saveBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photoItem: { width: 96, height: 96, borderRadius: RADIUS.md, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: 96, height: 96, borderRadius: RADIUS.md },
  photoRemove: { position: 'absolute', top: 4, right: 4, backgroundColor: COLORS.paper, borderRadius: 11 },
  photoAdd: { width: 96, height: 96, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: SPACING.xs },
  photoAddText: { ...FONTS.caption, color: COLORS.textTertiary },
});
