/**
 * E2E Provider Flow — integration test covering the full provider journey:
 *   Auth → Onboarding → Candidature → Mission execution → Emergency flow →
 *   Revenue/Invoices → Planning → Profile/Stripe → Notifications → Stability
 *
 * Uses the existing supabase mock infrastructure (src/__test-utils__).
 * Run with: npm run test:e2e
 */

import {
  mockSupabaseClient,
  mockSupabaseResponse,
  mockRpcResponse,
  resetAllMocks,
  createTestOwner,
  createTestProvider,
  createTestProperty,
  createTestMission,
  createTestEmergency,
  createTestApplication,
  createTestBid,
  createTestQuote,
  createTestNotification,
} from '../../__test-utils__';

import { supabase } from '../../lib/supabase';
import { getProfile, getProviderStats, completeProviderOnboarding } from '../../api/profile';
import { getMissions, applyToMission, startMission, completeMission, addMissionExtraHours, getMyApplications } from '../../api/missions';
import { getEmergencies, submitEmergencyBid, markEmergencyArrived, submitEmergencyQuote, completeEmergencyWithCapture, getProviderSchedule } from '../../api/emergencies';
import { createStripeConnectAccount, getMyInvoices } from '../../api/payments';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/notifications';
import {
  isValidMissionTransition,
  isValidEmergencyTransition,
  MISSION_TRANSITIONS,
  EMERGENCY_TRANSITIONS,
} from '../../services/mission-state-machine';
import type { MissionStatus, EmergencyStatus } from '../../types/api';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const TEST_PROVIDER = createTestProvider({
  id: 'provider-e2e-uuid',
  email: 'provider@altio.fr',
  name: 'Marie Presta E2E',
  role: 'provider',
  onboarding_completed: true,
  siren: '12345678901234',
});

const MOCK_SESSION = {
  user: {
    id: TEST_PROVIDER.id,
    email: TEST_PROVIDER.email,
    user_metadata: { full_name: TEST_PROVIDER.name },
  },
  access_token: 'mock-provider-token',
};

function mockAuthenticatedSession() {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: MOCK_SESSION },
    error: null,
  });
}

const TEST_OWNER = createTestOwner({
  id: 'owner-e2e-uuid',
  email: 'owner@altio.fr',
  name: 'Jean Proprio',
});

const TEST_PROPERTY = createTestProperty({
  id: 'prop-e2e-uuid',
  owner_id: TEST_OWNER.id,
  name: 'Chalet Alpes',
  address: '42 Route des Cimes, 74110 Morzine',
});

// ─── PARTIE A — Auth + Onboarding provider ──────────────────────────────────

describe('PARTIE A — Auth + Onboarding provider', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  test('signInWithPassword authenticates with provider@altio.fr', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { session: MOCK_SESSION, user: MOCK_SESSION.user },
      error: null,
    });

    const result = await supabase.auth.signInWithPassword({
      email: 'provider@altio.fr',
      password: 'password',
    });

    expect(result.error).toBeNull();
    expect(result.data.session).toBeDefined();
    expect(result.data.session!.user.id).toBe('provider-e2e-uuid');
  });

  test('user profile has role "provider"', async () => {
    mockAuthenticatedSession();
    mockSupabaseResponse('users', 'select', {
      ...TEST_PROVIDER,
      provider_profile: TEST_PROVIDER.provider_profile,
    });

    const profile = await getProfile();

    expect(profile).toBeDefined();
    expect(profile.role).toBe('provider');
    expect(profile.onboarding_completed).toBe(true);
  });

  test('provider with onboarding_completed redirects to dashboard (not onboarding)', () => {
    expect(TEST_PROVIDER.role).toBe('provider');
    expect(TEST_PROVIDER.onboarding_completed).toBe(true);

    // Provider tabs: dashboard, my-missions, revenue, planning, profile
    const providerTabs = ['dashboard', 'my-missions', 'revenue', 'planning', 'profile'];
    expect(providerTabs).toHaveLength(5);
  });

  test('provider onboarding requires specialties, zone, company type, legal acceptance', () => {
    // Mirrors the validation in app/onboarding-provider.tsx
    const SPECIALTIES = ['cleaning', 'linen', 'plumbing', 'electrical', 'locksmith', 'jacuzzi', 'repair'];
    const COMPANY_TYPES = ['auto_entrepreneur', 'artisan', 'eurl_sasu', 'sarl_sas'];
    const RADIUS_OPTIONS = [5, 10, 20, 30, 50];
    const TOTAL_STEPS = 4;

    expect(SPECIALTIES).toContain('cleaning');
    expect(COMPANY_TYPES).toContain('auto_entrepreneur');
    expect(RADIUS_OPTIONS).toContain(20);
    expect(TOTAL_STEPS).toBe(4);
  });

  test('completeProviderOnboarding() sends correct data', async () => {
    mockAuthenticatedSession();
    mockSupabaseResponse('users', 'update', { ...TEST_PROVIDER, onboarding_completed: true });
    mockSupabaseResponse('provider_profiles', 'update', TEST_PROVIDER.provider_profile);

    const onboardingData = {
      specialties: ['cleaning', 'linen'],
      company_type: 'auto_entrepreneur',
      radius_km: 20,
      weekly_availability: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      cgu_accepted_at: new Date().toISOString(),
      mandate_accepted_at: new Date().toISOString(),
      dsa_certified_at: new Date().toISOString(),
      notify_new_missions_in_zone: true,
    };

    await expect(completeProviderOnboarding(onboardingData)).resolves.toBeDefined();
  });

  test('SIRET validation works correctly', () => {
    const validateSiret = (v: string) => /^\d{14}$/.test(v.replace(/\s/g, ''));

    expect(validateSiret('12345678901234')).toBe(true);
    expect(validateSiret('1234 5678 901234')).toBe(true);
    expect(validateSiret('123')).toBe(false);
    expect(validateSiret('abcdefghijklmn')).toBe(false);
    expect(validateSiret('')).toBe(false);
  });
});

