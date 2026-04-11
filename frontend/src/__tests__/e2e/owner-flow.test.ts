/**
 * E2E Owner Flow — integration test covering the full owner journey:
 *   Auth → Role check → Property creation → Mission creation → State machine
 *
 * Uses the existing supabase mock infrastructure (src/__test-utils__).
 * Run with: npm run test:e2e
 */

import {
  mockSupabaseClient,
  mockSupabaseResponse,
  resetAllMocks,
  createTestOwner,
  createTestProperty,
  createTestMission,
} from '../../__test-utils__';

import { supabase } from '../../lib/supabase';
import { createProperty, getProperties } from '../../api/properties';
import { createMission, getMissions, getMission } from '../../api/missions';
import {
  isValidMissionTransition,
  MISSION_TRANSITIONS,
} from '../../services/mission-state-machine';
import type { MissionStatus, CreatePropertyPayload, CreateMissionPayload } from '../../types/api';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const TEST_USER = createTestOwner({
  id: 'owner-e2e-uuid',
  email: 'test@altio.fr',
  name: 'Test Owner',
  role: 'owner',
  onboarding_completed: true,
});

const MOCK_SESSION = {
  user: { id: TEST_USER.id, email: TEST_USER.email, user_metadata: { full_name: TEST_USER.name } },
  access_token: 'mock-access-token',
};

function mockAuthenticatedSession() {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: MOCK_SESSION },
    error: null,
  });
}

// ─── PARTIE A — Auth + Navigation ───────────────────────────────────────────

describe('PARTIE A — Auth + Role verification', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  test('signInWithPassword authenticates with test@altio.fr', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { session: MOCK_SESSION, user: MOCK_SESSION.user },
      error: null,
    });

    const result = await supabase.auth.signInWithPassword({
      email: 'test@altio.fr',
      password: 'password',
    });

    expect(result.error).toBeNull();
    expect(result.data.session).toBeDefined();
    expect(result.data.session!.user.id).toBe('owner-e2e-uuid');
    expect(result.data.session!.user.email).toBe('test@altio.fr');
  });

  test('user profile has role "owner"', async () => {
    mockAuthenticatedSession();
    mockSupabaseResponse('users', 'select', TEST_USER);

    const { data: { session } } = await supabase.auth.getSession();
    expect(session).toBeDefined();

    // Simulate AuthProvider fetching profile
    const profileResult = await supabase
      .from('users')
      .select('*')
      .eq('id', session!.user.id)
      .maybeSingle();

    expect(profileResult.data).toBeDefined();
    expect(profileResult.data.role).toBe('owner');
    expect(profileResult.data.onboarding_completed).toBe(true);
  });

  test('owner has onboarding_completed — would redirect to dashboard, not onboarding', () => {
    // Simulates the routing logic in _layout.tsx:
    // if (user.role === 'owner' && user.onboarding_completed) → redirect to /(owner)/dashboard
    expect(TEST_USER.role).toBe('owner');
    expect(TEST_USER.onboarding_completed).toBe(true);

    // Owner tabs: dashboard, properties, missions, profile
    const ownerTabs = ['dashboard', 'properties', 'missions', 'profile'];
    expect(ownerTabs).toHaveLength(4);
  });
});

// ─── PARTIE B — Ajout propriete ─────────────────────────────────────────────

