import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../src/theme';
import { useAuth } from '../../src/auth';

export default function ProviderTabLayout() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  if (!user || user.role !== 'provider') {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.textPrimary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          position: 'absolute', backgroundColor: COLORS.paper,
          borderTopColor: COLORS.border, borderTopWidth: 1,
          height: 62 + Math.max(insets.bottom, 12),
          paddingBottom: Math.max(insets.bottom, 12), paddingTop: 8,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: width < 350 ? 10 : 11, lineHeight: 16, marginHorizontal: 0, letterSpacing: width < 350 ? -0.2 : 0 },
        tabBarItemStyle: { minWidth: 0 },
        tabBarAllowFontScaling: true,
      }}
    >
      <Tabs.Screen name="dashboard" options={{
        title: 'Accueil',
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />,
      }} />
      <Tabs.Screen name="planning" options={{
        title: 'Planning',
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />,
      }} />
      <Tabs.Screen name="my-missions" options={{
        title: t('alpine.missions'),
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'albums' : 'albums-outline'} size={size} color={color} />,
      }} />
      <Tabs.Screen name="revenue" options={{
        title: 'Revenus',
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={size} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: t('alpine.account'),
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />,
      }} />
      <Tabs.Screen name="invoices" options={{ href: null }} />
    </Tabs>
  );
}