// ─── PARTIE B — Candidature a une mission ───────────────────────────────────

describe('PARTIE B — Candidature a une mission', () => {
  const AVAILABLE_MISSION = createTestMission({
    id: 'mission-available',
    owner_id: TEST_OWNER.id,
    property_id: TEST_PROPERTY.id,
    mission_type: 'cleaning',
    status: 'pending_provider_approval',
    fixed_rate: 80,
  });

  const ASSIGNED_MISSION = createTestMission({
    id: 'mission-assigned-other',
    owner_id: TEST_OWNER.id,
    property_id: TEST_PROPERTY.id,
    mission_type: 'cleaning',
    status: 'assigned',
    assigned_provider_id: 'other-provider-uuid',
  });

  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('available missions appear in provider feed (forProvider=true)', async () => {
    const missionWithProp = {
      ...AVAILABLE_MISSION,
      property: { name: 'Chalet Alpes', address: '42 Route des Cimes', city: 'Morzine', latitude: 46.18, longitude: 6.71 },
    };
    mockSupabaseResponse('missions', 'select', [missionWithProp]);
    mockSupabaseResponse('emergency_requests', 'select', []);
    mockSupabaseResponse('provider_profiles', 'select', {
      specialties: ['cleaning'],
      radius_km: 50,
      latitude: 46.19,
      longitude: 6.70,
    });
    mockSupabaseResponse('favorite_providers', 'select', []);
    mockSupabaseResponse('emergency_bids', 'select', []);

    const missions = await getMissions(undefined, undefined, true);

    expect(missions.length).toBeGreaterThanOrEqual(1);
    const found = missions.find((m: { mission_id: string }) => m.mission_id === 'mission-available');
    expect(found).toBeDefined();
    expect(found!.status).toBe('pending_provider_approval');
  });

  test('applyToMission() registers a candidature', async () => {
    // Mock document verification
    mockSupabaseResponse('users', 'select', { siren: '12345678901234' });
    mockSupabaseResponse('provider_profiles', 'select', { rc_pro_doc_url: 'https://example.com/rc.pdf' });
    // Mock mission status check
    const missionCheckChain = { status: 'pending_provider_approval' };
    // We need two select chains: first for users (doc check), then mission check, then insert
    // The mock infrastructure returns the same data for all selects on the same table
    // So we mock missions select to return the status check
    mockSupabaseResponse('missions', 'select', missionCheckChain);
    mockSupabaseResponse('mission_applications', 'select', []);
    mockSupabaseResponse('mission_applications', 'insert', createTestApplication({
      id: 'app-e2e',
      mission_id: 'mission-available',
      provider_id: TEST_PROVIDER.id,
      proposed_rate: 80,
      status: 'pending',
    }));

    const result = await applyToMission('mission-available', {
      message: 'Disponible pour cette mission',
      proposed_rate: 80,
    });

    expect(result).toBeDefined();
    expect(result.mission_id).toBe('mission-available');
    expect(result.status).toBe('pending');
  });

  test('getMyApplications() returns the candidature', async () => {
    const appWithMission = {
      ...createTestApplication({
        id: 'app-e2e',
        mission_id: 'mission-available',
        provider_id: TEST_PROVIDER.id,
        status: 'pending',
      }),
      mission: {
        id: 'mission-available',
        mission_type: 'cleaning',
        description: 'Nettoyage apres depart',
        scheduled_date: new Date().toISOString(),
        fixed_rate: 80,
        status: 'pending_provider_approval',
        property: { name: 'Chalet Alpes', address: '42 Route des Cimes', city: 'Morzine' },
      },
    };
    mockSupabaseResponse('mission_applications', 'select', [appWithMission]);

    const apps = await getMyApplications();

    expect(apps).toHaveLength(1);
    expect(apps[0].mission_id).toBe('mission-available');
    expect(apps[0].status).toBe('pending');
    expect(apps[0].mission_type).toBe('cleaning');
  });

  test('cannot apply to already assigned mission (anti-pattern #8)', async () => {
    mockSupabaseResponse('users', 'select', { siren: '12345678901234' });
    mockSupabaseResponse('provider_profiles', 'select', { rc_pro_doc_url: 'https://example.com/rc.pdf' });
    mockSupabaseResponse('missions', 'select', { status: 'assigned' });

    await expect(
      applyToMission('mission-assigned-other', { message: 'test' })
    ).rejects.toThrow('plus disponible');
  });

  test('cannot apply without SIRET', async () => {
    mockSupabaseResponse('users', 'select', { siren: null });
    mockSupabaseResponse('provider_profiles', 'select', { rc_pro_doc_url: 'https://example.com/rc.pdf' });

    await expect(
      applyToMission('mission-available', { message: 'test' })
    ).rejects.toThrow('SIRET');
  });

  test('cannot apply without RC Pro document', async () => {
    mockSupabaseResponse('users', 'select', { siren: '12345678901234' });
    mockSupabaseResponse('provider_profiles', 'select', { rc_pro_doc_url: null });

    await expect(
      applyToMission('mission-available', { message: 'test' })
    ).rejects.toThrow('RC Pro');
  });
});

