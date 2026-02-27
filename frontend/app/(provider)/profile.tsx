import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useAuth } from '../../src/auth';

export default function ProviderProfile() {
  const router = useRouter();
  const { user, handleLogout } = useAuth();

  const onLogout = async () => {
    await handleLogout();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container} testID="provider-profile">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}><Text style={styles.title}>Profil</Text></View>
        <View style={styles.userCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{user?.name?.[0] || 'P'}</Text></View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="construct-outline" size={14} color={COLORS.brandPrimary} />
            <Text style={styles.roleText}>Prestataire</Text>
          </View>
        </View>
        <View style={styles.menuSection}>
          {[
            { icon: 'notifications-outline', label: 'Notifications' },
            { icon: 'settings-outline', label: 'Spécialités & Zone' },
            { icon: 'card-outline', label: 'Paiements' },
            { icon: 'help-circle-outline', label: 'Aide' },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.menuItem}>
              <Ionicons name={item.icon as any} size={22} color={COLORS.textSecondary} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity testID="provider-logout-btn" style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.urgency} />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
        <Text style={styles.version}>MontRTO v1.0 - Prestataire</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  title: { ...FONTS.h2, color: COLORS.textPrimary },
  userCard: { alignItems: 'center', backgroundColor: COLORS.paper, marginHorizontal: SPACING.xl, marginTop: SPACING.xl, padding: SPACING.xxl, borderRadius: RADIUS.xl, ...SHADOWS.card },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.brandPrimary, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  avatarText: { ...FONTS.h1, color: COLORS.textInverse },
  userName: { ...FONTS.h3, color: COLORS.textPrimary },
  userEmail: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 4 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, backgroundColor: COLORS.subtle, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  roleText: { ...FONTS.bodySmall, color: COLORS.brandPrimary },
  menuSection: { marginTop: SPACING.xl, marginHorizontal: SPACING.xl, backgroundColor: COLORS.paper, borderRadius: RADIUS.xl, ...SHADOWS.card },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md },
  menuLabel: { flex: 1, ...FONTS.body, color: COLORS.textPrimary },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginHorizontal: SPACING.xl, marginTop: SPACING.xl, padding: SPACING.lg, backgroundColor: COLORS.urgencySoft, borderRadius: RADIUS.lg },
  logoutText: { ...FONTS.body, color: COLORS.urgency, fontWeight: '600' },
  version: { ...FONTS.bodySmall, color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.xxl, marginBottom: SPACING.xxxl },
});
