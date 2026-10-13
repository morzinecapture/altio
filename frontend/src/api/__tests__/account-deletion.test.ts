jest.mock('../../lib/supabase', () => {
  const { mockSupabaseClient } = require('../../__test-utils__/supabase-mock');
  return { supabase: mockSupabaseClient };
});
jest.mock('../../sentry', () => ({ captureError: jest.fn() }));
jest.mock('../../services/account-deletion-apple', () => ({ confirmAppleAccountDeletion: jest.fn() }));
import { mockSupabaseClient, resetAllMocks } from '../../__test-utils__/supabase-mock';
import { confirmAppleAccountDeletion } from '../../services/account-deletion-apple';
import { deleteAccount } from '../profile';
const apple = confirmAppleAccountDeletion as jest.Mock;
const ready = { protocol: 1, ready: true, userId: 'owner', requiresApple: false };
const session = { user: { id: 'owner' }, access_token: 'original-session' };
beforeEach(() => {
  resetAllMocks();
  mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session } });
  mockSupabaseClient.functions.invoke.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  apple.mockReset().mockResolvedValue('one-use-code');
});
function prepare(patch = {}) {
  mockSupabaseClient.functions.invoke.mockResolvedValueOnce({ data: { ...ready, ...patch }, error: null });
}
test.each([null, {}, { success: false }, { status: 'pending' }])('no false success: %j', async data => {
  prepare(); mockSupabaseClient.functions.invoke.mockResolvedValueOnce({ data, error: null });
  await expect(deleteAccount()).rejects.toThrow('n’a pas été confirmée');
});
test('preparation uses a separate endpoint and rejects legacy success without deleting', async () => {
  await expect(deleteAccount()).rejects.toThrow('préparation');
  expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledTimes(1);
  expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith('prepare-account-deletion', expect.anything());
});
test.each([{ ready: false }, { userId: 'other-user' }, { requiresApple: undefined }, { protocol: 2 }])('rejects invalid preparation %j', async patch => {
  prepare(patch); await expect(deleteAccount()).rejects.toThrow('préparation');
  expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledTimes(1);
});
test('surfaces server rejection', async () => {
  prepare(); mockSupabaseClient.functions.invoke.mockResolvedValueOnce({ data: null, error: {
    message: 'non-2xx', context: { json: async () => ({ error: 'Suppression indisponible' }) },
  } });
  await expect(deleteAccount()).rejects.toThrow('Suppression indisponible');
});
test('email account does not prompt Apple and pins deletion to the initiating session', async () => {
  prepare(); await expect(deleteAccount()).resolves.toBe('deleted');
  expect(apple).not.toHaveBeenCalled();
  expect(mockSupabaseClient.functions.invoke).toHaveBeenLastCalledWith('delete-account', {
    body: { action: 'delete', confirmation: 'DELETE_MY_ACCOUNT' }, headers: { Authorization: 'Bearer original-session' },
  });
});
test('Apple code is sent only to deletion after successful confirmation', async () => {
  prepare({ requiresApple: true, appleSubject: 'apple-owner' }); await deleteAccount();
  expect(apple).toHaveBeenCalledWith('apple-owner');
  expect(mockSupabaseClient.functions.invoke).toHaveBeenLastCalledWith('delete-account', expect.objectContaining({
    body: { action: 'delete', confirmation: 'DELETE_MY_ACCOUNT', appleAuthorizationCode: 'one-use-code' },
  }));
});
test('cancelled Apple confirmation never deletes', async () => {
  prepare({ requiresApple: true, appleSubject: 'apple-owner' }); apple.mockRejectedValue(new Error('Annulé'));
  await expect(deleteAccount()).rejects.toThrow('Annulé');
  expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledTimes(1);
});
test('missing Apple identity never prompts or deletes', async () => {
  prepare({ requiresApple: true }); await expect(deleteAccount()).rejects.toThrow('identité Apple');
  expect(apple).not.toHaveBeenCalled(); expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledTimes(1);
});
test('concurrent session change interrupts deletion', async () => {
  prepare(); mockSupabaseClient.auth.getSession.mockResolvedValueOnce({ data: { session } }).mockResolvedValueOnce({ data: { session: { user: { id: 'other' } } } });
  await expect(deleteAccount()).rejects.toThrow('session a changé');
  expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledTimes(1);
});
test('does not call deletion without a session', async () => {
  mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: null } });
  await expect(deleteAccount()).rejects.toThrow('Not authenticated');
  expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled();
});

test('accepted background deletion is distinguished from completed deletion', async () => {
 prepare(); mockSupabaseClient.functions.invoke.mockResolvedValueOnce({data:{success:false,accepted:true,status:'processing',requestId:'request-fixture'},error:null});
 await expect(deleteAccount()).resolves.toBe('processing');
});
test('pending status without explicit acceptance never reports a registered request', async () => {
 prepare(); mockSupabaseClient.functions.invoke.mockResolvedValueOnce({data:{success:false,status:'processing',requestId:'request-fixture'},error:null});
 await expect(deleteAccount()).rejects.toThrow('n’a pas été confirmée');
});
