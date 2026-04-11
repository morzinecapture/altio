import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Modal as RNModal, Linking
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../src/theme';
import { getServiceTypeLabel } from '../src/utils/serviceLabels';
import { useStripe } from '@stripe/stripe-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../src/auth';
import {
  createEmergency, getEmergency, getProperties,
  submitEmergencyBid, acceptEmergencyBid, rejectEmergencyBid,
  markEmergencyArrived,
  acceptEmergencyQuote, refuseEmergencyQuote,
  completeEmergency, completeEmergencyWithCapture, createPaymentIntent,
  cancelEmergency,
} from '../src/api';
import { submitReview, getMissionReview } from '../src/api/reviews';
import { addFavoriteProvider, removeFavoriteProvider, getFavoriteProviders } from '../src/api/partners';
import { supabase } from '../src/lib/supabase';
import { useTranslation } from 'react-i18next';
import { PLATFORM_FEE_RATE, ownerMultiplier, providerMultiplier } from '../src/config/billing';
import type { EmergencyRequest, EmergencyBidEnriched, Property, QuoteLineItem } from '../src/types/api';
import type { ComponentProps } from 'react';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface EmergencyBidWithBadges extends EmergencyBidEnriched {
  _badges: string[];
}

const SERVICE_TYPES = [
  { id: 'plumbing', icon: 'water-outline', labelKey: 'emergency.type_plumbing' },
  { id: 'electrical', icon: 'flash-outline', labelKey: 'emergency.type_electrical' },
  { id: 'locksmith', icon: 'key-outline', labelKey: 'emergency.type_locksmith' },
  { id: 'jacuzzi', icon: 'water-outline', labelKey: 'emergency.type_jacuzzi' },
  { id: 'repair', icon: 'construct-outline', labelKey: 'emergency.type_repair' },
];

const STATUS_FLOW: Record<string, { labelKey: string; color: string; icon: string }> = {
  bids_open: { labelKey: 'emergency.status_open', color: COLORS.warning, icon: 'time-outline' },
  bid_accepted: { labelKey: 'emergency.status_on_way', color: COLORS.info, icon: 'car-outline' },
  provider_accepted: { labelKey: 'emergency.status_on_way', color: COLORS.info, icon: 'car-outline' },
  displacement_paid: { labelKey: 'emergency.status_on_way', color: COLORS.info, icon: 'car-outline' },
  on_site: { labelKey: 'emergency.status_on_site', color: COLORS.brandPrimary, icon: 'person-outline' },
  quote_submitted: { labelKey: 'emergency.status_quote', color: COLORS.warning, icon: 'document-text-outline' },
  quote_sent: { labelKey: 'emergency.status_quote', color: COLORS.warning, icon: 'document-text-outline' },
  quote_accepted: { labelKey: 'emergency.status_works', color: COLORS.info, icon: 'construct-outline' },
  quote_paid: { labelKey: 'emergency.status_works', color: COLORS.info, icon: 'construct-outline' },
  in_progress: { labelKey: 'emergency.status_works', color: COLORS.info, icon: 'construct-outline' },
  quote_refused: { labelKey: 'emergency.status_refused', color: COLORS.urgency, icon: 'close-circle-outline' },
  completed: { labelKey: 'emergency.status_done', color: COLORS.success, icon: 'checkmark-circle-outline' },
  cancelled: { labelKey: 'emergency.status_cancelled', color: '#94A3B8', icon: 'close-circle-outline' },
};

const ARRIVAL_OPTIONS = [
  { labelKey: 'emergency.arrival_30', minutes: 30 },
  { labelKey: 'emergency.arrival_1h', minutes: 60 },
  { labelKey: 'emergency.arrival_1h30', minutes: 90 },
  { labelKey: 'emergency.arrival_2h', minutes: 120 },
];

