import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { PageHeader } from '../alpine/AlpineHeader';
import { Button } from '../ui';

type OwnerPageHeaderProps = {
  title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap;
  actionIcon?: keyof typeof Ionicons.glyphMap; actionLabel?: string; onAction?: () => void; testID?: string;
};
export default function OwnerPageHeader({ title, subtitle, actionIcon = 'add', actionLabel, onAction, testID }: OwnerPageHeaderProps) {
  const { t } = useTranslation();
  return <PageHeader title={title} subtitle={subtitle} action={onAction ? actionLabel ? <Button label={actionLabel} icon={actionIcon} onPress={onAction} fullWidth={false} testID={testID} /> : <TouchableOpacity testID={testID} accessibilityLabel={t('common.add')} onPress={onAction} style={styles.action}><Ionicons name={actionIcon} size={23} color={COLORS.paper} /></TouchableOpacity> : undefined} />;
}

const styles = StyleSheet.create({ action: { width: 48, height: 48, borderRadius: RADIUS.full, backgroundColor: COLORS.brandPrimary, alignItems: 'center', justifyContent: 'center' } });
