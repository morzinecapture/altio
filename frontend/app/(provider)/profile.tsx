import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, ActivityIndicator, TextInput, Image, Linking, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useQuery } from '@tanstack/react-query';
import { useProfile } from '../../src/hooks';
import { updateProviderProfile, geocodeAddress, createStripeConnectAccount, deleteAccount, connectGoogleCalendar, disconnectGoogleCalendar, updateMarketingConsent, getMarketingConsent } from '../../src/api';
import { supabase } from '../../src/lib/supabase';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../src/i18n';

// TODO: ajouter votre Google OAuth Client ID dans .env
// EXPO_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID=xxxx.apps.googleusercontent.com
const GOOGLE_CALENDAR_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID ?? '';

const SPECIALTIES = [
  { id: 'cleaning', icon: 'sparkles-outline' as const, label: 'Ménage' },
  { id: 'linen', icon: 'shirt-outline' as const, label: 'Linge' },
  { id: 'plumbing', icon: 'water-outline' as const, label: 'Plomberie' },
  { id: 'electrical', icon: 'flash-outline' as const, label: 'Électricité' },
  { id: 'locksmith', icon: 'key-outline' as const, label: 'Serrurerie' },
  { id: 'jacuzzi', icon: 'water-outline' as const, label: 'Jacuzzi / Spa' },
  { id: 'repair', icon: 'construct-outline' as const, label: 'Réparation' },
];

const RADIUS_OPTIONS = [5, 10, 20, 30, 50];

const DAYS = [
  { id: 'monday', label: 'Lun' },
  { id: 'tuesday', label: 'Mar' },
  { id: 'wednesday', label: 'Mer' },
  { id: 'thursday', label: 'Jeu' },
  { id: 'friday', label: 'Ven' },
  { id: 'saturday', label: 'Sam' },
  { id: 'sunday', label: 'Dim' },
];

const COMPANY_TYPE_LABELS: Record<string, string> = {
  auto_entrepreneur: 'Auto-entrepreneur',
  artisan: 'Artisan',
  eurl_sasu: 'EURL / SASU',
  sarl_sas: 'SARL / SAS',
};

const FAQ_PROVIDER = [
  { q: 'Comment candidater à une mission ?', a: 'Dans le tableau de bord, les missions disponibles apparaissent automatiquement selon votre zone et vos spécialités. Appuyez sur "Candidater" pour proposer votre tarif.' },
  { q: 'Comment activer ma disponibilité ?', a: 'Utilisez le switch "Disponible / Indisponible" en haut du tableau de bord. Désactivez-le quand vous n\'êtes pas disponible pour éviter de recevoir des missions.' },
  { q: 'Comment envoyer un devis pour une urgence ?', a: 'Acceptez l\'urgence depuis le tableau de bord, indiquez vos frais de déplacement et d\'arrivée estimée. Une fois sur place et après paiement du déplacement, vous pouvez envoyer votre devis réparation.' },
  { q: 'Quand suis-je payé ?', a: 'Le paiement est automatiquement transféré sur votre compte Stripe dès que le propriétaire valide l\'intervention terminée. Généralement sous 1 à 2 jours ouvrés.' },
  { q: 'Puis-je refuser une mission ?', a: 'Oui, vous êtes libre d\'accepter ou refuser chaque mission. Si vous n\'êtes pas disponible, désactivez simplement votre disponibilité.' },
];

