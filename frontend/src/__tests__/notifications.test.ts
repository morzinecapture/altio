import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import { useAuth } from '../auth';
import { registerPushToken } from '../api/notifications';
import { captureError } from '../sentry';
import { registerForPushAsync, usePushNotifications } from '../notifications';
const mockEffects: (() => void | (() => void))[] = [];
jest.mock('react', () => ({ useEffect: (fn: () => void) => mockEffects.push(fn), useRef: () => ({ current: null }) }));
jest.mock('../auth', () => ({ useAuth: jest.fn(() => ({ user: { id: 'provider' }, loading: false })) }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) } }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project' } } } } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../api/notifications', () => ({ registerPushToken: jest.fn() }));
jest.mock('../query-client', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../hooks/useNotifications', () => ({ notificationKeys: { all: ['notifications'] } }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(), getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(), addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
const flush = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  mockEffects.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'provider' }, loading: false });
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[test]' });
  (registerPushToken as jest.Mock).mockResolvedValue(undefined);
});
it('enregistre le téléphone pour le compte connecté', async () => {
  await registerForPushAsync('provider');
  expect(registerPushToken).toHaveBeenCalledWith('ExponentPushToken[test]', 'ios', 'provider');
});
it('ne sauvegarde pas le token après un changement de compte', async () => {
  await registerForPushAsync('provider', () => false);
  expect(registerPushToken).not.toHaveBeenCalled();
});
it('respecte le refus de permission', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  await registerForPushAsync('provider');
  expect(registerPushToken).not.toHaveBeenCalled();
});
it('signale les erreurs au lieu de les masquer', async () => {
  (registerPushToken as jest.Mock).mockRejectedValueOnce(new Error('database offline'));
  await registerForPushAsync('provider');
  expect(captureError).toHaveBeenCalledWith(expect.any(Error), { context: 'push-registration' });
});
it('attend la connexion puis réessaie au retour dans l’application', async () => {
  (useAuth as jest.Mock).mockReturnValue({ user: null, loading: true });
  usePushNotifications(); mockEffects[1](); await flush();
  expect(registerPushToken).not.toHaveBeenCalled();
  mockEffects.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'provider' }, loading: false });
  usePushNotifications(); const cleanup = mockEffects[1](); await flush();
  expect(registerPushToken).toHaveBeenCalledTimes(1);
  const onChange = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
  onChange('active'); await flush();
  expect(registerPushToken).toHaveBeenCalledTimes(2);
  if (cleanup) cleanup();
  onChange('active'); await flush();
  expect(registerPushToken).toHaveBeenCalledTimes(2);
});