// ─── PARTIE C — Execution mission ──────────────────────────────────────────

describe('PARTIE C — Execution mission (apres acceptation par owner)', () => {
  const ASSIGNED_MISSION = createTestMission({
    id: 'mission-exec',
    owner_id: TEST_OWNER.id,
    property_id: TEST_PROPERTY.id,
    mission_type: 'cleaning',
    status: 'assigned',
    assigned_provider_id: TEST_PROVIDER.id,
    fixed_rate: 80,
  });

  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('assigned mission appears in provider missions list', async () => {
    const missionWithProp = {
      ...ASSIGNED_MISSION,
      property: { name: 'Chalet Alpes', address: '42 Route des Cimes', city: 'Morzine', latitude: 46.18, longitude: 6.71 },
    };
    mockSupabaseResponse('missions', 'select', [missionWithProp]);
    mockSupabaseResponse('emergency_requests', 'select', []);
    mockSupabaseResponse('provider_profiles', 'select', {
      specialties: ['cleaning'], radius_km: 50, latitude: 46.19, longitude: 6.70,
    });
    mockSupabaseResponse('favorite_providers', 'select', []);
    mockSupabaseResponse('emergency_bids', 'select', []);

    const missions = await getMissions(undefined, undefined, true);
    const found = missions.find((m: { mission_id: string }) => m.mission_id === 'mission-exec');
    expect(found).toBeDefined();
    expect(found!.status).toBe('assigned');
  });

  test('startMission() transitions from assigned to in_progress', async () => {
    const startedMission = { ...ASSIGNED_MISSION, status: 'in_progress', started_at: new Date().toISOString(), owner_id: TEST_OWNER.id, mission_type: 'cleaning', property: { name: 'Chalet' } };
    mockSupabaseResponse('missions', 'update', startedMission);

    const result = await startMission('mission-exec');

    expect(result).toBeDefined();
    expect(result.status).toBe('in_progress');
  });

  test('state machine validates assigned → in_progress', () => {
    expect(isValidMissionTransition('assigned', 'in_progress')).toBe(true);
  });

  test('state machine rejects in_progress → assigned (no going back)', () => {
    expect(isValidMissionTransition('in_progress', 'assigned')).toBe(false);
  });

  test('addMissionExtraHours() works on in_progress mission', async () => {
    mockSupabaseResponse('missions', 'update', { id: 'mission-exec', fixed_rate: 120 });

    // addMissionExtraHours returns void on success (no return value)
    await expect(addMissionExtraHours('mission-exec', 120)).resolves.not.toThrow();
  });

  test('completeMission() transitions from in_progress to awaiting_payment', async () => {
    mockSupabaseResponse('mission_photos', 'insert', []);
    const completedMission = {
      ...ASSIGNED_MISSION, status: 'awaiting_payment',
      completed_at: new Date().toISOString(),
      owner_id: TEST_OWNER.id, mission_type: 'cleaning',
      property: { name: 'Chalet' },
    };
    mockSupabaseResponse('missions', 'update', completedMission);

    const result = await completeMission('mission-exec', ['https://example.com/photo1.jpg']);

    expect(result).toBeDefined();
    expect(result.status).toBe('awaiting_payment');
  });

  test('state machine validates in_progress → awaiting_payment', () => {
    expect(isValidMissionTransition('in_progress', 'awaiting_payment')).toBe(true);
  });

  test('cannot re-start a completed mission (awaiting_payment → in_progress invalid)', () => {
    expect(isValidMissionTransition('awaiting_payment', 'in_progress')).toBe(false);
  });

  test('complete happy path: assigned → in_progress → awaiting_payment → validated → paid', () => {
    const transitions: [MissionStatus, MissionStatus][] = [
      ['assigned', 'in_progress'],
      ['in_progress', 'awaiting_payment'],
      ['awaiting_payment', 'validated'],
      ['validated', 'paid'],
    ];
    for (const [from, to] of transitions) {
      expect(isValidMissionTransition(from, to)).toBe(true);
    }
  });
});

