import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { useAuth } from '../../src/auth';
import { getOwnerDashboard, getEmergencies, getNotifications, markNotificationRead } from '../../src/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mock data for categories
const CATEGORIES = [
  { id: '1', name: 'Plumber', icon: 'construct-outline' as const },
  { id: '2', name: 'Electrician', icon: 'flash-outline' as const },
  { id: '3', name: 'Carpenter', icon: 'hammer-outline' as const },
  { id: '4', name: 'Painter', icon: 'color-palette-outline' as const },
  { id: '5', name: 'Mason', icon: 'cube-outline' as const },
  { id: '6', name: 'Welder', icon: 'bonfire-outline' as const },
  { id: '7', name: 'Roofer', icon: 'home-outline' as const },
  { id: '8', name: 'More', icon: 'grid-outline' as const },
];

// Mock data for popular providers
const POPULAR_PROVIDERS = [
  {
    id: '1',
    name: 'Expert Plumbing',
    category: 'Plumber',
    categoryColor: '#FF6B6B',
    price: '$45',
    rating: 4.5,
    reviews: 120,
    avatar: 'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=100&h=100&fit=crop',
    verified: true,
  },
];

export default function OwnerDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);

  const fetchData = async () => {
    try {
      const [dashboard, notifs] = await Promise.all([
        getOwnerDashboard(),
        getNotifications(),
      ]);
      setData(dashboard);
      setNotifications(notifs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotifTap = async (notif: any) => {
    if (!notif.read) {
      try { await markNotificationRead(notif.notification_id); } catch {}
    }
    setShowNotifs(false);
    if (notif.type === 'emergency' || notif.type === 'emergency_accepted') {
      router.push(`/emergency?id=${notif.reference_id}`);
    } else if (notif.type === 'mission' || notif.type === 'mission_assigned') {
      router.push(`/mission/${notif.reference_id}`);
    }
    fetchData();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.info} />
      </View>
    );
  }

  const userName = user?.name?.split(' ')[0] || 'Alex Carter';

  return (
    <SafeAreaView style={styles.container} testID="owner-dashboard">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color={COLORS.textInverse} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.greeting}>Hello</Text>
              <Text style={styles.userName}>{userName}</Text>
            </View>
          </View>
          <TouchableOpacity
            testID="notifications-btn"
            onPress={() => setShowNotifs(true)}
            style={styles.notifBtn}
          >
            <Ionicons name="notifications-outline" size={22} color={COLORS.textPrimary} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for any service..."
              placeholderTextColor={COLORS.textTertiary}
              editable={false}
            />
            <View style={styles.searchDivider} />
            <TouchableOpacity style={styles.filterBtn}>
              <Ionicons name="options-outline" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Promo Banner */}
        <View style={styles.promoBanner}>
          <View style={styles.promoContent}>
            <View style={styles.promoSaveBadge}>
              <Text style={styles.promoSaveText}>Save 25% Today!</Text>
            </View>
            <Text style={styles.promoTitle}>
              Exclusive discounts{'\n'}on home service
            </Text>
            <TouchableOpacity style={styles.promoButton} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.textInverse} />
              <Text style={styles.promoButtonText}>Book Now</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.promoImageContainer}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=200&h=250&fit=crop' }}
              style={styles.promoImage}
              resizeMode="cover"
            />
          </View>
        </View>

        {/* Most Booked Services */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Most Booked Services</Text>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat.id} style={styles.categoryItem} activeOpacity={0.7}>
                <View style={styles.categoryIconBox}>
                  <Ionicons name={cat.icon} size={26} color={COLORS.info} />
                </View>
                <Text style={styles.categoryName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Popular Near You */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Popular Near You</Text>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>
          {POPULAR_PROVIDERS.map((provider) => (
            <View key={provider.id} style={styles.providerCard}>
              <View style={styles.providerTop}>
                <View style={styles.providerAvatarContainer}>
                  <Image
                    source={{ uri: provider.avatar }}
                    style={styles.providerAvatar}
                  />
                  {provider.verified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    </View>
                  )}
                </View>
                <View style={styles.providerInfo}>
                  <View style={styles.providerNameRow}>
                    <Text style={styles.providerName}>{provider.name}</Text>
                    <View style={[styles.categoryBadge, { backgroundColor: provider.categoryColor }]}>
                      <Text style={styles.categoryBadgeText}>{provider.category}</Text>
                    </View>
                  </View>
                  <Text style={styles.providerPrice}>{provider.price}</Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.ratingText}>
                      {provider.rating} ({provider.reviews} reviews)
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.providerActions}>
                <TouchableOpacity style={styles.viewProfileBtn}>
                  <Ionicons name="eye-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.viewProfileText}>View Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bookNowBtn} activeOpacity={0.8}>
                  <Ionicons name="calendar-outline" size={16} color={COLORS.textInverse} />
                  <Text style={styles.bookNowText}>Book Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Bottom spacing for floating nav */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Bottom Navigation */}
      <View style={styles.floatingNavContainer}>
        <BlurView intensity={80} tint="light" style={styles.floatingNav}>
          <TouchableOpacity style={styles.navItem}>
            <View style={styles.navItemActive}>
              <Ionicons name="home" size={22} color={COLORS.textInverse} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => {}}>
            <Ionicons name="chatbubble-outline" size={22} color={COLORS.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(owner)/missions')}>
            <Ionicons name="calendar-outline" size={22} color={COLORS.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(owner)/profile')}>
            <Ionicons name="person-outline" size={22} color={COLORS.textTertiary} />
          </TouchableOpacity>
        </BlurView>
      </View>

      {/* Notifications Modal */}
      <Modal visible={showNotifs} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifs(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <View style={styles.emptyNotifs}>
                  <Ionicons name="notifications-off-outline" size={40} color={COLORS.textTertiary} />
                  <Text style={styles.emptyText}>No notifications</Text>
                </View>
              ) : (
                notifications.map((n) => (
                  <TouchableOpacity
                    key={n.notification_id}
                    testID={`notif-${n.notification_id}`}
                    style={[styles.notifItem, !n.read && styles.notifItemUnread]}
                    onPress={() => handleNotifTap(n)}
                  >
                    <View style={[styles.notifIcon, {
                      backgroundColor: n.type?.includes('emergency') ? COLORS.urgencySoft : COLORS.infoSoft
                    }]}>
                      <Ionicons
                        name={n.type?.includes('emergency') ? 'warning-outline' : 'briefcase-outline'}
                        size={18}
                        color={n.type?.includes('emergency') ? COLORS.urgency : COLORS.info}
                      />
                    </View>
                    <View style={styles.notifContent}>
                      <Text style={styles.notifTitle}>{n.title}</Text>
                      <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                      <Text style={styles.notifTime}>
                        {n.created_at ? new Date(n.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </Text>
                    </View>
                    {!n.read && <View style={styles.unreadDot} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const CATEGORY_ITEM_WIDTH = (SCREEN_WIDTH - 40 - 36) / 4; // padding - gaps

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    gap: 2,
  },
  greeting: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.paper,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.info,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textInverse,
  },

  // Search Bar
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    borderRadius: 30,
    paddingHorizontal: 16,
    height: 50,
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginLeft: 10,
  },
  searchDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
    marginHorizontal: 12,
  },
  filterBtn: {
    padding: 4,
  },

  // Promo Banner
  promoBanner: {
    marginHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#DCEBFC',
    flexDirection: 'row',
    overflow: 'hidden',
    minHeight: 160,
    marginBottom: 24,
  },
  promoContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  promoSaveBadge: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  promoSaveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF8B53',
  },
  promoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A2B4A',
    lineHeight: 24,
    marginBottom: 14,
  },
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FF8B53',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  promoButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
  promoImageContainer: {
    width: '40%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  promoImage: {
    width: 130,
    height: 150,
    borderRadius: 12,
  },

  // Section
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textTertiary,
  },

  // Categories Grid
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryItem: {
    width: CATEGORY_ITEM_WIDTH,
    alignItems: 'center',
    gap: 8,
  },
  categoryIconBox: {
    width: CATEGORY_ITEM_WIDTH,
    height: CATEGORY_ITEM_WIDTH,
    backgroundColor: COLORS.paper,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryName: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Provider Card
  providerCard: {
    backgroundColor: COLORS.paper,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  providerTop: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  providerAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  providerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.subtle,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.paper,
    borderRadius: 8,
  },
  providerInfo: {
    flex: 1,
  },
  providerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
  providerPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.info,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  providerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  viewProfileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  viewProfileText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  bookNowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.info,
  },
  bookNowText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textInverse,
  },

  // Floating Bottom Nav
  floatingNavContainer: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
  },
  floatingNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 64,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  navItem: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navItemActive: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.info,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Notifications modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptyNotifs: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: '#F5F7FA',
  },
  notifItemUnread: {
    backgroundColor: COLORS.infoSoft,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notifContent: {
    flex: 1,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  notifBody: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  notifTime: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textTertiary,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.info,
    marginLeft: 8,
  },
});
