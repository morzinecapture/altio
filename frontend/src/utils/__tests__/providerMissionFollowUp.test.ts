import { providerMissionFollowUp } from '../providerMissionFollowUp';
import { ownerMissionAction } from '../missionPresentation';
import type { CompletionStep } from '../../api/completion';

const visit: CompletionStep = {
  id: 'visit', emergency_id: 'repair-1', phase: 'visit', status: 'pending',
  due_at: '2026-10-09T10:00:00Z', declared_at: '2026-10-07T10:00:00Z',
  disputed_at: null, paid_at: null, finish_emergency: true,
};
const mission = { status: 'in_progress', raw_status: 'on_site', is_emergency: true, completion_steps: [visit] };

test('finished first hour waits for the owner, even while the server work status remains on_site', () => {
  expect(providerMissionFollowUp(mission)).toBe('completionWaiting');
  expect(ownerMissionAction(mission)).toBe('Valider la fin d’intervention');
  expect(providerMissionFollowUp({ ...mission, completion_steps: [] })).toBeNull();
});
test.each(['quote_accepted', 'in_progress', 'quote_paid'])('an accepted repair still needs work after a completed visit: %s', raw_status => {
  expect(providerMissionFollowUp({ ...mission, raw_status })).toBeNull();
});
test('declaring the repair complete also removes it from work to do', () => {
  expect(providerMissionFollowUp({ ...mission, raw_status: 'in_progress', completion_steps: [visit, { ...visit, phase: 'repair' }] })).toBe('completionWaiting');
});
test.each([
  ['processing', 'completionProcessing'], ['payment_required', 'completionPaymentRequired'], ['disputed', 'completionDisputed'],
] as const)('preserves exceptional payment states: %s', (status, label) => {
  expect(providerMissionFollowUp({ ...mission, completion_steps: [{ ...visit, status }] })).toBe(label);
});
test('paid is not described as waiting for owner approval', () => {
  const paid = { ...visit, status: 'paid' as const, paid_at: '2026-10-07T11:00:00Z' };
  expect(providerMissionFollowUp({ ...mission, completion_steps: [paid] })).toBe('completionClosing');
  expect(ownerMissionAction({ ...mission, completion_steps: [paid] })).toBeNull();
  expect(providerMissionFollowUp({ ...mission, completion_steps: [{ ...paid, finish_emergency: false }] })).toBeNull();
});
test.each(['completed', 'cancelled', 'refunded', 'expired'])('does not resurrect a terminal mission: %s', raw_status => {
  expect(providerMissionFollowUp({ ...mission, raw_status })).toBeNull();
});
test('quote approval and ordinary payment remain follow-up states', () => {
  expect(providerMissionFollowUp({ ...mission, raw_status: 'quote_sent', completion_steps: [] })).toBe('quoteWaiting');
  expect(providerMissionFollowUp({ status: 'awaiting_payment' })).toBe('clientPayment');
});
