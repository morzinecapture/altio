import type { MergedMission } from '../types/api';
export type ProviderMissionView = 'discover' | 'applications' | 'active';
export const parseMissionView = (value?: string | string[]): ProviderMissionView => value === 'discover' || value === 'applications' ? value : 'active';
/** These are presentation groups; the backend remains responsible for visibility and transitions. */
export function groupProviderMissions(missions: MergedMission[], providerId: string, appliedIds: Set<string>) {
  const discover: MergedMission[] = [];
  const applications: MergedMission[] = [];
  const active: MergedMission[] = [];
  for (const m of missions) {
    const status = m.raw_status || m.status;
    if (m.is_emergency && m.my_bid_status === 'cancelled') continue;
    if (m.is_emergency && status === 'bids_open') {
      if (m.my_bid_status === 'pending') applications.push(m);
      else if (!m.my_bid_status) discover.push(m);
    } else if (!m.is_emergency && m.status === 'pending') {
      if (!appliedIds.has(m.mission_id) && !m.assigned_provider_id) discover.push(m);
    } else if (m.assigned_provider_id === providerId) {
      active.push(m);
    }
  }
  return { discover, applications, active };
}
export const applicationIsPending = (status?: string) => !!status && ['pending', 'pending_provider_approval'].includes(status);
