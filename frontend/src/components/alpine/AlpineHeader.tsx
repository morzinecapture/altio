import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MARKETPLACE } from './MarketplaceKit';
import { useAuth } from '../../auth';
import { COLORS, FONTS, RADIUS, SPACING } from '../../theme';

export function AccountButton({ light = false }: { light?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  return <TouchableOpacity accessibilityLabel={t('alpine.account')} onPress={() => router.push(user?.role === 'provider' ? '/(provider)/profile' : '/(owner)/profile')} style={[styles.avatar, light && styles.lightBorder]}>
    {user?.picture ? <Image source={{ uri: user.picture }} style={styles.avatarImage} /> : <Text style={styles.initials}>{user?.name?.split(' ').map(s => s[0]).slice(0, 2).join('') || 'A'}</Text>}
  </TouchableOpacity>;
}

export function AlpineHeader({ role, location, footer, unreadCount, onNotifications }: {
  role: 'owner' | 'provider'; location?: string; footer: React.ReactNode; unreadCount: number; onNotifications: () => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return <View style={[styles.hero, { paddingTop: insets.top + SPACING.sm }]}>
    <View style={styles.top}>
      <View style={styles.brand}><Text style={styles.logo}>Altio<Text style={{ color: COLORS.paper }}>.</Text></Text><Text numberOfLines={1} style={styles.region}>{location || t(`alpine.${role}Space`)}</Text></View>
      <View style={styles.actions}>
        <TouchableOpacity accessibilityLabel={t('alpine.notifications')} testID="notifications-btn" onPress={onNotifications} style={styles.bell}>
          <Ionicons name="notifications-outline" size={21} color={COLORS.paper} />{unreadCount > 0 && <View style={styles.badge} />}
        </TouchableOpacity>
        <AccountButton light />
      </View>
    </View>
    <View style={styles.copy}>
      <Text style={styles.greeting}>{t('alpine.greeting', { name: user?.name?.split(' ')[0] || '' })}</Text>
      <Text style={styles.heroTitle}>{t(`alpine.${role}Title`).split('\n')[0]}{'\n'}<Text style={styles.heroTitleLight}>{t(`alpine.${role}Title`).split('\n')[1]}</Text></Text>
    </View>
    <View style={styles.footer}>{footer}</View>
  </View>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <View style={styles.page}>
    <View style={styles.top}><Text style={[styles.logo, { color: COLORS.textPrimary }]}>Altio<Text style={styles.dot}>.</Text></Text><AccountButton /></View>
    <View style={styles.titleRow}><View style={styles.brand}><Text style={styles.pageTitle}>{title}</Text>{!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{action}</View>
  </View>;
}
const styles = StyleSheet.create({
  hero: { overflow: 'hidden', backgroundColor: MARKETPLACE.cobalt, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  brand: { flex: 1, minWidth: 0 },
  logo: { ...FONTS.h1, fontSize: 30, letterSpacing: -1.4, color: COLORS.paper },
  dot: { color: COLORS.brandPrimary },
  region: { ...FONTS.caption, fontSize: 11, letterSpacing: 0.4, color: COLORS.paper, marginTop: SPACING.xs },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  bell: { width: 48, height: 48, borderRadius: RADIUS.full, backgroundColor: COLORS.heroGlass, borderColor: COLORS.heroBorder, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 48, height: 48, borderRadius: RADIUS.full, backgroundColor: COLORS.avatar, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  lightBorder: { borderColor: COLORS.heroBorder, borderWidth: 1 },
  initials: { ...FONTS.h3, fontSize: 14, color: COLORS.textPrimary },
  badge: { position: 'absolute', top: SPACING.sm, right: SPACING.sm, width: 7, height: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.gold },
  copy: { paddingTop: SPACING.xxl, paddingBottom: SPACING.md },
  greeting: { ...FONTS.bodySmall, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: MARKETPLACE.heroMuted, marginBottom: SPACING.sm },
  heroTitleLight: { fontFamily: FONTS.h2.fontFamily },
  heroTitle: { ...FONTS.h2, fontSize: 32, lineHeight: 39, color: COLORS.paper, maxWidth: 340 },
  footer: { minHeight: 48, justifyContent: 'center' },
  page: { padding: SPACING.xl, backgroundColor: COLORS.paper, borderBottomColor: COLORS.border, borderBottomWidth: 1, gap: SPACING.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  pageTitle: { ...FONTS.h1, color: COLORS.textPrimary },
  subtitle: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.xs },
});
