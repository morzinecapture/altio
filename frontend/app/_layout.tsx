import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="role-select" />
        <Stack.Screen name="(owner)" />
        <Stack.Screen name="(provider)" />
        <Stack.Screen name="property/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="property/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="mission/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="emergency" options={{ presentation: 'modal' }} />
      </Stack>
    </AuthProvider>
  );
}
