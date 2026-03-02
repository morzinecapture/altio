import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerPushToken } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const usePushNotifications = () => {
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    registerForPushAsync();

    notificationListener.current = Notifications.addNotificationReceivedListener(n => {
      console.log('[Push] received:', n.request.content.title);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(r => {
      console.log('[Push] tapped:', r.notification.request.content.data);
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
    if (Constants.appOwnership === 'expo') {
      console.log('[Push] Expo Go détecté — push désactivé (utilise un development build)');
      return;
    }

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

    if (!projectId) {
      console.warn('[Push] Aucun projectId EAS — ajoute-le dans app.json extra.eas.projectId');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token, Platform.OS);
    console.log('[Push] Token enregistré:', token);
  } catch (e) {
    console.warn('[Push] Enregistrement échoué:', e);
  }
}