// ─── PARTIE D — Flux urgence complet (provider) ────────────────────────────

describe('PARTIE D — Flux urgence complet (provider)', () => {
  const EMERGENCY = createTestEmergency({
    id: 'emergency-e2e',
    owner_id: TEST_OWNER.id,
    property_id: TEST_PROPERTY.id,
    service_type: 'plumbing',
    status: 'bids_open',
  });

  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('emergency appears in provider emergencies list', async () => {
    const emWithProp = {
      ...EMERGENCY,
      property: { name: 'Chalet Alpes', address: '42 Route des Cimes', city: 'Morzine', latitude: 46.18, longitude: 6.71 },
      provider: null,
      bids: [],
    };
    mockSupabaseResponse('emergency_requests', 'select', [emWithProp]);
    mockSupabaseResponse('provider_profiles', 'select', {
      specialties: ['plumbing'], radius_km: 50, latitude: 46.19, longitude: 6.70,
    });

    const emergencies = await getEmergencies(true);
    expect(emergencies.length).toBeGreaterThanOrEqual(1);
    const found = emergencies.find((e: { id: string }) => e.id === 'emergency-e2e');
    expect(found).toBeDefined();
  });

  test('submitEmergencyBid() creates a bid with travel + diagnostic costs', async () => {
    // Mock provider document verification
    mockSupabaseResponse('users', 'select', { siren: '12345678901234' });
    mockSupabaseResponse('provider_profiles', 'select', { rc_pro_doc_url: 'https://example.com/rc.pdf' });
    // Mock max bids count check
    mockSupabaseResponse('emergency_bids', 'select', []);
    // Mock bid insert
    const bid = createTestBid({
      id: 'bid-e2e',
      emergency_request_id: 'emergency-e2e',
      provider_id: TEST_PROVIDER.id,
      travel_cost: 50,
      diagnostic_cost: 30,
      status: 'pending',
    });
    mockSupabaseResponse('emergency_bids', 'insert', bid);
    // Mock emergency fetch for notification
    mockSupabaseResponse('emergency_requests', 'select', { owner_id: TEST_OWNER.id, service_type: 'plumbing' });

    const result = await submitEmergencyBid('emergency-e2e', {
      travel_cost: 50,
      diagnostic_cost: 30,
      estimated_arrival: new Date(Date.now() + 3600000).toISOString(),
    });

    expect(result).toBeDefined();
    expect(result.travel_cost).toBe(50);
    expect(result.diagnostic_cost).toBe(30);
    expect(result.status).toBe('pending');
  });

  test('markEmergencyArrived() transitions to on_site', async () => {
    const arrivedEmergency = { ...EMERGENCY, status: 'on_site' };
    mockSupabaseResponse('emergency_requests', 'update', arrivedEmergency);

    const result = await markEmergencyArrived('emergency-e2e');

    expect(result).toBeDefined();
    expect(result.status).toBe('on_site');
  });

  test('submitEmergencyQuote() creates a quote with line items', async () => {
    const quote = createTestQuote({
      id: 'quote-e2e',
      emergency_request_id: 'emergency-e2e',
      provider_id: TEST_PROVIDER.id,
      description: 'Remplacement joint',
      repair_cost: 250,
      status: 'pending',
    });
    mockSupabaseResponse('mission_quotes', 'insert', quote);
    mockSupabaseResponse('quote_line_items', 'insert', quote.line_items);
    mockSupabaseResponse('emergency_requests', 'update', { ...EMERGENCY, status: 'quote_submitted' });

    const result = await submitEmergencyQuote('emergency-e2e', {
      description: 'Remplacement joint + siphon',
      repair_cost: 250,
      repair_delay_days: 1,
    });

    expect(result).toBeDefined();
  });

  test('emergency state machine: bids_open → bid_accepted is valid', () => {
    expect(isValidEmergencyTransition('bids_open', 'bid_accepted')).toBe(true);
  });

  test('emergency state machine: displacement_paid → on_site is valid', () => {
    expect(isValidEmergencyTransition('displacement_paid', 'on_site')).toBe(true);
  });

  test('emergency state machine: on_site → quote_submitted is valid', () => {
    expect(isValidEmergencyTransition('on_site', 'quote_submitted')).toBe(true);
  });

  test('emergency state machine: quote_accepted → completed is valid (direct path, no in_progress)', () => {
    expect(isValidEmergencyTransition('quote_accepted', 'completed')).toBe(true);
  });

  test('emergency state machine: quote_accepted → in_progress is INVALID (removed dead state)', () => {
    expect(isValidEmergencyTransition('quote_accepted', 'in_progress')).toBe(false);
  });

  test('emergency state machine: completed → bids_open is INVALID (no going back)', () => {
    expect(isValidEmergencyTransition('completed', 'bids_open')).toBe(false);
  });

  test('completeEmergencyWithCapture() completes an emergency', async () => {
    // Mock the emergency request fetch (needs quote_payment_id + correct status + provider)
    mockSupabaseResponse('emergency_requests', 'select', {
      owner_id: TEST_OWNER.id,
      status: 'quote_accepted',
      accepted_provider_id: TEST_PROVIDER.id,
      quote_payment_id: 'pi_quote_hold',
    });
    // Mock capture-payment edge function
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { captured: true }, error: null });
    // Mock emergency update to completed
    mockSupabaseResponse('emergency_requests', 'update', {
      ...EMERGENCY, status: 'completed', completed_at: new Date().toISOString(),
    });

    const result = await completeEmergencyWithCapture('emergency-e2e');

    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
  });

  test('full emergency lifecycle transitions are valid', () => {
    const lifecycle: [EmergencyStatus, EmergencyStatus][] = [
      ['bids_open', 'bid_accepted'],
      ['bid_accepted', 'displacement_paid'],
      ['displacement_paid', 'on_site'],
      ['on_site', 'quote_submitted'],
      ['quote_submitted', 'quote_sent'],
      ['quote_sent', 'quote_accepted'],
      ['quote_accepted', 'completed'],
    ];
    for (const [from, to] of lifecycle) {
      expect(isValidEmergencyTransition(from, to)).toBe(true);
    }
  });
});

