import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAdminUsers } from '../../src/api';
import type { User } from '../../src/types/api';

export default function AdminUsers() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch]           = useState('');
  const [roleFilter, setRoleFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [appliedSearch, setAppliedSearch] = useState('');

  const ROLE_FILTERS  = [{ key: 'all', label: t('admin.users.filter_all') }, { key: 'owner', label: t('admin.users.filter_owner') }, { key: 'provider', label: t('admin.users.filter_provider') }];
  const STATUS_FILTERS = [{ key: 'all', label: t('admin.users.filter_active') }, { key: 'suspended', label: t('admin.users.filter_suspended') }];

  const { data: users = [] as User[], isLoading: loading, refetch } = useQuery({
    queryKey: ['admin-users', appliedSearch, roleFilter, statusFilter],
    queryFn: () => getAdminUsers(appliedSearch, roleFilter, statusFilter),
  });

  const applySearch = () => { setAppliedSearch(search); };

  const renderUser = ({ item: u }: { item: { id: string; name: string; email: string; role: string; is_admin?: boolean; suspended?: boolean; created_at: string } }) => (
    <TouchableOpacity style={styles.userRow} onPress={() => router.push(`/(admin)/user/${u.id}` as never)} activeOpacity={0.8}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarLetter}>{(u.name || u.email || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={styles.userBody}>
        <Text style={styles.userName} numberOfLines={1}>{u.name || t('admin.users.no_name')}</Text>
        <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
      </View>
      <View style={styles.userMeta}>
        {u.role && (
          <View style={[styles.roleBadge, { backgroundColor: u.role === 'owner' ? COLORS.infoSoft : COLORS.purpleSoft }]}>
            <Text style={[styles.roleBadgeText, { color: u.role === 'owner' ? COLORS.info : COLORS.purple }]}>
              {u.role === 'owner' ? 'Owner' : 'Provider'}
            </Text>
          </View>
        )}
        {u.suspended && (
          <View style={[styles.roleBadge, { backgroundColor: COLORS.urgencySoft, marginTop: 4 }]}>
            <Text style={[styles.roleBadgeText, { color: COLORS.urgency }]}>{t('admin.users.suspended')}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <AdminGuard>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('admin.users.title')}</Text>
          <Text style={styles.count}>{users.length !== 1 ? t('admin.users.results', { count: users.length }) : t('admin.users.result', { count: users.length })}</Text>
        </View>

        {/* Recherche */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('admin.users.search_placeholder')}
            placeholderTextColor={COLORS.textTertiary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={applySearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setAppliedSearch(''); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filtres rôle */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
          {ROLE_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, roleFilter === f.key && styles.chipActive]}
              onPress={() => { setRoleFilter(f.key); }}
            >
              <Text style={[styles.chipText, roleFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterDivider} />
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, statusFilter === f.key && styles.chipActive, statusFilter === f.key && f.key === 'suspended' && { backgroundColor: COLORS.urgency, borderColor: COLORS.urgency }]}
              onPress={() => { setStatusFilter(f.key); }}
            >
              <Text style={[styles.chipText, statusFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={COLORS.purple} /></View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={u => u.id}
            renderItem={renderUser}
            refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={50} color={COLORS.textTertiary} />
                <Text style={styles.emptyText}>{t('admin.users.no_user_found')}</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, color: '#1E3A5F' },
  count: { ...FONTS.bodySmall, color: COLORS.textTertiary },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginHorizontal: SPACING.xl, backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  searchInput: { flex: 1, ...FONTS.body, color: '#1E3A5F', paddingVertical: 2 },
  filterBar: { flexGrow: 0 },
  filterContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm, paddingBottom: SPACING.sm },
  filterDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.xs },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  chipText: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.textInverse, fontWeight: '600' },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: SPACING.md, ...SHADOWS.card, borderWidth: 1, borderColor: '#F1F5F9' },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.purpleSoft, justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: COLORS.purple },
  userBody: { flex: 1 },
  userName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#1E3A5F' },
  userEmail: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  userMeta: { alignItems: 'flex-end' },
  roleBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  roleBadgeText: { ...FONTS.caption, fontSize: 9 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: SPACING.md },
  emptyText: { ...FONTS.bodySmall, color: COLORS.textTertiary },
});
