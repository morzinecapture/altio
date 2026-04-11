import type { MissionStatus, EmergencyStatus } from '../types/api';

// ─── Mission state machine ─────────────────────────────────────────────────
// Each key is a current status, values are the allowed next statuses.
// Any transition NOT listed here is INVALID and must be rejected.

export const MISSION_TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  pending:                   ['pending_provider_approval', 'assigned', 'cancelled', 'expired'],
  pending_provider_approval: ['assigned', 'rejected', 'cancelled', 'expired'],
  assigned:                  ['in_progress', 'cancelled'],
  in_progress:               ['awaiting_payment', 'cancelled'],
  awaiting_payment:          ['validated', 'dispute', 'cancelled'],
  validated:                 ['paid'],
  completed:                 [],
  paid:                      [],
  cancelled:                 [],
  dispute:                   ['validated', 'cancelled'],
  expired:                   ['pending'],
  rejected:                  ['pending'],
  quote_submitted:           ['quote_sent', 'cancelled'],
  quote_sent:                ['quote_accepted', 'quote_refused', 'cancelled'],
  quote_accepted:            ['assigned', 'cancelled'],
  quote_refused:             ['pending', 'cancelled'],
} as const;

export const EMERGENCY_TRANSITIONS: Record<EmergencyStatus, readonly EmergencyStatus[]> = {
  bids_open:         ['bid_accepted', 'provider_accepted', 'displacement_paid', 'cancelled'],
  provider_accepted: ['bid_accepted', 'displacement_paid'],
  bid_accepted:      ['displacement_paid'],
  displacement_paid: ['on_site'],
  on_site:           ['quote_submitted', 'quote_sent', 'completed'],
  quote_submitted:   ['quote_sent'],
  quote_sent:        ['quote_accepted', 'quote_refused'],
  quote_accepted:    ['completed'],
  quote_refused:     ['quote_submitted'],
  in_progress:       ['completed'],
  completed:         [],
  cancelled:         [],
} as const;

/**
 * Returns true if the transition from `current` to `next` is allowed.
 */
export function isValidMissionTransition(
  current: MissionStatus,
  next: MissionStatus,
): boolean {
  const allowed = MISSION_TRANSITIONS[current];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(next);
}

export function isValidEmergencyTransition(
  current: EmergencyStatus,
  next: EmergencyStatus,
): boolean {
  const allowed = EMERGENCY_TRANSITIONS[current];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(next);
}

/**
 * Asserts that the transition is valid, throwing a user-friendly error if not.
 */
export function assertMissionTransition(
  current: MissionStatus,
  next: MissionStatus,
): void {
  if (!isValidMissionTransition(current, next)) {
    throw new Error(
      `Transition invalide : impossible de passer de "${current}" à "${next}".`
    );
  }
}

export function assertEmergencyTransition(
  current: EmergencyStatus,
  next: EmergencyStatus,
): void {
  if (!isValidEmergencyTransition(current, next)) {
    throw new Error(
      `Transition invalide : impossible de passer de "${current}" à "${next}".`
    );
  }
}
