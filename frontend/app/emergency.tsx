import { confirmEarlyExecution } from '../src/services/early-execution-consent';
import { MARKETPLACE, MissionContact, QuoteChoice, marketStyles } from '../src/components/alpine/MarketplaceKit';
import { providerMissionFollowUp } from '../src/utils/providerMissionFollowUp';
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
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/theme';
import { isUrgentMission } from '../src/utils/missionPresentation';
import { getServiceTypeLabel } from '../src/utils/serviceLabels';
import { useStripe } from '@stripe/stripe-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../src/auth';
import {
  createEmergency, getEmergency, getProperties,
  submitEmergencyBid, acceptEmergencyBid, rejectEmergencyBid,
  markEmergencyArrived,
  acceptEmergencyQuote, refuseEmergencyQuote,
  createPaymentIntent,
  cancelEmergency,
} from '../src/api';
import { submitReview, getMissionReview } from '../src/api/reviews';
import { addFavoriteProvider, removeFavoriteProvider, getFavoriteProviders } from '../src/api/partners';
import { supabase } from '../src/lib/supabase';
import { useTranslation } from 'react-i18next';
import { priceFromTtc, providerVatRate } from '../src/utils/commission';
import { quotePrice } from '../src/utils/quotePrice';
import { completionAction, getCompletionSteps, type CompletionStep, type CompletionPhase } from '../src/api/completion';
import {
  MAX_DIAGNOSTIC_FEE_EUR,
  MAX_TRAVEL_FEE_EUR,
  MAX_VISIT_FEE_EUR,
  validateEmergencyFees,
} from '../src/config/emergencyFees';
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
  useEffect(() => {
    if (isOwner && !emergencyId) router.replace({ pathname: '/(owner)/missions', params: { create: '1', priority: 'urgent', ...(typeof params.property === 'string' ? { property: params.property } : {}) } });
  }, [isOwner, emergencyId, router, params.property]);

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

  const [completionSteps, setCompletionSteps] = useState<CompletionStep[]>([]);
  const [completionError, setCompletionError] = useState('');
  const [completionBusy, setCompletionBusy] = useState(false);
  const [disputePhase, setDisputePhase] = useState<CompletionPhase | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const fetchEmergency = useCallback(async () => {
    try {
      const data = await getEmergency(emergencyId!);
      setEmergency(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [emergencyId]);

  const refreshCompletion = useCallback(async () => {
    if (!emergencyId) return;
    try { setCompletionSteps(await getCompletionSteps(emergencyId)); setCompletionError(''); }
    catch { setCompletionError('Validation des étapes indisponible. Réessayez avant de poursuivre.'); }
  }, [emergencyId]);
  useFocusEffect(useCallback(() => { refreshCompletion(); }, [refreshCompletion]));
  useEffect(() => {
    if (!emergencyId) return;
    const timer = setInterval(() => { void refreshCompletion(); void fetchEmergency(); }, 30000);
    return () => clearInterval(timer);
  }, [emergencyId, refreshCompletion, fetchEmergency]);
  const actOnCompletion = async (phase: CompletionPhase, action: 'declare' | 'approve' | 'dispute', finishEmergency = false) => {
    setCompletionBusy(true);
    try {
      const result = await completionAction(emergencyId!, phase, action, { reason: action === 'dispute' ? disputeReason : undefined, finishEmergency });
      setCompletionSteps(previous => [...previous.filter(step => step.phase !== phase), result.step]);
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setDisputePhase(null); setDisputeReason('');
      await refreshCompletion(); await fetchEmergency();
      if (result.paymentPending) Alert.alert('Validation enregistrée', 'Le paiement reste en cours de vérification. Il n’est pas encore confirmé.');
    } catch (error) { Alert.alert('Validation', error instanceof Error ? error.message : 'Réessayez'); }
    finally { setCompletionBusy(false); }
  };

  // Timer
  const [timeLeft, setTimeLeft] = useState('');

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
      const { error } = await supabase.storage.from('emergency-photos').upload(path, bytes.buffer, { contentType: 'image/jpeg' });
      if (error) throw new Error(`Échec upload photo ${i + 1}: ${error.message}`);
      const { data: { publicUrl } } = supabase.storage.from('emergency-photos').getPublicUrl(path);
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
    const parsedTravelCost = Number(travelCost.replace(',', '.'));
    const parsedDiagnosticCost = Number(diagnosticCost.replace(',', '.'));
    try {
      validateEmergencyFees(parsedTravelCost, parsedDiagnosticCost);
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : String(error));
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
        travel_cost: parsedTravelCost,
        diagnostic_cost: parsedDiagnosticCost,
        estimated_arrival: arrivalTime,
      });
      Alert.alert(t('emergency.bid_sent_title'), t('emergency.bid_sent_msg'));
      fetchEmergency();
    } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  // ===== OWNER: Accept bid =====
  const handleAcceptBid = (bid: EmergencyBidEnriched) => {
    const baseTotal = (bid.travel_cost || 0) + (bid.diagnostic_cost || 0);
    const isFranchise = bid.provider_is_vat_exempt === true;
    // Must match the server price: 10 % of the provider's HT amount.
    const { fee: appFee, total: ownerTotal } = priceFromTtc(baseTotal, providerVatRate(bid.provider_is_vat_exempt));

    const arrivalStr = new Date(bid.estimated_arrival).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const providerLabel = bid.provider_company || bid.provider_name;
    const siretLine = bid.provider_siret ? `\nSIRET : ${bid.provider_siret}` : '';
    const tvaLine = isFranchise
      ? '\nTVA non applicable (art. 293 B CGI)'
      : '\nTVA comprise dans le prix de la prestation';
    Alert.alert(
      t('emergency.owner_accept_title'),
      `${t('emergency.owner_technician')} ${providerLabel}${siretLine}\n\n${t('emergency.owner_displacement')} ${baseTotal.toFixed(2)}€ TTC${tvaLine}\n${t('emergency.owner_fee')} ${appFee.toFixed(2)}€ TTC\n\n${t('emergency.owner_total')} ${ownerTotal.toFixed(2)}€ TTC\n${t('emergency.owner_eta')} ${arrivalStr}\n\nEn cas d’absence, vous pourrez la signaler 30 minutes après l’heure annoncée. Le support vérifiera la situation avant remboursement.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: `${t('emergency.owner_pay')} ${ownerTotal.toFixed(2)}€`, onPress: async () => {
            try {
              setLoading(true);
              // Provider's Stripe Connect ID will be passed here when implemented (bid.provider_stripe_id)
              const { clientSecret, paymentIntentId } = await createPaymentIntent(ownerTotal, { emergencyId, bidId: bid.id }, 'manual', undefined, undefined, await confirmEarlyExecution());

              const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'Altio',
                paymentIntentClientSecret: clientSecret,
                allowsDelayedPaymentMethods: true,
              });
              if (initError) throw new Error(initError.message);

              const { error: presentError } = await presentPaymentSheet();
              if (presentError) throw new Error(presentError.message);

              await acceptEmergencyBid(emergencyId!, bid.id, bid.provider_id, paymentIntentId);
              Alert.alert('Prestataire confirmé', 'Le montant est autorisé, pas encore encaissé. Après déclaration de fin, validez ou signalez un problème sous 48 heures.');
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
      `${bid.provider_name} ne sera plus visible pour cette mission.`,
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

    const { service: baseTotal, fee: appFee, total: ownerTotal } = quotePrice(quote);

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
              const { clientSecret, paymentIntentId } = await createPaymentIntent(ownerTotal, { emergencyId, quoteId: quote.id }, 'manual', undefined, undefined, await confirmEarlyExecution());

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
    Alert.alert('Déclarer cette étape terminée ?', 'Le propriétaire pourra valider ou contester. Sans réponse, le paiement sera déclenché après 48 heures, avec un rappel à 24 heures.', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'), onPress: async () => {
          try {
            const phase = emergency?.status === 'on_site' ? 'visit' : 'repair';
            // The repair step requires the diagnostic step; declare it first when it is missing.
            if (phase === 'repair' && !completionSteps.some(step => step.phase === 'visit')) {
              await completionAction(emergencyId!, 'visit', 'declare');
            }
            await actOnCompletion(phase, 'declare', true);
          } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
        }
      },
    ]);
  };

  const handleReportNoShow = () => {
    const acceptedBid = emergency?.bids?.find((bid: EmergencyBidEnriched) => bid.status === 'accepted');
    const expectedAt = acceptedBid?.estimated_arrival ? new Date(acceptedBid.estimated_arrival).getTime() : null;
    const reportAvailableAt = expectedAt ? expectedAt + 30 * 60 * 1000 : null;

    if (reportAvailableAt && Date.now() < reportAvailableAt) {
      Alert.alert(
        'Prestataire en retard',
        `Vous pourrez signaler une absence 30 minutes après l’heure d’arrivée annoncée, soit à ${new Date(reportAvailableAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. Vous pouvez le contacter dès maintenant via la discussion.`,
      );
      return;
    }

    Alert.alert(
      'Signaler l’absence du prestataire ?',
      'Une réclamation sera ouverte. Le support vérifiera la situation et traitera le remboursement des frais de déplacement et de diagnostic si l’absence est confirmée.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          onPress: () => router.push({
            pathname: '/reclamation',
            params: { emergencyId, reason: 'no_show' },
          }),
        },
      ],
    );
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
    const followUp = providerMissionFollowUp({ ...emergency, is_emergency: true, completion_steps: completionSteps });
    const visitFinished = completionSteps.some(step => step.phase === 'visit' && step.finish_emergency);
    const repairFinished = completionSteps.some(step => step.phase === 'repair');
    const activeBids = (emergency.bids || []).filter((b: EmergencyBidEnriched) => b.status !== 'rejected' && b.status !== 'cancelled');
    const acceptedBid = emergency.bids?.find((b: EmergencyBidEnriched) => b.status === 'accepted');

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: MARKETPLACE.cobalt }]} testID="emergency-detail-screen" edges={['top']}>
        <LinearGradient
          colors={[MARKETPLACE.cobalt, MARKETPLACE.cobalt]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{"Détail de la mission"}</Text>
          <TouchableOpacity onPress={fetchEmergency} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView style={{ backgroundColor: MARKETPLACE.canvas }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <LinearGradient colors={[MARKETPLACE.cobalt, MARKETPLACE.cobalt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emergencyHero}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroPriorityPill}>
                <Ionicons name={isUrgentMission({ ...emergency, is_emergency: true }) ? "flash" : "calendar-outline"} size={13} color={MARKETPLACE.iceInk} />
                <Text style={styles.heroPriorityText}>{isUrgentMission({ ...emergency, is_emergency: true }) ? 'MISSION URGENTE' : 'INTERVENTION PLANIFIÉE'}</Text>
              </View>
              <View style={[styles.heroStatusDot, { backgroundColor: statusInfo.color }]} />
            </View>
            <View style={styles.heroMainRow}>
              <View style={styles.heroServiceIcon}>
                <Ionicons name={statusInfo.icon as IoniconsName} size={28} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroServiceTitle}>{getServiceTypeLabel(emergency.service_type)}</Text>
                <Text style={styles.heroPropertyName}>{emergency.property_name || 'Votre logement'}</Text>
              </View>
            </View>
            <View style={styles.heroStatusRow}>
              <Ionicons name={statusInfo.icon as IoniconsName} size={17} color="#CFE5F2" />
              <Text style={styles.heroStatusText}>{!isOwner && followUp ? t(`alpine.${followUp}`) : statusInfo.label}</Text>
              {timeLeft && emergency.status === 'bids_open' ? <Text style={styles.heroTimer}>{timeLeft}</Text> : null}
            </View>
          </LinearGradient>

          {!isOwner && isMyEmergency && followUp && <View style={[styles.statusBanner, marketStyles.waiting]}>
            <Ionicons name="time-outline" size={22} color={COLORS.textSecondary} />
            <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{t(`alpine.${followUp}`)}</Text>
              {followUp === 'completionWaiting' && <Text style={styles.waitText}>{t('alpine.completionWaitingHelp')}</Text>}
            </View>
          </View>}
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

          {(isOwner || isMyEmergency) && (completionSteps.length > 0 || !!completionError || (!isOwner && ['quote_sent', 'quote_submitted', 'quote_refused', 'quote_accepted', 'in_progress'].includes(emergency.status))) && (
            <View style={[styles.card, followUp && marketStyles.waiting]}>
              <Text style={styles.sectionTitle}>{t('alpine.validationAndPayment')}</Text>
              <Text style={{ ...FONTS.bodySmall, marginVertical: 8 }}>Après déclaration de fin : validation par le propriétaire ou paiement après 48 h sans contestation, avec rappel à 24 h. Vos recours restent possibles après paiement.</Text>
              {!!completionError && <Text style={{ color: COLORS.urgency }}>{completionError}</Text>}
              {(['visit', 'repair'] as const).map(phase => {
                const step = completionSteps.find(row => row.phase === phase);
                const label = phase === 'visit' ? 'Déplacement et diagnostic' : 'Réparation';
                const hasMainCompletionAction = (phase === 'visit' && emergency.status === 'on_site' && !quote) || (phase === 'repair' && emergency.status === 'quote_accepted');
                const canDeclare = !hasMainCompletionAction && !isOwner && isMyEmergency && !step && (phase === 'visit'
                  ? ['on_site', 'quote_sent', 'quote_submitted', 'quote_refused', 'quote_accepted', 'in_progress'].includes(emergency.status)
                  : ['quote_accepted', 'in_progress'].includes(emergency.status));
                if (!step && !canDeclare) return null;
                return <View key={phase} style={{ marginTop: 12 }}>
                  <Text style={{ ...FONTS.bodySmall, fontWeight: '700' }}>{label}</Text>
                  {step && <Text style={FONTS.bodySmall}>{step.paid_at && step.disputed_at ? 'Paiement confirmé — contestation enregistrée, examen du support nécessaire' : step.status === 'paid' ? 'Paiement confirmé' : step.status === 'disputed' ? 'Contestation enregistrée — examen du support nécessaire' : step.status === 'payment_required' ? 'Autorisation à renouveler — contactez le support' : step.status === 'processing' ? 'Paiement en cours de vérification' : `À valider avant le ${new Date(step.due_at).toLocaleString('fr-FR')}`}</Text>}
                  {!!step?.paid_at && <View style={{ marginTop: SPACING.sm }}>
                    <Text style={FONTS.bodySmall}>{step.invoiced_at ? 'Factures disponibles' : step.invoice_error ? 'Paiement confirmé. La génération de la facture sera réessayée automatiquement.' : 'Paiement confirmé. Factures en préparation.'}</Text>
                    <TouchableOpacity accessibilityRole="button" onPress={() => router.push(isOwner ? '/(owner)/invoices' : '/(provider)/invoices')} style={{ paddingVertical: SPACING.md }}><Text style={{ color: COLORS.brandPrimary }}>Consulter mes factures</Text></TouchableOpacity>
                  </View>}
                  {!isOwner && isMyEmergency && phase === 'visit' && step?.status === 'paid' && ['on_site','quote_refused'].includes(emergency.status) && <TouchableOpacity disabled={completionBusy} onPress={() => actOnCompletion('visit','declare',true)} style={{paddingVertical:12}}><Text>Clôturer sans réparation supplémentaire</Text></TouchableOpacity>}
                  {canDeclare && <TouchableOpacity disabled={completionBusy || !!completionError} onPress={() => Alert.alert('Étape terminée ?', 'Cette déclaration ouvre le délai de validation de 48 heures.', [{text:'Annuler',style:'cancel'},{text:'Déclarer terminée',onPress:()=>actOnCompletion(phase,'declare')}])} style={styles.mainActionBtn}><Text style={{color:'white'}}>Déclarer cette étape terminée</Text></TouchableOpacity>}
                  {isOwner && step?.status === 'pending' && <TouchableOpacity disabled={completionBusy} onPress={() => Alert.alert('Valider et payer ?', 'Vous confirmez la fin de cette étape et demandez le paiement du montant autorisé.', [{text:'Annuler',style:'cancel'},{text:'Valider et payer',onPress:()=>actOnCompletion(phase,'approve')}])} style={styles.mainActionBtn}><Text style={{color:'white'}}>Valider et payer cette étape</Text></TouchableOpacity>}
                  {isOwner && step && !step.disputed_at && <TouchableOpacity disabled={completionBusy} onPress={() => setDisputePhase(phase)} style={{paddingVertical:12}}><Text style={{color:COLORS.urgency}}>Signaler un problème</Text></TouchableOpacity>}
                  {disputePhase === phase && <View>
                    <TextInput accessibilityLabel="Décrivez le problème" placeholder="Décrivez le problème (5 caractères minimum)" multiline maxLength={2000} value={disputeReason} onChangeText={setDisputeReason} style={{borderWidth:1,borderColor:COLORS.urgency,padding:12}} />
                    <TouchableOpacity disabled={completionBusy || disputeReason.trim().length < 5} onPress={() => actOnCompletion(phase,'dispute')} style={{paddingVertical:12}}><Text>Envoyer la contestation</Text></TouchableOpacity>
                  </View>}
                </View>;
              })}
            </View>
          )}

          {/* Status banner — hidden for providers during owner-facing search phase */}
          {!followUp && !(!isOwner && emergency.status === 'bids_open') && (
            <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '18' }]}>
              <Ionicons name={statusInfo.icon as IoniconsName} size={22} color={statusInfo.color} />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
          )}

          {/* Emergency info */}
          <View style={[styles.card, styles.urgentCard]}>
            <View style={styles.signalementTitleRow}>
              <View style={styles.signalementIcon}><Ionicons name="document-text-outline" size={18} color="#F36D45" /></View>
              <Text style={styles.signalementTitle}>Signalement</Text>
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
            <MissionContact title={isOwner ? emergency.provider_name || t('alpine.yourProvider') : t('alpine.yourOwner')} subtitle={emergency.property_name}
              onPress={() => router.push(`/chat/${emergencyId}?type=emergency&receiverId=${isOwner ? emergency.accepted_provider_id : emergency.owner_id}&title=Discussion`)} />
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
                          <Text style={styles.bidDetailText}>{t('emergency.bid_displacement_detail')} {bid.travel_cost}€ TTC</Text>
                        </View>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="search-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>{t('emergency.bid_diagnostic_detail')} {bid.diagnostic_cost}€ TTC</Text>
                        </View>
                        <View style={styles.bidDetailItem}>
                          <Ionicons name="pricetag-outline" size={13} color={COLORS.textTertiary} />
                          <Text style={styles.bidDetailText}>
                            {bid.provider_is_vat_exempt === true
                              ? 'TVA non applicable, art. 293 B du CGI'
                              : 'TVA comprise dans le prix'}
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
              {acceptedBid?.estimated_arrival ? (
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: SPACING.sm }}>
                  Arrivée annoncée : {new Date(acceptedBid.estimated_arrival).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}
              <TouchableOpacity
                style={{ marginTop: SPACING.md, paddingVertical: 11, alignItems: 'center', borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: COLORS.urgencySoft }}
                onPress={handleReportNoShow}
              >
                <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: COLORS.urgency }}>
                  Le prestataire ne s’est pas présenté
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ━━━ OWNER: On site — diagnostic in progress (may complete without quote if first hour is enough) ━━━ */}
          {isOwner && emergency.status === 'on_site' && !quote && !visitFinished && (
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
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary }}>Montant total TTC</Text>
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
                  <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary }}>Prestation TTC</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: COLORS.textPrimary }}>{quotePrice(quote).service.toFixed(2)}€</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary }}>Frais de service Altio</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: COLORS.textPrimary }}>{quotePrice(quote).fee.toFixed(2)}€</Text>
                </View>
                <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: COLORS.textPrimary }}>Total à payer</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: COLORS.brandPrimary }}>{quotePrice(quote).total.toFixed(2)}€ TTC</Text>
                </View>
              </View>

              <View style={styles.quoteBanner}>
                <Ionicons name="card-outline" size={15} color={COLORS.warning} />
                <Text style={styles.quoteBannerText}>
                  {t('emergency.hold_banner_text', { amount: quotePrice(quote).total })}
                </Text>
              </View>
              <TouchableOpacity style={styles.acceptBidBtn} onPress={handleAcceptQuote}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.textInverse} />
                <Text style={styles.acceptBidBtnText}>Accepter et payer {quotePrice(quote).total.toFixed(2)}€</Text>
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
                    {t('emergency.hold_amount_info', { amount: quotePrice(quote).total, date: new Date(quote.stripe_capture_deadline).toLocaleDateString('fr-FR') })}
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
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: COLORS.textTertiary, marginTop: -SPACING.sm, marginBottom: SPACING.md }}>
                Plafond : {MAX_TRAVEL_FEE_EUR} €
              </Text>
              <Text style={styles.fieldLabel}>{t('emergency.bid_diag')}</Text>
              <TextInput
                style={styles.input}
                value={diagnosticCost}
                onChangeText={setDiagnosticCost}
                keyboardType="numeric"
                placeholder="ex: 30"
                placeholderTextColor={COLORS.textTertiary}
              />
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: COLORS.textTertiary, marginTop: -SPACING.sm, marginBottom: SPACING.md }}>
                Plafond : {MAX_DIAGNOSTIC_FEE_EUR} € — total déplacement + diagnostic : {MAX_VISIT_FEE_EUR} € maximum
              </Text>
              {(() => {
                const travel = parseFloat(travelCost) || 0;
                const diag = parseFloat(diagnosticCost) || 0;
                if (travel + diag <= 0) return null;
                return (
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: COLORS.success, marginTop: -SPACING.xs, marginBottom: SPACING.sm }}>
                    {`Montant que vous recevrez : ${priceFromTtc(travel + diag, providerVatRate(user?.is_vat_exempt)).payout.toFixed(2)}€`}
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
                <Text style={[styles.amountValue, { color: COLORS.success }]}>{priceFromTtc((myBid.travel_cost || 0) + (myBid.diagnostic_cost || 0), providerVatRate(user?.is_vat_exempt)).payout.toFixed(2)}€</Text>
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
                <Text style={styles.mainActionBtnText}>Se rendre sur place</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: COLORS.success }]} onPress={handleMarkArrived}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>Je suis arrivé sur place</Text>
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
          {!isOwner && isMyEmergency && emergency.status === 'on_site' && !quote && !visitFinished && (
            <View style={marketStyles.actionPanel}>
              <Text style={styles.actionEyebrow}>{t('alpine.missionSummary')}</Text>
              <TouchableOpacity disabled={completionBusy || !!completionError} style={[styles.mainActionBtn, { marginTop: 0, opacity: completionBusy || completionError ? 0.5 : 1 }]} onPress={handleComplete}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>{t('emergency.complete_no_quote_btn')}</Text>
              </TouchableOpacity>
              <QuoteChoice disabled={completionBusy} onPress={handleOpenQuoteForm} />
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
                    <Text style={[styles.amountValue, { color: COLORS.success }]}>{quotePrice(quote).payout.toFixed(2)}€</Text>
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
                      <Text style={[styles.amountValue, { color: COLORS.success }]}>{quotePrice(quote).payout.toFixed(2)}€</Text>
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
              {!repairFinished && <TouchableOpacity disabled={completionBusy || !!completionError} style={[styles.mainActionBtn, { backgroundColor: COLORS.success }]} onPress={handleComplete}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionBtnText}>{t('emergency.complete_btn')}</Text>
              </TouchableOpacity>}
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
              style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: COLORS.urgencySoft, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={() => {
                Alert.alert(
                  'Annuler la mission ?',
                  'Les candidatures en cours seront annulées. Cette action est irréversible.',
                  [
                    { text: 'Non', style: 'cancel' },
                    { text: 'Oui, annuler', style: 'destructive', onPress: async () => {
                      try {
                        await cancelEmergency(emergencyId!);
                        Alert.alert('Mission annulée', 'Votre demande d\'intervention a été annulée.');
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
              <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#EF4444' }}>Annuler la mission</Text>
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
          colors={[MARKETPLACE.cobalt, MARKETPLACE.cobalt]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
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
  container: { flex: 1, backgroundColor: MARKETPLACE.canvas },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F8F7' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.xl,
    backgroundColor: MARKETPLACE.cobalt,
  },
  backBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  refreshBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  headerTitle: { ...FONTS.h2, color: '#FFFFFF' },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl, paddingTop: 0 },
  emergencyHero: { ...marketStyles.hero },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroPriorityPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: MARKETPLACE.ice },
  heroPriorityText: { fontFamily: 'PlusJakartaSans_700Bold', color: MARKETPLACE.iceInk, fontSize: 10, letterSpacing: 0.4 },
  heroStatusDot: { width: 10, height: 10, borderRadius: 5, shadowColor: '#FFFFFF', shadowOpacity: 0.7, shadowRadius: 8 },
  heroMainRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.lg },
  heroServiceIcon: { width: 58, height: 58, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  heroServiceTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 23, color: '#FFFFFF', textTransform: 'capitalize' },
  heroPropertyName: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: '#CFE5F2', marginTop: 3 },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  heroStatusText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: '#E9F4FA', flex: 1 },
  heroTimer: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: '#FFFFFF' },
  // Status banner
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderRadius: 16, marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(99,117,138,0.14)' },
  statusText: { ...FONTS.bodySmall, fontWeight: '700', flex: 1, fontSize: 13 },
  // Cards
  card: { backgroundColor: '#FFFFFF', padding: SPACING.xl, borderRadius: 20, marginBottom: SPACING.md, shadowColor: '#1C2E42', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2, borderWidth: 1, borderColor: '#E7ECEF' },
  urgentCard: { borderTopWidth: 3, borderTopColor: '#F36D45' },
  signalementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  signalementIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFF1E9', justifyContent: 'center', alignItems: 'center' },
  signalementTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#12233C' },
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
  mainActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: 14, minHeight: 52, marginTop: SPACING.md },
  mainActionBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  actionEyebrow: { ...FONTS.caption, color: MARKETPLACE.iceInk, fontSize: 11, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  // Form
  fieldLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginTop: SPACING.lg, marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  // Create form
  urgentBanner: { alignItems: 'center', backgroundColor: '#FFF7F3', padding: SPACING.xxl, borderRadius: 24, marginBottom: SPACING.xl, borderWidth: 1, borderColor: '#FFD9C8', shadowColor: '#F36D45', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.09, shadowRadius: 16, elevation: 2 },
  urgentBannerTitle: { ...FONTS.h1, color: '#12233C', marginTop: SPACING.md, textAlign: 'center' },
  urgentBannerDesc: { ...FONTS.body, color: '#63758A', textAlign: 'center', marginTop: SPACING.md, lineHeight: 24 },
  propScroll: { maxHeight: 50, marginBottom: SPACING.md },
  propChip: { paddingHorizontal: SPACING.xl, paddingVertical: 12, borderRadius: RADIUS.full, backgroundColor: COLORS.paper, marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.card },
  propChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  propChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  propChipTextActive: { color: COLORS.textInverse },
  addrPreview: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md, paddingHorizontal: SPACING.md, backgroundColor: COLORS.subtle, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
  addrPreviewText: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '500' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  serviceTypeCard: { width: '31%', padding: SPACING.lg, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', borderWidth: 1, borderColor: '#E7ECEF', gap: SPACING.sm },
  serviceTypeActive: { backgroundColor: '#F36D45', borderColor: '#F36D45', shadowColor: '#F36D45', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
  serviceTypeText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 11, textAlign: 'center', fontWeight: '600' },
  serviceTypeTextActive: { color: COLORS.textInverse },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: '#F36D45', paddingVertical: SPACING.lg, borderRadius: 18, marginTop: SPACING.xxl, shadowColor: '#F36D45', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 6 },
  emergencyBtnText: { ...FONTS.h2, color: COLORS.textInverse },
  // Photo picker
  photoPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', marginBottom: SPACING.md },
  photoPickerText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  photoGrid: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 80, height: 80, borderRadius: RADIUS.md },
  photoRemoveBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: COLORS.paper, borderRadius: 12 },
});
