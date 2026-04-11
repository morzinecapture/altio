import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert, ActivityIndicator, Linking, Image, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { supabase } from '../../src/lib/supabase';
import { deleteAccount, getMyInvoices, getProfile, updateMarketingConsent, getMarketingConsent } from '../../src/api';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../src/i18n';
import type { Invoice } from '../../src/types/api';

const OWNER_TYPE_LABELS: Record<string, string> = {
  airbnb_owner: 'Propriétaire Airbnb / Booking',
  lmnp: 'Loueur LMNP',
  sci: 'SCI / Société',
  concierge: 'Conciergerie',
  individual: 'Particulier',
};

const FAQ = [
  { q: 'Comment synchroniser mon calendrier Airbnb ?', a: 'Dans "Mes logements", ouvrez un logement et ajoutez votre URL iCal Airbnb. Appuyez ensuite sur "Synchroniser iCal" pour importer vos réservations.' },
  { q: 'Comment créer une mission manuellement ?', a: 'Dans l\'onglet "Missions", appuyez sur le bouton "+" en haut à droite. Sélectionnez le logement, le type de mission et le mode (tarif fixe ou appel d\'offres).' },
  { q: 'Que faire en cas d\'urgence ?', a: 'Appuyez sur le bouton rouge "Urgence" visible depuis le tableau de bord. Décrivez le problème — les techniciens disponibles dans votre zone seront alertés immédiatement.' },
  { q: 'Comment choisir un prestataire ?', a: 'En mode "Appel d\'offres", les prestataires candidatent et vous pouvez comparer leurs tarifs et avis. En mode "Tarif fixe", le premier prestataire disponible accepte automatiquement.' },
  { q: 'Quand suis-je débité ?', a: 'Le paiement est effectué lors de la validation du devis (urgences) ou lors de l\'acceptation d\'une candidature. Stripe sécurise la transaction jusqu\'à la fin de l\'intervention.' },
];

