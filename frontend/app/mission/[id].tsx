import React, { useState, useEffect, ComponentProps } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, AlertButton, Image, Platform, TextInput, Modal, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, GRADIENT } from '../../src/theme';
import { getMissionTypeLabel } from '../../src/utils/serviceLabels';
import { useAuth } from '../../src/auth';
import { getMission, handleApplication, startMission, completeMission, applyToMission, declineBroadcastMission, expandMissionZone, uploadMissionPhoto, addMissionPhoto, createPaymentIntent, addFavoriteProvider, completeMissionPayment, addMissionExtraHours, submitReview, getMissionReview, cancelMission, validateMission, openDispute, republishMission, getProfile, enableAutoCleaning, syncIcal, acceptDirectMission, rejectDirectMission, haversineKm } from '../../src/api';
import { geocodeAddress } from '../../src/api/profile';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { useStripe } from '@stripe/stripe-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { priceFromTtc, providerVatRate } from '../../src/utils/commission';
import { supabase } from '../../src/lib/supabase';
import type { MergedMission, MissionApplicationEnriched, MissionPhoto, Review, ProviderProfile } from '../../src/types/api';
import ProviderMissionReview from '../../src/components/missions/ProviderMissionReview';
import { MARKETPLACE, MissionContact, marketStyles } from '../../src/components/alpine/MarketplaceKit';
import { missionKeys } from '../../src/hooks/useMissions';