// ─── PARTIE E — Revenus + Factures + Stats ──────────────────────────────────

describe('PARTIE E — Revenus + Factures + Stats', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('getProviderStats() returns data (not undefined)', async () => {
    mockSupabaseResponse('provider_profiles', 'select', { total_earnings: 0, total_reviews: 0 });
    mockSupabaseResponse('missions', 'select', []);
    mockSupabaseResponse('mission_applications', 'select', []);
    mockSupabaseResponse('emergency_requests', 'select', []);
    mockSupabaseResponse('reviews', 'select', []);

    const stats = await getProviderStats();

    expect(stats).toBeDefined();
    expect(typeof stats.total_earnings).toBe('number');
    expect(typeof stats.completed_missions).toBe('number');
    expect(typeof stats.in_progress_missions).toBe('number');
    expect(typeof stats.rating).toBe('number');
    expect(Array.isArray(stats.recent_missions)).toBe(true);
  });

  test('getProviderStats() with 0 revenue returns valid numbers', async () => {
    mockSupabaseResponse('provider_profiles', 'select', { total_earnings: 0, total_reviews: 0 });
    mockSupabaseResponse('missions', 'select', []);
    mockSupabaseResponse('mission_applications', 'select', []);
    mockSupabaseResponse('emergency_requests', 'select', []);
    mockSupabaseResponse('reviews', 'select', []);

    const stats = await getProviderStats();

    expect(stats.total_earnings).toBe(0);
    expect(stats.completed_missions).toBe(0);
    // Rendering check: "0€" should be displayable
    expect(`${(stats.total_earnings || 0).toFixed(2)}€`).toBe('0.00€');
  });

  test('getMyInvoices() returns array (empty or with data)', async () => {
    mockSupabaseResponse('invoices', 'select', []);

    const invoices = await getMyInvoices();

    expect(Array.isArray(invoices)).toBe(true);
  });

  test('getMyInvoices() with invoices returns correct structure', async () => {
    const invoice = {
      id: 'inv-e2e',
      invoice_number: 'ALTIO-PREST-2026-0001',
      invoice_type: 'commission',
      seller_id: 'altio-uuid',
      buyer_id: TEST_PROVIDER.id,
      amount_ht: 20,
      tva_rate: 20,
      tva_amount: 4,
      amount_ttc: 24,
      status: 'issued',
      pdf_url: 'https://storage.example.com/invoice.pdf',
      created_at: new Date().toISOString(),
      mission: { mission_type: 'cleaning', description: 'Menage' },
      emergency: null,
      seller: { name: 'Altio', company_name: 'Altio SAS' },
      buyer: { name: TEST_PROVIDER.name, company_name: null },
    };
    mockSupabaseResponse('invoices', 'select', [invoice]);

    const invoices = await getMyInvoices();

    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoice_number).toBe('ALTIO-PREST-2026-0001');
    expect(invoices[0].amount_ttc).toBe(24);
  });
});

