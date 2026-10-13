import { mockSupabaseClient, mockSupabaseResponse } from '../../__test-utils__/supabase-mock';
import { registerPushToken, sendPushNotification } from '../notifications';
beforeEach(() => {
  mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'provider' } } }, error: null });
});
it('remonte une sauvegarde refusée par le serveur', async () => {
  mockSupabaseResponse('users', 'update', null, { message: 'permission denied' });
  await expect(registerPushToken('ExponentPushToken[test]', 'ios')).rejects.toThrow('permission denied');
});
it('ignore un enregistrement commencé sur un ancien compte', async () => {
  await registerPushToken('ExponentPushToken[test]', 'ios', 'previous-user');
  expect(mockSupabaseClient.from).not.toHaveBeenCalled();
});

it('une notification utilise un seul circuit serveur pour le centre et le téléphone', async () => {
  (mockSupabaseClient.rpc as jest.Mock).mockResolvedValue({ error: null });
  await sendPushNotification('provider', 'Offre acceptée', 'Votre offre a été retenue.', { emergencyId: 'emergency' });
  expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('insert_notification_for_user', expect.objectContaining({ p_user_id: 'provider', p_reference_id: 'emergency' }));
  expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled();
});
it('une notification refusée par le serveur remonte une erreur', async () => {
  (mockSupabaseClient.rpc as jest.Mock).mockResolvedValue({ error: { message: 'Notification non autorisée' } });
  await expect(sendPushNotification('provider', 'Test', 'Test')).rejects.toThrow('Notification non autorisée');
});
