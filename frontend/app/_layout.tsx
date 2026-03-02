import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth';
import { StatusBar } from 'expo-status-bar';
import { usePushNotifications } from '../src/notifications';

import { StripeProvider } from '@stripe/stripe-react-native';

function NotificationsInit() {
  usePushNotifications();
  return null;
}

export default function RootLayout() {
  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'}
      merchantIdentifier="com.montrto.app" // required for Apple Pay
    >
      <AuthProvider>
        <NotificationsInit />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="role-select" />
          <Stack.Screen name="onboarding-owner" />
          <Stack.Screen name="onboarding-provider" />
          <Stack.Screen name="(owner)" />
          <Stack.Screen name="(provider)" />
          <Stack.Screen name="property/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="property/add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="mission/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="emergency" options={{ presentation: 'modal' }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </StripeProvider>
  );
}
