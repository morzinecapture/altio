jest.mock('expo-apple-authentication', () => ({ isAvailableAsync: jest.fn(), signInAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'unique-request-state' }));
import * as Apple from 'expo-apple-authentication';
import { confirmAppleAccountDeletion } from '../account-deletion-apple';
const available = Apple.isAvailableAsync as jest.Mock;
const signIn = Apple.signInAsync as jest.Mock;
beforeEach(() => {
  available.mockReset().mockResolvedValue(true);
  signIn.mockReset().mockResolvedValue({ user: 'subject', state: 'unique-request-state', authorizationCode: 'fresh-code' });
});
test('returns fresh authorization code without requesting personal details', async () => {
  await expect(confirmAppleAccountDeletion('subject')).resolves.toBe('fresh-code');
  expect(signIn).toHaveBeenCalledWith({ requestedScopes: [], state: 'unique-request-state' });
});
test('unsupported device never opens Apple', async () => {
  available.mockResolvedValue(false);
  await expect(confirmAppleAccountDeletion('subject')).rejects.toThrow('indisponible');
  expect(signIn).not.toHaveBeenCalled();
});
test.each([{ user: 'someone-else' }, { state: 'other-request' }, { state: null }])('rejects mismatched response %j', async patch => {
  signIn.mockResolvedValue({ user: 'subject', state: 'unique-request-state', authorizationCode: 'code', ...patch });
  await expect(confirmAppleAccountDeletion('subject')).rejects.toThrow('ne correspond pas');
});
test.each([null, '', '  '])('rejects missing code %j', async authorizationCode => {
  signIn.mockResolvedValue({ user: 'subject', state: 'unique-request-state', authorizationCode });
  await expect(confirmAppleAccountDeletion('subject')).rejects.toThrow('confirmation nécessaire');
});
test('cancellation keeps account and produces a clear message', async () => {
  signIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
  await expect(confirmAppleAccountDeletion('subject')).rejects.toThrow('Suppression annulée');
});
test('native errors do not expose credential details', async () => {
  signIn.mockRejectedValue(new Error('secret credential details'));
  await expect(confirmAppleAccountDeletion('subject')).rejects.toThrow('confirmation Apple a échoué');
});