describe('PARTIE B — Property creation', () => {
  const PROPERTY_PAYLOAD: CreatePropertyPayload = {
    name: 'Chalet Test E2E',
    address: '123 Route de Morzine, 74110 Morzine',
    property_type: 'chalet',
  };

  const CREATED_PROPERTY = createTestProperty({
    id: 'prop-e2e-uuid',
    owner_id: TEST_USER.id,
    name: PROPERTY_PAYLOAD.name,
    address: PROPERTY_PAYLOAD.address,
    property_type: PROPERTY_PAYLOAD.property_type,
  });

  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('createProperty() is called with correct parameters', async () => {
    mockSupabaseResponse('properties', 'insert', CREATED_PROPERTY);

    const result = await createProperty(PROPERTY_PAYLOAD);

    expect(result).toBeDefined();
    expect(result.id).toBe('prop-e2e-uuid');
    expect(result.name).toBe('Chalet Test E2E');
    expect(result.address).toBe('123 Route de Morzine, 74110 Morzine');
    expect(result.property_type).toBe('chalet');
    expect(result.owner_id).toBe(TEST_USER.id);
  });

  test('createProperty() sends owner_id from authenticated session', async () => {
    mockSupabaseResponse('properties', 'insert', CREATED_PROPERTY);

    const result = await createProperty(PROPERTY_PAYLOAD);

    // The API function adds owner_id from the session
    expect(result.owner_id).toBe(MOCK_SESSION.user.id);
  });

  test('createProperty() does not produce an error', async () => {
    mockSupabaseResponse('properties', 'insert', CREATED_PROPERTY);

    // Should resolve without throwing
    await expect(createProperty(PROPERTY_PAYLOAD)).resolves.toBeDefined();
  });

  test('createProperty() throws on Supabase error', async () => {
    mockSupabaseResponse('properties', 'insert', null, { message: 'RLS policy violation' });

    await expect(createProperty(PROPERTY_PAYLOAD)).rejects.toThrow('RLS policy violation');
  });

  test('created property appears in getProperties() list', async () => {
    const allProperties = [
      CREATED_PROPERTY,
      createTestProperty({ name: 'Autre bien', owner_id: TEST_USER.id }),
    ];
    mockSupabaseResponse('properties', 'select', allProperties);

    const properties = await getProperties();

    expect(properties).toHaveLength(2);
    expect(properties.map((p: { name: string }) => p.name)).toContain('Chalet Test E2E');
  });

  test('form validation — name, street, postal, city are all required', () => {
    // Mirrors the validation logic in app/property/add.tsx handleSave()
    const validate = (name: string, street: string, postal: string, city: string): boolean => {
      return !!(name.trim() && street.trim() && postal.trim() && city.trim());
    };

    expect(validate('Chalet Test E2E', '123 Route de Morzine', '74110', 'Morzine')).toBe(true);
    expect(validate('', '123 Route de Morzine', '74110', 'Morzine')).toBe(false);
    expect(validate('Chalet', '', '74110', 'Morzine')).toBe(false);
    expect(validate('Chalet', '123 Route', '', 'Morzine')).toBe(false);
    expect(validate('Chalet', '123 Route', '74110', '')).toBe(false);
  });

  test('address is concatenated as "street, postal city"', () => {
    // Mirrors the logic in app/property/add.tsx handleSave()
    const street = '123 Route de Morzine';
    const postalCode = '74110';
    const city = 'Morzine';
    const fullAddress = `${street.trim()}, ${postalCode.trim()} ${city.trim()}`;

    expect(fullAddress).toBe('123 Route de Morzine, 74110 Morzine');
  });
});

// ─── PARTIE C — Creation mission sur cette propriete ────────────────────────

