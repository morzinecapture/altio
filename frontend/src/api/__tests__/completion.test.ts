jest.mock('../../lib/supabase', () => {
  const { mockSupabaseClient } = require('../../__test-utils__/supabase-mock');
  return { supabase: mockSupabaseClient };
});
jest.mock('../../sentry', () => ({ captureError: jest.fn() }));
import { mockSupabaseClient, resetAllMocks } from '../../__test-utils__';
import { completionAction } from '../completion';
beforeEach(resetAllMocks);
test('owner approval uses dedicated server endpoint, not direct database updates', async () => {
  mockSupabaseClient.functions.invoke.mockResolvedValue({ data: { step: { id: 'step' } }, error: null });
  await completionAction('emergency', 'visit', 'approve');
  expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith('emergency-completion', { body: { emergencyId: 'emergency', phase: 'visit', action: 'approve' } });
  expect(mockSupabaseClient.from).not.toHaveBeenCalled();
});
test('dispute includes its phase and reason', async () => {
  mockSupabaseClient.functions.invoke.mockResolvedValue({ data: { step: { id: 'step', status: 'disputed' } }, error: null });
  await completionAction('emergency', 'repair', 'dispute', { reason: 'Travaux incomplets' });
  expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith('emergency-completion', { body: { emergencyId: 'emergency', phase: 'repair', action: 'dispute', reason: 'Travaux incomplets' } });
});
test('empty server response is not reported as success', async () => {
  mockSupabaseClient.functions.invoke.mockResolvedValue({ data: null, error: null });
  await expect(completionAction('emergency','visit','declare')).rejects.toThrow('confirmée');
});
test('pending Stripe confirmation is preserved for the caller', async () => {
  mockSupabaseClient.functions.invoke.mockResolvedValue({ data: { step: { id: 'step' }, paymentPending: true }, error: null });
  expect((await completionAction('emergency','visit','approve')).paymentPending).toBe(true);
});
