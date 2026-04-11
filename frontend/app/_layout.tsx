import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/query-client';
import { AuthProvider } from '../src/auth';
import { StatusBar } from 'expo-status-bar';
import { usePushNotifications } from '../src/notifications';
import { useRealtimeSync } from '../src/hooks/useRealtimeSync';
import { StripeProvider } from '@stripe/stripe-react-native';
import { initSentry, Sentry } from '../src/sentry';
import ErrorBoundary from '../src/components/ErrorBoundary';
import NetworkGuard from '../src/components/NetworkGuard';

// Init Sentry as early as possible
initSentry();
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { ActivityIndicator, View } from 'react-native';
import { initI18n } from '../src/i18n';

// Initialize i18n once at app startup (loads persisted language preference)
initI18n();

function NotificationsInit() {
  usePushNotifications();
  return null;
}

function RealtimeInit() {
  useRealtimeSync();
  return null;
}

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
      merchantIdentifier="com.altio.app"
    >
      <AuthProvider>
        <NotificationsInit />
        <RealtimeInit />
        <StatusBar style="dark" />
        <ErrorBoundary>
        <NetworkGuard>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="role-select" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="onboarding-owner" />
          <Stack.Screen name="onboarding-provider" />
          <Stack.Screen name="(owner)" options={{ headerShown: false }} />
          <Stack.Screen name="(provider)" />
          <Stack.Screen name="property/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="property/add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="mission/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="emergency" options={{ presentation: 'modal' }} />
          <Stack.Screen name="invoice/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          <Stack.Screen name="auth/login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
          <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
          <Stack.Screen name="auth/set-password" options={{ headerShown: false }} />
          <Stack.Screen name="legal" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        </Stack>
        </NetworkGuard>
        </ErrorBoundary>
      </AuthProvider>
    </StripeProvider>
    </QueryClientProvider>
  );
});