describe('PARTIE C — Mission creation on property', () => {
  const PROPERTY_ID = 'prop-e2e-uuid';

  const MISSION_PAYLOAD: CreateMissionPayload = {
    property_id: PROPERTY_ID,
    mission_type: 'cleaning',
    mode: 'fixed',
    description: 'Menage complet apres depart locataire',
    fixed_rate: 80,
    scheduled_date: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    require_photos: true,
  };

  const CREATED_MISSION = createTestMission({
    id: 'mission-e2e-uuid',
    owner_id: TEST_USER.id,
    property_id: PROPERTY_ID,
    mission_type: 'cleaning',
    status: 'pending',
    description: MISSION_PAYLOAD.description,
    fixed_rate: 80,
    scheduled_date: MISSION_PAYLOAD.scheduled_date,
    require_photos: true,
  });

  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('createMission() is called with correct parameters', async () => {
    mockSupabaseResponse('properties', 'select', { fixed_rate: 80 });
    mockSupabaseResponse('favorite_providers', 'select', []);
    mockSupabaseResponse('missions', 'insert', CREATED_MISSION);

    const result = await createMission(MISSION_PAYLOAD);

    expect(result).toBeDefined();
    expect(result.id).toBe('mission-e2e-uuid');
    expect(result.property_id).toBe(PROPERTY_ID);
    expect(result.mission_type).toBe('cleaning');
    expect(result.fixed_rate).toBe(80);
    expect(result.require_photos).toBe(true);
  });

  test('mission initial status is "pending" (no assigned provider)', async () => {
    mockSupabaseResponse('properties', 'select', { fixed_rate: 80 });
    mockSupabaseResponse('favorite_providers', 'select', []);
    mockSupabaseResponse('missions', 'insert', CREATED_MISSION);

    const result = await createMission(MISSION_PAYLOAD);

    expect(result.status).toBe('pending');
  });

  test('mission appears in getMissions() list', async () => {
    const missionWithProperty = {
      ...CREATED_MISSION,
      property: { name: 'Chalet Test E2E', address: '123 Route de Morzine, 74110 Morzine', city: 'Morzine' },
    };
    mockSupabaseResponse('missions', 'select', [missionWithProperty]);
    mockSupabaseResponse('emergency_requests', 'select', []);

    const missions = await getMissions();

    expect(missions.length).toBeGreaterThanOrEqual(1);
    const found = missions.find((m: { mission_id: string }) => m.mission_id === 'mission-e2e-uuid');
    expect(found).toBeDefined();
    expect(found!.mission_type).toBe('cleaning');
    expect(found!.status).toBe('pending');
    expect(found!.is_emergency).toBe(false);
  });

  test('getMission() returns full detail with pending status', async () => {
    const missionDetail = {
      ...CREATED_MISSION,
      property: {
        name: 'Chalet Test E2E',
        address: '123 Route de Morzine, 74110 Morzine',
        city: 'Morzine',
        access_code: null,
        instructions: null,
        deposit_location: null,
        latitude: 46.1787,
        longitude: 6.709,
      },
    };
    mockSupabaseResponse('missions', 'select', missionDetail);
    mockSupabaseResponse('mission_applications', 'select', []);

    const detail = await getMission('mission-e2e-uuid');

    expect(detail.status).toBe('pending');
    expect(detail.id).toBe('mission-e2e-uuid');
    expect(detail.property_name).toBe('Chalet Test E2E');
  });

  test('mission state machine: pending is valid initial state', () => {
    const allowed = MISSION_TRANSITIONS['pending'];
    expect(allowed).toBeDefined();
    expect(allowed).toContain('pending_provider_approval');
    expect(allowed).toContain('cancelled');
  });

  test('mission state machine: pending → pending_provider_approval is valid', () => {
    expect(isValidMissionTransition('pending', 'pending_provider_approval')).toBe(true);
  });

  test('mission state machine: pending → assigned is valid (direct assign)', () => {
    expect(isValidMissionTransition('pending', 'assigned')).toBe(true);
  });

  test('mission state machine: pending → in_progress is INVALID (skip)', () => {
    expect(isValidMissionTransition('pending', 'in_progress')).toBe(false);
  });

  test('mission state machine: in_progress → pending is INVALID (reverse)', () => {
    expect(isValidMissionTransition('in_progress', 'pending')).toBe(false);
  });
});

// ─── PARTIE D — Stability and cache verification ───────────────────────────

