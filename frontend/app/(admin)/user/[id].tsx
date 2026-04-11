import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_LABELS, STATUS_COLORS } from '../../../src/theme';
import { getMissionTypeLabel } from '../../../src/utils/serviceLabels';
import { AdminGuard } from '../../../src/components/AdminGuard';
import { getAdminUserDetail, suspendUser, reactivateUser, approveProviderDocument, rejectProviderDocument } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import type { AdminUserDetail as AdminUserDetailType, ProviderDocument, AuditLogEntry } from '../../../src/types/api';

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={COLORS.textTertiary} />
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

export default function AdminUserDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: adminUser } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => getAdminUserDetail(id),
    enabled: !!id,
  });

  const suspendMut = useMutation({
    mutationFn: (params: { userId: string; reason: string }) => suspendUser(params.userId, params.reason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-user', id] }); },
  });

  const reactivateMut = useMutation({
    mutationFn: (userId: string) => reactivateUser(userId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-user', id] }); },
  });

  const approveDocMut = useMutation({
    mutationFn: (params: { providerId: string; docType: string }) => approveProviderDocument(params.providerId, params.docType),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-user', id] }); },
  });

  const rejectDocMut = useMutation({
    mutationFn: (params: { providerId: string; docType: string; reason: string }) => rejectProviderDocument(params.providerId, params.docType, params.reason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-user', id] }); },
  });

  const actionLoading = suspendMut.isPending || reactivateMut.isPending || approveDocMut.isPending || rejectDocMut.isPending;

  const handleSuspend = () => {
    Alert.alert(
      t('admin.user_detail.suspend_confirm_title'),
      t('admin.user_detail.suspend_confirm_msg', { name: data?.user?.name || t('admin.user_detail.user_default') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.user_detail.suspend'), style: 'destructive', onPress: async () => {
            try {
              await suspendMut.mutateAsync({ userId: id, reason: 'Suspendu manuellement par admin' });
              Alert.alert(t('admin.user_detail.account_suspended'));
            } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
          }
        }
      ]
    );
  };

  const handleReactivate = async () => {
    try {
      await reactivateMut.mutateAsync(id);
      Alert.alert(t('admin.user_detail.account_reactivated'));
    } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  const handleApproveDoc = async (docType: string) => {
    try {
      await approveDocMut.mutateAsync({ providerId: data?.provider?.provider_id || '', docType });
      Alert.alert(t('admin.user_detail.doc_approved_alert'));
    } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
  };

  const handleRejectDoc = (docType: string) => {
    Alert.alert(t('admin.user_detail.reject_doc_title'), t('admin.user_detail.reject_doc_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.user_detail.doc_rejected_alert'), style: 'destructive', onPress: async () => {
          try {
            await rejectDocMut.mutateAsync({ providerId: data?.provider?.provider_id || '', docType, reason: 'Document invalide' });
            Alert.alert(t('admin.user_detail.doc_rejected_alert'));
          } catch (e: unknown) { Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e)); }
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
          <Text style={styles.title} numberOfLines={1}>{u?.name || t('admin.user_detail.user_default')}</Text>
          {u?.suspended && (
            <View style={styles.suspendedBadge}>
              <Text style={styles.suspendedBadgeText}>{t('admin.user_detail.suspended_badge')}</Text>
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
                <Text style={styles.userName}>{u?.name || t('admin.user_detail.no_name')}</Text>
                <Text style={styles.userEmail}>{u?.email}</Text>
                {u?.role && (
                  <View style={[styles.chip, { backgroundColor: u.role === 'owner' ? COLORS.infoSoft : COLORS.purpleSoft, marginTop: SPACING.xs }]}>
                    <Text style={[styles.chipText, { color: u.role === 'owner' ? COLORS.info : COLORS.purple }]}>
                      {u.role === 'owner' ? t('admin.user_detail.role_owner') : t('admin.user_detail.role_provider')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Infos compte */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('admin.user_detail.account_info')}</Text>
            <View style={styles.card}>
              <InfoRow icon="calendar-outline"    label={t('admin.user_detail.registered_on')}         value={u?.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'} />
              <InfoRow icon="checkmark-circle-outline" label={t('admin.user_detail.onboarding')}   value={u?.onboarding_completed ? t('admin.user_detail.onboarding_done') : t('admin.user_detail.onboarding_pending')} />
              {u?.owner_type && <InfoRow icon="home-outline" label={t('admin.user_detail.owner_type')} value={u.owner_type} />}
              <InfoRow icon="shield-outline"      label={t('admin.user_detail.is_admin')}              value={u?.is_admin ? t('admin.user_detail.yes') : t('admin.user_detail.no')} />
            </View>
          </View>

          {/* Profil prestataire */}
          {provider && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('admin.user_detail.provider_profile')}</Text>
              <View style={styles.card}>
                <InfoRow icon="star-outline"      label={t('admin.user_detail.rating')}               value={`${provider.rating ?? '—'} / 5 (${provider.total_reviews ?? 0} ${t('admin.user_detail.reviews')})`} />
                <InfoRow icon="cash-outline"      label={t('admin.user_detail.total_earnings')}       value={`${provider.total_earnings ?? 0}€`} />
                <InfoRow icon="checkmark-done-outline" label={t('admin.user_detail.verified')}       value={provider.verified ? t('admin.user_detail.yes') : t('admin.user_detail.no')} />
                {provider.bio && <InfoRow icon="document-text-outline" label={t('admin.user_detail.bio')} value={provider.bio} />}
              </View>

              {/* Documents */}
              {provider.documents && Array.isArray(provider.documents) && provider.documents.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: SPACING.md }]}>{t('admin.user_detail.documents')}</Text>
                  {provider.documents.map((doc: ProviderDocument) => (
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
                            {doc.status === 'approved' ? t('admin.user_detail.doc_approved') : doc.status === 'rejected' ? t('admin.user_detail.doc_rejected') : t('admin.user_detail.doc_pending')}
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
              <Text style={styles.sectionTitle}>{t('admin.user_detail.recent_missions', { count: missions.length })}</Text>
              {missions.slice(0, 5).map((m) => (
                <TouchableOpacity key={m.id} style={[styles.card, { marginBottom: SPACING.sm }]} onPress={() => router.push(`/mission/${m.id}` as never)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.missionTitle}>{getMissionTypeLabel(m.mission_type)}</Text>
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

          {/* Historique audit log */}
          {auditHistory.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('admin.user_detail.action_history', { count: auditHistory.length })}</Text>
              {auditHistory.map((entry: AuditLogEntry) => (
                <View key={entry.id} style={[styles.card, { marginBottom: SPACING.sm, flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm }]}>
                  <Ionicons
                    name={entry.action === 'suspend_user' ? 'ban-outline' : entry.action === 'reactivate_user' ? 'checkmark-circle-outline' : 'clipboard-outline'}
                    size={16}
                    color={entry.action === 'suspend_user' ? COLORS.urgency : entry.action === 'reactivate_user' ? COLORS.success : COLORS.textTertiary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditAction}>{entry.action}</Text>
                    {entry.metadata?.reason ? <Text style={styles.auditMeta}>{t('admin.user_detail.reason')} : {String(entry.metadata.reason)}</Text> : null}
                    <Text style={styles.auditDate}>{new Date(entry.created_at).toLocaleString('fr-FR')}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Actions admin */}
          <View style={[styles.section, { paddingBottom: 100 }]}>
            <Text style={styles.sectionTitle}>{t('admin.user_detail.admin_actions')}</Text>
            {u?.suspended ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
                onPress={handleReactivate}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator color={COLORS.textInverse} /> : (
                  <><Ionicons name="checkmark-circle-outline" size={18} color={COLORS.textInverse} />
                  <Text style={styles.actionBtnText}>{t('admin.user_detail.reactivate')}</Text></>
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
                  <Text style={styles.actionBtnText}>{t('admin.user_detail.suspend')}</Text></>
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
  auditAction: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#1E3A5F', textTransform: 'capitalize' },
  auditMeta: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  auditDate: { ...FONTS.caption, color: COLORS.textTertiary, marginTop: 4 },
});