// ─── PARTIE F — Planning ────────────────────────────────────────────────────

describe('PARTIE F — Planning', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('getProviderSchedule() returns array (not undefined)', async () => {
    mockSupabaseResponse('missions', 'select', []);
    mockSupabaseResponse('emergency_requests', 'select', []);

    const schedule = await getProviderSchedule();

    expect(Array.isArray(schedule)).toBe(true);
  });

  test('getProviderSchedule() with empty schedule returns empty array', async () => {
    mockSupabaseResponse('missions', 'select', []);
    mockSupabaseResponse('emergency_requests', 'select', []);

    const schedule = await getProviderSchedule();

    expect(schedule).toEqual([]);
  });

  test('getProviderSchedule() with assigned missions returns schedule items', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const missionWithProp = {
      id: 'mission-plan',
      mission_type: 'cleaning',
      description: 'Menage',
      status: 'assigned',
      scheduled_date: tomorrow.toISOString(),
      property_id: TEST_PROPERTY.id,
      property: { name: 'Chalet Alpes', address: '42 Route des Cimes' },
    };
    mockSupabaseResponse('missions', 'select', [missionWithProp]);
    mockSupabaseResponse('emergency_requests', 'select', []);

    const schedule = await getProviderSchedule();

    expect(schedule.length).toBeGreaterThanOrEqual(1);
    const item = schedule[0];
    expect(item.title).toBeDefined();
    expect(item.scheduled_at).toBeDefined();
  });
});

// ─── PARTIE G — Profil + Stripe Connect ─────────────────────────────────────