export default function MissionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  // Owner price for the assigned provider: TTC rate + 10 % of its HT (server-checked).
  const ownerPrice = (rate?: number | null) => priceFromTtc(Number(rate) || 0, providerVatRate(mission?.assigned_provider_is_vat_exempt));
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mission, setMission] = useState<MergedMission | null>(null);
  const [showOtherActions, setShowOtherActions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [proposedRate, setProposedRate] = useState('');
  const [applying, setApplying] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [existingReview, setExistingReview] = useState<Review | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [extraHoursModal, setExtraHoursModal] = useState(false);
  const [extraHoursInput, setExtraHoursInput] = useState('');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [modalRating, setModalRating] = useState(0);
  const [modalComment, setModalComment] = useState('');
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [providerProfile, setProviderProfile] = useState<ProviderProfile | null>(null);
  const [providerSiren, setProviderSiren] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    try {
      const [data, review, profileData] = await Promise.all([
        getMission(id!),
        getMissionReview(id!).catch(() => null),
        user?.role === 'provider' ? getProfile().catch(() => null) : Promise.resolve(null),
      ]);
      setMission(data);

      // Auto-geocode si les coordonnées GPS sont manquantes (propriétés créées avant le géocodage)
      if (data && user?.role === 'provider' && !data.property_lat) {
        const addr = data.property_address || (data.property_city ? `${data.property_city}, France` : null);
        if (addr) {
          geocodeAddress(addr).then(async (coords) => {
            if (!coords) return;
            setGeocodedCoords(coords);
            // Persist exact coordinates in DB only when we have the full address
            if (data.property_address && data.property_id) {
              await supabase.from('properties')
                .update({ latitude: coords.lat, longitude: coords.lng })
                .eq('id', data.property_id);
            }
          });
        }
      }

      setExistingReview(review);
      if (profileData?.provider_profile) {
        const pp = Array.isArray(profileData.provider_profile) ? profileData.provider_profile[0] : profileData.provider_profile;
        setProviderProfile(pp);
      }
      if (profileData?.siren) {
        setProviderSiren(profileData.siren);
      }
      // Fetch associated quote if any
      const { data: quoteRow } = await supabase
        .from('mission_quotes')
        .select('id')
        .eq('mission_id', id!)
        .limit(1)
        .maybeSingle();
      setQuoteId(quoteRow?.id || null);

    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const confirmAcceptApp = async (appId: string) => {
    try {
      await handleApplication(id!, appId, 'accept');
      Alert.alert('Prestataire confirmé !', 'Il a été notifié et connaît les détails de la mission.');
      fetchData();
    } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  const handleAcceptApp = (appId: string, proposedRate: number | null | undefined, providerIsVatExempt?: boolean) => {
    const base = Number(proposedRate) || 0;
    if (base <= 0) {
      Alert.alert('Tarif manquant', 'Le prestataire doit proposer un tarif pour l’ensemble des prestations avant confirmation.');
      return;
    }
    const { fee, total } = priceFromTtc(base, providerVatRate(providerIsVatExempt));
    Alert.alert(
      'Assigner ce prestataire',
      `Tarif de la mission : ${base.toFixed(2)}€\nFrais de service Altio : ${fee.toFixed(2)}€\n\nTotal (paiement après validation) : ${total.toFixed(2)}€ TTC`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: 'Assigner', onPress: () => confirmAcceptApp(appId) },
      ]
    );
  };

  const handleRejectApp = async (appId: string) => {
    try {
      await handleApplication(id!, appId, 'reject');
      fetchData();
    } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  const handleApply = async () => {
    if (applying) return;
    const rate = mission?.fixed_rate || Number(proposedRate.replace(',', '.'));
    if (!Number.isFinite(rate) || rate <= 0) { Alert.alert(t('common.error'), 'Indiquez un tarif total pour toutes les prestations.'); return; }
    setApplying(true);
    try {
      await applyToMission(id!, { proposed_rate: rate, message: 'Disponible pour l’ensemble des prestations demandées' });
      const isBroadcast = !mission?.assigned_provider_id;
      Alert.alert(
        isBroadcast ? 'Votre disponibilité a été enregistrée' : 'Candidature envoyée !',
        'Le propriétaire a été notifié. Vous serez averti dès qu\'il aura fait son choix.'
      );
      fetchData();
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally { setApplying(false); }
  };

  const handleDeclineBroadcast = async () => {
    try {
      await declineBroadcastMission(id!);
      Alert.alert('Indisponibilité enregistrée', 'Le propriétaire a été informé que vous n\'êtes pas disponible.');
      fetchData();
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    }
  };

  const handleExpandZone = async () => {
    try {
      await expandMissionZone(id!);
      Alert.alert('Zone élargie', 'La mission est maintenant visible dans un rayon de 30 km. Vous ne recevrez pas plus de 3 candidatures.');
      fetchData();
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    }
  };

  const handleStart = async () => {
    try {
      await startMission(id!);
      Alert.alert('C\'est parti !', 'La mission est en cours. Le propriétaire a été notifié.');
      fetchData();
    } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  const handleCancel = () => {
    Alert.alert(
      'Annuler la mission',
      'Êtes-vous sûr de vouloir annuler cette mission ? Cette action est irréversible.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelMission(id!);
              Alert.alert('Mission annulée', 'La mission a été annulée avec succès.');
              fetchData();
            } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
          }
        }
      ]
    );
  };

  const handleValidateAndPay = async () => {
    const rate = mission?.fixed_rate || 0;
    const { fee, total: ownerTotal } = ownerPrice(rate);

    Alert.alert(
      'Valider et payer',
      `Prestation : ${rate.toFixed(2)} € TTC\n` +
      `Frais Altio : ${fee.toFixed(2)} € TTC\n` +
      `Total à payer : ${ownerTotal.toFixed(2)} € TTC\n\n` +
      `En validant, vous confirmez la bonne exécution de la prestation. Vos droits légaux et vos recours restent applicables.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: `Payer ${ownerTotal.toFixed(2)}€`,
          onPress: async () => {
            try {
              setLoading(true);
              // Step 1: Validate the mission
              await validateMission(id!);
              // Step 2: Create payment intent and show payment sheet
              const { clientSecret, paymentIntentId } = await createPaymentIntent(ownerTotal, { missionId: id }, 'automatic');
              const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'Altio',
                paymentIntentClientSecret: clientSecret,
                allowsDelayedPaymentMethods: true,
              });
              if (initError) throw new Error(initError.message);
              const { error: presentError } = await presentPaymentSheet();
              if (presentError) throw new Error(presentError.message);
              // Step 3: Complete payment + generate invoices (pass PI ID for invoice linking)
              const invoiceGeneration = await completeMissionPayment(id as string, paymentIntentId);
              await fetchData();

              if (invoiceGeneration.failedTypes.length > 0) {
                Alert.alert(
                  'Paiement confirmé',
                  'Votre paiement a bien été enregistré, mais la facture est temporairement indisponible. Notre équipe a été alertée.'
                );
              }

              // Step 4: If first validated cleaning, propose auto-cleaning
              if (mission?.mission_type === 'cleaning' && mission?.property_id) {
                try {
                  const { data: propData } = await supabase
                    .from('properties')
                    .select('validated_cleaning_count')
                    .eq('id', mission.property_id)
                    .single();

                  const prevCount = propData?.validated_cleaning_count || 0;
                  await supabase
                    .from('properties')
                    .update({ validated_cleaning_count: prevCount + 1 })
                    .eq('id', mission.property_id);

                  if (prevCount === 0) {
                    Alert.alert(
                      '🎉 Premier ménage validé !',
                      'Ça s\'est bien passé ? Voulez-vous automatiser les prochains ménages pour ce logement ? Les missions seront créées automatiquement à chaque nouvelle réservation.',
                      [
                        {
                          text: 'Oui, automatiser',
                          onPress: async () => {
                            try {
                              await enableAutoCleaning(mission.property_id, true);
                              await syncIcal(mission.property_id);
                              Alert.alert('Automatisation activée !', 'Les missions ménage seront créées automatiquement pour chaque départ.');
                            } catch (err) {
                              Alert.alert(t('common.error'), err instanceof Error ? err.message : String(err));
                            }
                          }
                        },
                        { text: 'Pas maintenant', style: 'cancel' }
                      ]
                    );
                  }
                } catch (_) {
                  // Non-blocking: don't break the payment flow if auto-cleaning check fails
                }
              }

              setModalRating(0);
              setModalComment('');
              setShowRatingModal(true);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (msg !== 'The payment has been canceled' && msg !== 'Canceled') {
                Alert.alert(t('common.error'), msg);
              }
              fetchData();
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleOpenDispute = async () => {
    if (!disputeReason.trim()) return;
    setSubmittingDispute(true);
    try {
      await openDispute(id!, disputeReason.trim());
      setShowDisputeModal(false);
      setDisputeReason('');
      Alert.alert('Litige ouvert', 'Le prestataire et le support Altio ont été notifiés. Nous reviendrons vers vous rapidement.');
      fetchData();
    } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
    finally { setSubmittingDispute(false); }
  };

  const handleRepublish = async () => {
    try {
      await republishMission(id!);
      Alert.alert('Mission republiée', 'Votre mission est de nouveau visible par les prestataires.');
      fetchData();
    } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  const pickImage = async (useCamera: boolean) => {
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('mission.permission_title'), t('mission.camera_permission'));
        return null;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('mission.permission_title'), t('mission.gallery_permission'));
        return null;
      }
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, mediaTypes: ['images'] });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0].uri;
    }
    return null;
  };

  const handleAddPhoto = async (useCamera: boolean) => {
    const uri = await pickImage(useCamera);
    if (!uri) return;

    setUploadingPhotos(true);
    try {
      const photo = await addMissionPhoto(id!, uri);
      // Optimistic update: add photo to local state immediately
      setMission((prev) => prev ? ({
        ...prev,
        photos: [photo, ...(prev.photos || [])],
      }) : prev);
      Alert.alert(t('mission.success'), t('mission.photo_added'));
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingPhotos(false);
    }
  };

  const showAddPhotoAlert = () => {
    const buttons: AlertButton[] = [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('mission.photo_choose'), onPress: () => handleAddPhoto(false) },
    ];
    if (Platform.OS !== 'web') {
      buttons.push({ text: t('mission.photo_take'), onPress: () => handleAddPhoto(true) });
    }
    Alert.alert(t('mission.photo_title'), t('mission.photo_add_subtitle'), buttons);
  };

  const handleComplete = async () => {
    // R7: Photos obligatoires — sauf si le propriétaire a désactivé l'obligation
    const photosNotRequired = mission?.require_photos === false;
    const hasExistingPhotos = mission?.photos && mission.photos.length > 0;

    if (photosNotRequired || hasExistingPhotos) {
      Alert.alert(t('mission.photo_title'), t('mission.photo_subtitle'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('mission.complete_btn'),
          onPress: async () => {
            setUploadingPhotos(true);
            try { await completeMission(id!); Alert.alert(t('mission.success'), t('mission.complete_success')); fetchData(); }
            catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
            finally { setUploadingPhotos(false); }
          }
        },
      ]);
      return;
    }

    // R7: Pas de photos existantes — le provider DOIT en ajouter au moins une
    const buttons: AlertButton[] = [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('mission.photo_choose'),
        onPress: async () => {
          const uri = await pickImage(false);
          if (!uri) return;
          setUploadingPhotos(true);
          try {
            const uploadedUrl = await uploadMissionPhoto(id!, uri);
            await completeMission(id!, [uploadedUrl]);
            Alert.alert(t('mission.success'), t('mission.complete_success'));
            fetchData();
          } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
          finally { setUploadingPhotos(false); }
        }
      },
    ];
    if (Platform.OS !== 'web') {
      buttons.push({
        text: t('mission.photo_take'),
        onPress: async () => {
          const uri = await pickImage(true);
          if (!uri) return;
          setUploadingPhotos(true);
          try {
            const uploadedUrl = await uploadMissionPhoto(id!, uri);
            await completeMission(id!, [uploadedUrl]);
            Alert.alert(t('mission.success'), t('mission.complete_success'));
            fetchData();
          } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
          finally { setUploadingPhotos(false); }
        }
      });
    }
    Alert.alert(t('mission.photo_title'), t('mission.photo_subtitle'), buttons);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;
  if (!mission) return <View style={styles.center}><Text>{t('mission.not_found')}</Text></View>;

  // Favorite provider review screen
  if (
    mission.status === 'pending_provider_approval' &&
    mission.assigned_provider_id === user?.id
  ) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Proposition de mission</Text>
          <View style={{ width: 44 }} />
        </View>
        <ProviderMissionReview
          mission={mission}
          onAccept={async () => {
            try {
              await acceptDirectMission(id!);
              await queryClient.invalidateQueries({ queryKey: missionKeys.all });
              Alert.alert('Mission acceptée !', 'Le propriétaire a été notifié. Consultez les détails de la mission.');
              fetchData();
            } catch (e) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
            }
          }}
          onDecline={async () => {
            try {
              await rejectDirectMission(id!);
              await queryClient.invalidateQueries({ queryKey: missionKeys.all });
              Alert.alert('Mission déclinée', 'Le propriétaire a été informé.');
              router.back();
            } catch (e) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
            }
          }}
        />
      </SafeAreaView>
    );
  }

  const isOwner = user?.role === 'owner';
  const isProvider = user?.role === 'provider';
  const statusColor = STATUS_COLORS[mission.status] || STATUS_COLORS.pending;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: MARKETPLACE.cobalt }]} testID="mission-detail-screen" edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.paper} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mission.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={{ backgroundColor: MARKETPLACE.canvas }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={marketStyles.hero}>
        <View style={styles.statusRow}>
          <View style={[styles.pillStrict, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.pillStrictText, { color: statusColor.text }]}>{isProvider && mission.status === 'awaiting_payment' ? t('alpine.clientPayment') : STATUS_LABELS[mission.status] || mission.status}</Text>
          </View>
          <Text style={[styles.cardStrictCategory, { color: MARKETPLACE.heroMuted }]}>{getMissionTypeLabel(mission.mission_type, mission.services).toUpperCase()}</Text>
          {mission.priority === 'urgent' && <Text style={{ ...FONTS.bodySmall, color: COLORS.urgency }}>Urgente · délai à confirmer avec le prestataire</Text>}
          {!!mission.linen_service && <Text style={{ ...FONTS.bodySmall, color: MARKETPLACE.heroMuted }}>Linge : {mission.linen_service}</Text>}
        </View>

        <Text style={marketStyles.heroTitle}>{mission.property_name || getMissionTypeLabel(mission.mission_type, mission.services)}</Text>
        <Text style={marketStyles.heroSubtitle}>{getMissionTypeLabel(mission.mission_type, mission.services)}</Text>
        <View style={{ marginTop: 22 }}><StatusTimeline status={mission.status} /></View>
        </View>
        {['pending', 'pending_provider_approval', 'assigned', 'in_progress', 'awaiting_payment', 'validated', 'paid', 'completed'].includes(mission.status) && <View style={[styles.nextStep, mission.status === 'awaiting_payment' && marketStyles.waiting]}>
          <Text style={styles.nextStepEyebrow}>{t('alpine.nextStep')}</Text>
          <Text style={styles.nextStepText}>{t(mission.status === 'assigned' ? isOwner ? 'alpine.ownerAssigned' : 'alpine.providerAssigned' : mission.status === 'in_progress' ? 'alpine.inProgress' : mission.status === 'awaiting_payment' ? isOwner ? 'alpine.ownerPayment' : 'alpine.providerPayment' : ['pending', 'pending_provider_approval'].includes(mission.status) ? isOwner ? 'alpine.ownerPending' : 'alpine.providerPending' : 'alpine.done')}</Text>
        </View>}

        {/* Info Card */}
        <View style={styles.cardStrict}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={{ width: 40, height: 40, borderRadius: 20, marginRight: SPACING.md }}
            />
            <View>
              <Text style={styles.cardStrictTitle}>{mission.property_name}</Text>
              {mission.property_address && (isOwner || (isProvider && mission.assigned_provider_id === user?.id && !['pending', 'pending_provider_approval'].includes(mission.status))) ? (
                <Text style={styles.providerTextStrict}>{mission.property_address}</Text>
              ) : mission.property_city ? (
                <Text style={styles.providerTextStrict}>{mission.property_city}</Text>
              ) : null}
            </View>
          </View>
          {mission.description && <Text style={[styles.providerTextStrict, { marginBottom: SPACING.lg }]}>{mission.description}</Text>}


          <View style={styles.metaGrid}>
            <MetaItem icon="calendar-outline" label={t('mission.date_time')} value={mission.scheduled_date ? `${new Date(mission.scheduled_date).toLocaleDateString('fr-FR')} à ${new Date(mission.scheduled_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : t('mission.not_planned')} />
            <MetaItem icon="cash-outline" label={t('mission.rate')} value={mission.fixed_rate ? `${mission.fixed_rate}€` : '-'} />
            <MetaItem icon="pricetags-outline" label={t('mission.mode')} value={mission.mode === 'fixed' ? t('mission.mode_fixed') : t('mission.mode_quote')} />
            <MetaItem icon="people-outline" label={t('mission.applications')} value={String(mission.applications_count || 0)} />
          </View>
        </View>

        {/* Mini-carte localisation — provider only */}
        {(() => {
          if (!isProvider) return null;
          const mapLat = mission.property_lat ?? geocodedCoords?.lat ?? null;
          const mapLng = mission.property_lng ?? geocodedCoords?.lng ?? null;
          if (mapLat == null || mapLng == null) return null;
          const isApprox = !mission.property_lat && !!geocodedCoords;
          const isAssignedToMe = mission.assigned_provider_id === user?.id &&
            ['assigned', 'in_progress', 'awaiting_payment'].includes(mission.status);

          const openNavigation = () => {
            const label = encodeURIComponent(mission.property_name || 'Mission');
            const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapLat},${mapLng}&travelmode=driving`;
            const appleUrl = `maps://?daddr=${mapLat},${mapLng}&dirflg=d`;
            if (Platform.OS === 'ios') {
              Alert.alert('Navigation', 'Choisissez votre application de navigation', [
                { text: 'Plans (Apple)', onPress: () => Linking.openURL(appleUrl) },
                { text: 'Google Maps', onPress: () => Linking.openURL(googleUrl) },
                { text: 'Annuler', style: 'cancel' },
              ]);
            } else {
              Linking.openURL(googleUrl);
            }
          };

          return (
            <View style={styles.cardStrict}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={styles.sectionTitle}>Localisation</Text>
                {isApprox && (
                  <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: '#92400E' }}>Zone approximative</Text>
                  </View>
                )}
              </View>
              <View style={{ borderRadius: 16, overflow: 'hidden', height: 160 }}>
                <MapView
                  style={{ flex: 1 }}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={{
                    latitude: mapLat,
                    longitude: mapLng,
                    latitudeDelta: isApprox ? 0.05 : 0.02,
                    longitudeDelta: isApprox ? 0.05 : 0.02,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  toolbarEnabled={false}
                  showsUserLocation={false}
                  showsMyLocationButton={false}
                  showsCompass={false}
                  showsScale={false}
                >
                  <Marker
                    coordinate={{ latitude: mapLat, longitude: mapLng }}
                    pinColor={COLORS.brandPrimary}
                  />
                </MapView>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <Ionicons name="location-outline" size={16} color="#64748B" />
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B', flex: 1 }}>
                  {mission.property_address || mission.property_city || 'Adresse non disponible'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Ionicons name="navigate-outline" size={16} color="#64748B" />
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B' }}>
                  {haversineKm(46.1796, 6.7092, mapLat, mapLng).toFixed(1)} km depuis Morzine centre
                </Text>
              </View>
              {isAssignedToMe && (
                <TouchableOpacity
                  onPress={openNavigation}
                  style={{ marginTop: 12, backgroundColor: COLORS.brandPrimary, borderRadius: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#fff' }}>Me rendre sur cette mission</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* View quote — both roles */}
        {quoteId && (
          <TouchableOpacity
            style={[styles.applyBtnStrict, { backgroundColor: COLORS.background, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: SPACING.lg, marginTop: 0 }]}
            onPress={() => router.push(`/quote/${quoteId}`)}
          >
            <Ionicons name="document-text-outline" size={20} color={COLORS.brandPrimary} />
            <Text style={[styles.applyTextStrict, { color: COLORS.brandPrimary }]}>
              {isOwner ? 'Voir le devis' : 'Voir mon devis'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Chat (Owner view) — only after assignment */}
        {isOwner && mission.assigned_provider_id && !['pending', 'pending_provider_approval', 'cancelled', 'expired'].includes(mission.status) && (
          <MissionContact testID="chat-btn-owner" title={mission.assigned_provider_name || t('alpine.yourProvider')} subtitle={mission.property_name} onPress={() => router.push(`/chat/${id}?type=mission&receiverId=${mission.assigned_provider_id}&title=Discussion+Prestataire`)} />
        )}

        {isProvider && ['assigned', 'in_progress', 'awaiting_payment', 'completed', 'paid'].includes(mission.status) && mission.assigned_provider_id === user?.id && (
          <MissionContact testID="chat-btn-provider" title={t('alpine.yourOwner')} subtitle={mission.property_name} onPress={() => router.push(`/chat/${id}?type=mission&receiverId=${mission.owner_id}&title=Discussion+Propriétaire`)} />
        )}

        {/* Access info for assigned provider */}
        {isProvider && mission.assigned_provider_id === user?.id && !['pending', 'pending_provider_approval'].includes(mission.status) && (mission.access_code || mission.instructions || mission.deposit_location) && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: '#3B82F6' }]}>
            <Text style={styles.sectionTitle}>{t('alpine.beforeLeaving')}</Text>
            {!!mission.access_code && <View style={styles.accessRow}>
              <Ionicons name="key-outline" size={18} color="#3B82F6" />
              <Text style={styles.providerTextStrict}>{t('mission.access_code')} <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: COLORS.textPrimary }}>{mission.access_code}</Text></Text>
            </View>}
            {mission.instructions && (
              <View style={styles.accessRow}>
                <Ionicons name="document-text-outline" size={18} color="#3B82F6" />
                <Text style={styles.providerTextStrict}>{mission.instructions}</Text>
              </View>
            )}
            {mission.deposit_location && (
              <View style={styles.accessRow}>
                <Ionicons name="location-outline" size={18} color="#3B82F6" />
                <Text style={styles.providerTextStrict}>{t('mission.deposit')} {mission.deposit_location}</Text>
              </View>
            )}
          </View>
        )}

        {/* Photos (Proof) — visible on advanced statuses */}
        {['in_progress', 'awaiting_payment', 'validated', 'paid'].includes(mission.status) && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: (mission.photos?.length ?? 0) > 0 ? COLORS.success : COLORS.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
              <Ionicons name="camera-outline" size={20} color={(mission.photos?.length ?? 0) > 0 ? COLORS.success : COLORS.textTertiary} />
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t('mission.photos')} {(mission.photos?.length ?? 0) > 0 ? `(${mission.photos!.length})` : ''}</Text>
            </View>
            {mission.photos && mission.photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.md }}>
                {mission.photos.map((p: MissionPhoto, idx: number) => (
                  <TouchableOpacity key={idx} activeOpacity={0.9}>
                    <Image source={{ uri: p.photo_url }} style={styles.proofImage} />
                    {p.uploaded_at && (
                      <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: COLORS.textTertiary, textAlign: 'center', marginTop: 4 }}>
                        {new Date(p.uploaded_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.md }}>
                <Ionicons name="image-outline" size={24} color={COLORS.textTertiary} />
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: COLORS.textTertiary }}>{t('mission.no_photos')}</Text>
              </View>
            )}
            {isProvider && mission.assigned_provider_id === user?.id && mission.status === 'in_progress' && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.infoSoft, borderRadius: RADIUS.md }}
                onPress={showAddPhotoAlert}
                disabled={uploadingPhotos}
              >
                {uploadingPhotos ? (
                  <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={20} color="#3B82F6" />
                    <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#3B82F6' }}>{t('mission.add_photo')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Mission validated — owner sees payment confirmation */}
        {isOwner && mission.status === 'validated' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.info, backgroundColor: '#EFF6FF' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.info} />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.info }}>Intervention validée</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B' }}>
              Vous avez validé l'intervention. Le paiement est en cours de traitement.
            </Text>
          </View>
        )}

        {/* Mission paid — owner */}
        {isOwner && mission.status === 'paid' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.success, backgroundColor: COLORS.successSoft }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.success }}>Mission terminée</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B' }}>
              {mission.fixed_rate ? `Paiement de ${ownerPrice(mission.fixed_rate).total.toFixed(2)}€ confirmé.` : 'Paiement confirmé.'} Le prestataire a été payé.
            </Text>
          </View>
        )}

        {/* Mission paid — provider */}
        {isProvider && mission.status === 'paid' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.success, backgroundColor: COLORS.successSoft }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.success }}>Mission terminée</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B' }}>
              {mission.fixed_rate ? `Votre paiement de ${priceFromTtc(mission.fixed_rate, providerVatRate(user?.is_vat_exempt)).payout.toFixed(2)}€ net est en cours de traitement.` : 'Votre paiement est en cours de traitement.'} Il sera viré sur votre compte sous 2-3 jours ouvrés.
            </Text>
          </View>
        )}

        {/* Dispute banner */}
        {mission.status === 'dispute' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.urgency, backgroundColor: COLORS.urgencySoft }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="warning" size={24} color={COLORS.urgency} />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.urgency }}>Litige en cours</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B' }}>
              Un litige a été ouvert pour cette mission. Le support Altio va examiner la situation et revenir vers les deux parties.
            </Text>
            {mission.dispute_reason && (
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.urgency, marginTop: SPACING.sm, fontStyle: 'italic' }}>
                Motif : {mission.dispute_reason}
              </Text>
            )}
          </View>
        )}

        {/* Dispute resolved banner */}
        {mission.dispute_resolved_at && mission.status !== 'dispute' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.success, backgroundColor: COLORS.successSoft }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.success }}>Litige résolu</Text>
            </View>
            {mission.dispute_resolution && (
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B' }}>
                {mission.dispute_resolution}
              </Text>
            )}
          </View>
        )}

        {/* Expired banner + republish */}
        {isOwner && mission.status === 'expired' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.warning, backgroundColor: COLORS.warningSoft }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="time-outline" size={24} color={COLORS.warning} />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.warning }}>Mission expirée</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', marginBottom: SPACING.md }}>
              Aucun prestataire n'a accepté cette mission dans le délai imparti.
            </Text>
            <TouchableOpacity
              style={[styles.mainAction, { backgroundColor: COLORS.brandPrimary, marginTop: 0 }]}
              onPress={handleRepublish}
            >
              <Ionicons name="refresh" size={20} color={COLORS.textInverse} />
              <Text style={styles.mainActionText}>Republier la mission</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* R2: Pending provider approval — rassurer le proprio */}
        {isOwner && mission.status === 'pending_provider_approval' && !mission.assigned_provider_id && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.info }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="search-outline" size={20} color={COLORS.info} />
              <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.info }}>En recherche de prestataire</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B' }}>
              Votre mission est visible par les prestataires de votre zone ({mission.zone_radius_km ?? 10} km). {(mission.applications_count ?? 0) > 0 ? `${mission.applications_count} candidature${(mission.applications_count ?? 0) > 1 ? 's' : ''} reçue${(mission.applications_count ?? 0) > 1 ? 's' : ''}.` : 'Vous serez notifié dès qu\'un prestataire postule.'}
            </Text>
            {!mission.assigned_provider_id && (mission.zone_radius_km ?? 10) < 30 && (
              <TouchableOpacity
                testID="expand-zone-btn"
                style={[styles.applyBtnStrict, { marginTop: SPACING.sm, backgroundColor: COLORS.brandPrimary }]}
                onPress={handleExpandZone}
              >
                <Text style={styles.applyTextStrict}>Élargir la zone à 30 km</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Applications (Owner view) */}
        {isOwner && mission.applications && mission.applications.length > 0 && (
          <View style={styles.cardStrict}>
            <Text style={styles.sectionTitle}>{t('alpine.compare')} ({mission.applications.length})</Text>
            {mission.applications.map((app: MissionApplicationEnriched) => (
              <View key={app.id} style={styles.appItem}>
                <View style={styles.appTop}>
                  <TouchableOpacity
                    style={styles.appInfo}
                    onPress={() => router.push(`/provider/${app.provider_id}`)}
                  >
                    <View style={styles.appAvatar}>
                      {app.provider_picture ? <Image source={{ uri: app.provider_picture }} style={styles.appPhoto} /> : <Text style={styles.appAvatarText}>{app.provider_name?.[0] || 'P'}</Text>}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                        <Text style={styles.appName}>{app.provider_name || t('mission.provider_label')}</Text>
                        {app.is_verified && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.infoSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Ionicons name="shield-checkmark" size={10} color={COLORS.brandPrimary} />
                            <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9, color: COLORS.brandPrimary, marginLeft: 3 }}>{t('mission.verified')}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.appRating}>
                        <Ionicons name="star" size={12} color={COLORS.warning} />
                        <Text style={styles.appRatingText}>{app.provider_reviews ? `${app.provider_rating || 0}/5 (${app.provider_reviews} ${t('mission.reviews')})` : t('alpine.providersNew')}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.appRate}>{`${priceFromTtc(Number(app.proposed_rate || 0), providerVatRate(app.provider_is_vat_exempt)).total.toFixed(2)}€ TTC`}</Text>
                </View>
                {app.message && <Text style={styles.appMessage}>{app.message}</Text>}
                {app.status === 'pending' && (
                  <View style={styles.appActions}>
                    <TouchableOpacity testID={`accept-app-${app.id}`} style={styles.acceptBtn} onPress={() => handleAcceptApp(app.id, app.proposed_rate, app.provider_is_vat_exempt)}>
                      <Ionicons name="checkmark" size={18} color={COLORS.textInverse} />
                      <Text style={styles.actionBtnText}>{t('alpine.chooseThisProvider')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectApp(app.id)}>
                      <Ionicons name="close" size={18} color={COLORS.urgency} />
                      <Text style={[styles.actionBtnText, { color: COLORS.urgency }]}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {app.status !== 'pending' && (
                  <View style={[styles.appStatusChip, { backgroundColor: (STATUS_COLORS[app.status] || STATUS_COLORS.pending).bg }]}>
                    <Text style={[styles.appStatusText, { color: (STATUS_COLORS[app.status] || STATUS_COLORS.pending).text }]}>
                      {STATUS_LABELS[app.status] || app.status}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Direct assignment — no application row exists */}
        {isOwner && mission.status === 'pending_provider_approval' && !!mission.assigned_provider_id && (!mission.applications || mission.applications.length === 0) && (
          <View style={styles.cardStrict}>
            <Text style={styles.sectionTitle}>Prestataire assigné</Text>
            <View style={styles.appItem}>
              <View style={styles.appTop}>
                <TouchableOpacity
                  style={styles.appInfo}
                  onPress={() => router.push(`/provider/${mission.assigned_provider_id}`)}
                >
                  <View style={styles.appAvatar}>
                    {mission.assigned_provider_picture ? (
                      <Image source={{ uri: mission.assigned_provider_picture }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    ) : (
                      <Text style={styles.appAvatarText}>{mission.assigned_provider_name?.[0] || 'P'}</Text>
                    )}
                  </View>
                  <View>
                    <Text style={styles.appName}>{mission.assigned_provider_name || 'Prestataire'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 2 }}>
                      <Ionicons name="star" size={11} color={COLORS.warning} />
                      <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: COLORS.textSecondary }}>Assigné directement</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <View style={{ backgroundColor: COLORS.infoSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, color: COLORS.brandPrimary }}>⭐ Favori</Text>
                </View>
              </View>
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.xs }}>
                En attente de confirmation du prestataire
              </Text>
            </View>
          </View>
        )}

        {/* Owner Actions — awaiting_payment / validated (unpaid): Pay OR Dispute */}
        {isOwner && (mission.status === 'awaiting_payment' || mission.status === 'validated') && (
          <View>
            {/* Price recap — owner sees its own Altio fee, never the provider's commission */}
            <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.info, marginBottom: SPACING.md }]}>
              <Text style={styles.sectionTitle}>Récapitulatif</Text>
              <View style={{ gap: SPACING.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: COLORS.textPrimary }}>Total</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.success }}>{ownerPrice(mission.fixed_rate).total.toFixed(2)}€ TTC</Text>
                </View>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#94A3B8' }}>Prestation : {(mission.fixed_rate || 0).toFixed(2)} € TTC · Frais Altio : {ownerPrice(mission.fixed_rate).fee.toFixed(2)} € TTC</Text>
              </View>
            </View>

            {mission.status === 'awaiting_payment' ? (
              <TouchableOpacity
                testID="validate-pay-btn"
                style={[styles.mainAction, { backgroundColor: COLORS.success }]}
                onPress={handleValidateAndPay}
              >
                <Ionicons name="card-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionText}>Valider et payer {ownerPrice(mission.fixed_rate).total.toFixed(2)}€</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                testID="pay-btn"
                style={[styles.mainAction, { backgroundColor: COLORS.success }]}
                onPress={async () => {
                  try {
                    setLoading(true);
                    const ownerTotal = ownerPrice(mission.fixed_rate).total;
                    const { clientSecret, paymentIntentId } = await createPaymentIntent(ownerTotal, { missionId: id }, 'automatic');
                    const { error: initError } = await initPaymentSheet({
                      merchantDisplayName: 'Altio',
                      paymentIntentClientSecret: clientSecret,
                      allowsDelayedPaymentMethods: true,
                    });
                    if (initError) throw new Error(initError.message);
                    const { error: presentError } = await presentPaymentSheet();
                    if (presentError) throw new Error(presentError.message);
                    const invoiceGeneration = await completeMissionPayment(id as string, paymentIntentId);
                    await fetchData();
                    if (invoiceGeneration.failedTypes.length > 0) {
                      Alert.alert(
                        'Paiement confirmé',
                        'Votre paiement a bien été enregistré, mais la facture est temporairement indisponible. Notre équipe a été alertée.'
                      );
                    }
                    setModalRating(0);
                    setModalComment('');
                    setShowRatingModal(true);
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    if (msg !== 'The payment has been canceled' && msg !== 'Canceled') {
                      Alert.alert(t('common.error'), msg);
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <Ionicons name="card-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionText}>Payer {ownerPrice(mission.fixed_rate).total.toFixed(2)}€</Text>
              </TouchableOpacity>
            )}

            {/* A validated mission stays disputable until its payment is confirmed. */}
            {(mission.status === 'awaiting_payment' || (mission.status === 'validated' && !mission.paid_at)) && (
              <TouchableOpacity
                testID="dispute-btn"
                style={[styles.mainAction, { backgroundColor: COLORS.urgency }]}
                onPress={() => { setDisputeReason(''); setShowDisputeModal(true); }}
              >
                <Ionicons name="warning-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionText}>Signaler un problème</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isOwner && ['pending', 'pending_provider_approval', 'assigned'].includes(mission.status) && (
          <View style={{ marginBottom: SPACING.lg }}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showOtherActions }} style={styles.otherActions} onPress={() => setShowOtherActions(!showOtherActions)}><Text style={styles.otherActionsText}>{t('alpine.otherActions')}</Text><Ionicons name={showOtherActions ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textSecondary} /></TouchableOpacity>
            {showOtherActions && <TouchableOpacity testID="cancel-btn" style={styles.otherActions} onPress={handleCancel}><Ionicons name="close-circle-outline" size={20} color={COLORS.urgency} /><Text style={[styles.otherActionsText, { color: COLORS.urgency }]}>{t('alpine.cancelMission')}</Text></TouchableOpacity>}
          </View>
        )}

        {/* Provider Actions */}
        {isProvider && ['pending', 'pending_provider_approval'].includes(mission.status) && !mission.fixed_rate && !mission.applications?.some(app => app.provider_id === user?.id) && <View style={styles.cardStrict}>
          <Text style={{ ...FONTS.h3, color: COLORS.textPrimary }}>Votre proposition pour l’ensemble</Text>
          <Text style={{ ...FONTS.bodySmall, color: COLORS.textSecondary }}>Un tarif total pour {getMissionTypeLabel(mission.mission_type, mission.services).toLocaleLowerCase('fr-FR')}. Les frais Altio seront détaillés au propriétaire.</Text>
          <TextInput accessibilityLabel="Tarif total proposé en euros" testID="application-total-rate" value={proposedRate} onChangeText={setProposedRate} keyboardType="decimal-pad" placeholder="Montant en euros" placeholderTextColor={COLORS.textTertiary} style={{ ...FONTS.body, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.sm }} />
        </View>}
        {isProvider && ['pending', 'pending_provider_approval'].includes(mission.status) && (() => {
          // Direct assignment — owner chose this provider directly (no application)
          if (mission.assigned_provider_id === user?.id && (!mission.applications || mission.applications.length === 0)) {
            return (
              <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.brandPrimary }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                  <Ionicons name="star" size={20} color={COLORS.brandPrimary} />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.brandPrimary }}>
                    Un propriétaire vous a confié cette mission
                  </Text>
                </View>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md }}>
                  Vous avez été sélectionné directement par le propriétaire. Acceptez ou refusez cette mission.
                </Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  <TouchableOpacity
                    style={[styles.acceptBtn, { flex: 1 }]}
                    onPress={async () => {
                      // Fix: acceptDirectMission transitions pending_provider_approval → assigned
                      // handleStart/startMission expected 'assigned' status → silent failure
                      try {
                        await acceptDirectMission(id!);
                        Alert.alert('Mission acceptée !', 'Le propriétaire a été notifié. Vous pouvez démarrer l\'intervention.');
                        fetchData();
                      } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
                    }}
                  >
                    <Ionicons name="checkmark" size={18} color={COLORS.textInverse} />
                    <Text style={styles.actionBtnText}>Accepter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rejectBtn, { flex: 1 }]}
                    onPress={async () => {
                      // Fix: rejectDirectMission transitions pending_provider_approval → rejected
                      // handleCancel/cancelMission checked owner_id → failed for provider
                      try {
                        await rejectDirectMission(id!);
                        Alert.alert('Mission refusée', 'Le propriétaire a été notifié.');
                        fetchData();
                      } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
                    }}
                  >
                    <Ionicons name="close" size={18} color={COLORS.urgency} />
                    <Text style={[styles.actionBtnText, { color: COLORS.urgency }]}>Refuser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          const myApp = mission.applications?.find((a: MissionApplicationEnriched) => a.provider_id === user?.id);
          const isBroadcast = !mission.assigned_provider_id;
          if (myApp) {
            const declined = myApp.status === 'declined';
            const title = declined
              ? 'Indisponibilité enregistrée'
              : isBroadcast
                ? 'Votre disponibilité a été enregistrée'
                : 'Candidature envoyée';
            const subtitle = declined
              ? 'Le propriétaire a été informé que vous n\'êtes pas disponible.'
              : 'Le propriétaire a été notifié. Vous serez averti dès qu\'il aura fait son choix.';
            const color = declined ? COLORS.textSecondary : COLORS.success;
            return (
              <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: color }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Ionicons name={declined ? 'close-circle' : 'checkmark-circle'} size={20} color={color} />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color }}>
                    {title}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.xs }}>
                  {subtitle}
                </Text>
              </View>
            );
          }

          // Check provider profile completeness (SIREN from users table + RC Pro from provider_profiles)
          const hasSiren = !!providerSiren;
          const hasRcPro = !!providerProfile?.rc_pro_doc_url;
          const profileComplete = hasSiren && hasRcPro;

          if (!profileComplete) {
            return (
              <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.warning }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.warning }}>
                    Profil incomplet
                  </Text>
                </View>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.xs }}>
                  Complétez votre SIRET et assurance RC Pro pour pouvoir postuler aux missions.
                </Text>
                <TouchableOpacity
                  style={[styles.applyBtnStrict, { marginTop: SPACING.sm, backgroundColor: COLORS.warning }]}
                  onPress={() => router.push('/(provider)/profile')}
                >
                  <Text style={styles.applyTextStrict}>Compléter mon profil</Text>
                </TouchableOpacity>
              </View>
            );
          }

          if (isBroadcast) {
            return (
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <TouchableOpacity
                  testID="apply-btn"
                  disabled={applying} onPress={handleApply}
                  style={[styles.applyBtnStrict, { flex: 1 }]}
                >
                  <Text style={styles.applyTextStrict}>{t('mission.apply_btn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="decline-broadcast-btn"
                  onPress={handleDeclineBroadcast}
                  style={[styles.applyBtnStrict, { flex: 1, backgroundColor: COLORS.background, borderWidth: 1, borderColor: '#E2E8F0' }]}
                >
                  <Text style={[styles.applyTextStrict, { color: COLORS.textSecondary }]}>Non disponible</Text>
                </TouchableOpacity>
              </View>
            );
          }

          return (
            <TouchableOpacity testID="apply-btn" disabled={applying} onPress={handleApply} style={styles.applyBtnStrict}>
              <Text style={styles.applyTextStrict}>{t('mission.apply_btn')}</Text>
            </TouchableOpacity>
          );
        })()}
        {isProvider && mission.status === 'assigned' && mission.assigned_provider_id === user?.id && (
          <TouchableOpacity testID="start-btn" style={styles.mainAction} onPress={handleStart}>
            <Ionicons name="play" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>Démarrer l'intervention</Text>
          </TouchableOpacity>
        )}
        {isProvider && mission.status === 'in_progress' && mission.assigned_provider_id === user?.id && (
          <TouchableOpacity
            testID="complete-btn"
            style={[styles.mainAction, { backgroundColor: COLORS.success, opacity: uploadingPhotos ? 0.7 : 1 }]}
            onPress={handleComplete}
            disabled={uploadingPhotos}
          >
            {uploadingPhotos ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <>
                <Ionicons name="camera" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionText}>Terminer et envoyer les photos</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {/* Provider: Extra hours or Quote when in_progress */}
        {isProvider && mission.status === 'in_progress' && mission.assigned_provider_id === user?.id && (
          <View>
            <TouchableOpacity
              style={[styles.mainAction, { backgroundColor: COLORS.warning }]}
              onPress={() => { setExtraHoursInput(''); setExtraHoursModal(true); }}
            >
              <Ionicons name="time-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.mainActionText}>{t('mission.overtime_btn')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Add to favorites (owner, mission paid) ── */}
        {isOwner && mission.status === 'paid' && mission.assigned_provider_id && (
          <TouchableOpacity
            style={[styles.mainAction, { backgroundColor: COLORS.warning, marginBottom: SPACING.sm }]}
            onPress={async () => {
              try {
                await addFavoriteProvider(mission.assigned_provider_id!);
                queryClient.invalidateQueries({ queryKey: ['favorite-providers'] });
                Alert.alert(t('mission.favorite_added'), t('mission.favorite_added_msg'));
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes('duplicate') || msg.includes('unique')) {
                  Alert.alert(t('mission.already_favorite'), t('mission.already_favorite_msg'));
                } else {
                  Alert.alert(t('common.error'), msg);
                }
              }
            }}
          >
            <Ionicons name="star-outline" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>{t('mission.add_favorite')}</Text>
          </TouchableOpacity>
        )}

        {/* ── Review section (owner, mission paid) ── */}
        {isOwner && mission.status === 'paid' && mission.assigned_provider_id && existingReview && (
          <View style={styles.cardStrict}>
            <Text style={styles.sectionTitle}>{t('mission.review_title')}</Text>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: SPACING.sm }}>
              {[1,2,3,4,5].map(s => (
                <Ionicons key={s} name={s <= existingReview.rating ? 'star' : 'star-outline'} size={22} color={COLORS.warning} />
              ))}
            </View>
            {existingReview.comment ? (
              <Text style={styles.providerTextStrict}>{existingReview.comment}</Text>
            ) : null}
            <Text style={[styles.providerTextStrict, { color: COLORS.success, marginTop: SPACING.xs }]}>{t('mission.review_sent')}</Text>
          </View>
        )}
      </ScrollView>

      {/* Optional review after a confirmed payment */}
      <Modal visible={showRatingModal} transparent animationType="fade" onRequestClose={() => setShowRatingModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: SPACING.xl }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: SPACING.xl, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.warningSoft || COLORS.coralSoft, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg }}>
              <Ionicons name="star" size={28} color={COLORS.warning} />
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.textPrimary, marginBottom: SPACING.xs, textAlign: 'center' }}>
              {t('mission.rating_modal_title')}
            </Text>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', marginBottom: SPACING.xl, textAlign: 'center' }}>
              {t('mission.rating_modal_subtitle')}
            </Text>

            <TouchableOpacity accessibilityRole="button" onPress={() => setShowRatingModal(false)} style={{ alignSelf: 'flex-end', padding: SPACING.md }}>
              <Text style={{ color: COLORS.textSecondary }}>{t('common.later', { defaultValue: 'Plus tard' })}</Text>
            </TouchableOpacity>
            {/* Stars */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: SPACING.xl }}>
              {[1,2,3,4,5].map(s => (
                <TouchableOpacity key={s} onPress={() => setModalRating(s)} activeOpacity={0.7}>
                  <Ionicons name={s <= modalRating ? 'star' : 'star-outline'} size={38} color={COLORS.warning} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Comment */}
            <TextInput
              style={{
                width: '100%',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 12,
                padding: SPACING.md,
                minHeight: 80,
                textAlignVertical: 'top',
                marginBottom: SPACING.lg,
                fontFamily: 'PlusJakartaSans_400Regular',
                fontSize: 14,
                color: COLORS.textPrimary,
              }}
              placeholder={t('mission.review_placeholder')}
              placeholderTextColor="#94A3B8"
              value={modalComment}
              onChangeText={setModalComment}
              multiline
            />

            {/* Submit button */}
            <TouchableOpacity
              style={{
                width: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: SPACING.sm,
                backgroundColor: modalRating > 0 ? COLORS.brandPrimary : COLORS.border,
                paddingVertical: 14,
                borderRadius: 12,
                opacity: submittingReview ? 0.6 : 1,
              }}
              disabled={modalRating === 0 || submittingReview}
              onPress={async () => {
                setSubmittingReview(true);
                try {
                  const review = await submitReview({
                    missionId: id!,
                    providerId: mission.assigned_provider_id!,
                    rating: modalRating,
                    comment: modalComment.trim() || undefined,
                  });
                  setExistingReview(review);
                  setShowRatingModal(false);
                  Alert.alert(t('mission.review_thanks'), t('mission.review_thanks_msg'));
                } catch (e) {
                  Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
                } finally {
                  setSubmittingReview(false);
                }
              }}
            >
              {submittingReview ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="star" size={20} color="#fff" />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#fff' }}>
                    {t('mission.rating_modal_submit')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {modalRating === 0 && (
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#94A3B8', marginTop: SPACING.sm, textAlign: 'center' }}>
                {t('mission.rating_modal_mandatory')}
              </Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Extra hours modal — cross-platform (Alert.prompt is iOS-only) */}
      <Modal visible={extraHoursModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: SPACING.xl }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: SPACING.xl }}>
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
              {t('mission.overtime_title')}
            </Text>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', marginBottom: SPACING.md }}>
              {t('mission.overtime_msg')}
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: SPACING.md, fontSize: 16, marginBottom: SPACING.lg, color: COLORS.textPrimary }}
              keyboardType="numeric"
              value={extraHoursInput}
              onChangeText={setExtraHoursInput}
              placeholder={t('mission.overtime_placeholder')}
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}
                onPress={() => setExtraHoursModal(false)}
              >
                <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: '#64748B' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.brandPrimary, alignItems: 'center' }}
                onPress={async () => {
                  const hours = extraHoursInput;
                  if (!hours || isNaN(Number(hours))) return;
                  const extraCost = Number(hours) * (mission.fixed_rate || 30);
                  setExtraHoursModal(false);
                  try {
                    await addMissionExtraHours(id as string, (mission.fixed_rate || 0) + extraCost);
                    Alert.alert(t('mission.success'), t('mission.overtime_success', { hours, cost: extraCost }));
                    fetchData();
                  } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
                }}
              >
                <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: '#fff' }}>{t('common.send')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Dispute modal */}
      <Modal visible={showDisputeModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: SPACING.xl }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: SPACING.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.urgencySoft, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="warning" size={22} color={COLORS.urgency} />
              </View>
              <View>
                <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: COLORS.textPrimary }}>Signaler un problème</Text>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#64748B' }}>Décrivez le problème rencontré</Text>
              </View>
            </View>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: SPACING.md, minHeight: 100, textAlignVertical: 'top', marginBottom: SPACING.lg, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: COLORS.textPrimary }}
              placeholder="Ex : Le travail n'a pas été réalisé correctement, pièce endommagée..."
              placeholderTextColor="#94A3B8"
              value={disputeReason}
              onChangeText={setDisputeReason}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}
                onPress={() => setShowDisputeModal(false)}
              >
                <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: '#64748B' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.urgency, alignItems: 'center', opacity: !disputeReason.trim() || submittingDispute ? 0.5 : 1 }}
                onPress={handleOpenDispute}
                disabled={!disputeReason.trim() || submittingDispute}
              >
                {submittingDispute ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: '#fff' }}>Ouvrir le litige</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MetaItem({ icon, label, value }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={miStyles.item}>
      <Ionicons name={icon} size={16} color={COLORS.textTertiary} />
      <Text style={miStyles.label}>{label}</Text>
      <Text style={miStyles.value}>{value}</Text>
    </View>
  );
}

