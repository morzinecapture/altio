import React, { useState, useEffect, ComponentProps } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, AlertButton, Image, Platform, TextInput, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getMission, handleApplication, startMission, completeMission, applyToMission, uploadMissionPhoto, addMissionPhoto, createPaymentIntent, addFavoriteProvider, completeMissionPayment, addMissionExtraHours, submitReview, getMissionReview, cancelMission, validateMission, openDispute, republishMission, getProfile } from '../../src/api';
import * as ImagePicker from 'expo-image-picker';
import { useStripe } from '@stripe/stripe-react-native';
import { useTranslation } from 'react-i18next';
import { ownerMultiplier, providerMultiplier } from '../../src/config/billing';
import type { MergedMission, MissionApplicationEnriched, MissionPhoto, Review, ProviderProfile } from '../../src/types/api';

export default function MissionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [mission, setMission] = useState<MergedMission | null>(null);
  const [loading, setLoading] = useState(true);
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
      setExistingReview(review);
      if (profileData?.provider_profile) {
        const pp = Array.isArray(profileData.provider_profile) ? profileData.provider_profile[0] : profileData.provider_profile;
        setProviderProfile(pp);
      }
      // Auto-trigger rating modal if mission paid but no review yet (owner only)
      if (data && data.status === 'paid' && !review && user?.role === 'owner') {
        setModalRating(0);
        setModalComment('');
        setShowRatingModal(true);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAcceptApp = async (appId: string) => {
    try {
      await handleApplication(id!, appId, 'accept');
      Alert.alert('Prestataire confirmé !', 'Il a été notifié et connaît les détails de la mission.');
      fetchData();
    } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  const handleRejectApp = async (appId: string) => {
    try {
      await handleApplication(id!, appId, 'reject');
      fetchData();
    } catch (e) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  const handleApply = async () => {
    try {
      console.log('APPLY: calling applyToMission', { missionId: id, proposed_rate: mission?.fixed_rate });
      await applyToMission(id!, { proposed_rate: mission?.fixed_rate, message: 'Disponible' });
      Alert.alert('Candidature envoyée !', 'Le propriétaire va examiner votre profil. Vous serez notifié dès qu\'il aura fait son choix.');
      fetchData();
    } catch (e) {
      console.log('APPLY ERROR:', e);
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
    const ownerTotal = Math.round(rate * ownerMultiplier);
    const totalTTC = Math.round(ownerTotal * 1.20 * 100) / 100;

    Alert.alert(
      'Valider et payer',
      `Total : ${ownerTotal.toFixed(2)} € HT (${totalTTC.toFixed(2)} € TTC)\n` +
      `Frais de service inclus.\n\n` +
      `En validant, vous confirmez la bonne exécution de la prestation. ` +
      `Conformément à l'art. L221-28 du Code de la consommation, ` +
      `vous renoncez à votre droit de rétractation pour cette prestation pleinement exécutée.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: `Payer ${ownerTotal}€`,
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
              await completeMissionPayment(id as string, paymentIntentId);
              await fetchData();
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
    // R7: Photos obligatoires — si des photos existent déjà, on peut compléter directement
    const hasExistingPhotos = mission?.photos && mission.photos.length > 0;

    if (hasExistingPhotos) {
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

  const isOwner = user?.role === 'owner';
  const isProvider = user?.role === 'provider';
  const statusColor = STATUS_COLORS[mission.status] || STATUS_COLORS.pending;

  return (
    <SafeAreaView style={styles.container} testID="mission-detail-screen" edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1E3A5F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mission.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Mission Progress Timeline */}
      {!['cancelled', 'rejected', 'refunded', 'expired', 'dispute'].includes(mission.status) && (
        <StatusTimeline status={mission.status} />
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Status */}
        <View style={styles.statusRow}>
          <View style={[styles.pillStrict, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.pillStrictText, { color: statusColor.text }]}>{STATUS_LABELS[mission.status] || mission.status}</Text>
          </View>
          <Text style={styles.cardStrictCategory}>{(MISSION_TYPE_LABELS[mission.mission_type] || mission.mission_type).toUpperCase()}</Text>
        </View>

        {/* Info Card */}
        <View style={styles.cardStrict}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
            <Image
              source={{ uri: `https://ui-avatars.com/api/?name=${mission.property_name?.replace(/\s/g, '+') || 'Prop'}&background=1E3A5F&color=fff&size=200&font-size=0.4` }}
              style={{ width: 40, height: 40, borderRadius: 20, marginRight: SPACING.md }}
            />
            <View>
              <Text style={styles.cardStrictTitle}>{mission.property_name}</Text>
              {mission.property_address && (isOwner || (isProvider && mission.assigned_provider_id === user?.id && !['pending'].includes(mission.status))) ? (
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

        {/* Chat (Owner view) — only after assignment */}
        {isOwner && mission.assigned_provider_id && !['pending', 'cancelled', 'expired'].includes(mission.status) && (
          <TouchableOpacity testID="chat-btn-owner" style={[styles.applyBtnStrict, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: SPACING.lg, marginTop: 0 }]} onPress={() => router.push(`/chat/${id}?type=mission&receiverId=${mission.assigned_provider_id}&title=Discussion+Prestataire`)}>
            <Ionicons name="chatbubbles-outline" size={20} color="#3B82F6" />
            <Text style={[styles.applyTextStrict, { color: '#3B82F6' }]}>{t('mission.discuss_provider')}</Text>
          </TouchableOpacity>
        )}

        {/* Access info for assigned provider */}
        {isProvider && mission.assigned_provider_id === user?.id && mission.access_code && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: '#3B82F6' }]}>
            <Text style={styles.sectionTitle}>{t('mission.access_info')}</Text>
            <View style={styles.accessRow}>
              <Ionicons name="key-outline" size={18} color="#3B82F6" />
              <Text style={styles.providerTextStrict}>{t('mission.access_code')} <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: '#1E3A5F' }}>{mission.access_code}</Text></Text>
            </View>
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
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.success, backgroundColor: '#F0FDF4' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.success }}>Mission terminée</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B' }}>
              {mission.fixed_rate ? `Paiement de ${Math.round(mission.fixed_rate * ownerMultiplier)}€ confirmé.` : 'Paiement confirmé.'} Le prestataire a été payé.
            </Text>
          </View>
        )}

        {/* Mission paid — provider */}
        {isProvider && mission.status === 'paid' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.success, backgroundColor: '#F0FDF4' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.success }}>Mission terminée</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B' }}>
              {mission.fixed_rate ? `Votre paiement de ${Math.round(mission.fixed_rate * providerMultiplier)}€ net est en cours de traitement.` : 'Votre paiement est en cours de traitement.'} Il sera viré sur votre compte sous 2-3 jours ouvrés.
            </Text>
          </View>
        )}

        {/* Dispute banner */}
        {mission.status === 'dispute' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.urgency, backgroundColor: '#FEF2F2' }]}>
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
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.success, backgroundColor: '#F0FDF4' }]}>
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
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.warning, backgroundColor: '#FFFBEB' }]}>
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
        {isOwner && mission.status === 'pending_provider_approval' && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.info }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <Ionicons name="search-outline" size={20} color={COLORS.info} />
              <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.info }}>En recherche de prestataire</Text>
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B' }}>
              Votre mission est visible par les prestataires de votre zone. {(mission.applications_count ?? 0) > 0 ? `${mission.applications_count} candidature${(mission.applications_count ?? 0) > 1 ? 's' : ''} reçue${(mission.applications_count ?? 0) > 1 ? 's' : ''}.` : 'Vous serez notifié dès qu\'un prestataire postule.'}
            </Text>
          </View>
        )}

        {/* Applications (Owner view) */}
        {isOwner && mission.applications && mission.applications.length > 0 && (
          <View style={styles.cardStrict}>
            <Text style={styles.sectionTitle}>{t('mission.applications')} ({mission.applications.length})</Text>
            {mission.applications.map((app: MissionApplicationEnriched) => (
              <View key={app.id} style={styles.appItem}>
                <View style={styles.appTop}>
                  <TouchableOpacity
                    style={styles.appInfo}
                    onPress={() => router.push(`/provider/${app.provider_id}`)}
                  >
                    <View style={styles.appAvatar}>
                      <Text style={styles.appAvatarText}>{app.provider_name?.[0] || 'P'}</Text>
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
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
                        <Text style={styles.appRatingText}>{app.provider_rating || 0}/5 ({app.provider_reviews || 0} {t('mission.reviews')})</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.appRate}>{app.proposed_rate}€</Text>
                </View>
                {app.message && <Text style={styles.appMessage}>{app.message}</Text>}
                {app.status === 'pending' && (
                  <View style={styles.appActions}>
                    <TouchableOpacity testID={`accept-app-${app.id}`} style={styles.acceptBtn} onPress={() => handleAcceptApp(app.id)}>
                      <Ionicons name="checkmark" size={18} color={COLORS.textInverse} />
                      <Text style={styles.actionBtnText}>Choisir {app.provider_name?.split(' ')[0] || ''}</Text>
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

        {/* Owner Actions — awaiting_payment: Validate & Pay OR Dispute */}
        {isOwner && (mission.status === 'awaiting_payment' || mission.status === 'validated') && (
          <View>
            {/* Price recap — all-inclusive, no fee breakdown (opacity rule) */}
            <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.info, marginBottom: SPACING.md }]}>
              <Text style={styles.sectionTitle}>Récapitulatif</Text>
              <View style={{ gap: SPACING.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#1E3A5F' }}>Total</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.success }}>{Math.round((mission.fixed_rate || 0) * ownerMultiplier)}€ HT</Text>
                </View>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#94A3B8' }}>Frais de service inclus</Text>
              </View>
            </View>

            {mission.status === 'awaiting_payment' ? (
              <TouchableOpacity
                testID="validate-pay-btn"
                style={[styles.mainAction, { backgroundColor: COLORS.success }]}
                onPress={handleValidateAndPay}
              >
                <Ionicons name="card-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionText}>Valider et payer {Math.round((mission.fixed_rate || 0) * ownerMultiplier)}€</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                testID="pay-btn"
                style={[styles.mainAction, { backgroundColor: COLORS.success }]}
                onPress={async () => {
                  try {
                    setLoading(true);
                    const ownerTotal = Math.round((mission.fixed_rate || 0) * ownerMultiplier);
                    const { clientSecret, paymentIntentId } = await createPaymentIntent(ownerTotal, { missionId: id }, 'automatic');
                    const { error: initError } = await initPaymentSheet({
                      merchantDisplayName: 'Altio',
                      paymentIntentClientSecret: clientSecret,
                      allowsDelayedPaymentMethods: true,
                    });
                    if (initError) throw new Error(initError.message);
                    const { error: presentError } = await presentPaymentSheet();
                    if (presentError) throw new Error(presentError.message);
                    await completeMissionPayment(id as string, paymentIntentId);
                    await fetchData();
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
                <Text style={styles.mainActionText}>Payer {Math.round((mission.fixed_rate || 0) * ownerMultiplier)}€</Text>
              </TouchableOpacity>
            )}

            {mission.status === 'awaiting_payment' && (
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

        {/* Owner: Cancel button (pending or assigned) */}
        {isOwner && ['pending', 'assigned'].includes(mission.status) && (
          <TouchableOpacity
            testID="cancel-btn"
            style={[styles.mainAction, { backgroundColor: COLORS.urgency }]}
            onPress={handleCancel}
          >
            <Ionicons name="close-circle" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>Annuler la mission</Text>
          </TouchableOpacity>
        )}

        {/* Provider Actions */}
        {isProvider && mission.status === 'pending_provider_approval' && (() => {
          const myApp = mission.applications?.find((a: MissionApplicationEnriched) => a.provider_id === user?.id);
          if (myApp) {
            return (
              <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.success }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.success }}>
                    Candidature envoyée
                  </Text>
                </View>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.xs }}>
                  Le propriétaire examinera votre profil. Vous serez notifié de sa décision.
                </Text>
              </View>
            );
          }

          // Check provider document verification status
          const hasSiret = !!providerProfile?.siret;
          const hasRcPro = !!providerProfile?.rc_pro_verified;
          const hasDecennale = !!providerProfile?.decennale_verified;
          const isVerified = !!providerProfile?.verified;
          const allDocsReady = hasSiret && hasRcPro && hasDecennale && isVerified;
          const docsPending = hasSiret && (providerProfile?.documents?.some((d) => d.status === 'pending'));

          if (!allDocsReady) {
            return (
              <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: COLORS.warning }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                  <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.warning }}>
                    {docsPending ? 'Documents en cours de vérification' : 'Profil incomplet'}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.xs }}>
                  {docsPending
                    ? 'Vos documents sont en cours de vérification par notre équipe. Vous pourrez postuler dès leur validation.'
                    : 'Complétez votre profil (SIRET, RC Pro, assurance décennale) pour pouvoir postuler aux missions.'}
                </Text>
                {!docsPending && (
                  <TouchableOpacity
                    style={[styles.applyBtnStrict, { marginTop: SPACING.sm, backgroundColor: COLORS.warning }]}
                    onPress={() => router.push('/(provider)/profile')}
                  >
                    <Text style={styles.applyTextStrict}>Compléter mon profil</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }

          return (
            <TouchableOpacity testID="apply-btn" onPress={handleApply} style={styles.applyBtnStrict}>
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

        {isProvider && (mission.status === 'assigned' || mission.status === 'in_progress') && mission.assigned_provider_id === user?.id && (
          <TouchableOpacity testID="chat-btn-provider" style={[styles.mainAction, { backgroundColor: COLORS.info }]} onPress={() => router.push(`/chat/${id}?type=mission&receiverId=${mission.owner_id}&title=Discussion+Propriétaire`)}>
            <Ionicons name="chatbubbles-outline" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>{t('mission.discuss_owner')}</Text>
          </TouchableOpacity>
        )}

        {/* ── Add to favorites (owner, mission paid) ── */}
        {isOwner && mission.status === 'paid' && mission.assigned_provider_id && (
          <TouchableOpacity
            style={[styles.mainAction, { backgroundColor: COLORS.warning, marginBottom: SPACING.sm }]}
            onPress={async () => {
              try {
                await addFavoriteProvider(mission.assigned_provider_id!);
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

      {/* Mandatory rating modal — appears after payment or on completed mission without review */}
      <Modal visible={showRatingModal} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: SPACING.xl }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: SPACING.xl, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.warningSoft || '#FFF7ED', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg }}>
              <Ionicons name="star" size={28} color={COLORS.warning} />
            </View>
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F', marginBottom: SPACING.xs, textAlign: 'center' }}>
              {t('mission.rating_modal_title')}
            </Text>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', marginBottom: SPACING.xl, textAlign: 'center' }}>
              {t('mission.rating_modal_subtitle')}
            </Text>

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
                color: '#1E3A5F',
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
                backgroundColor: modalRating > 0 ? '#1E3A5F' : '#CBD5E1',
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
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#1E3A5F', marginBottom: SPACING.md }}>
              {t('mission.overtime_title')}
            </Text>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', marginBottom: SPACING.md }}>
              {t('mission.overtime_msg')}
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: SPACING.md, fontSize: 16, marginBottom: SPACING.lg, color: '#1E3A5F' }}
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
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#1E3A5F', alignItems: 'center' }}
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
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="warning" size={22} color={COLORS.urgency} />
              </View>
              <View>
                <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#1E3A5F' }}>Signaler un problème</Text>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#64748B' }}>Décrivez le problème rencontré</Text>
              </View>
            </View>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: SPACING.md, minHeight: 100, textAlignVertical: 'top', marginBottom: SPACING.lg, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#1E3A5F' }}
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

const MISSION_STEP_KEYS = [
  { key: 'pending', label: 'Publiée' },
  { key: 'assigned', label: 'Confirmé' },
  { key: 'in_progress', label: 'En cours' },
  { key: 'awaiting_payment', label: 'Terminée' },
  { key: 'validated', label: 'Validée' },
  { key: 'paid', label: 'Payée' },
];

function StatusTimeline({ status }: { status: string }) {
  const steps = MISSION_STEP_KEYS;
  const currentIdx = steps.findIndex(s => s.key === status);
  const effectiveIdx = currentIdx === -1 ? 0 : currentIdx;

  return (
    <View style={tlStyles.container}>
      {steps.map((step, i) => {
        const isDone = i <= effectiveIdx;
        const isLast = i === steps.length - 1;
        return (
          <React.Fragment key={step.key}>
            <View style={tlStyles.stepCol}>
              <View style={[tlStyles.dot, isDone && tlStyles.dotDone]}>
                {isDone
                  ? <Ionicons name="checkmark" size={14} color="#fff" />
                  : <View style={tlStyles.dotInner} />
                }
              </View>
              <Text style={[tlStyles.label, isDone && tlStyles.labelDone]}>{step.label}</Text>
            </View>
            {!isLast && (
              <View style={[tlStyles.line, i < effectiveIdx && tlStyles.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const tlStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.paper,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  stepCol: { alignItems: 'center', minWidth: 52 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotDone: { backgroundColor: COLORS.brandPrimary },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textTertiary },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
    textAlign: 'center',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  labelDone: { color: COLORS.brandPrimary },
  line: { flex: 1, height: 2, backgroundColor: COLORS.border, marginBottom: 18 },
  lineDone: { backgroundColor: COLORS.brandPrimary },
});

const miStyles = StyleSheet.create({
  item: { width: '48%', flexDirection: 'column', gap: 2, paddingVertical: SPACING.sm },
  label: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 9 },
  value: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F' },

  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl, paddingTop: SPACING.lg },

  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg, paddingHorizontal: 4 },

  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#1E3A5F', marginBottom: SPACING.md },

  cardStrict: { backgroundColor: '#FFFFFF', padding: SPACING.xl, borderRadius: 16, marginBottom: SPACING.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9' },
  pillStrict: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  pillStrictText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  cardStrictCategory: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: '#94A3B8', letterSpacing: 0.5 },
  cardStrictTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#1E3A5F', marginBottom: 4 },
  providerTextStrict: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: '#64748B', lineHeight: 22 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.md, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: SPACING.md },

  accessRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },

  appItem: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  appTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  appAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  appAvatarText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, color: '#3B82F6' },
  appName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#1E3A5F' },
  appRating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  appRatingText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: '#64748B' },
  appRate: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#16A34A' },
  appMessage: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: '#64748B', marginTop: SPACING.sm, fontStyle: 'italic' },

  appActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 12 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EF4444', paddingVertical: 12, borderRadius: 12 },
  actionBtnText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#FFFFFF' },

  appStatusChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, marginTop: SPACING.sm },
  appStatusText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11 },

  applyBtnStrict: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#3B82F6', paddingVertical: 14, borderRadius: 12, marginTop: SPACING.md },
  applyTextStrict: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FFFFFF', fontSize: 15 },

  mainAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#1E3A5F', paddingVertical: 14, borderRadius: 12, marginTop: SPACING.md },
  mainActionText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#FFFFFF' },

  proofImage: { width: 120, height: 120, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
});
