import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getPartners, deletePartner, updatePartner } from '../../src/api';
import { AdminGuard } from '../../src/components/AdminGuard';
import type { LocalPartner } from '../../src/types/api';

export default function AdminPartners() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const CATEGORY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
    restaurant:   { icon: 'restaurant-outline',  color: '#F97316', label: t('admin.partners.category_restaurant')    },
    activite:     { icon: 'bicycle-outline',      color: '#10B981', label: t('admin.partners.category_activite')      },
    spa:          { icon: 'sparkles-outline',     color: '#8B5CF6', label: t('admin.partners.category_spa')           },
    transport:    { icon: 'car-outline',          color: '#3B82F6', label: t('admin.partners.category_transport')     },
    shopping:     { icon: 'bag-outline',          color: '#EC4899', label: t('admin.partners.category_shopping')      },
    location:     { icon: 'key-outline',          color: '#EAB308', label: t('admin.partners.category_location')      },
    autre:        { icon: 'ellipsis-horizontal-outline', color: '#64748B', label: t('admin.partners.category_autre') },
  };

  const { data: partners = [] as LocalPartner[], isLoading: loading, refetch: load } = useQuery({
    queryKey: ['admin-partners'],
    queryFn: () => getPartners(),
  });

  const handleToggleActive = (partner: LocalPartner) => {
    Alert.alert(
      partner.is_active ? t('admin.partners.deactivate_title') : t('admin.partners.activate_title'),
      partner.is_active ? t('admin.partners.deactivate_msg', { name: partner.name }) : t('admin.partners.activate_msg', { name: partner.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: partner.is_active ? t('admin.partners.deactivate') : t('admin.partners.activate'), onPress: async () => { await updatePartner(partner.id, { is_active: !partner.is_active }); load(); } },
      ]
    );
  };

  const handleDelete = (partner: LocalPartner) => {
    Alert.alert(t('admin.partners.delete_title'), t('admin.partners.delete_msg', { name: partner.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await deletePartner(partner.id); load(); } },
    ]);
  };

  const renderItem = ({ item }: { item: LocalPartner }) => {
    const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.autre;
    return (
      <View style={[styles.row, !item.is_active && styles.rowInactive]}>
        <View style={[styles.rowIcon, { backgroundColor: cfg.color + '22' }]}>
          {item.logo_url
            ? <Image source={{ uri: item.logo_url }} style={styles.rowLogo} resizeMode="contain" />
            : <Ionicons name={cfg.icon as keyof typeof Ionicons.glyphMap} size={20} color={cfg.color} />}
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.rowMeta}>{cfg.label} · {item.zone}</Text>
        </View>
        <View style={styles.rowActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: '/(admin)/partner-form', params: { id: item.id } } as never)}>
            <Ionicons name="pencil-outline" size={17} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleActive(item)}>
            <Ionicons name={item.is_active ? 'eye-outline' : 'eye-off-outline'} size={17} color={item.is_active ? '#10B981' : '#94A3B8'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={17} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <AdminGuard>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1E3A5F" />
          </TouchableOpacity>
          <Text style={styles.title}>{t('admin.partners.title')}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(admin)/partner-form' as never)}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.count}>{partners.length !== 1 ? t('admin.partners.count_plural', { count: partners.length }) : t('admin.partners.count', { count: partners.length })}</Text>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.brandPrimary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={partners}
            keyExtractor={p => p.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="storefront-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyText}>{t('admin.partners.empty')}</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF', gap: SPACING.md },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#1E3A5F', flex: 1 },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center' },
  count: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#94A3B8', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  list: { padding: SPACING.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.card },
  rowInactive: { opacity: 0.5 },
  rowIcon: { width: 44, height: 44, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  rowLogo: { width: 40, height: 40 },
  rowBody: { flex: 1 },
  rowName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1E3A5F' },
  rowMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#94A3B8', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: SPACING.sm },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#94A3B8', textAlign: 'center' },
});
