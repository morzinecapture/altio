import { ownerMissionAction, isActiveMission } from '../missionPresentation';
import { needsMissionSchedule, ownerMissionFollowUp } from '../ownerMissionFollowUp';
import type { CompletionStep } from '../../api/completion';
const step: CompletionStep = { id: 'step', emergency_id: 'e', phase: 'visit', status: 'processing', declared_at: '', due_at: '', disputed_at: null, paid_at: null, finish_emergency: true };
test('owner approval awaiting settlement never looks like an unconfirmed appointment', () => {
  const mission = { status: 'in_progress', raw_status: 'on_site', is_emergency: true, completion_steps: [step] };
  expect(needsMissionSchedule(mission)).toBe(false);
  expect(ownerMissionFollowUp(mission)).toBe('completionProcessing');
  expect(ownerMissionFollowUp({ ...mission, completion_steps: [{ ...step, status: 'pending' }] })).toBe('ownerCompletionWaiting');
});
test.each(['on_site', 'in_progress', 'completed', 'paid', 'awaiting_payment', 'quote_sent', 'cancelled'])('no scheduling action for %s', status => {
  expect(needsMissionSchedule({ status, is_emergency: true })).toBe(false);
});
test('an assigned undated mission still needs scheduling', () => {
  expect(needsMissionSchedule({ status: 'assigned' })).toBe(true);
  expect(needsMissionSchedule({ status: 'assigned', scheduled_date: '2026-10-10' })).toBe(false);
});

test('validated without Stripe payment stays actionable after a cancelled payment sheet', () => {
  const mission = { status: 'validated', is_emergency: false };
  expect(isActiveMission(mission)).toBe(true);
  expect(ownerMissionAction(mission)).toBe('Régler la mission');
  expect(ownerMissionFollowUp(mission)).toBe('clientPayment');
  expect(needsMissionSchedule(mission)).toBe(false);
});

test('accepted repair with an authorized payment does not demand another payment before completion', () => {
  expect(ownerMissionAction({ status: 'awaiting_payment', raw_status: 'quote_accepted', is_emergency: true })).toBeNull();
});