export default function EmergencyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isOwner = user?.role === 'owner';
  const emergencyId = params.id as string | undefined;

  const [emergency, setEmergency] = useState<EmergencyRequest | null>(null);
  const [loading, setLoading] = useState(!!emergencyId);
  const [properties, setProperties] = useState<Property[]>([]);

  // Create form
  const [selectedProp, setSelectedProp] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Provider bid form
  const [travelCost, setTravelCost] = useState('');
  const [diagnosticCost, setDiagnosticCost] = useState('');
  const [selectedArrival, setSelectedArrival] = useState<number | null>(null);
  const [arrivalMode, setArrivalMode] = useState<'quick' | 'scheduled'>('quick');
  const [scheduledArrivalDate, setScheduledArrivalDate] = useState('');
  const [scheduledArrivalTime, setScheduledArrivalTime] = useState('');

  // Provider quote form

  // Review & favorites (completed state)
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  // Photo viewer (detail view)
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  // Timer
  const [timeLeft, setTimeLeft] = useState('');

  // Guard: show "Vous avez été choisi" alert only once per session
  const [hasShownSelectedAlert, setHasShownSelectedAlert] = useState(false);

  // Stripe
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  useEffect(() => {
    if (emergencyId) fetchEmergency();
    else if (isOwner) fetchProperties();
  }, [emergencyId]);

  useFocusEffect(useCallback(() => {
    if (emergencyId) fetchEmergency();
  }, [emergencyId]));

  // Realtime: auto-refresh when bids arrive or status changes
  useEffect(() => {
    if (!emergencyId) return;
    const channel = supabase
      .channel(`emergency:${emergencyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'emergency_bids',
        filter: `emergency_request_id=eq.${emergencyId}`,
      }, () => { fetchEmergency(); })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'emergency_requests',
        filter: `id=eq.${emergencyId}`,
      }, () => { fetchEmergency(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [emergencyId]);

  // Countdown timer
  useEffect(() => {
    if (!emergency?.response_deadline) return;
    const interval = setInterval(() => {
      const diff = new Date(emergency.response_deadline!).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft(t('emergency.expired')); clearInterval(interval); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [emergency?.response_deadline]);

  // Default bid form to scheduled mode for planned interventions
  useEffect(() => {
    if (!emergency?.scheduled_date) return;
    setArrivalMode('scheduled');
    const d = new Date(emergency.scheduled_date);
    setScheduledArrivalDate(d.toISOString().split('T')[0]);
    setScheduledArrivalTime(d.toTimeString().slice(0, 5));
  }, [emergency?.scheduled_date]);

  // Load existing review & favorite status when completed
  useEffect(() => {
    if (!emergencyId || !emergency || emergency.status !== 'completed' || !isOwner) return;
    const providerId = emergency.accepted_provider_id;
    if (!providerId) return;
    (async () => {
      try {
        const existingReview = await getMissionReview(undefined, emergencyId);
        if (existingReview) {
          setReviewSubmitted(true);
          setReviewRating(existingReview.rating);
        }
      } catch (_) { /* ignore */ }
      try {
        const favs = await getFavoriteProviders();
        setIsFavorite(favs.some((f: { provider_id: string }) => f.provider_id === providerId));
      } catch (_) { /* ignore */ }
    })();
  }, [emergencyId, emergency?.status, emergency?.accepted_provider_id]);

  // Show "Vous avez été choisi" alert exactly once when the owner selects this provider
  useEffect(() => {
    if (!emergency || isOwner) return;
    if (
      emergency.accepted_provider_id === user?.id &&
      emergency.status === 'bid_accepted' &&
      !hasShownSelectedAlert
    ) {
      setHasShownSelectedAlert(true);
      Alert.alert(
        t('emergency.selected_title'),
        t('emergency.selected_msg')
      );
    }
  }, [emergency?.accepted_provider_id, emergency?.status]);

  const fetchEmergency = async () => {
    try {
      const data = await getEmergency(emergencyId!);
      setEmergency(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchProperties = async () => {
    try {
      const p = await getProperties();
      setProperties(p);
      if (p.length > 0) setSelectedProp(p[0].id);
    } catch (e) { console.error(e); }
  };

  // ===== PHOTO PICKER =====
  const handlePickPhotos = async () => {
    if (photos.length >= 3) {
      Alert.alert(t('common.error'), 'Vous pouvez ajouter 3 photos maximum.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 3 - photos.length,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map(a => a.uri).slice(0, 3 - photos.length);
      setPhotos(prev => [...prev, ...newUris]);
    }
  };

  const uploadEmergencyPhotos = async (localUris: string[]): Promise<string[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');
    const urls: string[] = [];
    const timestamp = Date.now();
    for (let i = 0; i < localUris.length; i++) {
      const base64 = await FileSystem.readAsStringAsync(localUris[i], { encoding: 'base64' });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      const path = `${session.user.id}/emergency_${timestamp}_${i}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, bytes.buffer, { contentType: 'image/jpeg' });
      if (error) throw new Error(`Échec upload photo ${i + 1}: ${error.message}`);
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      urls.push(publicUrl);
    }
    return urls;
  };

  // ===== CREATE =====
  const handleCreateEmergency = async () => {
    if (!selectedProp || !selectedType || !description.trim()) {
      Alert.alert(t('common.error'), t('emergency.fill_fields'));
      return;
    }
    setSending(true);
    try {
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        photoUrls = await uploadEmergencyPhotos(photos);
      }
      await createEmergency({
        property_id: selectedProp,
        service_type: selectedType,
        description: description.trim(),
        ...(photoUrls.length > 0 ? { photos: photoUrls } : {}),
      });
      Alert.alert(t('emergency.sent_title'), t('emergency.sent_msg'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); setSending(false); }
  };

  // ===== PROVIDER: Submit bid =====
  const handleSubmitBid = async () => {
    if (!travelCost || !diagnosticCost) {
      Alert.alert(t('common.error'), t('emergency.bid_fill_fields'));
      return;
    }
    let arrivalTime: string;
    if (arrivalMode === 'quick') {
      if (selectedArrival === null) {
        Alert.alert(t('common.error'), t('emergency.bid_fill_fields'));
        return;
      }
      arrivalTime = new Date(Date.now() + selectedArrival * 60 * 1000).toISOString();
    } else {
      if (!scheduledArrivalDate || !scheduledArrivalTime) {
        Alert.alert(t('common.error'), 'Veuillez indiquer la date et l\'heure de votre disponibilité.');
        return;
      }
      const parsed = new Date(`${scheduledArrivalDate}T${scheduledArrivalTime}`);
      if (isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        Alert.alert(t('common.error'), 'La date/heure doit être dans le futur.');
        return;
      }
      arrivalTime = parsed.toISOString();
    }
    try {
      await submitEmergencyBid(emergencyId!, {
        travel_cost: parseFloat(travelCost),
        diagnostic_cost: parseFloat(diagnosticCost),
        estimated_arrival: arrivalTime,
      });
      Alert.alert(t('emergency.bid_sent_title'), t('emergency.bid_sent_msg'));
      fetchEmergency();
    } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  // ===== OWNER: Accept bid =====
  const handleAcceptBid = (bid: EmergencyBidEnriched) => {
    const baseTotal = (bid.travel_cost || 0) + (bid.diagnostic_cost || 0);
    const appFee = baseTotal * PLATFORM_FEE_RATE;
    const ownerTotal = baseTotal * ownerMultiplier;
    const isFranchise = bid.provider_tva_status === 'franchise'
      || bid.provider_is_vat_exempt === true
      || bid.provider_is_auto_entrepreneur === true;
    const tvaAmount = isFranchise ? 0 : baseTotal * 0.2;
    const baseTTC = baseTotal + tvaAmount;

    const arrivalStr = new Date(bid.estimated_arrival).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const providerLabel = bid.provider_company || bid.provider_name;
    const siretLine = bid.provider_siret ? `\nSIRET : ${bid.provider_siret}` : '';
    const tvaLine = isFranchise
      ? '\nTVA non applicable (art. 293 B CGI)'
      : `\nTVA 20% : ${tvaAmount.toFixed(2)}€ (soit ${baseTTC.toFixed(2)}€ TTC)`;
    Alert.alert(
      t('emergency.owner_accept_title'),
      `${t('emergency.owner_technician')} ${providerLabel}${siretLine}\n\n${t('emergency.owner_displacement')} ${baseTotal.toFixed(2)}€ HT${tvaLine}\n${t('emergency.owner_fee')} ${appFee.toFixed(2)}€\n\n${t('emergency.owner_total')} ${ownerTotal.toFixed(2)}€\n${t('emergency.owner_eta')} ${arrivalStr}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: `${t('emergency.owner_pay')} ${ownerTotal.toFixed(2)}€`, onPress: async () => {
            try {
              setLoading(true);
              // Provider's Stripe Connect ID will be passed here when implemented (bid.provider_stripe_id)
              const { clientSecret, paymentIntentId } = await createPaymentIntent(ownerTotal, { emergencyId, bidId: bid.id }, 'automatic');

              const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'Altio',
                paymentIntentClientSecret: clientSecret,
                allowsDelayedPaymentMethods: true,
              });
              if (initError) throw new Error(initError.message);

              const { error: presentError } = await presentPaymentSheet();
              if (presentError) throw new Error(presentError.message);

              await acceptEmergencyBid(emergencyId!, bid.id, bid.provider_id, paymentIntentId);
              Alert.alert('Prestataire confirmé et déplacement payé', 'Votre technicien a été notifié et est en route.');
              fetchEmergency();
            } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); setLoading(false); }
          }
        },
      ]
    );
  };

  // ===== OWNER: Reject bid =====
  const handleRejectBid = (bid: EmergencyBidEnriched) => {
    Alert.alert(
      'Refuser cette offre ?',
      `${bid.provider_name} ne sera plus visible pour cette urgence.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Refuser', style: 'destructive', onPress: async () => {
            try {
              await rejectEmergencyBid(emergencyId!, bid.id);
              fetchEmergency();
            } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
          }
        },
      ]
    );
  };

  // ===== PROVIDER: Mark arrived =====
  const handleMarkArrived = async () => {
    try {
      await markEmergencyArrived(emergencyId!);
      Alert.alert(t('emergency.owner_arrival'), t('emergency.owner_arrival_msg'));
      fetchEmergency();
    } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  // ===== PROVIDER: Navigate to detailed quote form =====
  const handleOpenQuoteForm = () => {
    router.push({ pathname: '/quote/create', params: { emergencyId } });
  };

  // ===== OWNER: Accept quote =====
  const handleAcceptQuote = () => {
    if (!emergency) return;
    const quote = emergency.quote;
    if (!quote) return;

    const baseTotal = quote.repair_cost;
    const appFee = baseTotal * PLATFORM_FEE_RATE;
    const ownerTotal = baseTotal * ownerMultiplier;

    Alert.alert(
      t('emergency.owner_quote_title'),
      `${t('emergency.owner_work_cost')} ${baseTotal.toFixed(2)}€\n${t('emergency.owner_service_fee')} ${appFee.toFixed(2)}€\n${t('emergency.owner_quote_total')} ${ownerTotal.toFixed(2)}€\n${t('emergency.owner_quote_delay')} ${quote.repair_delay_days ?? 0} ${(quote.repair_delay_days ?? 0) > 1 ? t('emergency.quote_days') : t('emergency.quote_day')}\n\n${t('emergency.owner_hold_info')} ${ownerTotal.toFixed(2)}€ ${t('emergency.owner_hold_info2')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('emergency.owner_place_hold'), onPress: async () => {
            try {
              setLoading(true);
              // Provider's Stripe Connect ID will be passed here when implemented
              const { clientSecret, paymentIntentId } = await createPaymentIntent(ownerTotal, { emergencyId, quoteId: quote.id }, 'manual');

              const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'Altio',
                paymentIntentClientSecret: clientSecret,
                allowsDelayedPaymentMethods: true,
              });
              if (initError) throw new Error(initError.message);

              const { error: presentError } = await presentPaymentSheet();
              if (presentError) throw new Error(presentError.message);

              await acceptEmergencyQuote(emergencyId!, quote.id, paymentIntentId);
              Alert.alert(t('emergency.owner_hold_placed'), `${t('emergency.owner_hold_placed_msg1')} ${ownerTotal.toFixed(2)}€ ${t('emergency.owner_hold_placed_msg2')}`);
              fetchEmergency();
            } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); setLoading(false); }
          }
        },
      ]
    );
  };

  // ===== OWNER: Refuse quote =====
  const handleRefuseQuote = () => {
    Alert.alert(
      t('emergency.owner_refuse_title'),
      t('emergency.owner_refuse_msg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('emergency.owner_refuse_btn'), style: 'destructive', onPress: async () => {
            try {
              await refuseEmergencyQuote(emergencyId!, emergency!.quote!.id);
              Alert.alert(t('emergency.owner_refused_title'), t('emergency.owner_refused_msg'));
              fetchEmergency();
            } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
          }
        },
      ]
    );
  };

  // ===== PROVIDER: Complete =====
  const handleComplete = () => {
    Alert.alert(t('emergency.complete_title'), t('emergency.complete_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'), onPress: async () => {
          try {
            // If on_site without quote → complete directly (first hour was enough, no quote payment to capture)
            // If quote_accepted/in_progress → capture quote payment then complete
            if (emergency?.status === 'on_site') {
              await completeEmergency(emergencyId!, {});
            } else {
              await completeEmergencyWithCapture(emergencyId!);
            }
            Alert.alert(t('emergency.complete_done'), t('emergency.complete_done_msg'));
            fetchEmergency();
          } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
        }
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.urgency} />
      </View>
    );
  }

  // ──────────────────────────────────────────────────
  // DETAIL VIEW
  // ──────────────────────────────────────────────────
  if (emergencyId && emergency) {
    const statusEntry = STATUS_FLOW[emergency.status] || STATUS_FLOW.bids_open;
    const statusInfo = { ...statusEntry, label: t(statusEntry.labelKey) };
    const isMyEmergency = emergency.accepted_provider_id === user?.id;
    const myBid = emergency.bids?.find((b: EmergencyBidEnriched) => b.provider_id === user?.id && b.status !== 'cancelled');
    const quote = emergency.quote;
    const activeBids = (emergency.bids || []).filter((b: EmergencyBidEnriched) => b.status !== 'rejected' && b.status !== 'cancelled');

    return (
      <SafeAreaView style={styles.container} testID="emergency-detail-screen" edges={['top']}>
        <LinearGradient
          colors={GRADIENT.header}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('emergency.detail_title')}</Text>
          <TouchableOpacity onPress={fetchEmergency} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* R22: Stepper de progression — l'utilisateur sait où il en est */}
          {(() => {
            const steps = [
              { key: 'search', label: 'Recherche', icon: 'search-outline' },
              { key: 'enroute', label: 'En route', icon: 'car-outline' },
              { key: 'onsite', label: 'Sur place', icon: 'location-outline' },
              { key: 'works', label: 'Travaux', icon: 'construct-outline' },
              { key: 'done', label: 'Terminé', icon: 'checkmark-circle-outline' },
            ];
            const statusToStep: Record<string, number> = {
              open: 0, bids_open: 0,
              bid_accepted: 1, provider_accepted: 1, displacement_paid: 1,
              on_site: 2,
              quote_submitted: 2, quote_sent: 2, quote_accepted: 3, quote_paid: 3, in_progress: 3,
              completed: 4,
              quote_refused: 2,
              cancelled: -1,
            };
            const currentStep = statusToStep[emergency.status] ?? 0;
            return (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.lg, paddingHorizontal: SPACING.xs }}>
                {steps.map((step, i) => {
                  const isActive = i <= currentStep;
                  const isCurrent = i === currentStep;
                  return (
                    <View key={step.key} style={{ alignItems: 'center', flex: 1 }}>
                      <View style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: isCurrent ? statusInfo.color : isActive ? statusInfo.color + '30' : COLORS.subtle,
                        justifyContent: 'center', alignItems: 'center',
                        borderWidth: isCurrent ? 2 : 0, borderColor: statusInfo.color,
                      }}>
                        <Ionicons name={step.icon as IoniconsName} size={16} color={isCurrent ? '#FFFFFF' : isActive ? statusInfo.color : COLORS.textTertiary} />
                      </View>
                      <Text style={{
                        fontSize: 9, fontFamily: 'PlusJakartaSans_600SemiBold',
                        color: isCurrent ? statusInfo.color : isActive ? COLORS.textSecondary : COLORS.textTertiary,
                        marginTop: 4, textAlign: 'center',
                      }}>{step.label}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          {/* Status banner — hidden for providers during owner-facing search phase */}
          {!(!isOwner && emergency.status === 'bids_open') && (
            <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '18' }]}>
              <Ionicons name={statusInfo.icon as IoniconsName} size={22} color={statusInfo.color} />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
          )}

          {/* Emergency info */}
          <View style={[styles.card, styles.urgentCard]}>
            <View style={styles.urgentBadge}>
              <Ionicons name="warning" size={18} color={COLORS.urgency} />
              <Text style={styles.urgentLabel}>🚨 {getServiceTypeLabel(emergency.service_type)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
              <Image
                source={{ uri: `https://ui-avatars.com/api/?name=${emergency.property_name?.replace(/\s/g, '+') || 'Prop'}&background=FF6B6B&color=fff&size=200&font-size=0.4` }}
                style={{ width: 44, height: 44, borderRadius: RADIUS.md, marginRight: SPACING.md }}
              />
              <Text style={styles.propName}>{emergency.property_name}</Text>
            </View>
            {emergency.property_address ? (
              <View style={styles.addrRow}>
                <Ionicons name="location-outline" size={14} color={COLORS.textTertiary} />
                <Text style={styles.propAddr}>{emergency.property_address}</Text>
              </View>
            ) : null}
            {emergency.scheduled_date ? (
              <View style={[styles.addrRow, { marginTop: SPACING.xs }]}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.textTertiary} />
                <Text style={styles.propAddr}>Intervention souhaitée le {new Date(emergency.scheduled_date).toLocaleDateString('fr-FR')}</Text>
              </View>
            ) : null}
            <Text style={styles.emergDesc}>{emergency.description}</Text>

            {/* Emergency photos */}
            {emergency.photos && emergency.photos.length > 0 && (
              <View style={{ marginTop: SPACING.lg }}>
                <Text style={{ ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginBottom: SPACING.sm }}>Photos de la panne</Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  {emergency.photos.map((url, idx) => (
                    <TouchableOpacity key={idx} onPress={() => setViewingPhoto(url)}>
                      <Image source={{ uri: url }} style={{ width: 90, height: 90, borderRadius: RADIUS.md, backgroundColor: COLORS.subtle }} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Photo fullscreen viewer */}
          <RNModal visible={!!viewingPhoto} transparent animationType="fade" onRequestClose={() => setViewingPhoto(null)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
              <TouchableOpacity style={{ position: 'absolute', top: 60, right: 20, zIndex: 10 }} onPress={() => setViewingPhoto(null)}>
                <Ionicons name="close-circle" size={36} color="#FFFFFF" />
              </TouchableOpacity>
              {viewingPhoto && (
                <Image source={{ uri: viewingPhoto }} style={{ width: '90%', height: '70%' }} resizeMode="contain" />
              )}
            </View>
          </RNModal>

          {/* Global Chat Button after assignment */}
          {!!emergency.accepted_provider_id && (isOwner || (isMyEmergency && ['displacement_paid', 'on_site', 'quote_submitted', 'quote_sent', 'quote_accepted', 'in_progress', 'completed'].includes(emergency.status))) && (
            <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.info, marginBottom: SPACING.lg, marginTop: 0 }]} onPress={() => router.push(`/chat/${emergencyId}?type=emergency&receiverId=${isOwner ? emergency.accepted_provider_id : emergency.owner_id}&title=Discussion`)}>
              <Ionicons name="chatbubbles-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.mainActionBtnText}>{isOwner ? t('emergency.discuss_provider') : t('emergency.discuss_owner')}</Text>
            </TouchableOpacity>
          )}

          {/* ━━━ OWNER: Timer + bids ━━━ */}
          {isOwner && (emergency.status === 'bids_open') && (
            <>
              {timeLeft ? (
                <View style={[styles.card, styles.timerCard]}>
                  <View style={styles.timerRow}>
                    <Ionicons name="search-outline" size={18} color={COLORS.info} />
                    <Text style={styles.timerLabel}>Recherche en cours... les prestataires ont encore</Text>
                    <Text style={[styles.timerValue, { color: COLORS.info }]}>{timeLeft}</Text>
                  </View>
                  <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textTertiary, marginTop: SPACING.sm }}>
                    Vous serez notifié dès qu'un prestataire répond
                  </Text>
                </View>
              ) : null}

              {activeBids.length > 0 ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{activeBids.length} offre{activeBids.length > 1 ? 's' : ''} reçue{activeBids.length > 1 ? 's' : ''}</Text>
                  {(() => {
                    const sortedBids = [...activeBids].sort((a: EmergencyBidEnriched, b: EmergencyBidEnriched) => new Date(a.estimated_arrival).getTime() - new Date(b.estimated_arrival).getTime());
                    const fastestId = sortedBids[0]?.id;
                    const cheapestId = [...activeBids].sort((a: EmergencyBidEnriched, b: EmergencyBidEnriched) => ((a.travel_cost || 0) + (a.diagnostic_cost || 0)) - ((b.travel_cost || 0) + (b.diagnostic_cost || 0)))[0]?.id;
                    const bestRatedId = [...activeBids].sort((a: EmergencyBidEnriched, b: EmergencyBidEnriched) => (b.provider_rating || 0) - (a.provider_rating || 0))[0]?.id;
                    return activeBids.map((bid: EmergencyBidEnriched) => {
                      const badges: string[] = [];
                      if (activeBids.length > 1) {
                        if (bid.id === fastestId) badges.push('Arrive le plus vite');
                        if (bid.id === cheapestId && bid.id !== fastestId) badges.push('Moins cher');
                        if (bid.id === bestRatedId && (bid.provider_rating ?? 0) > 0 && bid.id !== fastestId && bid.id !== cheapestId) badges.push('Mieux noté');
                      }
                      return { ...bid, _badges: badges };
                    });
                  })().map((bid: EmergencyBidWithBadges) => (
                    <View key={bid.id} style={styles.bidItem}>
                      {bid._badges?.length > 0 && (
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.sm }}>
                          {bid._badges.map((badge: string) => (
                            <View key={badge} style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>
                              <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10, color: '#2563EB' }}>{badge}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={styles.bidTop}>
                        <TouchableOpacity
                          style={styles.bidProvider}
                          onPress={() => router.push({ pathname: '/provider/[id]', params: { id: bid.provider_id, fromEmergencyId: emergencyId } })}
                        >
                          <View style={styles.bidAvatar}>
                            <Text style={styles.bidAvatarText}>{bid.provider_name?.[0] || 'P'}</Text>
                          </View>
                          <View>
                            <Text style={styles.bidName}>{bid.provider_company || bid.provider_name || t('mission.provider_label')}</Text>
                            {!!bid.provider_siret && (
                              <Text style={{ fontFamily: FONTS.bodySmall.fontFamily, fontSize: 10, color: COLORS.textTertiary }}>SIRET {bid.provider_siret}</Text>
                            )}
                            {(bid.provider_rating ?? 0) > 0 && (
                              <View style={styles.ratingRow}>
                                <Ionicons name="star" size={12} color={COLORS.warning} />
                                <Text style={styles.ratingText}>{bid.provider_rating}/5</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                        <View style={styles.bidPriceCol}>
                          <Text style={styles.bidTotal}>{(bid.travel_cost || 0) + (bid.diagnostic_cost || 0)}€</Text>
                          <Text style={styles.bidPriceSub}>{t('emergency.owner_displacement_short')}</Text>
                        </View>
                      </View>
                      <View style={styles.bidDetails}>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="car-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>{t('emergency.bid_displacement_detail')} {bid.travel_cost}€ HT</Text>
                        </View>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="search-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>{t('emergency.bid_diagnostic_detail')} {bid.diagnostic_cost}€ HT</Text>
                        </View>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="pricetag-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>
                            {bid.provider_tva_status === 'franchise'
                              ? 'TVA non applicable, art. 293 B du CGI'
                              : `TVA 20% : ${(((bid.travel_cost || 0) + (bid.diagnostic_cost || 0)) * 0.2).toFixed(2)}€`}
                          </Text>
                        </View>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="time-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>
                            {t('emergency.bid_arrival_detail')} {(() => {
                              const arrDate = new Date(bid.estimated_arrival);
                              const isToday = arrDate.toDateString() === new Date().toDateString();
                              const time = arrDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                              return isToday ? time : `${arrDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${time}`;
                            })()}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                        <TouchableOpacity style={styles.acceptBidBtn} onPress={() => handleAcceptBid(bid)}>
                          <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
                          <Text style={styles.acceptBidBtnText}>Choisir — {(bid.travel_cost || 0) + (bid.diagnostic_cost || 0)}€</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.rejectBidBtn} onPress={() => handleRejectBid(bid)}>
                          <Ionicons name="close-circle" size={18} color={COLORS.urgency} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[styles.card, { borderLeftColor: COLORS.info, borderLeftWidth: 3 }]}>
                  <View style={styles.waitRow}>
                    <ActivityIndicator size="small" color={COLORS.info} />
                    <Text style={styles.waitText}>Votre demande est visible par les prestataires de votre zone. On vous notifie dès que quelqu'un répond.</Text>
                  </View>
                </View>
              )}
            </>
          )}

          {/* ━━━ OWNER: Provider en route ━━━ */}
          {isOwner && ['displacement_paid', 'bid_accepted', 'provider_accepted'].includes(emergency.status) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('emergency.owner_selected')}</Text>
              {emergency.provider_name ? (
                <TouchableOpacity
                  style={styles.providerRow}
                  onPress={() => router.push({ pathname: '/provider/[id]', params: { id: emergency.accepted_provider_id!, fromEmergencyId: emergencyId } })}
                >
                  <View style={styles.providerAvatar}>
                    <Text style={styles.providerAvatarText}>{emergency.provider_name[0]}</Text>
                  </View>
                  <Text style={[styles.providerName, { flex: 1 }]}>{emergency.provider_name}</Text>
                  <View style={styles.etaBadge}>
                    <Ionicons name="car-outline" size={14} color={COLORS.info} />
                    <Text style={styles.etaText}>{t('emergency.owner_on_way_label')}</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              <View style={[styles.waitRow, { marginTop: SPACING.md }]}>
                <ActivityIndicator size="small" color={COLORS.info} />
                <Text style={styles.waitText}>Il est en chemin — vous n'avez rien à faire, on vous prévient quand il arrive</Text>
              </View>
            </View>
          )}

          {/* ━━━ OWNER: On site — diagnostic in progress (may complete without quote if first hour is enough) ━━━ */}
          {isOwner && emergency.status === 'on_site' && !quote && (
            <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={[styles.waitText, { color: COLORS.success, fontWeight: '600' }]}>Le prestataire est arrivé et diagnostique le problème</Text>
              </View>
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textTertiary, marginTop: SPACING.sm, marginLeft: 36 }}>
                S'il faut des travaux supplémentaires, il vous enverra un devis. Sinon, l'intervention sera terminée directement.
              </Text>
            </View>
          )}

          {/* ━━━ OWNER: Quote review ━━━ */}
          {isOwner && (emergency.status === 'quote_submitted' || emergency.status === 'quote_sent') && quote && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Devis reçu</Text>
              {/* R6: Prix total en gros, visible en 2 secondes */}
              <View style={{ alignItems: 'center', paddingVertical: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.subtle, borderRadius: RADIUS.lg }}>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary }}>Montant total HT</Text>
                <Text style={{ fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 36, color: COLORS.textPrimary, marginTop: 4 }}>{quote.repair_cost}€</Text>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textTertiary, marginTop: 4 }}>
                  Durée estimée : {quote.repair_delay_days ?? 0} {(quote.repair_delay_days ?? 0) > 1 ? 'jours' : 'jour'}
                </Text>
              </View>

              {/* Line items detail */}
              {quote.line_items && quote.line_items.length > 0 && (
                <View style={{ marginBottom: SPACING.md }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>Détail du devis</Text>
                  {quote.line_items.map((item: QuoteLineItem, idx: number) => (
                    <View key={item.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: idx < quote.line_items.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9' }}>
                      <View style={{ flex: 1, marginRight: SPACING.sm }}>
                        <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: COLORS.textPrimary }}>{item.description}</Text>
                        <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: COLORS.textTertiary, marginTop: 2 }}>
                          {item.quantity} × {parseFloat(String(item.unit_price_ht)).toFixed(2)}€ ({item.unit || 'unité'})
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: COLORS.textPrimary }}>{parseFloat(String(item.total_ht)).toFixed(2)}€</Text>
                    </View>
                  ))}
                </View>
              )}

              {quote.description ? (
                <View style={styles.quoteDescRow}>
                  <Ionicons name="document-text-outline" size={16} color={COLORS.textTertiary} />
                  <Text style={styles.quoteDescText}>{quote.description}</Text>
                </View>
              ) : null}

              {/* View full quote detail page */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft, marginBottom: SPACING.md }}
                onPress={() => router.push(`/quote/${quote.id}`)}
              >
                <Ionicons name="document-text-outline" size={18} color={COLORS.brandPrimary} />
                <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary }}>Voir le devis complet</Text>
              </TouchableOpacity>

              <View style={{ marginTop: 4, marginBottom: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.infoSoft, borderRadius: RADIUS.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary }}>Montant prestataire</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: COLORS.textPrimary }}>{(quote.repair_cost || 0).toFixed(2)}€</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary }}>Frais de service Altio</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: COLORS.textPrimary }}>{(Math.round((quote.repair_cost || 0) * PLATFORM_FEE_RATE * 100) / 100).toFixed(2)}€</Text>
                </View>
                <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: COLORS.textPrimary }}>Total à payer</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: COLORS.brandPrimary }}>{(Math.round((quote.repair_cost || 0) * ownerMultiplier * 100) / 100).toFixed(2)}€ TTC</Text>
                </View>
              </View>

              <View style={styles.quoteBanner}>
                <Ionicons name="card-outline" size={15} color={COLORS.warning} />
                <Text style={styles.quoteBannerText}>
                  {t('emergency.hold_banner_text', { amount: quote.repair_cost })}
                </Text>
              </View>
              <TouchableOpacity style={styles.acceptBidBtn} onPress={handleAcceptQuote}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
                <Text style={styles.acceptBidBtnText}>Accepter et payer {(Math.round((quote.repair_cost || 0) * ownerMultiplier * 100) / 100).toFixed(2)}€</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.refuseBtn} onPress={handleRefuseQuote}>
                <Ionicons name="close" size={18} color={COLORS.urgency} />
                <Text style={styles.refuseBtnText}>Refuser ce devis</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ━━━ OWNER: Work in progress ━━━ */}
          {isOwner && emergency.status === 'quote_accepted' && (
            <View style={[styles.card, { borderLeftColor: COLORS.info, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={COLORS.info} />
                <Text style={styles.waitText}>{t('emergency.owner_work_ongoing')}</Text>
              </View>
              {quote?.stripe_capture_deadline ? (
                <View style={styles.captureInfo}>
                  <Ionicons name="lock-closed-outline" size={13} color={COLORS.textTertiary} />
                  <Text style={styles.captureText}>
                    {t('emergency.hold_amount_info', { amount: quote.repair_cost, date: new Date(quote.stripe_capture_deadline).toLocaleDateString('fr-FR') })}
                  </Text>
                </View>
              ) : null}
              {quote && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft, marginTop: SPACING.md }}
                  onPress={() => router.push(`/quote/${quote.id}`)}
                >
                  <Ionicons name="document-text-outline" size={18} color={COLORS.brandPrimary} />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary }}>Voir le devis</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ━━━ OWNER: Work in progress (in_progress) ━━━ */}
          {isOwner && emergency.status === 'in_progress' && (
            <View style={[styles.card, { borderLeftColor: COLORS.info, borderLeftWidth: 3 }]}>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={COLORS.info} />
                <Text style={styles.waitText}>{t('emergency.owner_work_ongoing')}</Text>
              </View>
              {quote && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft, marginTop: SPACING.md }}
                  onPress={() => router.push(`/quote/${quote.id}`)}
                >
                  <Ionicons name="document-text-outline" size={18} color={COLORS.brandPrimary} />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary }}>Voir le devis</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ━━━ OWNER: Quote refused ━━━ */}
          {isOwner && emergency.status === 'quote_refused' && (
            <View style={[styles.card, { borderLeftColor: COLORS.urgency, borderLeftWidth: 3 }]}>
              <Ionicons name="close-circle" size={28} color={COLORS.urgency} />
              <Text style={[styles.sectionTitle, { color: COLORS.urgency, marginTop: SPACING.sm }]}>{t('emergency.owner_refused_title')}</Text>
              <Text style={styles.emergDesc}>{t('emergency.owner_quote_refused_desc')}</Text>
            </View>
          )}

          {/* ━━━ COMPLETED ━━━ */}
          {emergency.status === 'completed' && isOwner && (
            <>
              {/* Success banner */}
              <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
                <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
                <Text style={[styles.sectionTitle, { color: COLORS.success, marginTop: SPACING.sm }]}>{t('emergency.completed_title')}</Text>
                <Text style={styles.emergDesc}>{t('emergency.completed_desc')}</Text>
                {quote && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft, marginTop: SPACING.md }}
                    onPress={() => router.push(`/quote/${quote.id}`)}
                  >
                    <Ionicons name="document-text-outline" size={18} color={COLORS.brandPrimary} />
                    <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary }}>Voir le devis</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Review section */}
              <View style={styles.card}>
                {!reviewSubmitted ? (
                  <>
                    <Text style={styles.sectionTitle}>Noter le prestataire</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SPACING.xs, marginVertical: SPACING.md }}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <TouchableOpacity key={i} onPress={() => setReviewRating(i)}>
                          <Ionicons
                            name={i <= reviewRating ? 'star' : 'star-outline'}
                            size={32}
                            color="#F59E0B"
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                      value={reviewComment}
                      onChangeText={setReviewComment}
                      placeholder="Un commentaire ? (optionnel)"
                      placeholderTextColor={COLORS.textTertiary}
                      multiline
                    />
                    <TouchableOpacity
                      style={[styles.mainActionBtn, { opacity: reviewRating === 0 || submittingReview ? 0.5 : 1, marginTop: SPACING.md }]}
                      disabled={reviewRating === 0 || submittingReview}
                      onPress={async () => {
                        if (!emergency.accepted_provider_id) return;
                        setSubmittingReview(true);
                        try {
                          await submitReview({
                            emergencyId: emergencyId!,
                            providerId: emergency.accepted_provider_id,
                            rating: reviewRating,
                            comment: reviewComment.trim() || undefined,
                          });
                          setReviewSubmitted(true);
                          Alert.alert('Merci !', 'Votre avis a été envoyé.');
                        } catch (e: unknown) {
                          Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
                        } finally {
                          setSubmittingReview(false);
                        }
                      }}
                    >
                      {submittingReview ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.mainActionBtnText}>Envoyer mon avis</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>Merci pour votre avis !</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SPACING.xs, marginTop: SPACING.sm }}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Ionicons
                          key={i}
                          name={i <= reviewRating ? 'star' : 'star-outline'}
                          size={28}
                          color="#F59E0B"
                        />
                      ))}
                    </View>
                  </>
                )}
              </View>

              {/* Favorite toggle */}
              {!!emergency.accepted_provider_id && (
                <TouchableOpacity
                  style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, opacity: togglingFavorite ? 0.5 : 1 }]}
                  disabled={togglingFavorite}
                  onPress={async () => {
                    setTogglingFavorite(true);
                    try {
                      if (isFavorite) {
                        await removeFavoriteProvider(emergency.accepted_provider_id!);
                        setIsFavorite(false);
                      } else {
                        await addFavoriteProvider(emergency.accepted_provider_id!);
                        setIsFavorite(true);
                      }
                      queryClient.invalidateQueries({ queryKey: ['favorite-providers'] });
                    } catch (e: unknown) {
                      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
                    } finally {
                      setTogglingFavorite(false);
                    }
                  }}
                >
                  <Ionicons
                    name={isFavorite ? 'heart' : 'heart-outline'}
                    size={22}
                    color={isFavorite ? COLORS.urgency : COLORS.textSecondary}
                  />
                  <Text style={{ color: isFavorite ? COLORS.urgency : COLORS.textSecondary, fontSize: 15, fontFamily: FONTS.h3.fontFamily }}>
                    {isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {emergency.status === 'completed' && !isOwner && (
            <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
              <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
              <Text style={[styles.sectionTitle, { color: COLORS.success, marginTop: SPACING.sm }]}>{t('emergency.completed_title')}</Text>
              <Text style={styles.emergDesc}>{t('emergency.completed_desc')}</Text>
              {quote && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft, marginTop: SPACING.md }}
                  onPress={() => router.push(`/quote/${quote.id}`)}
                >
                  <Ionicons name="document-text-outline" size={18} color={COLORS.brandPrimary} />
                  <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary }}>Voir mon devis (PDF)</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ━━━ PROVIDER: Bid form ━━━ */}
          {!isOwner && (emergency.status === 'bids_open') && !myBid && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('emergency.bid_apply_title')}</Text>
              <Text style={styles.fieldLabel}>{t('emergency.bid_displacement')}</Text>
              <TextInput
                style={styles.input}
                value={travelCost}
                onChangeText={setTravelCost}
                keyboardType="numeric"
                placeholder="ex: 40"
                placeholderTextColor={COLORS.textTertiary}
              />
              <Text style={styles.fieldLabel}>{t('emergency.bid_diag')}</Text>
              <TextInput
                style={styles.input}
                value={diagnosticCost}
                onChangeText={setDiagnosticCost}
                keyboardType="numeric"
                placeholder="ex: 30"
                placeholderTextColor={COLORS.textTertiary}
              />
              {(() => {
                const travel = parseFloat(travelCost) || 0;
                const diag = parseFloat(diagnosticCost) || 0;
                if (travel + diag <= 0) return null;
                return (
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: COLORS.success, marginTop: -SPACING.xs, marginBottom: SPACING.sm }}>
                    {`Montant que vous recevrez : ${((travel + diag) * providerMultiplier).toFixed(2)}€`}
                  </Text>
                );
              })()}
              <Text style={styles.fieldLabel}>{t('emergency.bid_arrival')}</Text>

              {/* Toggle: arrivée rapide vs date/heure précise */}
              <View style={[styles.arrivalRow, { marginBottom: SPACING.sm }]}>
                <TouchableOpacity
                  style={[styles.arrivalChip, arrivalMode === 'quick' && styles.arrivalChipActive, { flex: 1 }]}
                  onPress={() => setArrivalMode('quick')}
                >
                  <Text style={[styles.arrivalChipText, arrivalMode === 'quick' && styles.arrivalChipTextActive]}>⚡ Arrivée rapide</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.arrivalChip, arrivalMode === 'scheduled' && styles.arrivalChipActive, { flex: 1 }]}
                  onPress={() => setArrivalMode('scheduled')}
                >
                  <Text style={[styles.arrivalChipText, arrivalMode === 'scheduled' && styles.arrivalChipTextActive]}>📅 Date & heure</Text>
                </TouchableOpacity>
              </View>

              {arrivalMode === 'quick' ? (
                <View style={styles.arrivalRow}>
                  {ARRIVAL_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.minutes}
                      style={[styles.arrivalChip, selectedArrival === opt.minutes && styles.arrivalChipActive]}
                      onPress={() => setSelectedArrival(opt.minutes)}
                    >
                      <Text style={[styles.arrivalChipText, selectedArrival === opt.minutes && styles.arrivalChipTextActive]}>{t(opt.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View>
                  <Text style={[styles.fieldLabel, { fontSize: 12, color: COLORS.textSecondary }]}>Indiquez la date et l'heure à laquelle vous serez disponible</Text>
                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={scheduledArrivalDate}
                      onChangeText={setScheduledArrivalDate}
                      placeholder="AAAA-MM-JJ"
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="numbers-and-punctuation"
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={scheduledArrivalTime}
                      onChangeText={setScheduledArrivalTime}
                      placeholder="HH:MM"
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.mainActionBtn, (!travelCost || !diagnosticCost || (arrivalMode === 'quick' ? selectedArrival === null : !scheduledArrivalDate || !scheduledArrivalTime)) && { opacity: 0.5 }]}
                onPress={handleSubmitBid}
                disabled={!travelCost || !diagnosticCost || (arrivalMode === 'quick' ? selectedArrival === null : !scheduledArrivalDate || !scheduledArrivalTime)}
              >
                <Ionicons name="hand-left-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>{t('emergency.bid_send')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ━━━ PROVIDER: Waiting after bid submitted ━━━ */}
          {!isOwner && (emergency.status === 'bids_open') && myBid && (
            <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
              <View style={styles.bidSentRow}>
                <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                <Text style={[styles.sectionTitle, { flex: 1, marginBottom: 0 }]}>{t('emergency.bid_sent_label')}</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>{t('emergency.bid_displacement_label')}</Text>
                <Text style={styles.amountValue}>{myBid.travel_cost}€</Text>
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>{t('emergency.bid_diagnostic_label')}</Text>
                <Text style={styles.amountValue}>{myBid.diagnostic_cost}€</Text>
              </View>
              <View style={[styles.amountRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Text style={[styles.amountLabel, { fontWeight: '700', color: COLORS.success }]}>Vous recevrez</Text>
                <Text style={[styles.amountValue, { color: COLORS.success }]}>{(((myBid.travel_cost || 0) + (myBid.diagnostic_cost || 0)) * providerMultiplier).toFixed(2)}€</Text>
              </View>
              <View style={[styles.waitRow, { marginTop: SPACING.md }]}>
                <ActivityIndicator size="small" color={COLORS.warning} />
                <Text style={styles.waitText}>{t('emergency.bid_pending')}</Text>
              </View>
            </View>
          )}

          {/* ━━━ PROVIDER: On the way — navigate, chat, arrived ━━━ */}
          {!isOwner && isMyEmergency && ['displacement_paid', 'bid_accepted', 'provider_accepted'].includes(emergency.status) && (
            <View>
              <TouchableOpacity
                style={[styles.mainActionBtn, { backgroundColor: COLORS.info, marginBottom: SPACING.sm }]}
                onPress={() => {
                  const destination = emergency.property_lat && emergency.property_lng
                    ? `${emergency.property_lat},${emergency.property_lng}`
                    : encodeURIComponent(emergency.property_address || '');
                  if (!destination) {
                    Alert.alert(t('common.error'), 'Adresse indisponible.');
                    return;
                  }
                  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
                }}
              >
                <Ionicons name="navigate-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>📍 Se rendre sur place</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.success }]} onPress={handleMarkArrived}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>✅ Je suis arrivé sur place</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ━━━ PROVIDER: Not selected ━━━ */}
          {!isOwner && !isMyEmergency && myBid?.status === 'rejected' && (
            <View style={[styles.card, { borderLeftColor: COLORS.urgency, borderLeftWidth: 3 }]}>
              <Text style={[styles.sectionTitle, { color: COLORS.urgency }]}>{t('emergency.bid_not_selected')}</Text>
              <Text style={styles.emergDesc}>{t('emergency.bid_not_selected_msg')}</Text>
            </View>
          )}

          {/* ━━━ PROVIDER: On site — submit quote OR complete without quote ━━━ */}
          {!isOwner && isMyEmergency && emergency.status === 'on_site' && !quote && (
            <View>
              <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.success, marginBottom: SPACING.sm }]} onPress={handleComplete}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>{t('emergency.complete_no_quote_btn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.brandPrimary }]} onPress={handleOpenQuoteForm}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>{t('emergency.quote_title')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ━━━ PROVIDER: Waiting for quote validation ━━━ */}
          {!isOwner && isMyEmergency && (emergency.status === 'quote_submitted' || emergency.status === 'quote_sent') && (
            <View style={[styles.card, { borderLeftColor: COLORS.warning, borderLeftWidth: 3 }]}>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.textPrimary, marginBottom: SPACING.xs, textAlign: 'center' }}>
                Devis envoyé
              </Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md, textAlign: 'center' }}>
                En attente de validation du propriétaire
              </Text>
              {quote ? (
                <>
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>{t('emergency.quote_amount_label')}</Text>
                    <Text style={styles.amountValue}>{quote.repair_cost}€</Text>
                  </View>
                  {/* Show line items summary */}
                  {quote.line_items && quote.line_items.length > 0 && (
                    <View style={{ marginBottom: SPACING.sm }}>
                      {quote.line_items.map((item: QuoteLineItem, idx: number) => (
                        <View key={item.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: SPACING.sm }}>
                          <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textSecondary, flex: 1 }}>{item.description}</Text>
                          <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: COLORS.textPrimary }}>{parseFloat(String(item.total_ht)).toFixed(2)}€</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>{t('emergency.delay_label')}</Text>
                    <Text style={styles.amountValue}>{quote.repair_delay_days ?? 0} {(quote.repair_delay_days ?? 0) > 1 ? t('emergency.quote_days') : t('emergency.quote_day')}</Text>
                  </View>
                  <View style={[styles.amountRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                    <Text style={[styles.amountLabel, { fontWeight: '700', color: COLORS.success }]}>Vous recevrez si accepté</Text>
                    <Text style={[styles.amountValue, { color: COLORS.success }]}>{((quote.repair_cost || 0) * providerMultiplier).toFixed(2)}€</Text>
                  </View>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft, marginTop: SPACING.md }}
                    onPress={() => router.push(`/quote/${quote.id}`)}
                  >
                    <Ionicons name="document-text-outline" size={18} color={COLORS.brandPrimary} />
                    <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary }}>Voir mon devis (PDF)</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              <View style={[styles.waitRow, { marginTop: SPACING.md }]}>
                <ActivityIndicator size="small" color={COLORS.warning} />
                <Text style={styles.waitText}>{t('emergency.quote_pending')}</Text>
              </View>
            </View>
          )}

          {/* ━━━ PROVIDER: Quote accepted, do the work ━━━ */}
          {!isOwner && isMyEmergency && emergency.status === 'quote_accepted' && (
            <>
              <View style={[styles.card, { borderLeftColor: COLORS.success, borderLeftWidth: 3 }]}>
                <View style={styles.waitRow}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={[styles.waitText, { color: COLORS.success, fontWeight: '600' }]}>
                    {t('emergency.quote_accepted_msg')}
                  </Text>
                </View>
                {quote && (
                  <>
                    <View style={[styles.amountRow, { marginTop: SPACING.md }]}>
                      <Text style={styles.amountLabel}>{t('emergency.quote_amount_label')}</Text>
                      <Text style={styles.amountValue}>{quote.repair_cost}€</Text>
                    </View>
                    <View style={[styles.amountRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                      <Text style={[styles.amountLabel, { fontWeight: '700', color: COLORS.success }]}>Vous recevrez</Text>
                      <Text style={[styles.amountValue, { color: COLORS.success }]}>{((quote.repair_cost || 0) * providerMultiplier).toFixed(2)}€</Text>
                    </View>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft, marginTop: SPACING.md }}
                      onPress={() => router.push(`/quote/${quote.id}`)}
                    >
                      <Ionicons name="document-text-outline" size={18} color={COLORS.brandPrimary} />
                      <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary }}>Voir mon devis (PDF)</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.success }]} onPress={handleComplete}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>{t('emergency.complete_btn')}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ━━━ PROVIDER: Quote refused ━━━ */}
          {!isOwner && isMyEmergency && emergency.status === 'quote_refused' && (
            <View style={[styles.card, { borderLeftColor: COLORS.urgency, borderLeftWidth: 3 }]}>
              <Text style={[styles.sectionTitle, { color: COLORS.urgency }]}>{t('emergency.status_refused')}</Text>
              <Text style={styles.emergDesc}>{t('emergency.quote_refused_msg')}</Text>
            </View>
          )}

          {/* ━━━ OWNER: Cancel emergency ━━━ */}
          {isOwner && (emergency.status === 'bids_open') && (
            <TouchableOpacity
              style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={() => {
                Alert.alert(
                  'Annuler l\'urgence ?',
                  'Les candidatures en cours seront annulées. Cette action est irréversible.',
                  [
                    { text: 'Non', style: 'cancel' },
                    { text: 'Oui, annuler', style: 'destructive', onPress: async () => {
                      try {
                        await cancelEmergency(emergencyId!);
                        Alert.alert('Urgence annulée', 'Votre demande d\'urgence a été annulée.');
                        router.back();
                      } catch (e: unknown) {
                        Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
                      }
                    }},
                  ]
                );
              }}
            >
              <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#EF4444' }}>Annuler l'urgence</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────
  // CREATE FORM (OWNER)
  // ──────────────────────────────────────────────────
  const selectedPropData = properties.find(p => p.id === selectedProp);

  return (
    <SafeAreaView style={styles.container} testID="emergency-create-screen" edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <LinearGradient
          colors={GRADIENT.header}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('emergency.new_header')}</Text>
          <View style={{ width: 48 }} />
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.urgentBanner}>
            <Ionicons name="warning" size={32} color={COLORS.urgency} />
            <Text style={styles.urgentBannerTitle}>{t('emergency.new_title')}</Text>
            <Text style={styles.urgentBannerDesc}>
              {t('emergency.create_banner_desc')}
            </Text>
          </View>

          <Text style={styles.fieldLabel}>{t('emergency.property_label')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.propScroll}>
            {properties.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.propChip, selectedProp === p.id && styles.propChipActive]}
                onPress={() => setSelectedProp(p.id)}
              >
                <Text style={[styles.propChipText, selectedProp === p.id && styles.propChipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {selectedPropData?.address ? (
            <View style={styles.addrPreview}>
              <Ionicons name="location-outline" size={14} color={COLORS.textTertiary} />
              <Text style={styles.addrPreviewText}>{selectedPropData.address}</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>{t('emergency.type_label')}</Text>
          <View style={styles.typeGrid}>
            {SERVICE_TYPES.map((st) => (
              <TouchableOpacity
                key={st.id}
                testID={`service-type-${st.id}`}
                style={[styles.serviceTypeCard, selectedType === st.id && styles.serviceTypeActive]}
                onPress={() => setSelectedType(st.id)}
              >
                <Ionicons name={st.icon as IoniconsName} size={24} color={selectedType === st.id ? COLORS.textInverse : COLORS.urgency} />
                <Text style={[styles.serviceTypeText, selectedType === st.id && styles.serviceTypeTextActive]}>{t(st.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t('emergency.description_label')}</Text>
          <TextInput
            testID="emergency-description"
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('emergency.description_placeholder')}
            placeholderTextColor={COLORS.textTertiary}
            multiline
            numberOfLines={4}
          />

          {/* Photo picker */}
          <Text style={styles.fieldLabel}>Photos de la panne (optionnel)</Text>
          <TouchableOpacity
            testID="pick-photos-btn"
            style={styles.photoPickerBtn}
            onPress={handlePickPhotos}
            disabled={photos.length >= 3}
          >
            <Ionicons name="camera-outline" size={20} color={photos.length >= 3 ? COLORS.textTertiary : COLORS.brandPrimary} />
            <Text style={[styles.photoPickerText, photos.length >= 3 && { color: COLORS.textTertiary }]}>
              Ajouter des photos ({photos.length}/3)
            </Text>
          </TouchableOpacity>
          {photos.length > 0 && (
            <View style={styles.photoGrid}>
              {photos.map((uri, idx) => (
                <View key={idx} style={styles.photoThumbWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity
                    style={styles.photoRemoveBtn}
                    onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Ionicons name="close-circle" size={22} color={COLORS.urgency} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            testID="send-emergency-btn"
            style={styles.emergencyBtn}
            onPress={handleCreateEmergency}
            disabled={sending}
          >
            {sending ? <ActivityIndicator color={COLORS.textInverse} /> : (
              <>
                <Ionicons name="warning" size={22} color={COLORS.textInverse} />
                <Text style={styles.emergencyBtnText}>{t('emergency.send_btn')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.xl,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    ...SHADOWS.card
  },
  backBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  refreshBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.paper, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  headerTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl, paddingTop: SPACING.lg },
  // Status banner
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.xl, marginBottom: SPACING.lg },
  statusText: { ...FONTS.bodySmall, fontWeight: '700', flex: 1, fontSize: 13 },
  // Cards
  card: { backgroundColor: COLORS.paper, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.md, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  urgentCard: { borderLeftWidth: 4, borderLeftColor: COLORS.urgency, ...SHADOWS.float },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  urgentLabel: { ...FONTS.bodySmall, color: COLORS.urgency, fontWeight: '700' },
  propName: { ...FONTS.h1, color: COLORS.textPrimary, fontSize: 24, marginBottom: 2 },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 2, marginBottom: SPACING.sm },
  propAddr: { ...FONTS.body, color: COLORS.textSecondary, flex: 1 },
  emergDesc: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md, lineHeight: 22 },
  sectionTitle: { ...FONTS.h3, color: COLORS.textPrimary, marginBottom: SPACING.md, fontSize: 18 },
  // Timer
  timerCard: { borderLeftWidth: 4, borderLeftColor: COLORS.warning },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  timerLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, flex: 1, fontWeight: '600' },
  timerValue: { ...FONTS.h2, color: COLORS.warning, fontSize: 18 },
  // Bids
  bidItem: { paddingVertical: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  bidTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  bidProvider: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  bidAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brandPrimary + '20', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.brandPrimary + '40' },
  bidAvatarText: { ...FONTS.h3, color: COLORS.brandPrimary },
  bidName: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 11 },
  bidPriceCol: { alignItems: 'flex-end', backgroundColor: COLORS.subtle, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.md },
  bidTotal: { ...FONTS.h2, color: COLORS.success, fontSize: 18 },
  bidPriceSub: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 10 },
  bidDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.md, backgroundColor: COLORS.paper, padding: SPACING.sm, borderRadius: RADIUS.md },
  bidDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bidDetailText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 12, fontWeight: '500' },
  acceptBidBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.success, paddingVertical: SPACING.md, borderRadius: RADIUS.xl, ...SHADOWS.card },
  acceptBidBtnText: { ...FONTS.h3, color: COLORS.textInverse, fontSize: 15 },
  rejectBidBtn: { width: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.urgency, borderRadius: RADIUS.xl },
  bidSentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  // Provider info
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  providerAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.brandPrimary + '20', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.brandPrimary + '40' },
  providerAvatarText: { ...FONTS.h2, color: COLORS.brandPrimary },
  providerName: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 18 },
  etaBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.infoSoft, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, ...SHADOWS.float },
  etaText: { ...FONTS.bodySmall, color: COLORS.info, fontWeight: '700' },
  // Amounts
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.subtle },
  amountLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  amountValue: { ...FONTS.h3, color: COLORS.textPrimary },
  // Quote
  quoteDescRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start', marginBottom: SPACING.lg, backgroundColor: COLORS.subtle, padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  quoteDescText: { ...FONTS.body, color: COLORS.textPrimary, flex: 1, lineHeight: 22 },
  quoteBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.warningSoft, padding: SPACING.lg, borderRadius: RADIUS.lg, marginTop: SPACING.lg, marginBottom: SPACING.md },
  quoteBannerText: { ...FONTS.bodySmall, color: COLORS.warning, flex: 1, lineHeight: 20, fontWeight: '500' },
  captureInfo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md },
  captureText: { ...FONTS.caption, color: COLORS.textTertiary, flex: 1, fontSize: 11 },
  refuseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.urgency, paddingVertical: SPACING.md, borderRadius: RADIUS.xl, marginTop: SPACING.sm },
  refuseBtnText: { ...FONTS.bodySmall, color: COLORS.urgency, fontWeight: '700' },
  // Wait
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.subtle, padding: SPACING.md, borderRadius: RADIUS.md },
  waitText: { ...FONTS.bodySmall, color: COLORS.textSecondary, flex: 1, fontWeight: '500', lineHeight: 20 },
  // Arrival chips
  arrivalRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  arrivalChip: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.xl, backgroundColor: COLORS.subtle, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  arrivalChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary, ...SHADOWS.card },
  arrivalChipText: { ...FONTS.bodySmall, color: COLORS.textTertiary, fontWeight: '600' },
  arrivalChipTextActive: { color: COLORS.textInverse },
  // Main action
  mainActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.xxl, marginTop: SPACING.md, ...SHADOWS.float },
  mainActionBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  // Form
  fieldLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginTop: SPACING.lg, marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  // Create form
  urgentBanner: { alignItems: 'center', backgroundColor: COLORS.urgency + '15', padding: SPACING.xxl, borderRadius: RADIUS.xxl, marginBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.urgency + '30' },
  urgentBannerTitle: { ...FONTS.h1, color: COLORS.urgency, marginTop: SPACING.md, textAlign: 'center' },
  urgentBannerDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.md, lineHeight: 24 },
  propScroll: { maxHeight: 50, marginBottom: SPACING.md },
  propChip: { paddingHorizontal: SPACING.xl, paddingVertical: 12, borderRadius: RADIUS.full, backgroundColor: COLORS.paper, marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.card },
  propChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  propChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  propChipTextActive: { color: COLORS.textInverse },
  addrPreview: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.subtle, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
  addrPreviewText: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '500' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  serviceTypeCard: { width: '31%', padding: SPACING.lg, borderRadius: RADIUS.xl, backgroundColor: COLORS.paper, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm, ...SHADOWS.card },
  serviceTypeActive: { backgroundColor: COLORS.urgency, borderColor: COLORS.urgency, ...SHADOWS.float },
  serviceTypeText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 11, textAlign: 'center', fontWeight: '600' },
  serviceTypeTextActive: { color: COLORS.textInverse },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: COLORS.urgency, paddingVertical: SPACING.lg, borderRadius: RADIUS.xxl, marginTop: SPACING.xxl, ...SHADOWS.urgency },
  emergencyBtnText: { ...FONTS.h2, color: COLORS.textInverse },
  // Photo picker
  photoPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', marginBottom: SPACING.md },
  photoPickerText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  photoGrid: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 80, height: 80, borderRadius: RADIUS.md },
  photoRemoveBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: COLORS.paper, borderRadius: 12 },
});