function StatusTimeline({ status }: { status: string }) {
  const { t } = useTranslation();
  const index = ['pending', 'pending_provider_approval'].includes(status) ? 0 : status === 'assigned' ? 1 : status === 'in_progress' ? 2 : 3;
  if (!['pending', 'pending_provider_approval', 'assigned', 'in_progress', 'awaiting_payment', 'validated', 'paid', 'completed'].includes(status)) return null;
  return <View style={tlStyles.container}>{['requestStep', 'confirmedStep', 'serviceStep', 'finalStep'].map((key, i) => <View key={key} style={tlStyles.step}><View style={[tlStyles.line, i <= index && tlStyles.lineActive]} /><Text style={[tlStyles.label, i === index && tlStyles.activeLabel]}>{t(`alpine.${key}`)}</Text></View>)}</View>;
}
const tlStyles = StyleSheet.create({
  container: { flexDirection: 'row', gap: SPACING.sm },
  step: { flex: 1 },
  line: { height: 3, borderRadius: RADIUS.full, backgroundColor: '#7395E6', marginBottom: SPACING.sm },
  lineActive: { backgroundColor: COLORS.paper },
  label: { ...FONTS.bodySmall, fontSize: 11, color: MARKETPLACE.heroMuted },
  activeLabel: { color: COLORS.paper, fontFamily: FONTS.h2.fontFamily },
});

