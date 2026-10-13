import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, RADIUS, SPACING, getServiceVisual } from '../../theme';
import { ownerMissionFollowUp } from '../../utils/ownerMissionFollowUp';
import { providerMissionFollowUp } from '../../utils/providerMissionFollowUp';
import type { CompletionStep } from '../../api/completion';
import { isUrgentMission } from '../../utils/missionPresentation';
import { getMissionTypeLabel } from '../../utils/serviceLabels';
import { MARKETPLACE } from './MarketplaceKit';
import { Card, StatusBadge } from '../ui';

export type MissionPreviewData = {
  completion_steps?: CompletionStep[];
  services?: string[]; priority?: 'normal' | 'urgent';
  mission_type?: string; service_type?: string; property_name?: string; property_address?: string;
  scheduled_date?: string | null; fixed_rate?: number; status: string; raw_status?: string; is_emergency?: boolean;
};
export function MissionPreview({ mission: m, onPress, dark = false, label, provider = false, embedded = false }: { mission: MissionPreviewData; onPress: () => void; dark?: boolean; label?: string; provider?: boolean; embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const visual = getServiceVisual(m.service_type || m.mission_type || '');
  const followUp = provider ? providerMissionFollowUp(m) : ownerMissionFollowUp(m);
  const ink = dark ? COLORS.paper : COLORS.textPrimary;
  return <Card onPress={onPress} style={[dark ? styles.feature : styles.preview, embedded && { padding: 0, borderWidth: 0, shadowOpacity: 0, elevation: 0 }]}>
    <View style={homeStyles.row}>
      <View style={[styles.serviceIcon, { backgroundColor: dark ? COLORS.heroBorder : visual.bg }]}><Ionicons name={visual.icon as keyof typeof Ionicons.glyphMap} size={22} color={dark ? COLORS.paper : visual.color} /></View>
      <View style={homeStyles.flex}><Text style={[homeStyles.eyebrow, { color: dark ? COLORS.onNavyMuted : COLORS.textSecondary }]}>{getMissionTypeLabel(m.service_type || m.mission_type || '', m.services)}</Text><Text style={[homeStyles.cardTitle, { color: ink }]}>{m.property_name}</Text></View>
      {!!m.fixed_rate && !m.is_emergency && <Text style={[styles.price, { color: ink }]}>{m.fixed_rate} €</Text>}
    </View>
    {!!m.property_address && <Text style={[homeStyles.meta, { color: dark ? COLORS.onNavyMuted : COLORS.textSecondary }]} numberOfLines={2}>{m.property_address}</Text>}
    <View style={[homeStyles.row, { marginTop: SPACING.md }]}><Ionicons name="calendar-outline" color={dark ? COLORS.onNavyMuted : COLORS.textSecondary} size={16} /><Text style={[homeStyles.meta, homeStyles.flex, { color: dark ? COLORS.onNavyMuted : COLORS.textSecondary }]}>{m.scheduled_date ? new Date(m.scheduled_date).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : isUrgentMission(m) ? 'Dès que possible · délai à confirmer' : t('alpine.datePending')}</Text></View>
    <View style={styles.footer}>{isUrgentMission(m) && <Text style={{ ...FONTS.caption, color: dark ? COLORS.gold : COLORS.urgency }}>Urgente</Text>}<StatusBadge multiline={!!followUp} style={{ flexShrink: 1 }} status={followUp ? 'awaiting_payment' : m.raw_status || m.status} emergency={m.is_emergency} label={followUp ? t(`alpine.${followUp}`) : undefined} /><Ionicons name="arrow-forward" size={18} color={ink} /></View>
    {label && <View style={styles.featureAction}><Text style={styles.featureActionText}>{label}</Text><Ionicons name="arrow-forward" color={COLORS.textPrimary} size={18} /></View>}
  </Card>;
}
export function WeekStrip({ selected, onSelect, dates }: { selected: Date; onSelect: (day: Date) => void; dates: string[] }) {
  const { i18n } = useTranslation();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return <View style={styles.week}>{Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today); date.setDate(date.getDate() + index);
    const active = selected.toDateString() === date.toDateString();
    const hasMission = dates.some(value => new Date(value).toDateString() === date.toDateString());
    return <TouchableOpacity key={date.toISOString()} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })} onPress={() => onSelect(date)} style={[styles.day, active && styles.activeDay]}><Text style={[styles.dayLabel, active && styles.light]}>{date.toLocaleDateString(i18n.language, { weekday: 'short' }).replace('.', '')}</Text><Text style={[styles.dayNumber, active && styles.light]}>{date.getDate()}</Text><View style={[styles.dayDot, { backgroundColor: hasMission ? active ? COLORS.gold : COLORS.success : 'transparent' }]} /></TouchableOpacity>;
  })}</View>;
}
export const homeStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  sheet: { padding: SPACING.lg, paddingBottom: 110, backgroundColor: MARKETPLACE.canvas, gap: SPACING.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { ...FONTS.caption, fontSize: 10, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  cardTitle: { ...FONTS.h3, fontSize: 17, color: COLORS.textPrimary },
  meta: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  link: { ...FONTS.bodySmall, fontFamily: FONTS.h2.fontFamily, color: COLORS.brandPrimary },
  summary: { ...FONTS.bodySmall, fontSize: 12, color: COLORS.textSecondary },
  divider: { height: 1, backgroundColor: COLORS.border },
  white: { color: COLORS.paper },
});
const styles = StyleSheet.create({
  preview: { borderRadius: RADIUS.xl },
  feature: { backgroundColor: MARKETPLACE.deep, borderColor: MARKETPLACE.deep, padding: SPACING.xl, borderRadius: 18 },
  serviceIcon: { width: 44, height: 44, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  price: { ...FONTS.h3, fontSize: 17, flexShrink: 0 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  featureAction: { minHeight: 48, marginTop: SPACING.lg, backgroundColor: COLORS.paper, borderRadius: RADIUS.md, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  featureActionText: { ...FONTS.bodySmall, fontFamily: FONTS.h2.fontFamily, color: COLORS.textPrimary, flexShrink: 1 },
  week: { flexDirection: 'row', gap: SPACING.xs },
  day: { flex: 1, minHeight: 72, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  activeDay: { backgroundColor: COLORS.navy },
  dayLabel: { ...FONTS.bodySmall, fontSize: 10, color: COLORS.textSecondary },
  dayNumber: { ...FONTS.h3, fontSize: 17, color: COLORS.textPrimary, marginTop: SPACING.xs },
  dayDot: { width: 4, height: 4, borderRadius: RADIUS.full, marginTop: SPACING.xs },
  light: { color: COLORS.paper },
});
