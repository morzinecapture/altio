import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAuditLog } from '../../src/api';
import { useAuth } from '../../src/auth';
import type { AuditLogEntry } from '../../src/types/api';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, handleLogout } = useAuth();

  const ACTION_LABELS: Record<string, string> = {
    suspend_user:     t('admin.settings.audit_suspend_user'),
    reactivate_user:  t('admin.settings.audit_reactivate_user'),
    approve_doc:      t('admin.settings.audit_approve_doc'),
    reject_doc:       t('admin.settings.audit_reject_doc'),
    export_csv:       t('admin.settings.audit_export_csv'),
    generate_invoice: t('admin.settings.audit_generate_invoice'),
  };

  const { data: audit = [] as AuditLogEntry[], isLoading: loading, refetch } = useQuery({
    queryKey: ['admin-audit-log'],
    queryFn: () => getAuditLog(),
  });

  const confirmLogout = () => {
    Alert.alert(t('admin.settings.logout_title'), t('admin.settings.logout_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.logout'), style: 'destructive', onPress: handleLogout }
    ]);
  };

  return (
    <AdminGuard>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('admin.settings.title')}</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
        >
          {/* Profil admin */}
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Ionicons name="shield-checkmark" size={28} color={COLORS.purple} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'Admin'}</Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>{t('admin.settings.administrator')}</Text>
              </View>
            </View>
          </View>

          {/* Navigation rapide */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('admin.settings.navigation')}</Text>
          </View>
          {[
            { label: t('admin.settings.local_partners'), icon: 'storefront-outline', route: '/(admin)/partners', color: COLORS.purple },
            { label: t('admin.settings.user_management'), icon: 'people-outline', route: '/(admin)/users', color: COLORS.brandPrimary },
            { label: t('admin.settings.finances_export'), icon: 'bar-chart-outline', route: '/(admin)/finances', color: COLORS.success },
          ].map(item => (
            <TouchableOpacity key={item.label} style={styles.menuRow} onPress={() => router.push(item.route as never)}>
              <View style={[styles.menuIcon, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}

          {/* Audit log */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('admin.settings.audit_log')} ({audit.length})</Text>
          </View>
          {loading ? (
            <ActivityIndicator color={COLORS.purple} style={{ marginTop: SPACING.lg }} />
          ) : audit.length === 0 ? (
            <Text style={styles.emptyText}>{t('admin.settings.no_action_recorded')}</Text>
          ) : (
            audit.map(a => (
              <View key={a.id} style={styles.auditRow}>
                <View style={styles.auditDot} />
                <View style={styles.auditBody}>
                  <Text style={styles.auditAction}>{ACTION_LABELS[a.action] ?? a.action}</Text>
                  {a.metadata && Object.keys(a.metadata).length > 0 && (
                    <Text style={styles.auditMeta}>{JSON.stringify(a.metadata)}</Text>
                  )}
                  <Text style={styles.auditTime}>{formatDate(a.created_at)}</Text>
                </View>
              </View>
            ))
          )}

          {/* Déconnexion */}
          <View style={[styles.sectionHeader, { marginTop: SPACING.xl }]}>
            <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.urgency} />
              <Text style={styles.logoutText}>{t('admin.settings.logout')}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginHorizontal: SPACING.xl, marginTop: SPACING.sm, backgroundColor: COLORS.purpleSoft, borderRadius: RADIUS.lg, padding: SPACING.md },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  profileInfo: { flex: 1 },
  profileName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#1E3A5F' },
  profileEmail: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  adminBadge: { backgroundColor: COLORS.purple, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full, alignSelf: 'flex-start', marginTop: SPACING.xs },
  adminBadgeText: { ...FONTS.caption, color: COLORS.textInverse, fontSize: 9 },
  sectionHeader: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: SPACING.sm },
  sectionTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, color: '#1E3A5F' },
  auditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  auditDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.purple, marginTop: 5 },
  auditBody: { flex: 1 },
  auditAction: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: '#1E3A5F' },
  auditMeta: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 2 },
  auditTime: { ...FONTS.bodySmall, color: COLORS.textTertiary, marginTop: 2 },
  emptyText: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center', paddingVertical: SPACING.xl },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.urgencySoft, padding: SPACING.md, borderRadius: RADIUS.md },
  logoutText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: COLORS.urgency },
});
