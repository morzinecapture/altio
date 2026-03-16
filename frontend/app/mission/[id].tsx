import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Image, Platform, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS, STATUS_LABELS, MISSION_TYPE_LABELS, GRADIENT } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getMission, handleApplication, startMission, completeMission, applyToMission, uploadMissionPhoto, createPaymentIntent, addFavoriteProvider } from '../../src/api';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import { useStripe } from '@stripe/stripe-react-native';

export default function MissionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [mission, setMission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    try {
      const data = await getMission(id!);
      setMission(data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAcceptApp = async (appId: string) => {
    try {
      await handleApplication(id!, appId, 'accept');
      Alert.alert('Candidature acceptée');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleRejectApp = async (appId: string) => {
    try {
      await handleApplication(id!, appId, 'reject');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleApply = async () => {
    try {
      await applyToMission(id!, { proposed_rate: mission?.fixed_rate, message: 'Disponible' });
      Alert.alert('Candidature envoyée !');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const handleStart = async () => {
    try { await startMission(id!); Alert.alert('Mission démarrée'); fetchData(); }
    catch (e: any) { Alert.alert('Erreur', e.message); }
  };

  const pickAndUploadPhoto = async (useCamera: boolean) => {
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Nous avons besoin de l\'accès à la caméra.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Nous avons besoin de l\'accès à vos photos.');
        return;
      }
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, mediaTypes: ['images'] });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setUploadingPhotos(true);
      try {
        const photoUri = result.assets[0].uri;
        const uploadedUrl = await uploadMissionPhoto(id!, photoUri);
        await completeMission(id!, [uploadedUrl]);
        Alert.alert('Succès', 'Mission terminée et photo envoyée !');
        fetchData();
      } catch (e: any) {
        Alert.alert('Erreur', e.message);
      } finally {
        setUploadingPhotos(false);
      }
    }
  };

  const handleComplete = async () => {
    const buttons: any[] = [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Passer (sans photo)',
        onPress: async () => {
          setUploadingPhotos(true);
          try { await completeMission(id!); Alert.alert('Terminée !'); fetchData(); }
          catch (e: any) { Alert.alert('Erreur', e.message); }
          finally { setUploadingPhotos(false); }
        }
      },
      { text: 'Choisir une photo', onPress: () => pickAndUploadPhoto(false) },
    ];
    // Only offer camera on real devices (not simulator)
    if (Platform.OS !== 'web') {
      buttons.push({ text: '📷 Prendre une photo', onPress: () => pickAndUploadPhoto(true) });
    }
    Alert.alert('Preuve d\'intervention', 'Ajoutez une photo pour valider la fin de mission.', buttons);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brandPrimary} /></View>;
  if (!mission) return <View style={styles.center}><Text>Mission non trouvée</Text></View>;

  const isOwner = user?.role === 'owner';
  const isProvider = user?.role === 'provider';
  const statusColor = STATUS_COLORS[mission.status] || STATUS_COLORS.pending;

  return (
    <SafeAreaView style={styles.container} testID="mission-detail-screen" edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1E3A5F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détail mission</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Mission Progress Timeline */}
      {!['cancelled', 'rejected', 'refunded'].includes(mission.status) && (
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
              {mission.property_address && <Text style={styles.providerTextStrict}>{mission.property_address}</Text>}
            </View>
          </View>
          {mission.description && <Text style={[styles.providerTextStrict, { marginBottom: SPACING.lg }]}>{mission.description}</Text>}

          <View style={styles.metaGrid}>
            <MetaItem icon="calendar-outline" label="Date et Heure" value={mission.scheduled_date ? `${new Date(mission.scheduled_date).toLocaleDateString('fr-FR')} à ${new Date(mission.scheduled_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Non planifiée'} />
            <MetaItem icon="cash-outline" label="Tarif" value={mission.fixed_rate ? `${mission.fixed_rate}€` : '-'} />
            <MetaItem icon="pricetags-outline" label="Mode" value={mission.mode === 'fixed' ? 'FIXE' : 'DEVIS'} />
            <MetaItem icon="people-outline" label="Candidatures" value={String(mission.applications_count || 0)} />
          </View>
        </View>

        {/* Chat (Owner view) */}
        {isOwner && mission.assigned_provider_id && (
          <TouchableOpacity testID="chat-btn-owner" style={[styles.applyBtnStrict, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: SPACING.lg, marginTop: 0 }]} onPress={() => router.push(`/chat/${id}?type=mission&receiverId=${mission.assigned_provider_id}&title=Discussion+Prestataire`)}>
            <Ionicons name="chatbubbles-outline" size={20} color="#3B82F6" />
            <Text style={[styles.applyTextStrict, { color: '#3B82F6' }]}>Discuter avec le prestataire</Text>
          </TouchableOpacity>
        )}

        {/* Access info for assigned provider */}
        {isProvider && mission.assigned_provider_id === user?.id && mission.access_code && (
          <View style={[styles.cardStrict, { borderLeftWidth: 3, borderLeftColor: '#3B82F6' }]}>
            <Text style={styles.sectionTitle}>Informations d'accès</Text>
            <View style={styles.accessRow}>
              <Ionicons name="key-outline" size={18} color="#3B82F6" />
              <Text style={styles.providerTextStrict}>Code: <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', color: '#1E3A5F' }}>{mission.access_code}</Text></Text>
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
                <Text style={styles.providerTextStrict}>Dépôt: {mission.deposit_location}</Text>
              </View>
            )}
          </View>
        )}

        {/* Photos (Proof) */}
        {mission.photos && mission.photos.length > 0 && (
          <View style={styles.cardStrict}>
            <Text style={styles.sectionTitle}>Photos d'intervention</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.md }}>
              {mission.photos.map((p: any, idx: number) => (
                <Image key={idx} source={{ uri: p.photo_url }} style={styles.proofImage} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Applications (Owner view) */}
        {isOwner && mission.applications && mission.applications.length > 0 && (
          <View style={styles.cardStrict}>
            <Text style={styles.sectionTitle}>Candidatures ({mission.applications.length})</Text>
            {mission.applications.map((app: any) => (
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
                        <Text style={styles.appName}>{app.provider_name || 'Prestataire'}</Text>
                        {app.is_verified && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.infoSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Ionicons name="shield-checkmark" size={10} color={COLORS.brandPrimary} />
                            <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9, color: COLORS.brandPrimary, marginLeft: 3 }}>Vérifié</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.appRating}>
                        <Ionicons name="star" size={12} color={COLORS.warning} />
                        <Text style={styles.appRatingText}>{app.provider_rating || 0}/5 ({app.provider_reviews || 0} avis)</Text>
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
                      <Text style={styles.actionBtnText}>Accepter</Text>
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

        {/* Owner Actions */}
        {isOwner && mission.status === 'awaiting_payment' && (
          <View>
            <TouchableOpacity
              testID="pay-btn"
              style={[styles.mainAction, { backgroundColor: COLORS.success }]}
              onPress={async () => {
                Alert.alert(
                  'Confirmer le paiement',
                  `Voulez-vous valider et payer ${mission.fixed_rate || 0}€ pour cette mission ?`,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Payer',
                      onPress: async () => {
                        try {
                          setLoading(true);
                          const ownerTotal = mission.fixed_rate || 0;

                          const { clientSecret } = await createPaymentIntent(ownerTotal, { missionId: id }, 'automatic');

                          const { error: initError } = await initPaymentSheet({
                            merchantDisplayName: 'Altio',
                            paymentIntentClientSecret: clientSecret,
                            allowsDelayedPaymentMethods: true,
                          });
                          if (initError) throw new Error(initError.message);

                          const { error: presentError } = await presentPaymentSheet();
                          if (presentError) throw new Error(presentError.message);

                          // Update mission to completed
                          await supabase.from('missions')
                            .update({ status: 'completed' })
                            .eq('id', id);

                          Alert.alert('Succès', 'Mission validée et payée !');
                          fetchData();
                        } catch (e: any) {
                          if (e.message !== 'The payment has been canceled' && e.message !== 'Canceled') {
                            Alert.alert('Erreur', e.message);
                          }
                          setLoading(false);
                        }
                      }
                    }
                  ]
                );
              }}
            >
              <Ionicons name="card-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.mainActionText}>Valider et Payer {mission.fixed_rate ? `${mission.fixed_rate}€` : ''}</Text>
            </TouchableOpacity>
            {/* Add to favorites */}
            {mission.assigned_provider_id && (
              <TouchableOpacity
                style={[styles.mainAction, { backgroundColor: COLORS.warning, marginTop: SPACING.sm }]}
                onPress={async () => {
                  try {
                    await addFavoriteProvider(mission.assigned_provider_id);
                    Alert.alert('⭐ Ajouté !', 'Ce prestataire a été ajouté à vos favoris.');
                  } catch (e: any) {
                    if (e.message?.includes('duplicate') || e.message?.includes('unique')) {
                      Alert.alert('Déjà favori', 'Ce prestataire est déjà dans vos favoris.');
                    } else {
                      Alert.alert('Erreur', e.message);
                    }
                  }
                }}
              >
                <Ionicons name="star-outline" size={20} color={COLORS.textInverse} />
                <Text style={styles.mainActionText}>Ajouter aux favoris</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Provider Actions */}
        {isProvider && mission.status === 'pending' && (
          <TouchableOpacity testID="apply-btn" onPress={handleApply} style={styles.applyBtnStrict}>
            <Text style={styles.applyTextStrict}>Candidater à cette mission</Text>
          </TouchableOpacity>
        )}
        {isProvider && mission.status === 'assigned' && mission.assigned_provider_id === user?.id && (
          <TouchableOpacity testID="start-btn" style={styles.mainAction} onPress={handleStart}>
            <Ionicons name="play" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>Démarrer la mission</Text>
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
                <Text style={styles.mainActionText}>Terminer (Photo)</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {/* Provider: Extra hours or Quote when in_progress */}
        {isProvider && mission.status === 'in_progress' && mission.assigned_provider_id === user?.id && (
          <View>
            <TouchableOpacity
              style={[styles.mainAction, { backgroundColor: COLORS.warning }]}
              onPress={() => {
                Alert.prompt(
                  'Heures supplémentaires',
                  'Combien d\'heures supplémentaires facturez-vous ?',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Envoyer',
                      onPress: async (hours?: string) => {
                        if (!hours || isNaN(Number(hours))) return;
                        const extraCost = Number(hours) * (mission.fixed_rate || 30);
                        try {
                          await supabase.from('missions')
                            .update({ fixed_rate: (mission.fixed_rate || 0) + extraCost })
                            .eq('id', id);
                          Alert.alert('Succès', `${hours}h supplémentaires ajoutées (+${extraCost}€).`);
                          fetchData();
                        } catch (e: any) { Alert.alert('Erreur', e.message); }
                      }
                    }
                  ],
                  'plain-text',
                  '',
                  'numeric'
                );
              }}
            >
              <Ionicons name="time-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.mainActionText}>Facturer heures sup</Text>
            </TouchableOpacity>
          </View>
        )}

        {isProvider && (mission.status === 'assigned' || mission.status === 'in_progress') && mission.assigned_provider_id === user?.id && (
          <TouchableOpacity testID="chat-btn-provider" style={[styles.mainAction, { backgroundColor: COLORS.info }]} onPress={() => router.push(`/chat/${id}?type=mission&receiverId=${mission.owner_id}&title=Discussion+Propriétaire`)}>
            <Ionicons name="chatbubbles-outline" size={20} color={COLORS.textInverse} />
            <Text style={styles.mainActionText}>Discuter avec le propriétaire</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={miStyles.item}>
      <Ionicons name={icon as any} size={16} color={COLORS.textTertiary} />
      <Text style={miStyles.label}>{label}</Text>
      <Text style={miStyles.value}>{value}</Text>
    </View>
  );
}

const MISSION_STEPS = [
  { key: 'pending', label: 'Créée' },
  { key: 'assigned', label: 'Assignée' },
  { key: 'in_progress', label: 'En cours' },
  { key: 'completed', label: 'Terminée' },
];

function StatusTimeline({ status }: { status: string }) {
  const steps = MISSION_STEPS;
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
