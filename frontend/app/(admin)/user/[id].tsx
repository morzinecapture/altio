import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_LABELS, STATUS_COLORS, MISSION_TYPE_LABELS } from '../../../src/theme';
import { AdminGuard } from '../../../src/components/AdminGuard';
import { getAdminUserDetail, suspendUser, reactivateUser, approveProviderDocument, rejectProviderDocument } from '../../../src/api';
import { useAuth } from '../../../src/auth';

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={COLORS.textTertiary} />
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

export default function AdminUserDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: adminUser } = useAuth();
  const [data, setData]           = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      const result = await getAdminUserDetail(id);
      setData(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [id]));

  const handleSuspend = () => {
    Alert.alert(
      'Suspendre ce compte ?',
      `${data?.user?.name || 'Cet utilisateur'} ne pourra plus se connecter.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Suspendre', style: 'destructive', onPress: async () => {
            setActionLoading(true);
            try {
              await suspendUser(id, 'Suspendu manuellement par admin');
              Alert.alert('Compte suspendu');
              fetchData();
            } catch (e: any) { Alert.alert('Erreur', e.message); }
            finally { setActionLoading(false); }
          }
        }
      ]
    );
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await reactivateUser(id);
      Alert.alert('Compte réactivé');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setActionLoading(false); }
  };

  const handleApproveDoc = async (docType: string) => {
    setActionLoading(true);
    try {
      await approveProviderDocument(data?.provider?.provider_id, docType);
      Alert.alert('Document approuvé');
      fetchData();
    } catch (e: any) { Alert.alert('Erreur', e.message); }
    finally { setActionLoading(false); }
  };

  const handleRejectDoc = (docType: string) => {
    Alert.alert('Refuser ce document ?', 'Le prestataire sera notifié.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Refuser', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await rejectProviderDocument(data?.provider?.provider_id, docType, 'Document invalide');
            Alert.alert('Document refusé');
            fetchData();
          } catch (e: any) { Alert.alert('Erreur', e.message); }
          finally { setActionLoading(false); }
        }
      }
    ]);
  };

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={COLORS.purple} /></View>
  );

  const u = data?.user;
  const provider = data?.provider;
  const missions = data?.missions ?? [];
  const auditHistory = data?.audit ?? [];

  return (
    <AdminGuard>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1E3A5F" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{u?.name || 'Utilisateur'}</Text>
          {u?.suspended && (
            <View style={styles.suspendedBadge}>
              <Text style={styles.suspendedBadgeText}>SUSPENDU</Text>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Profil */}
          <View style={styles.section}>
            <View style={styles.avatarRow}>
              <View style={styles.avatarBig}>
                <Text style={styles.avatarBigLetter}>{(u?.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={styles.avatarInfo}>
                <Text style={styles.userName}>{u?.name || 'Sans nom'}</Text>
                <Text style={styles.userEmail}>{u?.email}</Text>
                {u?.role && (
                  <View style={[styles.chip, { backgroundColor: u.role === 'owner' ? COLORS.infoSoft : COLORS.purpleSoft, marginTop: SPACING.xs }]}>
                    <Text style={[styles.chipText, { color: u.role === 'owner' ? COLORS.info : COLORS.purple }]}>
                      {u.role === 'owner' ? 'Propriétaire' : 'Prestataire'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Infos compte */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informations compte</Text>
            <View style={styles.card}>
              <InfoRow icon="calendar-outline"    label="Inscrit le"         value={u?.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'} />
              <InfoRow icon="checkmark-circle-outline" label="Onboarding"   value={u?.onboarding_completed ? 'Terminé' : 'En cours'} />
              {u?.owner_type && <InfoRow icon="home-outline" label="Type owner" value={u.owner_type} />}
              <InfoRow icon="shield-outline"      label="Admin"              value={u?.is_admin ? 'Oui' : 'Non'} />
            </View>
          </View>

          {/* Profil prestataire */}
          {provider && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profil prestataire</Text>
              <View style={styles.card}>
                <InfoRow icon="star-outline"      label="Note"               value={`${provider.rating ?? '—'} / 5 (${provider.total_reviews ?? 0} avis)`} />
                <InfoRow icon="cash-outline"      label="Gains totaux"       value={`${provider.total_earnings ?? 0}€`} />
                <InfoRow icon="checkmark-done-outline" label="Vérifié"       value={provider.verified ? 'Oui' : 'Non'} />
                {provider.bio && <InfoRow icon="document-text-outline" label="Bio" value={provider.bio} />}
              </View>

              {/* Documents */}
              {provider.documents && Array.isArray(provider.documents) && provider.documents.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: SPACING.md }]}>Documents</Text>
                  {provider.documents.map((doc: any) => (
                    <View key={doc.type} style={[styles.card, styles.docRow]}>
                      <Ionicons name="document-outline" size={20} color={COLORS.info} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docType}>{doc.type}</Text>
                        <View style={[styles.docStatus, {
                          backgroundColor: doc.status === 'approved' ? COLORS.successSoft : doc.status === 'rejected' ? COLORS.urgencySoft : COLORS.warningSoft
                        }]}>
                          <Text style={[styles.docStatusText, {
                            color: doc.status === 'approved' ? COLORS.success : doc.status === 'rejected' ? COLORS.urgency : COLORS.warning
                          }]}>
                            {doc.status === 'approved' ? 'Approuvé' : doc.status === 'rejected' ? 'Refusé' : 'En attente'}
                          </Text>
                        </View>
                      </View>
                      {doc.status === 'pending' && (
                        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                          <TouchableOpacity style={[styles.docBtn, { backgroundColor: COLORS.successSoft }]} onPress={() => handleApproveDoc(doc.type)} disabled={actionLoading}>
                            <Ionicons name="checkmark" size={16} color={COLORS.success} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.docBtn, { backgroundColor: COLORS.urgencySoft }]} onPress={() => handleRejectDoc(doc.type)} disabled={actionLoading}>
                            <Ionicons name="close" size={16} color={COLORS.urgency} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* Historique missions */}
          {missions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Missions récentes ({missions.length})</Text>
              {missions.slice(0, 5).map((m: any) => (
                <TouchableOpacity key={m.id} style={[styles.card, { marginBottom: SPACING.sm }]} onPress={() => router.push(`/mission/${m.id}` as any)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.missionTitle}>{MISSION_TYPE_LABELS[m.mission_type] || m.mission_type}</Text>
                    <View style={[styles.chip, { backgroundColor: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).bg }]}>
                      <Text style={[styles.chipText, { color: (STATUS_COLORS[m.status] || STATUS_COLORS.pending).text }]}>
                        {STATUS_LABELS[m.status] || m.status}
                      </Text>
                    </View>
                  </View>
                  {m.scheduled_date && <Text style={styles.missionDate}>{new Date(m.scheduled_date).toLocaleDateString('fr-FR')}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Actions admin */}
          <View style={[styles.section, { paddingBottom: 100 }]}>
            <Text style={styles.sectionTitle}>Actions admin</Text>
            {u?.suspended ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
                onPress={handleReactivate}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator color={COLORS.textInverse} /> : (
                  <><Ionicons name="checkmark-circle-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionBtnText}>Réactiver le compte</Text></>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.urgency }]}
                onPress={handleSuspend}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator color={COLORS.textInverse} /> : (
                  <><Ionicons name="ban-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionBtnText}>Suspendre le compte</Text></>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#FFFFFF' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 18, color: '#1E3A5F' },
  suspendedBadge: { backgroundColor: COLORS.urgencySoft, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  suspendedBadgeText: { ...FONTS.caption, color: COLORS.urgency, fontSize: 9 },
  section: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  avatarBig: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.purpleSoft, justifyContent: 'center', alignItems: 'center' },
  avatarBigLetter: { fontFamily: 'Inter_700Bold', fontSize: 28, color: COLORS.purple },
  avatarInfo: { flex: 1 },
  userName: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#1E3A5F' },
  userEmail: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  chip: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full, alignSelf: 'flex-start' },
  chipText: { ...FONTS.caption, fontSize: 9 },
  card: { backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: SPACING.md, ...SHADOWS.card, borderWidth: 1, borderColor: '#F1F5F9' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoText: { flex: 1 },
  infoLabel: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  infoValue: { ...FONTS.bodySmall, color: '#1E3A5F', marginTop: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
  docType: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1E3A5F', textTransform: 'capitalize' },
  docStatus: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginTop: 4 },
  docStatusText: { ...FONTS.caption, fontSize: 9 },
  docBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  missionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1E3A5F' },
  missionDate: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, marginBottom: SPACING.sm },
  actionBtnText: { ...FONTS.bodySmall, color: COLORS.textInverse, fontWeight: '600' },
});
