import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING } from '../../theme';

export const MARKETPLACE = {
  cobalt: '#2159DB', deep: '#123353', canvas: '#F3F5F8',
  ice: '#E8EFFF', iceInk: '#204CA4', mint: '#E0F3EC', mintInk: '#23634F',
  amber: '#FFF0DA', amberInk: '#805012', heroMuted: '#D8E5FF',
};
type Icon = React.ComponentProps<typeof Ionicons>['name'];

export function HomeSection({ title, icon, tone = 'plain', actionLabel, onAction, children }: {
  title: string; icon: Icon; tone?: 'plain' | 'mint' | 'amber' | 'deep' | 'ice';
  actionLabel?: string; onAction?: () => void; children: React.ReactNode;
}) {
  const dark = tone === 'deep';
  return <View style={[marketStyles.section, { backgroundColor: tone === 'plain' ? COLORS.paper : MARKETPLACE[tone], borderColor: tone === 'plain' ? COLORS.border : MARKETPLACE[tone] }]}>
    <View style={marketStyles.sectionHead}>
      <View style={marketStyles.sectionIcon}><Ionicons name={icon} size={17} color={MARKETPLACE.iceInk} /></View>
      <Text accessibilityRole="header" style={[marketStyles.sectionTitle, dark && { color: COLORS.paper }]}>{title}</Text>
      {onAction && actionLabel && <TouchableOpacity accessibilityRole="button" onPress={onAction} style={marketStyles.sectionLink}><Text style={[marketStyles.linkText, dark && { color: COLORS.paper }]}>{actionLabel}</Text><Ionicons name="chevron-forward" size={15} color={dark ? COLORS.paper : MARKETPLACE.iceInk} /></TouchableOpacity>}
    </View>
    <View style={marketStyles.sectionBody}>{children}</View>
  </View>;
}

export function MissionContact({ title, subtitle, onPress, testID }: {
  title: string; subtitle?: string; onPress: () => void; testID?: string;
}) {
  const { t } = useTranslation();
  return <View style={marketStyles.contact}>
    <View style={marketStyles.avatar}><Ionicons name="person-outline" size={21} color={MARKETPLACE.amberInk} /></View>
    <View style={{ flex: 1, minWidth: 0 }}><Text style={marketStyles.contactTitle}>{title}</Text>{subtitle && <Text style={marketStyles.contactSub}>{subtitle}</Text>}</View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${t('alpine.sendMessage')} · ${title}`} testID={testID} onPress={onPress} style={marketStyles.message}>
      <Ionicons name="chatbubble-outline" size={18} color={MARKETPLACE.iceInk} /><Text style={marketStyles.linkText}>{t('alpine.message')}</Text>
    </TouchableOpacity>
  </View>;
}

export function QuoteChoice({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[marketStyles.quoteChoice, disabled && { opacity: 0.5 }]}>
    <View style={marketStyles.sectionIcon}><Ionicons name="document-text-outline" size={21} color={MARKETPLACE.iceInk} /></View>
    <View style={{ flex: 1 }}><Text style={marketStyles.contactTitle}>{t('alpine.prepareQuote')}</Text><Text style={marketStyles.contactSub}>{t('alpine.extraWork')}</Text></View>
    <Ionicons name="arrow-up-right-box-outline" size={20} color={MARKETPLACE.iceInk} />
  </TouchableOpacity>;
}

export const marketStyles = StyleSheet.create({
  section: { padding: 18, borderRadius: 20, borderWidth: 1, shadowColor: MARKETPLACE.deep, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 10, elevation: 1 },
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9, marginBottom: 15 },
  sectionIcon: { minWidth: 32, height: 34, borderRadius: 10, backgroundColor: MARKETPLACE.ice, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { ...FONTS.h3, fontSize: 16, color: COLORS.textPrimary, flex: 1 },
  sectionLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionBody: { gap: SPACING.md },
  linkText: { ...FONTS.bodySmall, fontFamily: FONTS.h3.fontFamily, color: MARKETPLACE.iceInk, fontSize: 12 },
  contact: { padding: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.paper, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.lg, flexWrap: 'wrap' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: MARKETPLACE.amber, alignItems: 'center', justifyContent: 'center' },
  contactTitle: { ...FONTS.h3, fontSize: 14, color: COLORS.textPrimary },
  contactSub: { ...FONTS.bodySmall, fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  message: { minHeight: 44, paddingHorizontal: 12, borderRadius: 11, backgroundColor: MARKETPLACE.ice, flexDirection: 'row', alignItems: 'center', gap: 7 },
  quoteChoice: { padding: 14, minHeight: 72, backgroundColor: MARKETPLACE.canvas, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 10 },
  actionPanel: { padding: 18, borderRadius: 20, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  hero: { backgroundColor: MARKETPLACE.cobalt, marginHorizontal: -SPACING.xl, padding: SPACING.xl, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, marginBottom: 20 },
  heroTitle: { ...FONTS.h1, fontSize: 28, lineHeight: 35, color: COLORS.paper, marginTop: 12 },
  heroSubtitle: { ...FONTS.body, color: MARKETPLACE.heroMuted, marginTop: 6 },
  waiting: { backgroundColor: MARKETPLACE.amber, borderColor: MARKETPLACE.amber, borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 16 },
});
