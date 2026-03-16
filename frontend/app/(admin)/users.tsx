import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { AdminGuard } from '../../src/components/AdminGuard';
import { getAdminUsers } from '../../src/api';

const ROLE_FILTERS  = [{ key: 'all', label: 'Tous' }, { key: 'owner', label: 'Owner' }, { key: 'provider', label: 'Prestataire' }];
const STATUS_FILTERS = [{ key: 'all', label: 'Actifs' }, { key: 'suspended', label: 'Suspendus' }];

export default function AdminUsers() {
  const router = useRouter();
  const [users, setUsers]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [search, setSearch]           = useState('');
  const [roleFilter, setRoleFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = async () => {
    try {
      const result = await getAdminUsers(search, roleFilter, statusFilter);
      setUsers(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  // Refetch quand les filtres changent
  const applySearch = () => { setLoading(true); fetchData(); };

  const renderUser = ({ item: u }: { item: any }) => (
    <TouchableOpacity style={styles.userRow} onPress={() => router.push(`/(admin)/user/${u.id}` as any)} activeOpacity={0.8}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarLetter}>{(u.name || u.email || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={styles.userBody}>
        <Text style={styles.userName} numberOfLines={1}>{u.name || 'Sans nom'}</Text>
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
            <Text style={[styles.roleBadgeText, { color: COLORS.urgency }]}>Suspendu</Text>
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
          <Text style={styles.title}>Utilisateurs</Text>
          <Text style={styles.count}>{users.length} résultat{users.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Recherche */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher par nom ou email…"
            placeholderTextColor={COLORS.textTertiary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={applySearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setTimeout(applySearch, 0); }}>
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
              onPress={() => { setRoleFilter(f.key); setLoading(true); setTimeout(fetchData, 0); }}
            >
              <Text style={[styles.chipText, roleFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterDivider} />
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, statusFilter === f.key && styles.chipActive, statusFilter === f.key && f.key === 'suspended' && { backgroundColor: COLORS.urgency, borderColor: COLORS.urgency }]}
              onPress={() => { setStatusFilter(f.key); setLoading(true); setTimeout(fetchData, 0); }}
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={50} color={COLORS.textTertiary} />
                <Text style={styles.emptyText}>Aucun utilisateur trouvé</Text>
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