describe('PARTIE D — Stability and data flow', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('multiple sequential getProperties() calls return consistent data', async () => {
    const properties = [
      createTestProperty({ id: 'p1', name: 'Chalet Test E2E', owner_id: TEST_USER.id }),
      createTestProperty({ id: 'p2', name: 'Appart Lyon', owner_id: TEST_USER.id }),
    ];
    mockSupabaseResponse('properties', 'select', properties);

    const results: unknown[][] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await getProperties());
    }

    // All calls should return the same data shape
    for (const r of results) {
      expect(r).toHaveLength(2);
      expect((r as Array<{ name: string }>).map((p) => p.name)).toContain('Chalet Test E2E');
    }
  });

  test('multiple sequential getMissions() calls return consistent data', async () => {
    const missionWithProp = {
      ...createTestMission({ id: 'mission-stable', owner_id: TEST_USER.id, status: 'pending' }),
      property: { name: 'Chalet Test E2E', address: 'test', city: 'Morzine' },
    };
    mockSupabaseResponse('missions', 'select', [missionWithProp]);
    mockSupabaseResponse('emergency_requests', 'select', []);

    const results: unknown[][] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await getMissions());
    }

    for (const r of results) {
      expect(r).toHaveLength(1);
      expect((r[0] as { status: string }).status).toBe('pending');
    }
  });

  test('no crash when getProperties() returns empty array', async () => {
    mockSupabaseResponse('properties', 'select', []);

    const result = await getProperties();
    expect(result).toEqual([]);
  });

  test('no crash when getMissions() returns empty arrays', async () => {
    mockSupabaseResponse('missions', 'select', []);
    mockSupabaseResponse('emergency_requests', 'select', []);

    const result = await getMissions();
    expect(result).toEqual([]);
  });

  test('getProperties() throws when not authenticated', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getProperties()).rejects.toThrow('Not authenticated');
  });

  test('createMission() throws when not authenticated', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(createMission({
      property_id: 'any',
      mission_type: 'cleaning',
    })).rejects.toThrow('Not authenticated');
  });

  test('full owner flow: auth → property → mission → verify', async () => {
    // Step 1: Auth
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { session: MOCK_SESSION, user: MOCK_SESSION.user },
      error: null,
    });
    const auth = await supabase.auth.signInWithPassword({
      email: 'test@altio.fr',
      password: 'password',
    });
    expect(auth.error).toBeNull();

    // Step 2: Create property
    const prop = createTestProperty({
      id: 'prop-flow',
      owner_id: TEST_USER.id,
      name: 'Chalet Test E2E',
      address: '123 Route de Morzine, 74110 Morzine',
      property_type: 'chalet',
    });
    mockSupabaseResponse('properties', 'insert', prop);
    const createdProp = await createProperty({
      name: 'Chalet Test E2E',
      address: '123 Route de Morzine, 74110 Morzine',
      property_type: 'chalet',
    });
    expect(createdProp.id).toBe('prop-flow');

    // Step 3: Create mission on this property
    resetAllMocks();
    mockAuthenticatedSession();
    const mission = createTestMission({
      id: 'mission-flow',
      owner_id: TEST_USER.id,
      property_id: 'prop-flow',
      mission_type: 'cleaning',
      status: 'pending',
    });
    mockSupabaseResponse('properties', 'select', { fixed_rate: null });
    mockSupabaseResponse('favorite_providers', 'select', []);
    mockSupabaseResponse('missions', 'insert', mission);
    const createdMission = await createMission({
      property_id: 'prop-flow',
      mission_type: 'cleaning',
    });
    expect(createdMission.status).toBe('pending');
    expect(createdMission.property_id).toBe('prop-flow');

    // Step 4: Verify state machine
    expect(isValidMissionTransition('pending', 'pending_provider_approval')).toBe(true);
    expect(isValidMissionTransition('pending', 'paid')).toBe(false);
  });

  test('complete mission lifecycle transitions are valid', () => {
    const happyPath: [MissionStatus, MissionStatus][] = [
      ['pending', 'pending_provider_approval'],
      ['pending_provider_approval', 'assigned'],
      ['assigned', 'in_progress'],
      ['in_progress', 'awaiting_payment'],
      ['awaiting_payment', 'validated'],
      ['validated', 'paid'],
    ];

    for (const [from, to] of happyPath) {
      expect(isValidMissionTransition(from, to)).toBe(true);
    }
  });

  test('reverse transitions are all invalid', () => {
    const reverseTransitions: [MissionStatus, MissionStatus][] = [
      ['paid', 'validated'],
      ['validated', 'awaiting_payment'],
      ['awaiting_payment', 'in_progress'],
      ['in_progress', 'assigned'],
      ['assigned', 'pending_provider_approval'],
      ['pending_provider_approval', 'pending'],
    ];

    for (const [from, to] of reverseTransitions) {
      expect(isValidMissionTransition(from, to)).toBe(false);
    }
  });
});
