import { applicationIsPending, groupProviderMissions, parseMissionView } from '../providerMissionViews';
import type { MergedMission } from '../../types/api';
const mission = (id: string, values: Partial<MergedMission> = {}): MergedMission => ({
  id, mission_id: id, owner_id: 'owner', property_id: 'property', mission_type: 'cleaning',
  status: 'pending', is_emergency: false, created_at: '2026-09-23T08:00:00Z', ...values,
});

describe('provider mission navigation', () => {
  it('keeps new opportunities separate from applications and assigned work', () => {
    const groups = groupProviderMissions([
      mission('new'), mission('applied'), mission('rejected'),
      mission('mine', { status: 'assigned', assigned_provider_id: 'me' }),
      mission('invitation', { status: 'pending_provider_approval', assigned_provider_id: 'me' }),
      mission('other', { status: 'assigned', assigned_provider_id: 'other' }),
    ], 'me', new Set(['applied', 'rejected']));
    expect(groups.discover.map(m => m.id)).toEqual(['new']);
    expect(groups.active.map(m => m.id)).toEqual(['mine', 'invitation']);
  });
  it('uses the emergency raw status, keeps pending bids, and hides withdrawn or rejected bids', () => {
    const groups = groupProviderMissions([
      mission('urgent-new', { is_emergency: true, raw_status: 'bids_open' }),
      mission('urgent-bid', { is_emergency: true, raw_status: 'bids_open', my_bid_status: 'pending' }),
      mission('withdrawn', { is_emergency: true, raw_status: 'bids_open', my_bid_status: 'cancelled' }),
      mission('rejected', { is_emergency: true, raw_status: 'bids_open', my_bid_status: 'rejected' }),
      mission('urgent-mine', { is_emergency: true, raw_status: 'quote_sent', status: 'in_progress', assigned_provider_id: 'me' }),
    ], 'me', new Set());
    expect(groups.discover.map(m => m.id)).toEqual(['urgent-new']);
    expect(groups.applications.map(m => m.id)).toEqual(['urgent-bid']);
    expect(groups.active.map(m => m.id)).toEqual(['urgent-mine']);
  });
  it('keeps payment follow-up and history reachable in my missions', () => {
    const items = ['awaiting_payment', 'completed', 'cancelled', 'refunded', 'paid'].map(status => mission(status, { status: status as MergedMission['status'], assigned_provider_id: 'me' }));
    expect(groupProviderMissions(items, 'me', new Set()).active).toHaveLength(5);
  });
  it('routes deep links to known views with a safe default', () => {
    expect(parseMissionView('discover')).toBe('discover');
    expect(parseMissionView('applications')).toBe('applications');
    expect(parseMissionView('unknown')).toBe('active');
    expect(parseMissionView()).toBe('active');
  });
  it('does not show stale candidatures for already assigned or closed missions', () => {
    expect(applicationIsPending('pending')).toBe(true);
    expect(applicationIsPending('pending_provider_approval')).toBe(true);
    for (const status of ['assigned', 'in_progress', 'completed', 'refunded', 'cancelled', undefined]) expect(applicationIsPending(status)).toBe(false);
  });
});