export default function OwnerProfile() {
  const router = useRouter();
  const { user, setUser, handleLogout } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Mes informations state
  const [infosName, setInfosName] = useState('');
  const [infosOwnerType, setInfosOwnerType] = useState('');
  const [infosCompanyName, setInfosCompanyName] = useState('');
  const [infosSiren, setInfosSiren] = useState('');
  const [infosVatNumber, setInfosVatNumber] = useState('');
  const [infosBillingAddress, setInfosBillingAddress] = useState('');
  const [infosIsVatExempt, setInfosIsVatExempt] = useState(false);
  const [loadingInfos, setLoadingInfos] = useState(false);
  const [savingInfos, setSavingInfos] = useState(false);

  const { data: invoices = [] as Invoice[] } = useQuery({
    queryKey: ['my-invoices'],
    queryFn: getMyInvoices,
  });

  const { data: marketingConsent = false } = useQuery({
    queryKey: ['marketing-consent'],
    queryFn: getMarketingConsent,
  });

  const marketingConsentMutation = useMutation({
    mutationFn: updateMarketingConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-consent'] });
    },
  });

  const savingConsent = marketingConsentMutation.isPending;

  const handleToggleMarketingConsent = async (value: boolean) => {
    try {
      await marketingConsentMutation.mutateAsync(value);
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de mettre a jour vos preferences.');
    }
  };

  const handleOpenBilling = () => {
    setActiveModal('factures');
  };

  const onLogout = async () => {
    await handleLogout();
    setTimeout(() => router.replace('/'), 0);
  };

  const handlePickPhoto = async () => {
    if (!user) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingPhoto(true);
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(`${user.id}/avatar.jpg`, blob, { upsert: true, contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(`${user.id}/avatar.jpg`);

      await supabase.from('users').update({ picture: publicUrl }).eq('id', user.id);
      setUser({ ...user, picture: publicUrl });
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e) || 'Impossible de mettre à jour la photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleOpenInfos = async () => {
    setActiveModal('infos');
    setLoadingInfos(true);
    try {
      const profile = await getProfile();
      setInfosName(profile?.name || user?.name || '');
      setInfosOwnerType(profile?.owner_type || user?.owner_type || '');
      setInfosCompanyName(profile?.company_name || '');
      setInfosSiren(profile?.siren || '');
      setInfosVatNumber(profile?.vat_number || '');
      setInfosBillingAddress(profile?.billing_address || '');
      setInfosIsVatExempt(profile?.is_vat_exempt || false);
    } catch (e) {
      console.error(e);
      setInfosName(user?.name || '');
      setInfosOwnerType(user?.owner_type || '');
    } finally {
      setLoadingInfos(false);
    }
  };

  const handleSaveInfos = async () => {
    if (!user) return;
    setSavingInfos(true);
    try {
      const updates: Record<string, unknown> = {
        name: infosName.trim(),
        owner_type: infosOwnerType,
        company_name: infosCompanyName.trim() || null,
        siren: infosSiren.trim() || null,
        vat_number: infosVatNumber.trim() || null,
        billing_address: infosBillingAddress.trim() || null,
        is_vat_exempt: infosIsVatExempt,
      };
      const { error } = await supabase.from('users').update(updates).eq('id', user.id);
      if (error) throw error;
      setUser({ ...user, name: updates.name as string, owner_type: updates.owner_type as string | undefined });
      setActiveModal(null);
      Alert.alert('Succès', 'Vos informations ont été mises à jour.');
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e) || 'Impossible de sauvegarder.');
    } finally {
      setSavingInfos(false);
    }
  };

  const menuItems = [
    { id: 'infos', icon: 'person-outline' as const, label: 'Mes informations', onPress: handleOpenInfos },
    { id: 'favorites', icon: 'star-outline' as const, label: t('owner.favorites.title'), onPress: () => router.push('/(owner)/favorites') },
    { id: 'notifications', icon: 'notifications-outline' as const, label: t('owner.profile.menu_notifications') },
    { id: 'factures', icon: 'document-text-outline' as const, label: `${t('owner.profile.menu_invoices')}${invoices.length > 0 ? ` (${invoices.length})` : ''}`, onPress: handleOpenBilling },
    { id: 'langue', icon: 'language-outline' as const, label: t('owner.profile.menu_language') },
    { id: 'aide', icon: 'help-circle-outline' as const, label: t('owner.profile.menu_help') },
    { id: 'reclamation', icon: 'alert-circle-outline' as const, label: 'Réclamation', onPress: () => router.push('/reclamation') },
    { id: 'apropos', icon: 'information-circle-outline' as const, label: t('owner.profile.menu_about') },
  ];

  return (
    <SafeAreaView style={styles.container} testID="owner-profile">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Profil</Text>
        </View>

        <View style={styles.userCard}>
          <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.7} style={styles.avatarWrap}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImage} />
            ) : (
              <LinearGradient colors={GRADIENT.brandButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.name?.[0] || 'U'}</Text>
              </LinearGradient>
            )}
            <View style={styles.cameraOverlay}>
              {uploadingPhoto ? (
                <ActivityIndicator size={12} color={COLORS.textInverse} />
              ) : (
                <Ionicons name="camera" size={14} color={COLORS.textInverse} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          {user?.owner_type && (
            <Text style={styles.ownerTypeText}>{OWNER_TYPE_LABELS[user.owner_type] || user.owner_type}</Text>
          )}
          <View style={styles.roleBadge}>
            <Ionicons name="home-outline" size={14} color={COLORS.brandPrimary} />
            <Text style={styles.roleText}>Propriétaire</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuItem, i === menuItems.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => item.id === 'admin' ? router.push('/overview' as never) : (item.onPress ? item.onPress() : setActiveModal(item.id))}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon} size={20} color={COLORS.brandPrimary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.urgency} />
          <Text style={styles.logoutText}>{t('common.logout')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="delete-account-btn"
          style={styles.deleteBtn}
          onPress={() => {
            Alert.alert(
              t('owner.profile.delete_confirm_title'),
              t('owner.profile.delete_confirm_msg'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.continue'), style: 'destructive', onPress: () => { setDeleteConfirmText(''); setActiveModal('delete'); } },
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={20} color={COLORS.urgency} />
          <Text style={styles.deleteBtnText}>{t('owner.profile.delete_account')}</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Altio v1.0 — Morzine, France</Text>
      </ScrollView>

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
                <Text style={styles.menuLabel}>{t(`preferences.language_${lang}`)}</Text>
                {i18n.language === lang && <Ionicons name="checkmark-circle" size={20} color={COLORS.brandPrimary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

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
            {['Nouvelles candidatures prestataires', 'Confirmations d\'urgences', 'Rappels de missions', 'Alertes de paiement'].map((item, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
                <Text style={styles.featureRowText}>{item}</Text>
              </View>
            ))}

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
              {FAQ.map((faq, i) => (
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
                Toutes vos missions, logements et données seront définitivement supprimés.{'\n\n'}
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

      {/* ── Facturation Modal ── */}
      <Modal visible={activeModal === 'factures'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Mes Factures</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {loadingInvoices ? (
              <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.brandPrimary} />
              </View>
            ) : invoices.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: SPACING.xxl }}>
                <Ionicons name="document-text-outline" size={40} color={COLORS.textTertiary} />
                <Text style={{ ...FONTS.body, color: COLORS.textTertiary, marginTop: SPACING.md, textAlign: 'center' }}>
                  Aucune facture pour l'instant.{'\n'}Elles apparaîtront après chaque mission payée.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {invoices.map((inv: { id: string; invoice_number: string; invoice_type: string; amount_ttc: number; amount_ht?: number; pdf_url?: string; created_at: string }) => (
                  <View key={inv.id} style={styles.invoiceCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invoiceNumber}>{inv.invoice_number}</Text>
                        <Text style={styles.invoiceType}>{inv.invoice_type === 'service' ? 'Prestation' : 'Commission'}</Text>
                        <Text style={styles.invoiceDate}>{new Date(inv.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.invoiceAmount}>{Number(inv.amount_ttc).toFixed(2)} €</Text>
                        <Text style={styles.invoiceAmountHt}>HT: {Number(inv.amount_ht).toFixed(2)} €</Text>
                      </View>
                    </View>
                    {inv.pdf_url && (
                      <TouchableOpacity
                        style={styles.invoiceDownloadBtn}
                        onPress={() => Linking.openURL(inv.pdf_url || '')}
                      >
                        <Ionicons name="open-outline" size={16} color={COLORS.brandPrimary} />
                        <Text style={styles.invoiceDownloadText}>Ouvrir la facture</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <View style={{ height: SPACING.xxxl }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── À propos Modal ── */}
      <Modal visible={activeModal === 'apropos'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>À propos</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.aboutWrap}>
              <View style={styles.aboutLogo}>
                <Ionicons name="snow" size={36} color={COLORS.textInverse} />
              </View>
              <Text style={styles.aboutAppName}>Altio</Text>
              <Text style={styles.aboutVersion}>Version 1.0.0</Text>
              <Text style={styles.aboutDesc}>La plateforme de gestion opérationnelle pour les locations saisonnières en montagne.</Text>
              <View style={styles.aboutTable}>
                {[
                  { label: 'Zone cible', value: 'Morzine / Alpes' },
                  { label: 'Stack', value: 'Supabase + Expo + Stripe' },
                  { label: 'Contact', value: 'contact@altio.app' },
                ].map((row, i) => (
                  <View key={i} style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>{row.label}</Text>
                    <Text style={styles.aboutValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Mes informations Modal ── */}
      <Modal visible={activeModal === 'infos'} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Mes informations</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {loadingInfos ? (
              <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.brandPrimary} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.infosLabel}>Nom complet</Text>
                <TextInput
                  style={styles.infosInput}
                  value={infosName}
                  onChangeText={setInfosName}
                  placeholder="Votre nom"
                  placeholderTextColor={COLORS.textTertiary}
                />

                <Text style={styles.infosLabel}>Type de propriétaire</Text>
                <View style={styles.infosChipsWrap}>
                  {Object.entries(OWNER_TYPE_LABELS).map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.infosChip, infosOwnerType === key && styles.infosChipActive]}
                      onPress={() => setInfosOwnerType(key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.infosChipText, infosOwnerType === key && styles.infosChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.infosLabel}>Nom de société (optionnel)</Text>
                <TextInput
                  style={styles.infosInput}
                  value={infosCompanyName}
                  onChangeText={setInfosCompanyName}
                  placeholder="Ma société SAS"
                  placeholderTextColor={COLORS.textTertiary}
                />

                <Text style={styles.infosLabel}>SIREN (optionnel)</Text>
                <TextInput
                  style={styles.infosInput}
                  value={infosSiren}
                  onChangeText={setInfosSiren}
                  placeholder="123456789"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="numeric"
                  maxLength={9}
                />

                <Text style={styles.infosLabel}>N° TVA intracommunautaire (optionnel)</Text>
                <TextInput
                  style={styles.infosInput}
                  value={infosVatNumber}
                  onChangeText={setInfosVatNumber}
                  placeholder="FR12345678901"
                  placeholderTextColor={COLORS.textTertiary}
                />

                <Text style={styles.infosLabel}>Adresse de facturation (optionnel)</Text>
                <TextInput
                  style={[styles.infosInput, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={infosBillingAddress}
                  onChangeText={setInfosBillingAddress}
                  placeholder="12 rue des Alpes, 74110 Morzine"
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                />

                <View style={styles.infosSwitchRow}>
                  <Text style={styles.infosLabel}>Exonéré de TVA</Text>
                  <Switch
                    value={infosIsVatExempt}
                    onValueChange={setInfosIsVatExempt}
                    trackColor={{ false: COLORS.border, true: COLORS.brandPrimary }}
                    thumbColor={COLORS.textInverse}
                  />
                </View>

                <TouchableOpacity
                  style={styles.infosSaveBtn}
                  onPress={handleSaveInfos}
                  disabled={savingInfos}
                  activeOpacity={0.7}
                >
                  {savingInfos ? (
                    <ActivityIndicator color={COLORS.textInverse} />
                  ) : (
                    <Text style={styles.infosSaveBtnText}>Enregistrer</Text>
                  )}
                </TouchableOpacity>
                <View style={{ height: SPACING.xxxl }} />
              </ScrollView>
            )}
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
  avatarWrap: { position: 'relative' as const, marginBottom: SPACING.lg },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', ...SHADOWS.card },
  avatarImage: { width: 80, height: 80, borderRadius: 40, ...SHADOWS.card },
  avatarText: { ...FONTS.h1, color: COLORS.textInverse },
  cameraOverlay: { position: 'absolute' as const, bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.brandPrimary, justifyContent: 'center' as const, alignItems: 'center' as const, borderWidth: 2, borderColor: COLORS.paper },
  userName: { ...FONTS.h2, color: COLORS.textPrimary },
  userEmail: { ...FONTS.body, color: COLORS.textSecondary, marginTop: 4 },
  ownerTypeText: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: SPACING.xs },
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
  // Invoices
  invoiceCard: { backgroundColor: COLORS.subtle, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  invoiceNumber: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: COLORS.textPrimary },
  invoiceType: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  invoiceDate: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: 2 },
  invoiceAmount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: COLORS.textPrimary },
  invoiceAmountHt: { ...FONTS.caption, color: COLORS.textTertiary },
  invoiceDownloadBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  invoiceDownloadText: { ...FONTS.bodySmall, color: COLORS.brandPrimary, fontWeight: '600' },
  version: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.xxxl, marginBottom: SPACING.xxxl, letterSpacing: 1 },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(26,29,46,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.paper, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACING.xl, maxHeight: '85%', ...SHADOWS.float },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  sheetTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  comingSoonWrap: { alignItems: 'center', paddingVertical: SPACING.lg, marginBottom: SPACING.lg },
  bigIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.subtle, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  comingSoonTitle: { ...FONTS.h2, color: COLORS.textPrimary },
  comingSoonDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
  comingSoonBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, alignSelf: 'center', marginTop: SPACING.xl, backgroundColor: COLORS.warningSoft, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.full },
  comingSoonBadgeText: { ...FONTS.bodySmall, color: COLORS.warning, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  featureRowText: { ...FONTS.body, color: COLORS.textSecondary, flex: 1, fontWeight: '500' },
  faqItem: { backgroundColor: COLORS.subtle, padding: SPACING.xl, borderRadius: RADIUS.xl, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  faqQuestion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACING.md },
  faqQ: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700', flex: 1, fontSize: 13 },
  faqA: { ...FONTS.body, color: COLORS.textSecondary, marginTop: SPACING.md, lineHeight: 22 },
  aboutWrap: { alignItems: 'center', paddingVertical: SPACING.lg },
  aboutLogo: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg, ...SHADOWS.card },
  aboutAppName: { ...FONTS.h1, color: COLORS.textPrimary },
  aboutVersion: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 4, fontWeight: '600' },
  aboutDesc: { ...FONTS.body, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.lg, marginBottom: SPACING.xxl, lineHeight: 22 },
  aboutTable: { width: '100%', gap: SPACING.sm, backgroundColor: COLORS.subtle, padding: SPACING.lg, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  aboutLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '500' },
  aboutValue: { ...FONTS.bodySmall, color: COLORS.textPrimary, fontWeight: '700' },
  // Infos modal
  infosLabel: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginBottom: SPACING.xs, marginTop: SPACING.md },
  infosInput: { backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, ...FONTS.body, color: COLORS.textPrimary },
  infosChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs },
  infosChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: COLORS.subtle, borderWidth: 1, borderColor: COLORS.border },
  infosChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  infosChipText: { ...FONTS.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  infosChipTextActive: { color: COLORS.textInverse },
  infosSwitchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.md },
  infosSaveBtn: { backgroundColor: COLORS.brandPrimary, paddingVertical: SPACING.lg, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xl, ...SHADOWS.float },
  infosSaveBtnText: { ...FONTS.h3, color: COLORS.textInverse },
});
