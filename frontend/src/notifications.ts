import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { registerPushToken } from './api';
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
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    registerForPushAsync();

    // When a push notification is received while app is open → refresh notification list
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    });

    // When user taps a push notification → navigate to the relevant screen
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
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
};

async function registerForPushAsync() {
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

    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token, Platform.OS);
  } catch (_) {
    // Silent fail — push registration is non-critical
  }
}