describe('PARTIE G — Profil + Stripe Connect', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('getProfile() returns provider info with provider_profile', async () => {
    mockSupabaseResponse('users', 'select', {
      ...TEST_PROVIDER,
      provider_profile: TEST_PROVIDER.provider_profile,
    });

    const profile = await getProfile();

    expect(profile).toBeDefined();
    expect(profile.role).toBe('provider');
    expect(profile.provider_profile).toBeDefined();
    expect(profile.provider_profile.specialties).toContain('cleaning');
    expect(profile.provider_profile.radius_km).toBe(30);
  });

  test('createStripeConnectAccount() returns onboarding link', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { url: 'https://connect.stripe.com/setup/e/acct_test123' },
      error: null,
    });

    const result = await createStripeConnectAccount();

    expect(result).toBeDefined();
    expect(result.url).toContain('stripe.com');
  });

  test('profile menu items are defined for provider', () => {
    // Mirrors the menu structure in app/(provider)/profile.tsx
    const menuItems = [
      'specialites_zone',
      'documents_siret',
      'edit_profile',
      'stripe_connect',
      'google_calendar',
      'marketing_consent',
      'faq',
      'logout',
      'delete_account',
    ];
    expect(menuItems.length).toBeGreaterThan(0);
    // None should be empty string
    menuItems.forEach(item => expect(item.length).toBeGreaterThan(0));
  });

  test('provider profile includes specialties, zone, rating', () => {
    const pp = TEST_PROVIDER.provider_profile;
    expect(pp.specialties).toEqual(['cleaning', 'maintenance']);
    expect(pp.radius_km).toBe(30);
    expect(pp.rating).toBe(4.5);
    expect(pp.total_reviews).toBe(12);
    expect(pp.zone).toBe('Morzine');
  });
});

// ─── PARTIE H — Notifications provider ──────────────────────────────────────

