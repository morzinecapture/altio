import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, Alert, KeyboardAvoidingView, Platform, Modal, Image, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useProperty, useUpdateProperty, useDeleteProperty, useSyncIcal, useMissions, useReservations } from '../../src/hooks';
import { supabase } from '../../src/lib/supabase';
import { getFavoriteProviders } from '../../src/api/partners';
import { getReservationsWithMissionStatus, uploadPropertyPhoto, deletePropertyPhoto } from '../../src/api/properties';
import { PropertyCalendar } from '../../src/components/PropertyCalendar';
import { useReservationActions } from '../../src/hooks/useReservationActions';
import type { ReservationWithMission, ReservationMissionStatus } from '../../src/api/properties';

export default function PropertyDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const { data: property, isLoading, isError } = useProperty(id!);
  const updateMut = useUpdateProperty();
  const deleteMut = useDeleteProperty();
  const syncMut = useSyncIcal();
  const { data: allMissions } = useMissions();
  const queryClient = useQueryClient();
  const { data: reservations = [] } = useReservations(id!);

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: getFavoriteProviders,
  });

  const { createCleaningMission, sendToFavorite, publishToNetwork } = useReservationActions();

  const cleaningFavorite = favorites.find((f: any) => {
    const specialties = f.provider?.profile?.specialties || [];
    return specialties.includes('cleaning') || specialties.includes('ménage') || specialties.includes('menage');
  });

  const { data: reservationsWithStatus = [] } = useQuery({
    queryKey: ['properties', 'reservations-with-missions', id],
    queryFn: () => getReservationsWithMissionStatus(id!),
    enabled: !!id,
  });

  const unplannedReservations = reservationsWithStatus.filter((r) => !r.has_mission);
  const plannedReservations = reservationsWithStatus.filter((r) => r.has_mission);

  const [editing, setEditing] = useState(false);
  const [showCleaningModal, setShowCleaningModal] = useState(false);
  const [creatingMissions, setCreatingMissions] = useState(false);
  const [showFavoritePicker, setShowFavoritePicker] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationMissionStatus | null>(null);
  const [sendingToFavorite, setSendingToFavorite] = useState(false);
  const [publishingToNetwork, setPublishingToNetwork] = useState(false);

  // Photo state
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [newPhotoAssets, setNewPhotoAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [deletedPhotoUrls, setDeletedPhotoUrls] = useState<string[]>([]);

  // Form state — mirrors add.tsx fields
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

  // Parse address into street / postal / city when property loads
  useEffect(() => {
    if (property) {
      setName(property.name || '');
      setPropertyType(property.property_type || property.type || 'apartment');
      setIcalAirbnbUrl(property.ical_airbnb_url || '');
      setIcalBookingUrl(property.ical_booking_url || '');
      setAccessCode(property.access_code || '');
      setInstructions(property.instructions || '');
      setFixedRate(property.fixed_rate ? String(property.fixed_rate) : '');
      setLinenInstructions(property.linen_instructions || '');
      setDepositLocation(property.deposit_location || '');
      setExistingPhotos(property.photos || []);
      setNewPhotoAssets([]);
      setDeletedPhotoUrls([]);

      // Try to parse "street, postalCode city" format
      const addr = property.address || '';
      const commaIdx = addr.lastIndexOf(',');
      if (commaIdx > 0) {
        setStreet(addr.substring(0, commaIdx).trim());
        const rest = addr.substring(commaIdx + 1).trim();
        const spaceIdx = rest.indexOf(' ');
        if (spaceIdx > 0) {
          setPostalCode(rest.substring(0, spaceIdx).trim());
          setCity(rest.substring(spaceIdx + 1).trim());
        } else {
          setPostalCode('');
          setCity(rest);
        }
      } else {
        setStreet(addr);
        setPostalCode('');
        setCity('');
      }
    }
  }, [property]);

  // Count missions associated with this property
  const missionsCount = allMissions
    ? allMissions.filter((m: { property_id?: string }) => m.property_id === id).length
    : 0;

  const futureReservations = reservations.filter((r: { check_out: string }) => new Date(r.check_out) >= new Date());

  const { data: existingCleaningMissions = [] } = useQuery({
    queryKey: ['cleaning-missions', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('missions')
        .select('scheduled_date')
        .eq('property_id', id!)
        .eq('mission_type', 'cleaning');
      return data || [];
    },
    enabled: !!id,
  });

  const existingDates = new Set(existingCleaningMissions.map((m: { scheduled_date?: string | null }) => m.scheduled_date?.slice(0, 10)));
  const reservationsWithoutMission = futureReservations.filter((r: { check_out: string }) => !existingDates.has(r.check_out?.slice(0, 10)));

  const handleCreateMissionForReservation = async (r: ReservationWithMission) => {
    if (!property) return;
    await createCleaningMission(r, {
      id: id!,
      name: property.name || '',
      fixed_rate: property.fixed_rate ?? null,
      address: property.address || '',
    });
  };

  const handleCreateSingleMission = async () => {
    if (!property?.fixed_rate) {
      Alert.alert(
        'Prix du ménage manquant',
        'Définissez d\'abord un tarif de ménage pour ce logement (section "Tarif fixe").',
        [{ text: 'Compris' }]
      );
      return;
    }
    setCreatingMissions(true);
    try {
      const next = reservationsWithoutMission[0];
      const { data: prop } = await supabase.from('properties').select('owner_id').eq('id', id!).single();
      await supabase.from('missions').insert({
        property_id: id,
        owner_id: prop?.owner_id,
        mission_type: 'cleaning',
        status: 'pending',
        mode: 'fixed',
        scheduled_date: next.check_out,
        description: `Ménage — départ ${next.guest_name || 'invité'}`,
        fixed_rate: property.fixed_rate,
      });
      setShowCleaningModal(false);
      Alert.alert('Mission créée', `Mission ménage créée pour le ${new Date(next.check_out).toLocaleDateString('fr-FR')}. Les prestataires proches vont candidater.`);
      queryClient.invalidateQueries({ queryKey: ['cleaning-missions', id] });
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingMissions(false);
    }
  };

  const handleCreateAllMissions = async () => {
    if (!property?.fixed_rate) {
      Alert.alert(
        'Prix du ménage manquant',
        'Définissez d\'abord un tarif de ménage pour ce logement (section "Tarif fixe").',
        [{ text: 'Compris' }]
      );
      return;
    }
    setCreatingMissions(true);
    try {
      const { data: prop } = await supabase.from('properties').select('owner_id').eq('id', id!).single();
      let count = 0;
      for (const res of reservationsWithoutMission) {
        await supabase.from('missions').insert({
          property_id: id,
          owner_id: prop?.owner_id,
          mission_type: 'cleaning',
          status: 'pending',
          mode: 'fixed',
          scheduled_date: res.check_out,
          description: `Ménage — départ ${res.guest_name || 'invité'}`,
          fixed_rate: property.fixed_rate,
        });
        count++;
      }
      setShowCleaningModal(false);
      Alert.alert('Missions créées', `${count} mission(s) ménage créée(s) ! Les prestataires proches vont candidater.`);
      queryClient.invalidateQueries({ queryKey: ['cleaning-missions', id] });
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingMissions(false);
    }
  };

  const handleSendToFavorite = async (reservation: ReservationMissionStatus, favoriteProviderId: string, favoriteProviderName: string) => {
    if (!property) return;
    setSendingToFavorite(true);
    try {
      await sendToFavorite(
        reservation,
        { id: id!, name: property.name || '', fixed_rate: property.fixed_rate ?? null, address: property.address || '' },
        favoriteProviderId,
        favoriteProviderName,
      );
      setShowFavoritePicker(false);
      setSelectedReservation(null);
    } finally {
      setSendingToFavorite(false);
    }
  };

  const handlePublishToNetwork = async (reservation: ReservationMissionStatus) => {
    if (!property) return;
    setPublishingToNetwork(true);
    try {
      await publishToNetwork(
        reservation,
        { id: id!, name: property.name || '', fixed_rate: property.fixed_rate ?? null, address: property.address || '' },
      );
    } finally {
      setPublishingToNetwork(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !street.trim() || !postalCode.trim() || !city.trim()) {
      Alert.alert(t('common.error'), t('owner.properties.name_required'));
      return;
    }
    const fullAddress = `${street.trim()}, ${postalCode.trim()} ${city.trim()}`;
    try {
      // Upload new photos
      const uploadedUrls: string[] = [];
      for (const asset of newPhotoAssets) {
        try {
          const url = await uploadPropertyPhoto(id!, asset.uri);
          uploadedUrls.push(url);
        } catch (e) {
          console.error('[PropertyDetail] photo upload error:', e);
        }
      }

      // Delete removed photos from storage
      for (const url of deletedPhotoUrls) {
        try { await deletePropertyPhoto(url); } catch (e) { /* ignore */ }
      }

      const finalPhotos = [
        ...existingPhotos.filter(u => !deletedPhotoUrls.includes(u)),
        ...uploadedUrls,
      ];

      await updateMut.mutateAsync({
        id: id!,
        data: {
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
          photos: finalPhotos,
        },
      });
      setEditing(false);
      Alert.alert(t('owner.properties.updated'), '');
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('owner.properties.delete_title'),
      t('owner.properties.delete_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMut.mutateAsync(id!);
              router.back();
            } catch (e: unknown) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const handleSync = async () => {
    try {
      const result = await syncMut.mutateAsync(id!);
      Alert.alert(t('owner.properties.sync_done'), result.message);
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    }
  };

  const cancelEditing = () => {
    // Reset form to property values
    if (property) {
      setName(property.name || '');
      setPropertyType(property.property_type || property.type || 'apartment');
      setIcalAirbnbUrl(property.ical_airbnb_url || '');
      setIcalBookingUrl(property.ical_booking_url || '');
      setAccessCode(property.access_code || '');
      setInstructions(property.instructions || '');
      setFixedRate(property.fixed_rate ? String(property.fixed_rate) : '');
      setLinenInstructions(property.linen_instructions || '');
      setDepositLocation(property.deposit_location || '');
      setExistingPhotos(property.photos || []);
      setNewPhotoAssets([]);
      setDeletedPhotoUrls([]);

      const addr = property.address || '';
      const commaIdx = addr.lastIndexOf(',');
      if (commaIdx > 0) {
        setStreet(addr.substring(0, commaIdx).trim());
        const rest = addr.substring(commaIdx + 1).trim();
        const spaceIdx = rest.indexOf(' ');
        if (spaceIdx > 0) {
          setPostalCode(rest.substring(0, spaceIdx).trim());
          setCity(rest.substring(spaceIdx + 1).trim());
        } else {
          setPostalCode('');
          setCity(rest);
        }
      } else {
        setStreet(addr);
        setPostalCode('');
        setCity('');
      }
    }
    setEditing(false);
  };

  const types = [
    { id: 'apartment', label: t('owner.properties.type_apartment'), icon: 'business-outline' },
    { id: 'chalet', label: t('owner.properties.type_chalet'), icon: 'home-outline' },
    { id: 'studio', label: t('owner.properties.type_studio'), icon: 'bed-outline' },
  ];

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.center} testID="property-detail-loading">
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </SafeAreaView>
    );
  }

  // Error / not found state
  if (isError || !property) {
    return (
      <SafeAreaView style={styles.center} testID="property-detail-error">
        <View style={styles.errorIcon}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.urgency} />
        </View>
        <Text style={styles.errorTitle}>{t('owner.properties.not_found')}</Text>
        <Text style={styles.errorSubtitle}>{t('owner.properties.not_found_desc')}</Text>
        <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
          <Text style={styles.errorBtnText}>{t('common.go_back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="property-detail-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity testID="back-btn" onPress={() => editing ? cancelEditing() : router.back()} style={styles.backBtn}>
            <Ionicons name={editing ? 'close' : 'arrow-back'} size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{property.name}</Text>
          {!editing ? (
            <TouchableOpacity testID="edit-btn" onPress={() => setEditing(true)} style={styles.editBtn}>
              <Ionicons name="create-outline" size={20} color={COLORS.brandPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
          {/* Photos carousel (view mode) */}
          {!editing && (property.photos?.length ?? 0) > 0 && (
            <View style={photoStyles.carouselCard}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const imgW = windowWidth - 2 * SPACING.xl;
                  setCarouselIndex(Math.round(e.nativeEvent.contentOffset.x / imgW));
                }}
              >
                {((property.photos || []) as string[]).map((uri: string, idx: number) => (
                  <Image
                    key={idx}
                    source={{ uri }}
                    style={[photoStyles.carouselImage, { width: windowWidth - 2 * SPACING.xl }]}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
              {(property.photos?.length ?? 0) > 1 && (
                <View style={photoStyles.dotsRow}>
                  {((property.photos || []) as string[]).map((_: string, idx: number) => (
                    <View key={idx} style={[photoStyles.dot, carouselIndex === idx && photoStyles.dotActive]} />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Property Info Card (view mode) */}
          {!editing && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIcon}>
                  <Ionicons
                    name={propertyType === 'chalet' ? 'home' : propertyType === 'studio' ? 'bed' : 'business'}
                    size={28}
                    color={COLORS.brandPrimary}
                  />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.propName}>{property.name}</Text>
                  <Text style={styles.propType}>
                    {types.find((tp) => tp.id === propertyType)?.label || propertyType}
                  </Text>
                </View>
              </View>
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={16} color={COLORS.textTertiary} />
                <Text style={styles.propAddr}>{property.address}</Text>
              </View>
              {missionsCount > 0 && (
                <View style={styles.missionsCountRow}>
                  <View style={styles.missionsCountBadge}>
                    <Ionicons name="construct-outline" size={14} color={COLORS.brandPrimary} />
                    <Text style={styles.missionsCountText}>
                      {missionsCount} {missionsCount === 1 ? t('owner.properties.mission_count_singular') : t('owner.properties.mission_count_plural')}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Edit mode — all fields like add.tsx */}
          {editing && (
            <>
              <Text style={styles.label}>{t('owner.properties.name_label')}</Text>
              <TextInput testID="property-name-input" style={styles.input} value={name} onChangeText={setName} placeholder={t('owner.properties.name_placeholder')} placeholderTextColor={COLORS.textTertiary} />

              <Text style={styles.label}>{t('owner.properties.address_label')}</Text>
              <TextInput testID="property-street-input" style={styles.input} value={street} onChangeText={setStreet} placeholder={t('owner.properties.street_placeholder')} placeholderTextColor={COLORS.textTertiary} />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: SPACING.sm }}>
                  <Text style={styles.label}>{t('owner.properties.postal_label')}</Text>
                  <TextInput testID="property-postal-input" style={styles.input} value={postalCode} onChangeText={setPostalCode} placeholder={t('owner.properties.postal_placeholder')} keyboardType="numeric" placeholderTextColor={COLORS.textTertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('owner.properties.city_label')}</Text>
                  <TextInput testID="property-city-input" style={styles.input} value={city} onChangeText={setCity} placeholder={t('owner.properties.city_placeholder')} placeholderTextColor={COLORS.textTertiary} />
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
              />

              <Text style={styles.label}>{t('owner.properties.access_code')}</Text>
              <TextInput testID="access-code-input" style={styles.input} value={accessCode} onChangeText={setAccessCode} placeholder={t('owner.properties.access_code_placeholder')} placeholderTextColor={COLORS.textTertiary} />

              <Text style={styles.label}>{t('owner.properties.fixed_rate')}</Text>
              <TextInput testID="fixed-rate-input" style={styles.input} value={fixedRate} onChangeText={setFixedRate} placeholder={t('owner.properties.fixed_rate_placeholder')} placeholderTextColor={COLORS.textTertiary} keyboardType="numeric" />

              <Text style={styles.label}>{t('owner.properties.instructions')}</Text>
              <TextInput style={[styles.input, styles.textArea]} value={instructions} onChangeText={setInstructions} placeholder={t('owner.properties.instructions_placeholder')} placeholderTextColor={COLORS.textTertiary} multiline numberOfLines={3} />

              <Text style={styles.label}>{t('owner.properties.linen')}</Text>
              <TextInput style={[styles.input, styles.textArea]} value={linenInstructions} onChangeText={setLinenInstructions} placeholder={t('owner.properties.linen_placeholder')} placeholderTextColor={COLORS.textTertiary} multiline numberOfLines={2} />

              <Text style={styles.label}>{t('owner.properties.deposit')}</Text>
              <TextInput style={styles.input} value={depositLocation} onChangeText={setDepositLocation} placeholder={t('owner.properties.deposit_placeholder')} placeholderTextColor={COLORS.textTertiary} />

              <Text style={styles.label}>Photos du logement</Text>
              <View style={photoStyles.grid}>
                {existingPhotos.filter(u => !deletedPhotoUrls.includes(u)).map((uri, idx) => (
                  <View key={`existing-${idx}`} style={photoStyles.item}>
                    <Image source={{ uri }} style={photoStyles.thumb} />
                    <TouchableOpacity
                      style={photoStyles.removeBtn}
                      onPress={() => setDeletedPhotoUrls(prev => [...prev, uri])}
                    >
                      <Ionicons name="close-circle" size={22} color={COLORS.urgency} />
                    </TouchableOpacity>
                  </View>
                ))}
                {newPhotoAssets.map((asset, idx) => (
                  <View key={`new-${idx}`} style={photoStyles.item}>
                    <Image source={{ uri: asset.uri }} style={photoStyles.thumb} />
                    <TouchableOpacity
                      style={photoStyles.removeBtn}
                      onPress={() => setNewPhotoAssets(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <Ionicons name="close-circle" size={22} color={COLORS.urgency} />
                    </TouchableOpacity>
                  </View>
                ))}
                {(existingPhotos.filter(u => !deletedPhotoUrls.includes(u)).length + newPhotoAssets.length) < 10 && (
                  <TouchableOpacity
                    style={photoStyles.addBtn}
                    onPress={async () => {
                      const total = existingPhotos.filter(u => !deletedPhotoUrls.includes(u)).length + newPhotoAssets.length;
                      const result = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ['images'] as ImagePicker.MediaType[],
                        allowsMultipleSelection: true,
                        quality: 1,
                        selectionLimit: 10 - total,
                      });
                      if (!result.canceled) {
                        setNewPhotoAssets(prev => [...prev, ...result.assets].slice(0, 10 - existingPhotos.filter(u => !deletedPhotoUrls.includes(u)).length));
                      }
                    }}
                  >
                    <Ionicons name="camera-outline" size={28} color={COLORS.textTertiary} />
                    <Text style={photoStyles.addText}>Ajouter</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity testID="save-property-btn" style={styles.saveBtn} onPress={handleSave} disabled={updateMut.isPending}>
                {updateMut.isPending ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.saveBtnText}>{t('owner.properties.save')}</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* View mode — detail sections */}
          {!editing && (
            <>
              {/* Access & Details */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('owner.properties.access_section')}</Text>
                <DetailRow icon="key-outline" label={t('owner.properties.access_code_label')} value={property.access_code || t('owner.properties.not_defined')} />
                <DetailRow icon="document-text-outline" label={t('owner.properties.instructions_label')} value={property.instructions || t('owner.properties.not_defined_f')} />
                <DetailRow icon="cash-outline" label={t('owner.properties.fixed_rate_label')} value={property.fixed_rate ? `${property.fixed_rate} \u20AC` : t('owner.properties.not_defined')} />
                <DetailRow icon="shirt-outline" label={t('owner.properties.linen_label')} value={property.linen_instructions || t('owner.properties.not_defined_f')} />
                <DetailRow icon="location-outline" label={t('owner.properties.deposit_label')} value={property.deposit_location || t('owner.properties.not_defined')} />
              </View>

              {/* iCal Sync */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('owner.properties.ical_section')}</Text>
                <DetailRow
                  icon="logo-apple"
                  label={t('owner.properties.airbnb_ical_label')}
                  value={property.ical_airbnb_url ? `\u2713 ${t('owner.properties.configured')}` : t('owner.properties.not_configured')}
                />
                <DetailRow
                  icon="globe-outline"
                  label={t('owner.properties.booking_ical_label')}
                  value={property.ical_booking_url ? `\u2713 ${t('owner.properties.configured')}` : t('owner.properties.not_configured')}
                />
                {(property.ical_airbnb_url || property.ical_booking_url) && (
                  <TouchableOpacity testID="sync-ical-btn" style={styles.syncBtn} onPress={handleSync} disabled={syncMut.isPending}>
                    {syncMut.isPending ? <ActivityIndicator size="small" color={COLORS.info} /> : <Ionicons name="sync-outline" size={18} color={COLORS.info} />}
                    <Text style={styles.syncText}>{t('owner.properties.sync_now')}</Text>
                  </TouchableOpacity>
                )}
                {property.last_ical_sync && (
                  <Text style={styles.lastSync}>{t('owner.properties.last_sync')} {new Date(property.last_ical_sync).toLocaleString('fr-FR')}</Text>
                )}
              </View>

              {/* Reservations calendar */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Réservations à venir</Text>
                <PropertyCalendar
                  propertyId={id!}
                  onCreateMission={handleCreateMissionForReservation}
                />
                {reservationsWithoutMission.length > 1 && (
                  <TouchableOpacity style={resStyles.createBtn} onPress={() => setShowCleaningModal(true)}>
                    <Ionicons name="sparkles-outline" size={18} color={COLORS.textInverse} />
                    <Text style={resStyles.createBtnText}>
                      Créer toutes les missions ménage ({reservationsWithoutMission.length})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Réservations à planifier — per-reservation actions */}
              {unplannedReservations.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Réservations à planifier</Text>
                  <Text style={{ ...FONTS.bodySmall, color: COLORS.textTertiary, marginBottom: SPACING.md }}>
                    {unplannedReservations.length} réservation(s) sans mission ménage
                  </Text>
                  {unplannedReservations.map((res) => {
                    const checkIn = new Date(res.check_in).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                    const checkOut = new Date(res.check_out).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                    const platformColor = res.source === 'airbnb' ? '#FF585D' : res.source === 'booking' ? '#003B95' : COLORS.textSecondary;
                    const platformLabel = res.source === 'airbnb' ? 'Airbnb' : res.source === 'booking' ? 'Booking' : 'Direct';
                    return (
                      <View key={res.id} style={planStyles.card}>
                        <View style={planStyles.row}>
                          <View style={{ flex: 1 }}>
                            <Text style={planStyles.dates}>{checkIn} → {checkOut}</Text>
                            <Text style={planStyles.guest}>{res.guest_name || 'Voyageur'}</Text>
                          </View>
                          <View style={[planStyles.platformBadge, { backgroundColor: platformColor + '20' }]}>
                            <Text style={[planStyles.platformText, { color: platformColor }]}>{platformLabel}</Text>
                          </View>
                        </View>
                        <View style={planStyles.actions}>
                          <TouchableOpacity
                            style={planStyles.favoriteBtn}
                            disabled={sendingToFavorite}
                            onPress={() => {
                              if (favorites.length === 0) {
                                Alert.alert('Aucun favori', 'Ajoutez d\'abord un prestataire favori depuis votre profil.');
                                return;
                              }
                              setSelectedReservation(res);
                              setShowFavoritePicker(true);
                            }}
                          >
                            <Ionicons name="star" size={16} color={COLORS.brandPrimary} />
                            <Text style={planStyles.favoriteBtnText}>Envoyer à mon favori</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={planStyles.networkBtn}
                            disabled={publishingToNetwork}
                            onPress={() => handlePublishToNetwork(res)}
                          >
                            {publishingToNetwork ? (
                              <ActivityIndicator size="small" color={COLORS.textInverse} />
                            ) : (
                              <>
                                <Ionicons name="globe-outline" size={16} color={COLORS.textInverse} />
                                <Text style={planStyles.networkBtnText}>Publier au réseau</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Réservations déjà planifiées */}
              {plannedReservations.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Ménages planifiés</Text>
                  {plannedReservations.map((res) => {
                    const checkOut = new Date(res.check_out).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                    return (
                      <View key={res.id} style={planStyles.plannedRow}>
                        <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                        <Text style={planStyles.plannedText}>
                          {checkOut} — Ménage planifié{res.mission_provider_name ? ` — ${res.mission_provider_name}` : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Favorite provider picker modal */}
              <Modal visible={showFavoritePicker} transparent animationType="slide" onRequestClose={() => setShowFavoritePicker(false)}>
                <View style={modalStyles.overlay}>
                  <View style={[modalStyles.card, { maxHeight: '70%' }]}>
                    <Text style={modalStyles.title}>Choisir un prestataire favori</Text>
                    {selectedReservation && (
                      <Text style={modalStyles.subtitle}>
                        Ménage le {new Date(selectedReservation.check_out).toLocaleDateString('fr-FR')} — {selectedReservation.guest_name || 'Voyageur'}
                      </Text>
                    )}
                    {sendingToFavorite ? (
                      <ActivityIndicator size="large" color={COLORS.brandPrimary} style={{ marginVertical: SPACING.xl }} />
                    ) : (
                      <ScrollView style={{ maxHeight: 300 }}>
                        {favorites.map((fav: any) => {
                          const provName = fav.provider?.name || 'Prestataire';
                          const rating = fav.provider?.profile?.rating;
                          const reviews = fav.provider?.profile?.total_reviews;
                          return (
                            <TouchableOpacity
                              key={fav.id}
                              style={planStyles.favoriteItem}
                              onPress={() => {
                                if (selectedReservation) {
                                  handleSendToFavorite(selectedReservation, fav.provider_id, provName);
                                }
                              }}
                            >
                              <View style={planStyles.favoriteAvatar}>
                                <Ionicons name="person" size={20} color={COLORS.brandPrimary} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={planStyles.favoriteName}>{provName}</Text>
                                {rating != null && reviews != null && reviews > 0 && (
                                  <Text style={planStyles.favoriteRating}>{rating.toFixed(1)} ({reviews} avis)</Text>
                                )}
                              </View>
                              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                    <TouchableOpacity style={modalStyles.laterBtn} onPress={() => { setShowFavoritePicker(false); setSelectedReservation(null); }}>
                      <Text style={modalStyles.laterBtnText}>Annuler</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

              {/* Cleaning missions modal */}
              <Modal visible={showCleaningModal} transparent animationType="fade" onRequestClose={() => setShowCleaningModal(false)}>
                <View style={modalStyles.overlay}>
                  <View style={modalStyles.card}>
                    <Ionicons name="sparkles" size={32} color={COLORS.brandSecondary} style={{ alignSelf: 'center', marginBottom: SPACING.md }} />
                    <Text style={modalStyles.title}>Missions ménage automatiques</Text>
                    <Text style={modalStyles.subtitle}>
                      On a trouvé {reservationsWithoutMission.length} départ(s) sans ménage prévu.
                    </Text>

                    {creatingMissions ? (
                      <ActivityIndicator size="large" color={COLORS.brandSecondary} style={{ marginVertical: SPACING.xl }} />
                    ) : (
                      <>
                        {cleaningFavorite && (
                          <View style={{ marginBottom: 12 }}>
                            <Text style={{ color: COLORS.textTertiary, fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
                              Votre prestataire ménage favori :
                            </Text>
                            <TouchableOpacity
                              style={[modalStyles.primaryBtn, { backgroundColor: COLORS.brandPrimary }]}
                              onPress={async () => {
                                setCreatingMissions(true);
                                try {
                                  const { data: prop } = await supabase.from('properties').select('owner_id').eq('id', id!).single();
                                  let count = 0;
                                  for (const res of reservationsWithoutMission) {
                                    await supabase.from('missions').insert({
                                      property_id: id,
                                      owner_id: prop?.owner_id,
                                      mission_type: 'cleaning',
                                      status: 'pending_provider_approval',
                                      mode: 'fixed',
                                      fixed_rate: property?.fixed_rate,
                                      scheduled_date: res.check_out,
                                      assigned_provider_id: cleaningFavorite.provider_id,
                                      description: `Ménage — départ ${res.guest_name || 'invité'}`,
                                    });
                                    count++;
                                  }
                                  setShowCleaningModal(false);
                                  Alert.alert(
                                    'Missions envoyées',
                                    `${count} mission(s) ménage envoyée(s) à ${cleaningFavorite.provider?.name || 'votre favori'}. Il sera notifié pour confirmer.`,
                                  );
                                  queryClient.invalidateQueries({ queryKey: ['cleaning-missions', id] });
                                } catch (e: unknown) {
                                  Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
                                } finally {
                                  setCreatingMissions(false);
                                }
                              }}
                            >
                              <Text style={modalStyles.primaryBtnText}>
                                Envoyer tout à {cleaningFavorite.provider?.name || 'votre favori'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        <TouchableOpacity style={modalStyles.primaryBtn} onPress={handleCreateSingleMission}>
                          <Text style={modalStyles.primaryBtnText}>Créer le prochain ménage uniquement</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={modalStyles.secondaryBtn} onPress={handleCreateAllMissions}>
                          <Text style={modalStyles.secondaryBtnText}>
                            Tout créer d'un coup ({reservationsWithoutMission.length} missions)
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={modalStyles.laterBtn} onPress={() => setShowCleaningModal(false)}>
                          <Text style={modalStyles.laterBtnText}>Plus tard</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </Modal>

              {/* Delete button */}
              <TouchableOpacity testID="delete-property-btn" style={styles.deleteBtn} onPress={handleDelete} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.urgency} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={COLORS.urgency} />
                    <Text style={styles.deleteBtnText}>{t('owner.properties.delete')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={drStyles.row}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={COLORS.textTertiary} />
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, paddingHorizontal: SPACING.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  headerTitle: { ...FONTS.h3, color: COLORS.textPrimary, flex: 1, textAlign: 'center', marginHorizontal: SPACING.sm },
  editBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  form: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
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
  // View mode styles
  card: { backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl, marginTop: SPACING.lg, ...SHADOWS.card },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.md },
  cardIcon: { width: 50, height: 50, borderRadius: 15, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center' },
  cardHeaderText: { flex: 1 },
  propName: { ...FONTS.h2, color: COLORS.textPrimary },
  propType: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  propAddr: { ...FONTS.body, color: COLORS.textSecondary, marginLeft: SPACING.sm, flex: 1 },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
  missionsCountRow: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  missionsCountBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.infoSoft, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignSelf: 'flex-start' },
  missionsCountText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md, fontSize: 16 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingVertical: SPACING.sm },
  syncText: { ...FONTS.bodySmall, color: COLORS.info, fontWeight: '600' },
  lastSync: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: SPACING.sm, fontSize: 11 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.xxl, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.urgency, backgroundColor: COLORS.urgencySoft },
  deleteBtnText: { ...FONTS.h3, color: COLORS.urgency, fontSize: 16 },
  // Loading & Error states
  loadingText: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.lg },
  errorIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.urgencySoft, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  errorTitle: { ...FONTS.h2, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  errorSubtitle: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.xxl },
  errorBtn: { backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xxl, borderRadius: RADIUS.lg },
  errorBtnText: { ...FONTS.h3, color: COLORS.textInverse },
});

const resStyles = StyleSheet.create({
  resCard: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  guestName: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },
  dates: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 2 },
  sourceBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm },
  badgeAirbnb: { backgroundColor: '#FF585D20' },
  badgeBooking: { backgroundColor: '#003B9520' },
  badgeManual: { backgroundColor: COLORS.subtle },
  sourceText: { ...FONTS.caption, fontWeight: '600', color: COLORS.textSecondary },
  moreText: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: SPACING.md, textAlign: 'center' },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.brandSecondary },
  createBtnText: { ...FONTS.body, color: COLORS.textInverse, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  card: { backgroundColor: COLORS.paper, borderRadius: RADIUS.xl, padding: SPACING.xxl, width: '100%', maxWidth: 400 },
  title: { ...FONTS.h2, color: COLORS.textPrimary, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.xl },
  primaryBtn: { backgroundColor: COLORS.brandSecondary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, alignItems: 'center', marginBottom: SPACING.md },
  primaryBtnText: { ...FONTS.body, color: COLORS.textInverse, fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, borderColor: COLORS.brandSecondary, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, alignItems: 'center', marginBottom: SPACING.md },
  secondaryBtnText: { ...FONTS.body, color: COLORS.brandSecondary, fontWeight: '600' },
  laterBtn: { paddingVertical: SPACING.md, alignItems: 'center' },
  laterBtnText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
});

const photoStyles = StyleSheet.create({
  carouselCard: { borderRadius: RADIUS.xl, marginTop: SPACING.lg, overflow: 'hidden', ...SHADOWS.card },
  carouselImage: { height: 220 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm, backgroundColor: COLORS.paper },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.brandPrimary, width: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  item: { width: 96, height: 96, borderRadius: RADIUS.md, overflow: 'hidden', position: 'relative' },
  thumb: { width: 96, height: 96, borderRadius: RADIUS.md },
  removeBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: COLORS.paper, borderRadius: 11 },
  addBtn: { width: 96, height: 96, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: SPACING.xs },
  addText: { ...FONTS.caption, color: COLORS.textTertiary },
});

const planStyles = StyleSheet.create({
  card: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  dates: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontWeight: '600' },
  guest: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600', marginTop: 2 },
  platformBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm },
  platformText: { ...FONTS.caption, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  favoriteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.brandPrimary, backgroundColor: COLORS.brandPrimary + '10' },
  favoriteBtnText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  networkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.brandSecondary },
  networkBtnText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
  plannedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  plannedText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  favoriteItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  favoriteAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center' },
  favoriteName: { ...FONTS.body, color: COLORS.textPrimary, fontWeight: '600' },
  favoriteRating: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: 2 },
});
