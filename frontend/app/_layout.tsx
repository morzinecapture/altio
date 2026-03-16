import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth';
import { StatusBar } from 'expo-status-bar';
import { usePushNotifications } from '../src/notifications';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { ActivityIndicator, View } from 'react-native';

function NotificationsInit() {
  usePushNotifications();
  return null;
}

export default function RootLayout() {
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
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'}
      merchantIdentifier="com.montrto.app"
    >
      <AuthProvider>
        <NotificationsInit />
        <StatusBar style="dark" />
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
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </StripeProvider>
  );
}
