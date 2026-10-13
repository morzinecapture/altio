import { providerMissionFollowUp, type MissionFollowUpData } from './providerMissionFollowUp';

/** A missing date is not a scheduling action once an intervention has started. */
export function ownerMissionFollowUp(mission: MissionFollowUpData): string | null {
  const followUp = providerMissionFollowUp(mission);
  return followUp === 'completionWaiting' ? 'ownerCompletionWaiting' : followUp;
}

export function needsMissionSchedule(mission: MissionFollowUpData & { scheduled_date?: string | null }) {
  if (mission.scheduled_date || ownerMissionFollowUp(mission)) return false;
  return ['open', 'pending', 'pending_provider_approval', 'bids_open', 'assigned', 'displacement_paid'].includes(mission.raw_status || mission.status);
}
