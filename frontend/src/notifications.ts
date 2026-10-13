import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import { registerPushToken } from './api/notifications';
import { useAuth } from './auth';
import { captureError } from './sentry';
import { queryClient } from './query-client';
import { notificationKeys } from './hooks/useNotifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const usePushNotifications = () => {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // When a push notification is received while app is open → refresh notification list
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['emergencies'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    });

    // When user taps a push notification → navigate to the relevant screen
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      queryClient.invalidateQueries({ queryKey: ['emergencies'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      const payload = response.notification.request.content.data as Record<string, string> | undefined;
      if (payload?.emergencyId) {
        router.push(`/emergency?id=${payload.emergencyId}`);
      } else if (payload?.missionId) {
        router.push(`/mission/${payload.missionId}`);
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (loading || !userId) return;
    let active = true;
    let registering = false;
    const register = async () => {
      if (!active || registering) return;
      registering = true;
      try {
        await registerForPushAsync(userId, () => active);
      } finally {
        registering = false;
      }
    };
    void register();
    // Retry after a network failure or a permission change in iOS Settings.
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void register();
    });
    const tokenListener = Notifications.addPushTokenListener(() => { void register(); });
    return () => {
      active = false;
      appState.remove();
      tokenListener.remove();
    };
  }, [userId, loading]);
};

export async function registerForPushAsync(userId: string, isCurrent: () => boolean = () => true) {
  try {
    if (!Device.isDevice) return;

    // Expo Go ne supporte plus les push depuis SDK 53 — skip silencieux
    if (Constants.appOwnership === 'expo') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Altio',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) throw new Error('Configuration des notifications manquante');

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (isCurrent()) await registerPushToken(token, Platform.OS, userId);
  } catch (error) {
    if (isCurrent()) captureError(error, { context: 'push-registration' });
  }
}
