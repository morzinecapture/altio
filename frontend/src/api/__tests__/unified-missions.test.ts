jest.mock('../../lib/supabase', () => {
  const { mockSupabaseClient } = require('../../__test-utils__/supabase-mock');
  return { supabase: mockSupabaseClient };
});
jest.mock('../../sentry', () => ({ captureError: jest.fn() }));
jest.mock('../notifications', () => ({ sendPushNotification: jest.fn().mockResolvedValue(undefined) }));
import { mockSupabaseClient, mockSupabaseResponse, resetAllMocks } from '../../__test-utils__';
import { createMission, getMissions } from '../missions';
import { createEmergency } from '../emergencies';

it('attaches completion evidence without rewriting the emergency work status', async () => {
  mockSupabaseResponse('missions', 'select', []);
  mockSupabaseResponse('emergency_requests', 'select', [{ id: 'repair-1', owner_id: 'owner-1', status: 'on_site', service_type: 'plumbing' }]);
  const step = { id: 'step-1', emergency_id: 'repair-1', phase: 'visit', status: 'pending', finish_emergency: true };
  mockSupabaseResponse('emergency_completion_steps', 'select', [step]);
  expect(await getMissions()).toEqual([expect.objectContaining({ raw_status: 'on_site', completion_steps: [step] })]);
});
it('does not silently present work as active when completion evidence fails to load', async () => {
  mockSupabaseResponse('missions', 'select', []);
  mockSupabaseResponse('emergency_requests', 'select', [{ id: 'repair-1', owner_id: 'owner-1', status: 'on_site' }]);
  mockSupabaseResponse('emergency_completion_steps', 'select', null, { message: 'Completion unavailable' });
  await expect(getMissions()).rejects.toThrow('Completion unavailable');
});

beforeEach(() => {
  resetAllMocks();
  mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner-1' } } }, error: null });
});
function inserted(table: string) {
  const call = mockSupabaseClient.from.mock.calls.findIndex(([name]) => name === table);
  return (mockSupabaseClient.from.mock.results[call].value.insert as jest.Mock).mock.calls[0][0];
}
it('persists cleaning + linen as one mission without silently using the cleaning-only price', async () => {
  mockSupabaseResponse('properties', 'select', { fixed_rate: 70 });
  mockSupabaseResponse('favorite_providers', 'select', [{ provider_id: 'favorite-1' }]);
  mockSupabaseResponse('missions', 'insert', { id: 'combined-1' });
  await createMission({ property_id: 'property-1', mission_type: 'cleaning', services: ['cleaning', 'linen'], linen_service: 'Laver et remettre en place', priority: 'urgent', mode: 'bidding' });
  expect(inserted('missions')).toMatchObject({ services: ['cleaning', 'linen'], mission_type: 'cleaning', priority: 'urgent', fixed_rate: null, favorites_only_until: null, linen_service: 'Laver et remettre en place' });
  expect(mockSupabaseClient.from.mock.calls.filter(([name]) => name === 'missions')).toHaveLength(1);
});
it('preserves an explicit total for all services', async () => {
  mockSupabaseResponse('properties', 'select', { fixed_rate: 70 });
  mockSupabaseResponse('missions', 'insert', { id: 'combined-2' });
  await createMission({ property_id: 'property-1', mission_type: 'linen', services: ['linen', 'cleaning'], fixed_rate: 115, mode: 'fixed' });
  expect(inserted('missions')).toMatchObject({ mission_type: 'cleaning', fixed_rate: 115, services: ['linen', 'cleaning'] });
});
it('rejects incompatible trades before creating a mission', async () => {
  await expect(createMission({ property_id: 'p', mission_type: 'cleaning', services: ['cleaning', 'plumbing'] })).rejects.toThrow('distincte');
  expect(mockSupabaseClient.from).not.toHaveBeenCalled();
});
it('retains the requested repair date and does not invent a scheduled slot for urgent jobs', async () => {
  mockSupabaseResponse('missions', 'select', []);
  mockSupabaseResponse('emergency_requests', 'select', [
    { id: 'planned', service_type: 'plumbing', status: 'bids_open', created_at: '2026-10-01', scheduled_date: '2026-10-10T14:00:00Z' },
    { id: 'urgent', service_type: 'locksmith', status: 'bids_open', created_at: '2026-10-02' },
    { id: 'expired', service_type: 'electrical', status: 'expired', created_at: '2026-10-01' },
  ]);
  mockSupabaseResponse('emergency_bids', 'select', [{ emergency_request_id: 'planned' }]);
  const result = await getMissions();
  expect(result.find(m => m.mission_id === 'planned')).toMatchObject({ priority: 'normal', scheduled_date: '2026-10-10T14:00:00Z', bids_count: 1 });
  expect(result.find(m => m.mission_id === 'urgent')).toMatchObject({ priority: 'urgent', scheduled_date: null, bids_count: 0 });
  expect(result.find(m => m.mission_id === 'expired')?.status).toBe('expired');
});
it('finds combined jobs when filtering for linen', async () => {
  mockSupabaseResponse('missions', 'select', [{ id: 'combined', mission_type: 'cleaning', services: ['cleaning', 'linen'], status: 'pending' }]);
  mockSupabaseResponse('emergency_requests', 'select', []);
  expect(await getMissions(undefined, 'linen')).toHaveLength(1);
});
it('does not silently hide repair failures behind an empty list', async () => {
  mockSupabaseResponse('missions', 'select', []);
  mockSupabaseResponse('emergency_requests', 'select', null, { message: 'Repair query failed' });
  await expect(getMissions()).rejects.toThrow('Repair query failed');
});
it('creates a planned plumbing request in the existing quote workflow', async () => {
  mockSupabaseResponse('emergency_requests', 'insert', { id: 'repair-1', service_type: 'plumbing' });
  await createEmergency({ property_id: 'property-1', service_type: 'plumbing', priority: 'normal', scheduled_date: '2026-10-10T14:00:00Z', description: 'Remplacer le robinet' });
  expect(inserted('emergency_requests')).toMatchObject({ priority: 'normal', scheduled_date: '2026-10-10T14:00:00Z', status: 'bids_open' });
});
it('only shows a combined mission to a provider covering both requested services', async () => {
  mockSupabaseResponse('missions', 'select', [{ id: 'combined', mission_type: 'cleaning', services: ['cleaning', 'linen'], status: 'pending' }]);
  mockSupabaseResponse('emergency_requests', 'select', []);
  mockSupabaseResponse('provider_profiles', 'select', { specialties: ['cleaning'] });
  expect(await getMissions(undefined, undefined, true)).toHaveLength(0);
  mockSupabaseResponse('provider_profiles', 'select', { specialties: ['cleaning', 'linen'] });
  expect(await getMissions(undefined, undefined, true)).toHaveLength(1);
});
it('saves the accepted proposal as the mission price', async () => {
  const { handleApplication } = await import('../missions');
  mockSupabaseResponse('mission_applications', 'update', { id: 'application-1', provider_id: 'provider-1', proposed_rate: 115 });
  mockSupabaseResponse('missions', 'select', { mission_type: 'cleaning', property: { name: 'Chalet' } });
  mockSupabaseResponse('missions', 'update', { id: 'mission-1' });
  await handleApplication('mission-1', 'application-1', 'accept');
  const writes = mockSupabaseClient.from.mock.results.map(result => result.value.update).filter(fn => fn.mock.calls.length);
  expect(writes.some(fn => fn.mock.calls.some(([payload]: [{ fixed_rate?: number }]) => payload.fixed_rate === 115))).toBe(true);
});