const miStyles = StyleSheet.create({
  item: { width: '48%', flexDirection: 'column', gap: 2, paddingVertical: SPACING.sm },
  label: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 9 },
  value: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
});

const styles = StyleSheet.create({
  nextStep: { backgroundColor: COLORS.paper, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  nextStepEyebrow: { ...FONTS.caption, fontSize: 10, color: COLORS.brandPrimary, marginBottom: SPACING.sm },
  nextStepText: { ...FONTS.bodySmall, color: COLORS.textPrimary },
  otherActions: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  otherActionsText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  appPhoto: { width: 44, height: 44, borderRadius: RADIUS.full },
  container: { flex: 1, backgroundColor: MARKETPLACE.canvas },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    backgroundColor: MARKETPLACE.cobalt,
  },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.paper },

  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl, paddingTop: 0 },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg, paddingHorizontal: 4 },

  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: COLORS.textPrimary, marginBottom: SPACING.md },

  cardStrict: { backgroundColor: '#FFFFFF', padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: COLORS.border },
  pillStrict: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  pillStrictText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  cardStrictCategory: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: '#94A3B8', letterSpacing: 0.5 },
  cardStrictTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: COLORS.textPrimary, marginBottom: 4 },
  providerTextStrict: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', lineHeight: 22 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md, borderRadius: 16, backgroundColor: MARKETPLACE.ice, padding: SPACING.md },

  accessRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },

  appItem: { padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, marginBottom: SPACING.md, backgroundColor: COLORS.background },
  appTop: { gap: SPACING.md },
  appInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 48 },
  appAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  appAvatarText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, color: '#3B82F6' },
  appName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
  appRating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  appRatingText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#64748B' },
  appRate: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.success },
  appMessage: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B', marginTop: SPACING.sm, fontStyle: 'italic' },

  appActions: { flexDirection: 'column', gap: SPACING.sm, marginTop: SPACING.md },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, minHeight: 48, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.md, borderRadius: 12 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EF4444', paddingVertical: 12, borderRadius: 12 },
  actionBtnText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#FFFFFF' },

  appStatusChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, marginTop: SPACING.sm },
  appStatusText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11 },

  applyBtnStrict: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#3B82F6', minHeight: 52, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, marginTop: SPACING.md },
  applyTextStrict: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FFFFFF', fontSize: 15 },

  mainAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, minHeight: 52, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, marginTop: SPACING.md },
  mainActionText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#FFFFFF' },

  proofImage: { width: 120, height: 120, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: '#E2E8F0' },
});