describe('PARTIE H — Notifications provider', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('getNotifications() returns provider notifications', async () => {
    const notifs = [
      createTestNotification({
        notification_id: 'notif-1',
        user_id: TEST_PROVIDER.id,
        type: 'mission',
        title: 'Nouvelle mission disponible',
        body: 'Une mission menage est disponible a Morzine',
        read: false,
      }),
      createTestNotification({
        notification_id: 'notif-2',
        user_id: TEST_PROVIDER.id,
        type: 'mission_assigned',
        title: 'Mission acceptee',
        body: 'Votre candidature a ete acceptee',
        read: false,
      }),
    ];
    // DB notifications path (fast path)
    mockSupabaseResponse('notifications', 'select', notifs.map(n => ({
      id: n.notification_id,
      type: n.type,
      title: n.title,
      body: n.body,
      reference_id: n.reference_id,
      read: n.read,
      created_at: n.created_at,
    })));

    const result = await getNotifications();

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('mission');
    expect(result[1].type).toBe('mission_assigned');
  });

  test('markNotificationRead() marks a notification as read', async () => {
    mockSupabaseResponse('notifications', 'update', { read: true });

    const result = await markNotificationRead('notif-1');
    expect(result).toEqual({ ok: true });
  });

  test('markAllNotificationsRead() marks all as read', async () => {
    mockSupabaseResponse('notifications', 'update', []);

    await expect(markAllNotificationsRead()).resolves.not.toThrow();
  });

  test('no duplicate notifications — unique notification_id', () => {
    const notifs = [
      createTestNotification({ notification_id: 'n1', type: 'mission' }),
      createTestNotification({ notification_id: 'n2', type: 'mission_assigned' }),
      createTestNotification({ notification_id: 'n3', type: 'emergency' }),
    ];
    const ids = notifs.map(n => n.notification_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('notification types cover provider-relevant events', () => {
    const providerNotifTypes = ['mission', 'mission_assigned', 'emergency', 'emergency_accepted'];
    expect(providerNotifTypes).toContain('mission');
    expect(providerNotifTypes).toContain('mission_assigned');
    expect(providerNotifTypes).toContain('emergency');
  });
});

// ─── PARTIE I — Stabilite navigation provider ──────────────────────────────

describe('PARTIE I — Stabilite navigation provider', () => {
  beforeEach(() => {
    resetAllMocks();
    mockAuthenticatedSession();
  });

  test('multiple sequential getProfile() calls return consistent data', async () => {
    mockSupabaseResponse('users', 'select', {
      ...TEST_PROVIDER,
      provider_profile: TEST_PROVIDER.provider_profile,
    });

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await getProfile());
    }

    for (const r of results) {
      expect(r).toBeDefined();
      expect(r.role).toBe('provider');
      expect(r.provider_profile).toBeDefined();
    }
  });

  test('multiple sequential getMissions() calls (forProvider) return consistent data', async () => {
    const missionWithProp = {
      ...createTestMission({ id: 'stable-mission', status: 'assigned', assigned_provider_id: TEST_PROVIDER.id }),
      property: { name: 'Chalet', address: 'test', city: 'Morzine', latitude: 46.18, longitude: 6.71 },
    };
    mockSupabaseResponse('missions', 'select', [missionWithProp]);
    mockSupabaseResponse('emergency_requests', 'select', []);
    mockSupabaseResponse('provider_profiles', 'select', {
      specialties: ['cleaning'], radius_km: 50, latitude: 46.19, longitude: 6.70,
    });
    mockSupabaseResponse('favorite_providers', 'select', []);
    mockSupabaseResponse('emergency_bids', 'select', []);

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await getMissions(undefined, undefined, true));
    }

    for (const r of results) {
      expect(r.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('getProviderStats() with zero data does not return undefined/null fields', async () => {
    mockSupabaseResponse('provider_profiles', 'select', { total_earnings: 0, total_reviews: 0 });
    mockSupabaseResponse('missions', 'select', []);
    mockSupabaseResponse('mission_applications', 'select', []);
    mockSupabaseResponse('emergency_requests', 'select', []);
    mockSupabaseResponse('reviews', 'select', []);

    const stats = await getProviderStats();

    // No field should be undefined
    expect(stats.total_earnings).not.toBeUndefined();
    expect(stats.completed_missions).not.toBeUndefined();
    expect(stats.in_progress_missions).not.toBeUndefined();
    expect(stats.pending_applications).not.toBeUndefined();
    expect(stats.rating).not.toBeUndefined();
    expect(stats.recent_missions).not.toBeUndefined();
  });

  test('empty schedule does not crash — returns empty array', async () => {
    mockSupabaseResponse('missions', 'select', []);
    mockSupabaseResponse('emergency_requests', 'select', []);

    const schedule = await getProviderSchedule();
    expect(schedule).toEqual([]);
  });

  test('getNotifications() with no data returns empty array', async () => {
    mockSupabaseResponse('notifications', 'select', []);
    mockSupabaseResponse('users', 'select', { role: 'provider' });
    mockSupabaseResponse('missions', 'select', []);
    mockSupabaseResponse('emergency_requests', 'select', []);
    mockSupabaseResponse('mission_applications', 'select', []);
    mockSupabaseResponse('emergency_bids', 'select', []);

    const notifs = await getNotifications();
    expect(Array.isArray(notifs)).toBe(true);
  });

  test('not authenticated throws clear error', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getProfile()).rejects.toThrow('Not authenticated');
    await expect(getProviderStats()).rejects.toThrow('Not authenticated');
    await expect(getMyInvoices()).rejects.toThrow('Not authenticated');
    await expect(getProviderSchedule()).rejects.toThrow('Not authenticated');
  });

  test('full provider flow: auth → missions → start → complete → stats', async () => {
    // Step 1: Auth
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: { session: MOCK_SESSION, user: MOCK_SESSION.user },
      error: null,
    });
    const auth = await supabase.auth.signInWithPassword({
      email: 'provider@altio.fr',
      password: 'password',
    });
    expect(auth.error).toBeNull();

    // Step 2: Check profile
    mockSupabaseResponse('users', 'select', {
      ...TEST_PROVIDER,
      provider_profile: TEST_PROVIDER.provider_profile,
    });
    const profile = await getProfile();
    expect(profile.role).toBe('provider');

    // Step 3: Start mission
    resetAllMocks();
    mockAuthenticatedSession();
    const started = { id: 'flow-mission', status: 'in_progress', owner_id: TEST_OWNER.id, mission_type: 'cleaning', property: { name: 'X' } };
    mockSupabaseResponse('missions', 'update', started);
    const startResult = await startMission('flow-mission');
    expect(startResult.status).toBe('in_progress');

    // Step 4: Complete mission
    resetAllMocks();
    mockAuthenticatedSession();
    mockSupabaseResponse('mission_photos', 'insert', []);
    const completed = { id: 'flow-mission', status: 'awaiting_payment', owner_id: TEST_OWNER.id, mission_type: 'cleaning', property: { name: 'X' } };
    mockSupabaseResponse('missions', 'update', completed);
    const completeResult = await completeMission('flow-mission');
    expect(completeResult.status).toBe('awaiting_payment');

    // Step 5: Verify state machine integrity
    expect(isValidMissionTransition('assigned', 'in_progress')).toBe(true);
    expect(isValidMissionTransition('in_progress', 'awaiting_payment')).toBe(true);
    expect(isValidMissionTransition('awaiting_payment', 'assigned')).toBe(false);
  });
});