export default function ProviderProfile() {
  const router = useRouter();
  const { user, setUser, handleLogout } = useAuth();
  const { t, i18n } = useTranslation();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Spécialités & Zone state
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [radiusKm, setRadiusKm] = useState(20);
  const [availability, setAvailability] = useState<string[]>([]);
  const [locationLabel, setLocationLabel] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [connectingGcal, setConnectingGcal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit profile state
  const [editBio, setEditBio] = useState('');
  const [editHourlyRate, setEditHourlyRate] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Documents modal state
  const [docSiret, setDocSiret] = useState('');
  const [docCompanyName, setDocCompanyName] = useState('');
  const [rcProDocUrl, setRcProDocUrl] = useState<string | null>(null);
  const [decennaleDocUrl, setDecennaleDocUrl] = useState<string | null>(null);
  const [savingDocuments, setSavingDocuments] = useState(false);
  const [uploadingRcPro, setUploadingRcPro] = useState(false);
  const [uploadingDecennale, setUploadingDecennale] = useState(false);

  // Marketing consent state (RGPD / CPCE art. L34-5)
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);

  // Zone broadcast opt-in (push for new missions/emergencies in provider's zone)
  const [notifyZone, setNotifyZone] = useState(true);
  const [savingNotifyZone, setSavingNotifyZone] = useState(false);

  const { data: marketingConsentData } = useQuery({
    queryKey: ['marketing-consent'],
    queryFn: getMarketingConsent,
  });

  useEffect(() => {
    if (marketingConsentData !== undefined) setMarketingConsent(marketingConsentData);
  }, [marketingConsentData]);

  const handleToggleNotifyZone = async (value: boolean) => {
    setSavingNotifyZone(true);
    try {
      await updateProviderProfile({ notify_new_missions_in_zone: value });
      setNotifyZone(value);
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de mettre à jour vos préférences.');
    } finally {
      setSavingNotifyZone(false);
    }
  };

  const handleToggleMarketingConsent = async (value: boolean) => {
    setSavingConsent(true);
    try {
      await updateMarketingConsent(value);
      setMarketingConsent(value);
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de mettre a jour vos preferences.');
    } finally {
      setSavingConsent(false);
    }
  };

  const onLogout = async () => {
    await handleLogout();
    setTimeout(() => router.replace('/'), 0);
  };

  const { data: profileData, refetch: refetchProfile, isLoading: profileQueryLoading } = useProfile();

  // Sync profile data to local form state
  useEffect(() => {
    if (profileData) {
      const pp = profileData.provider_profile;
      if (pp) {
        setSpecialties(pp.specialties || []);
        setRadiusKm(pp.radius_km || 20);
        setAvailability(pp.weekly_availability || []);
        setLocationLabel(pp.location_label || '');
        setEditBio(pp.bio || '');
        setEditHourlyRate(pp.hourly_rate ? String(pp.hourly_rate) : '');
        setNotifyZone(pp.notify_new_missions_in_zone !== false);
      }
      setGcalConnected(!!profileData.google_calendar_token);
      // siren lives on users table
      setDocSiret(profileData.siren || '');
    }
  }, [profileData]);

  const loadProviderProfile = async () => {
    setLoadingProfile(true);
    try {
      await refetchProfile();
    } catch (e) { console.error(e); }
    finally { setLoadingProfile(false); }
  };

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]?.uri || !user?.id) return;
      setUploadingAvatar(true);
      const uri = result.assets[0].uri;
      // Read file as base64 (reliable in React Native, unlike fetch().blob())
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      // Convert base64 to Uint8Array for Supabase upload
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      // Unique filename to avoid cache issues
      const filePath = `${user.id}/avatar_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes.buffer, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      await supabase.from('users').update({ picture: publicUrl }).eq('id', user.id);
      setUser({ ...user, picture: publicUrl });
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e) || 'Impossible de mettre à jour la photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleOpenEditProfile = async () => {
    setLoadingProfile(true);
    setActiveModal('edit-profile');
    try {
      const { data: profile } = await refetchProfile();
      const pp = profile?.provider_profile;
      setEditBio(pp?.bio || '');
      setEditHourlyRate(pp?.hourly_rate ? String(pp.hourly_rate) : '');
    } catch (e) { console.error(e); }
    finally { setLoadingProfile(false); }
  };

  const handleSaveEditProfile = async () => {
    setSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {};
      payload.bio = editBio.trim();
      const rate = parseFloat(editHourlyRate);
      if (!isNaN(rate) && rate >= 0) payload.hourly_rate = rate;
      await updateProviderProfile(payload as Parameters<typeof updateProviderProfile>[0]);
      Alert.alert('Enregistré !', 'Votre profil a été mis à jour.');
      setActiveModal(null);
      refetchProfile();
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally { setSavingProfile(false); }
  };

  const handleOpenDocuments = async () => {
    setLoadingProfile(true);
    setActiveModal('documents');
    try {
      const { data: profile } = await refetchProfile();
      const pp = profile?.provider_profile;
      setRcProDocUrl(pp?.rc_pro_doc_url || null);
      setDecennaleDocUrl(pp?.decennale_doc_url || null);
      // siren & company_name live on users, not provider_profiles
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: userData } = await supabase.from('users').select('siren, company_name').eq('id', session.user.id).single();
        setDocSiret(userData?.siren || '');
        setDocCompanyName(userData?.company_name || '');
      }
    } catch (e) { console.error(e); }
    finally { setLoadingProfile(false); }
  };

  const handleUploadInsuranceDoc = async (type: 'rc_pro' | 'decennale') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri || !user?.id) return;
      if (type === 'rc_pro') setUploadingRcPro(true);
      else setUploadingDecennale(true);
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const fileName = type === 'rc_pro' ? 'rc_pro.jpg' : 'decennale.jpg';
      const { error } = await supabase.storage
        .from('insurance-documents')
        .upload(`${user.id}/${fileName}`, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('insurance-documents').getPublicUrl(`${user.id}/${fileName}`);
      if (type === 'rc_pro') setRcProDocUrl(publicUrl);
      else setDecennaleDocUrl(publicUrl);
      Alert.alert('Document ajouté', 'Votre document a bien été uploadé.');
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e) || 'Impossible d\'uploader le document.');
    } finally {
      setUploadingRcPro(false);
      setUploadingDecennale(false);
    }
  };

  const handleSaveDocuments = async () => {
    setSavingDocuments(true);
    try {
      // siren lives on users table, not provider_profiles
      await supabase.from('users').update({
        siren: docSiret.replace(/\s/g, ''),
        ...(docCompanyName.trim() ? { company_name: docCompanyName.trim() } : {}),
      }).eq('id', user?.id);
      await updateProviderProfile({
        rc_pro_doc_url: rcProDocUrl ?? undefined,
        decennale_doc_url: decennaleDocUrl ?? undefined,
      });
      Alert.alert('Enregistré !', 'Vos documents et informations ont été mis à jour.');
      setActiveModal(null);
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingDocuments(false);
    }
  };

  // Profile is loaded via useProfile() hook — no manual useEffect needed

  const handleConnectGoogleCalendar = async () => {
    if (!GOOGLE_CALENDAR_CLIENT_ID) {
      Alert.alert('Configuration manquante', 'EXPO_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID non défini dans .env');
      return;
    }
    setConnectingGcal(true);
    try {
      // URL HTTPS via Supabase relay — Google n'accepte pas les custom schemes (altio://)
      const supabaseRedirectUri = 'https://vtybccqqbyjbmhkpliyn.supabase.co/functions/v1/google-calendar-callback';
      // Deep link que l'app va recevoir après le relay
      const appDeepLink = ExpoLinking.createURL('auth/google-calendar-callback');
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const authUrl = [
        'https://accounts.google.com/o/oauth2/v2/auth',
        `?client_id=${GOOGLE_CALENDAR_CLIENT_ID}`,
        `&redirect_uri=${encodeURIComponent(supabaseRedirectUri)}`,
        '&response_type=code',
        '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events',
        '&access_type=offline',
        '&prompt=consent',
        `&code_challenge=${codeChallenge}`,
        '&code_challenge_method=S256',
      ].join('');

      const result = await WebBrowser.openAuthSessionAsync(authUrl, appDeepLink);

      if (result.type === 'success' && result.url) {
        const params = ExpoLinking.parse(result.url);
        const code = params.queryParams?.code as string | undefined;
        if (code) {
          await connectGoogleCalendar(code, codeVerifier);
          setGcalConnected(true);
          Alert.alert('✅ Connecté !', 'Google Calendar synchronisera vos missions automatiquement.');
          setActiveModal(null);
        }
      }
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setConnectingGcal(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    Alert.alert(
      'Déconnecter Google Calendar',
      'Les nouvelles missions ne seront plus ajoutées à votre calendrier.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: async () => {
            await disconnectGoogleCalendar();
            setGcalConnected(false);
          },
        },
      ],
    );
  };

  const handleOpenZone = () => {
    loadProviderProfile();
    setActiveModal('zone');
  };

  const handleSaveZone = async () => {
    setSaving(true);
    try {
      let geoUpdate: { latitude?: number; longitude?: number; location_label?: string } = {};
      if (locationLabel.trim()) {
        const coords = await geocodeAddress(locationLabel.trim());
        if (coords) {
          geoUpdate = { latitude: coords.lat, longitude: coords.lng, location_label: locationLabel.trim() };
        } else {
          geoUpdate = { location_label: locationLabel.trim() };
        }
      }
      await updateProviderProfile({ specialties, radius_km: radiusKm, weekly_availability: availability, ...geoUpdate });
      Alert.alert('Enregistré !', 'Votre profil prestataire a été mis à jour.');
      setActiveModal(null);
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  const handleConnectStripe = async () => {
    setConnectingStripe(true);
    try {
      const result = await createStripeConnectAccount();
      if (result?.error) {
        Alert.alert('Erreur Stripe', result.error);
        return;
      }
      if (result?.onboarding_complete) {
        Alert.alert('Stripe Connect', 'Votre compte Stripe est déjà configuré et actif !');
        setActiveModal(null);
        return;
      }
      if (result?.url) {
        Linking.openURL(result.url);
        setActiveModal(null);
      }
    } catch (e: unknown) {
      Alert.alert('Erreur Stripe', e instanceof Error ? e.message : String(e));
    } finally {
      setConnectingStripe(false);
    }
  };

  const toggleSpecialty = (id: string) =>
    setSpecialties(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const toggleDay = (id: string) =>
    setAvailability(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  const pp = profileData?.provider_profile;
  const docsComplete = !!docSiret && !!pp?.rc_pro_doc_url;
  const stripeConfigured = !!pp?.stripe_account_id;

  const menuItems = [
    { id: 'edit-profile', icon: 'create-outline' as const, label: 'Modifier mon profil', onPress: handleOpenEditProfile },
    { id: 'notifications', icon: 'notifications-outline' as const, label: t('provider.profile.menu_notifications') },
    { id: 'documents', icon: 'document-attach-outline' as const, label: 'Mes documents & SIRET', onPress: handleOpenDocuments, badge: docsComplete ? 'done' as const : 'todo' as const },
    { id: 'zone', icon: 'settings-outline' as const, label: 'Spécialités & Zone', onPress: handleOpenZone },
    { id: 'integrations', icon: 'calendar-outline' as const, label: t('provider.profile.menu_calendar') },
    { id: 'paiements', icon: 'card-outline' as const, label: t('owner.profile.menu_payments'), badge: stripeConfigured ? 'done' as const : 'todo' as const },
    { id: 'langue', icon: 'language-outline' as const, label: t('provider.profile.menu_language') },
    { id: 'aide', icon: 'help-circle-outline' as const, label: t('provider.profile.menu_help') },
    { id: 'reclamation', icon: 'chatbubble-ellipses-outline' as const, label: 'Réclamation', onPress: () => router.push('/reclamation' as never) },
  ];

  return (
    <SafeAreaView style={styles.container} testID="provider-profile">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}><Text style={styles.title}>Profil</Text></View>

        <View style={styles.userCard}>
          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.7} style={styles.avatarWrap}>
            {uploadingAvatar ? (
              <View style={styles.avatar}>
                <ActivityIndicator size="small" color={COLORS.brandPrimary} />
              </View>
            ) : user?.picture ? (
              <Image
                source={{ uri: user.picture }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 28, color: COLORS.textInverse, fontWeight: '700' }}>
                  {(user?.name || 'P').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.cameraIconOverlay}>
              <Ionicons name="camera" size={14} color={COLORS.textInverse} />
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          {editBio ? (
            <Text style={{ ...FONTS.bodySmall, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, marginHorizontal: SPACING.md }} numberOfLines={2}>{editBio}</Text>
          ) : null}
          <View style={styles.roleBadge}>
            <Ionicons name="construct-outline" size={14} color={COLORS.brandPrimary} />
            <Text style={styles.roleText}>Prestataire</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuItem, i === menuItems.length - 1 && { borderBottomWidth: 0 }]}
              onPress={item.onPress || (() => setActiveModal(item.id))}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon} size={20} color={COLORS.brandPrimary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              {'badge' in item && item.badge === 'done' && (
                <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginRight: 6 }}>
                  <Text style={{ color: '#16A34A', fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{item.id === 'paiements' ? 'Configuré' : '✓'}</Text>
                </View>
              )}
              {'badge' in item && item.badge === 'todo' && (
                <View style={{ backgroundColor: '#FFF7ED', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginRight: 6 }}>
                  <Text style={{ color: COLORS.warning, fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{item.id === 'paiements' ? 'À configurer' : 'À compléter'}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity testID="provider-logout-btn" style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.urgency} />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>


        <TouchableOpacity
          testID="delete-account-btn"
          style={styles.deleteBtn}
          onPress={() => {
            Alert.alert(
              'Supprimer mon compte',
              'Cette action est irréversible. Toutes vos données seront définitivement supprimées.',
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Continuer', style: 'destructive', onPress: () => { setDeleteConfirmText(''); setActiveModal('delete'); } },
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={20} color={COLORS.urgency} />
          <Text style={styles.deleteBtnText}>Supprimer mon compte</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Altio v1.0 — Prestataire</Text>
      </ScrollView>

      {/* ── Notifications Modal ── */}
      <Modal visible={activeModal === 'notifications'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.comingSoonWrap}>
              <View style={styles.bigIconWrap}>
                <Ionicons name="notifications-outline" size={44} color={COLORS.brandPrimary} />
              </View>
              <Text style={styles.comingSoonTitle}>Notifications</Text>
              <Text style={styles.comingSoonDesc}>Vous recevrez des notifications pour :</Text>
            </View>
            {['Nouvelles missions dans votre zone', 'Confirmation de candidature acceptée', 'Alertes d\'urgences', 'Paiements reçus'].map((item, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
                <Text style={styles.featureRowText}>{item}</Text>
              </View>
            ))}

            {/* Zone broadcast opt-in (push for new missions/emergencies) */}
            <View style={{ marginTop: SPACING.lg, paddingTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.subtle }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: SPACING.md }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.textPrimary }}>Alertes nouvelles missions</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>Recevoir une notification quand une mission ou urgence est publiée près de chez vous (max 2/heure)</Text>
                </View>
                <Switch
                  value={notifyZone}
                  onValueChange={handleToggleNotifyZone}
                  disabled={savingNotifyZone}
                  trackColor={{ false: COLORS.subtle, true: COLORS.brandPrimary }}
                  thumbColor={COLORS.textInverse}
                />
              </View>
            </View>

            {/* Marketing consent toggle (RGPD / CPCE art. L34-5) */}
            <View style={{ marginTop: SPACING.lg, paddingTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.subtle }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: SPACING.md }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.textPrimary }}>Communications commerciales</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>Recevoir des offres et nouveautes d'Altio</Text>
                </View>
                <Switch
                  value={marketingConsent}
                  onValueChange={handleToggleMarketingConsent}
                  disabled={savingConsent}
                  trackColor={{ false: COLORS.subtle, true: COLORS.brandPrimary }}
                  thumbColor={COLORS.textInverse}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Spécialités & Zone Modal (fonctionnel) ── */}
      <Modal visible={activeModal === 'zone'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Spécialités & Zone</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {loadingProfile ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={COLORS.brandPrimary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Spécialités</Text>
                <View style={styles.specialtyGrid}>
                  {SPECIALTIES.map((s) => {
                    const selected = specialties.includes(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.specialtyChip, selected && styles.specialtyChipSelected]}
                        onPress={() => toggleSpecialty(s.id)}
                      >
                        <Ionicons name={s.icon} size={16} color={selected ? COLORS.textInverse : COLORS.brandPrimary} />
                        <Text style={[styles.specialtyChipText, selected && styles.specialtyChipTextSelected]}>{s.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Rayon d'intervention</Text>
                <View style={styles.chipRow}>
                  {RADIUS_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, radiusKm === r && styles.chipSelected]}
                      onPress={() => setRadiusKm(r)}
                    >
                      <Text style={[styles.chipText, radiusKm === r && styles.chipTextSelected]}>{r} km</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Commune de départ</Text>
                <TextInput
                  style={styles.locationInput}
                  placeholder="Ex: Megève, Chamonix, Annecy..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={locationLabel}
                  onChangeText={setLocationLabel}
                  autoCorrect={false}
                />
                <Text style={styles.locationHint}>Votre lieu de départ pour calculer les distances</Text>

                <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Disponibilités habituelles</Text>
                <View style={styles.chipRow}>
                  {DAYS.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dayChip, availability.includes(d.id) && styles.chipSelected]}
                      onPress={() => toggleDay(d.id)}
                    >
                      <Text style={[styles.chipText, availability.includes(d.id) && styles.chipTextSelected]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveZone} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color={COLORS.textInverse} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textInverse} />
                      <Text style={styles.saveBtnText}>Enregistrer</Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={{ height: SPACING.xxxl }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Paiements Modal ── */}
      <Modal visible={activeModal === 'paiements'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Paiements</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.comingSoonWrap}>
              <View style={styles.bigIconWrap}>
                <Ionicons name="card-outline" size={44} color={COLORS.brandPrimary} />
              </View>
              <Text style={styles.comingSoonTitle}>Stripe Connect</Text>
              <Text style={styles.comingSoonDesc}>Connectez votre compte bancaire pour recevoir vos paiements automatiquement.</Text>
            </View>
            {[
              { icon: 'flash-outline' as const, text: 'Virement automatique après chaque mission validée' },
              { icon: 'bar-chart-outline' as const, text: 'Tableau de bord de vos revenus' },
              { icon: 'document-text-outline' as const, text: 'Factures générées en votre nom' },
              { icon: 'shield-checkmark-outline' as const, text: 'Conforme aux obligations fiscales françaises' },
            ].map((item, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name={item.icon} size={16} color={COLORS.info} />
                <Text style={styles.featureRowText}>{item.text}</Text>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#635BFF', marginTop: SPACING.xxl }]}
              onPress={handleConnectStripe}
              disabled={connectingStripe}
            >
              {connectingStripe ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Ionicons name="link-outline" size={20} color={COLORS.textInverse} />
                  <Text style={styles.saveBtnText}>Connecter mon compte Stripe</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Suppression de compte Modal ── */}
      <Modal visible={activeModal === 'delete'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: COLORS.urgency }]}>Supprimer le compte</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.deleteWarningWrap}>
              <View style={styles.deleteWarningIcon}>
                <Ionicons name="warning-outline" size={36} color={COLORS.urgency} />
              </View>
              <Text style={styles.deleteWarningTitle}>Action irréversible</Text>
              <Text style={styles.deleteWarningDesc}>
                Toutes vos missions, votre profil prestataire et vos données seront définitivement supprimés.{'\n\n'}
                Tapez <Text style={{ fontWeight: '700', color: COLORS.urgency }}>SUPPRIMER</Text> pour confirmer.
              </Text>
            </View>
            <TextInput
              style={styles.deleteInput}
              placeholder="SUPPRIMER"
              placeholderTextColor={COLORS.textTertiary}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.confirmDeleteBtn, deleteConfirmText !== 'SUPPRIMER' && styles.confirmDeleteBtnDisabled]}
              disabled={deleteConfirmText !== 'SUPPRIMER' || deletingAccount}
              onPress={async () => {
                setDeletingAccount(true);
                try {
                  await deleteAccount();
                  setUser(null); // flush React state before navigation to avoid race condition
                  await supabase.auth.signOut();
                  router.replace('/');
                } catch (e: unknown) {
                  Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
                } finally {
                  setDeletingAccount(false);
                }
              }}
            >
              {deletingAccount ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={20} color={COLORS.textInverse} />
                  <Text style={styles.confirmDeleteBtnText}>Supprimer définitivement</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Langue Modal ── */}
      <Modal visible={activeModal === 'langue'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('preferences.language_title')}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {(['fr', 'en'] as const).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.menuItem, { borderBottomWidth: lang === 'fr' ? 1 : 0 }]}
                onPress={() => { changeLanguage(lang); setActiveModal(null); }}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name="language-outline" size={20} color={COLORS.brandPrimary} />
                </View>
                <Text style={styles.menuLabel}>{t(`preferences.language_${lang}`)}</Text>
                {i18n.language === lang && <Ionicons name="checkmark-circle" size={20} color={COLORS.brandPrimary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Intégrations Modal (Google Calendar) ── */}
      <Modal visible={activeModal === 'integrations'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Intégrations Calendrier</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Google Calendar */}
            <View style={styles.integrationCard}>
              <View style={styles.integrationRow}>
                <View style={[styles.bigIconWrap, { width: 48, height: 48, borderRadius: 14, marginBottom: 0 }]}>
                  <Ionicons name="logo-google" size={22} color="#4285F4" />
                </View>
                <View style={{ flex: 1, marginLeft: SPACING.lg }}>
                  <Text style={styles.integrationTitle}>Google Calendar</Text>
                  <Text style={styles.integrationDesc}>
                    {gcalConnected
                      ? 'Vos missions sont synchronisées automatiquement.'
                      : 'Ajoutez vos missions à votre agenda Google.'}
                  </Text>
                </View>
                {gcalConnected && (
                  <View style={styles.connectedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                    <Text style={styles.connectedText}>Connecté</Text>
                  </View>
                )}
              </View>

              {gcalConnected ? (
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: COLORS.urgency, marginTop: SPACING.xl }]}
                  onPress={handleDisconnectGoogleCalendar}
                >
                  <Ionicons name="unlink-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.saveBtnText}>Déconnecter Google Calendar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#4285F4', marginTop: SPACING.xl }]}
                  onPress={handleConnectGoogleCalendar}
                  disabled={connectingGcal}
                >
                  {connectingGcal ? (
                    <ActivityIndicator color={COLORS.textInverse} />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={18} color={COLORS.textInverse} />
                      <Text style={styles.saveBtnText}>Connecter Google Calendar</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.integrationHint}>
              Une fois connecté, chaque mission assignée sera automatiquement ajoutée à votre Google Calendar avec rappels.
            </Text>
            <View style={{ height: SPACING.xxxl }} />
          </View>
        </View>
      </Modal>

      {/* ── Documents Modal ── */}
      <Modal visible={activeModal === 'documents'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Mes documents & SIRET</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {loadingProfile ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={COLORS.brandPrimary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>SIRET</Text>
                <TextInput
                  style={styles.locationInput}
                  placeholder="Numéro SIRET (14 chiffres)"
                  placeholderTextColor={COLORS.textTertiary}
                  value={docSiret}
                  onChangeText={setDocSiret}
                  keyboardType="numeric"
                  maxLength={14}
                  autoCorrect={false}
                />

                <Text style={[styles.fieldLabel, { marginTop: SPACING.lg }]}>Nom de société</Text>
                <TextInput
                  style={styles.locationInput}
                  placeholder="Nom de votre société"
                  placeholderTextColor={COLORS.textTertiary}
                  value={docCompanyName}
                  onChangeText={setDocCompanyName}
                  autoCorrect={false}
                />

                <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Assurance RC Pro</Text>
                {rcProDocUrl ? (
                  <View style={styles.docUploadedRow}>
                    <View style={styles.docUploadedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                      <Text style={styles.docUploadedText}>RC Pro uploadée</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.docReuploadBtn}
                      onPress={() => handleUploadInsuranceDoc('rc_pro')}
                      disabled={uploadingRcPro}
                    >
                      {uploadingRcPro ? (
                        <ActivityIndicator size="small" color={COLORS.brandPrimary} />
                      ) : (
                        <Text style={styles.docReuploadText}>Re-uploader</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.docUploadBtn}
                    onPress={() => handleUploadInsuranceDoc('rc_pro')}
                    disabled={uploadingRcPro}
                  >
                    {uploadingRcPro ? (
                      <ActivityIndicator size="small" color={COLORS.brandPrimary} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={20} color={COLORS.brandPrimary} />
                        <Text style={styles.docUploadBtnText}>Ajouter votre RC Pro</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                <Text style={[styles.fieldLabel, { marginTop: SPACING.xl }]}>Assurance Décennale</Text>
                {decennaleDocUrl ? (
                  <View style={styles.docUploadedRow}>
                    <View style={styles.docUploadedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                      <Text style={styles.docUploadedText}>Décennale uploadée</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.docReuploadBtn}
                      onPress={() => handleUploadInsuranceDoc('decennale')}
                      disabled={uploadingDecennale}
                    >
                      {uploadingDecennale ? (
                        <ActivityIndicator size="small" color={COLORS.brandPrimary} />
                      ) : (
                        <Text style={styles.docReuploadText}>Re-uploader</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.docUploadBtn}
                    onPress={() => handleUploadInsuranceDoc('decennale')}
                    disabled={uploadingDecennale}
                  >
                    {uploadingDecennale ? (
                      <ActivityIndicator size="small" color={COLORS.brandPrimary} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={20} color={COLORS.brandPrimary} />
                        <Text style={styles.docUploadBtnText}>Ajouter votre Décennale</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                <Text style={styles.docInfoText}>
                  Vos assurances sont vérifiées par notre équipe pour protéger les propriétaires.
                </Text>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDocuments} disabled={savingDocuments}>
                  {savingDocuments ? (
                    <ActivityIndicator color={COLORS.textInverse} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textInverse} />
                      <Text style={styles.saveBtnText}>Enregistrer</Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={{ height: SPACING.xxxl }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modifier mon profil Modal ── */}
      <Modal visible={activeModal === 'edit-profile'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Modifier mon profil</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {loadingProfile ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={COLORS.brandPrimary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Photo de profil</Text>
                <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.7} style={{ alignItems: 'center', marginBottom: SPACING.lg }}>
                  {uploadingAvatar ? (
                    <View style={styles.avatar}>
                      <ActivityIndicator size="small" color={COLORS.brandPrimary} />
                    </View>
                  ) : (
                    <View style={styles.avatarWrap}>
                      {user?.picture ? (
                        <Image source={{ uri: user.picture }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 28, color: COLORS.textInverse, fontWeight: '700' }}>
                            {(user?.name || 'P').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.cameraIconOverlay}>
                        <Ionicons name="camera" size={14} color={COLORS.textInverse} />
                      </View>
                    </View>
                  )}
                  <Text style={{ ...FONTS.bodySmall, color: COLORS.brandPrimary, marginTop: SPACING.sm, fontWeight: '600' }}>Changer la photo</Text>
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>Description / Bio</Text>
                <TextInput
                  style={[styles.locationInput, { height: 100, textAlignVertical: 'top', paddingTop: SPACING.md }]}
                  placeholder="Décrivez votre expérience, vos compétences..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={editBio}
                  onChangeText={setEditBio}
                  multiline
                  maxLength={500}
                />
                <Text style={styles.locationHint}>{editBio.length}/500 caractères</Text>

                <Text style={[styles.fieldLabel, { marginTop: SPACING.lg }]}>Tarif horaire (€)</Text>
                <TextInput
                  style={styles.locationInput}
                  placeholder="Ex: 35"
                  placeholderTextColor={COLORS.textTertiary}
                  value={editHourlyRate}
                  onChangeText={setEditHourlyRate}
                  keyboardType="numeric"
                />
                <Text style={styles.locationHint}>Tarif indicatif affiché sur votre profil</Text>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEditProfile} disabled={savingProfile}>
                  {savingProfile ? (
                    <ActivityIndicator color={COLORS.textInverse} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.textInverse} />
                      <Text style={styles.saveBtnText}>Enregistrer</Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={{ height: SPACING.xxxl }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Aide Modal ── */}
      <Modal visible={activeModal === 'aide'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Aide & FAQ</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {FAQ_PROVIDER.map((faq, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.faqItem}
                  onPress={() => setOpenFaq(openFaq === i ? null : i)}
                  activeOpacity={0.7}
                >
                  <View style={styles.faqQuestion}>
                    <Text style={styles.faqQ}>{faq.q}</Text>
                    <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textTertiary} />
                  </View>
                  {openFaq === i && <Text style={styles.faqA}>{faq.a}</Text>}
                </TouchableOpacity>
              ))}
              <View style={{ height: SPACING.xxxl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxl, paddingBottom: SPACING.lg },
  title: { ...FONTS.h1, color: COLORS.textPrimary },
  userCard: { alignItems: 'center', backgroundColor: COLORS.paper, marginHorizontal: SPACING.xl, padding: SPACING.xxl, borderRadius: RADIUS.xxl, ...SHADOWS.float, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  avatarText: { ...FONTS.h1, color: COLORS.textInverse },
  userName: { ...FONTS.h2, color: COLORS.textPrimary },
  userEmail: { ...FONTS.body, color: COLORS.textSecondary, marginTop: 4 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, backgroundColor: COLORS.subtle, paddingHorizontal: SPACING.lg, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  roleText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  menuSection: { marginTop: SPACING.xxl, marginHorizontal: SPACING.xl, backgroundColor: COLORS.paper, borderRadius: RADIUS.xxl, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.subtle, gap: SPACING.md },
  menuIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  menuLabel: { flex: 1, ...FONTS.body, color: COLORS.textPrimary, fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, padding: SPACING.lg, backgroundColor: COLORS.paper, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.urgency, ...SHADOWS.card },
  logoutText: { ...FONTS.h3, color: COLORS.urgency, fontSize: 16 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginHorizontal: SPACING.xl, marginTop: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.xl },
  deleteBtnText: { ...FONTS.bodySmall, color: COLORS.urgency, fontWeight: '600' },
  deleteWarningWrap: { alignItems: 'center', paddingVertical: SPACING.lg, marginBottom: SPACING.lg },
  deleteWarningIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: '#FECACA' },
  deleteWarningTitle: { ...FONTS.h2, color: COLORS.urgency, marginBottom: SPACING.sm },
  deleteWarningDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  deleteInput: { backgroundColor: '#FEF2F2', borderWidth: 2, borderColor: COLORS.urgency, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, ...FONTS.h3, color: COLORS.urgency, textAlign: 'center', letterSpacing: 2, marginBottom: SPACING.lg },
  confirmDeleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.urgency, paddingVertical: SPACING.lg, borderRadius: RADIUS.xl, ...SHADOWS.float },
  confirmDeleteBtnDisabled: { opacity: 0.4 },
  confirmDeleteBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  version: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.xxxl, marginBottom: SPACING.xxxl, letterSpacing: 1 },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(26,29,46,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.paper, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACING.xl, maxHeight: '85%', ...SHADOWS.float },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  sheetTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  loadingWrap: { height: 150, justifyContent: 'center', alignItems: 'center' },
  comingSoonWrap: { alignItems: 'center', paddingVertical: SPACING.lg, marginBottom: SPACING.lg },
  bigIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  comingSoonTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  comingSoonDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
  comingSoonBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, alignSelf: 'center', marginTop: SPACING.xl, backgroundColor: COLORS.warningSoft, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full },
  comingSoonBadgeText: { ...FONTS.bodySmall, color: COLORS.warning, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  featureRowText: { ...FONTS.body, color: COLORS.textSecondary, flex: 1, fontWeight: '500' },
  fieldLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginBottom: SPACING.sm, fontWeight: '600' },
  specialtyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  specialtyChip: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border },
  specialtyChipSelected: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary, ...SHADOWS.float },
  specialtyChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontSize: 13, fontWeight: '500' },
  specialtyChipTextSelected: { color: COLORS.textInverse, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: SPACING.xl, paddingVertical: 12, borderRadius: RADIUS.full, backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border },
  chipSelected: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary, ...SHADOWS.card },
  chipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextSelected: { color: COLORS.textInverse, fontWeight: '600' },
  dayChip: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.xxl, marginTop: SPACING.xl, ...SHADOWS.float },
  saveBtnText: { ...FONTS.h3, color: COLORS.textInverse },
  locationInput: { backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, ...FONTS.body, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  locationHint: { ...FONTS.caption, color: COLORS.textTertiary, fontSize: 12, marginBottom: SPACING.sm },
  faqItem: { backgroundColor: COLORS.subtle, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  faqQuestion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACING.md },
  faqQ: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', flex: 1, fontSize: 13 },
  faqA: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md, lineHeight: 22 },
  // Integrations
  integrationCard: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.xl, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.md },
  integrationRow: { flexDirection: 'row', alignItems: 'center' },
  integrationTitle: { ...FONTS.h3, color: COLORS.textPrimary, fontSize: 16 },
  integrationDesc: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2, lineHeight: 18 },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.successSoft, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.full },
  connectedText: { ...FONTS.caption, color: COLORS.success, fontWeight: '600' },
  integrationHint: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: SPACING.lg, lineHeight: 18, fontStyle: 'italic' },
  // Avatar
  avatarWrap: { position: 'relative', marginBottom: SPACING.lg },
  cameraIconOverlay: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.paper, ...SHADOWS.card },
  // Documents
  docUploadedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.successSoft, padding: SPACING.lg, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.success },
  docUploadedBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  docUploadedText: { ...FONTS.bodySmall, color: COLORS.success, fontWeight: '600' },
  docReuploadBtn: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.lg, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border },
  docReuploadText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  docUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.lg, borderRadius: RADIUS.xl, backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },
  docUploadBtnText: { ...FONTS.body, color: COLORS.brandPrimary, fontWeight: '600' },
  docInfoText: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: SPACING.xl, lineHeight: 18, fontStyle: 'italic', textAlign: 'center' },
});

// ── PKCE helpers (OAuth Google Calendar) ────────────────────────────────────

function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < 128; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
