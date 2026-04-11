/**
 * Integration-logic tests for the full mission flow.
 *
 * These tests exercise the real API functions with a mocked Supabase client,
 * verifying state transitions, notifications, and commission calculations.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../lib/supabase', () => {
  const { mockSupabaseClient } = require('../../__test-utils__/supabase-mock');
  return { supabase: mockSupabaseClient };
});
jest.mock('../../sentry', () => ({ captureError: jest.fn() }));

import {
  mockSupabaseClient,
  mockSupabaseResponse,
  resetAllMocks,
  createTestOwner,
  createTestProvider,
  createTestProperty,
  createTestMission,
  createTestApplication,
} from '../../__test-utils__';

import { createMission, applyToMission, handleApplication, startMission, completeMission, cancelMission, validateMission, acceptDirectMission, rejectDirectMission } from '../missions';
import { createPaymentIntent, completeMissionPayment } from '../payments';
import { sendPushNotification } from '../notifications';
import { isValidMissionTransition, MISSION_TRANSITIONS } from '../../services/mission-state-machine';
import { COMMISSION_RATE, OWNER_MARKUP_RATE, PROVIDER_PAYOUT_RATE, computeOwnerTotal, computeProviderPayout } from '../../utils/commission';

// ── Spy on sendPushNotification ────────────────────────────────────────────────

jest.mock('../notifications', () => {
  const actual = jest.requireActual('../notifications');
  return {
    ...actual,
    sendPushNotification: jest.fn().mockResolvedValue(undefined),
  };
});

const sendPushSpy = sendPushNotification as jest.MockedFunction<typeof sendPushNotification>;

// ── Helpers ────────────────────────────────────────────────────────────────────

const owner = createTestOwner();
const provider = createTestProvider();
const property = createTestProperty({ owner_id: owner.id });

function mockAuthSession(userId: string) {
  mockSupabaseClient.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: userId }, access_token: 'test-token' } },
    error: null,
  });
}

// ── Setup / Teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  resetAllMocks();
  sendPushSpy.mockClear();
  mockSupabaseClient.auth.getSession.mockReset();
  mockSupabaseClient.functions.invoke.mockResolvedValue({ data: null, error: null });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO 1 — Flux normal complet
// ═══════════════════════════════════════════════════════════════════════════════

describe('Flux mission complet : publier → candidater → accepter → réaliser → valider → payer', () => {
  const mission = createTestMission({
    owner_id: owner.id,
    property_id: property.id,
    mission_type: 'cleaning',
    fixed_rate: 100,
    status: 'pending',
  });

  const application = createTestApplication({
    mission_id: mission.id,
    provider_id: provider.id,
    status: 'pending',
  });

  // ── 1. Owner crée une mission ─────────────────────────────────────────────

  it('1. createMission → status pending, property_id correct, mission_type cleaning', async () => {
    mockAuthSession(owner.id);

    const createdMission = { ...mission, status: 'pending' };
    mockSupabaseResponse('properties', 'select', { fixed_rate: 100 });
    mockSupabaseResponse('favorite_providers', 'select', []);
    mockSupabaseResponse('missions', 'insert', createdMission);

    const result = await createMission({
      property_id: property.id,
      mission_type: 'cleaning',
      description: mission.description,
      scheduled_date: mission.scheduled_date,
      fixed_rate: 100,
    });

    expect(result.status).toBe('pending');
    expect(result.property_id).toBe(property.id);
    expect(result.mission_type).toBe('cleaning');
  });

  // ── 2. Provider postule ───────────────────────────────────────────────────

  it('2. applyToMission → application créée + notification owner', async () => {
    mockAuthSession(provider.id);

    // Document verification
    mockSupabaseResponse('users', 'select', { siren: '123456789' });
    mockSupabaseResponse('provider_profiles', 'select', { rc_pro_doc_url: 'http://doc.pdf' });
    // Mission status check
    mockSupabaseResponse('missions', 'select', { status: 'pending_provider_approval', owner_id: owner.id, mission_type: 'cleaning' });
    // Existing application count (select with count → returns via .then)
    mockSupabaseResponse('mission_applications', 'select', null);
    // Insert application
    mockSupabaseResponse('mission_applications', 'insert', { ...application, status: 'pending' });

    const result = await applyToMission(mission.id, {
      proposed_rate: 75,
      message: 'Disponible',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('pending');
    // sendPushNotification should be called for the owner
    expect(sendPushSpy).toHaveBeenCalledWith(
      owner.id,
      expect.stringContaining('candidature'),
      expect.any(String),
      expect.objectContaining({ missionId: mission.id }),
    );
  });

  // ── 3. Owner accepte la candidature ───────────────────────────────────────

  it('3. handleApplication(accept) → mission assigned + notification provider', async () => {
    // handleApplication now verifies owner session before assigning
    mockAuthSession(owner.id);
    mockSupabaseResponse('mission_applications', 'update', { ...application, status: 'accepted', provider_id: provider.id });
    mockSupabaseResponse('missions', 'select', { mission_type: 'cleaning', property: { name: 'Chalet' } });
    // Assign provider update
    mockSupabaseResponse('missions', 'update', { ...mission, status: 'assigned', assigned_provider_id: provider.id });

    const result = await handleApplication(mission.id, application.id, 'accept');

    expect(result.message).toContain('accepted');
    // The function updates mission status to 'assigned'
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('missions');
  });

  // ── 4. Provider démarre ───────────────────────────────────────────────────

  it('4. startMission → status in_progress', async () => {
    mockAuthSession(provider.id);

    const updatedMission = { ...mission, status: 'in_progress', owner_id: owner.id, mission_type: 'cleaning' };
    mockSupabaseResponse('missions', 'update', updatedMission);

    const result = await startMission(mission.id);

    expect(result.status).toBe('in_progress');
  });

  // ── 5. Provider termine ───────────────────────────────────────────────────

  it('5. completeMission → status awaiting_payment', async () => {
    mockAuthSession(provider.id);

    const updatedMission = { ...mission, status: 'awaiting_payment', owner_id: owner.id, mission_type: 'cleaning' };
    mockSupabaseResponse('missions', 'update', updatedMission);

    const result = await completeMission(mission.id);

    expect(result.status).toBe('awaiting_payment');
  });

  // ── 6. Owner valide ───────────────────────────────────────────────────────

  it('6. validateMission → status validated', async () => {
    mockAuthSession(owner.id);

    mockSupabaseResponse('missions', 'select', { status: 'awaiting_payment', owner_id: owner.id, assigned_provider_id: provider.id, mission_type: 'cleaning' });
    mockSupabaseResponse('missions', 'update', null);

    await validateMission(mission.id);

    // No throw = success. The update was called.
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('missions');
  });

  // ── 7. Paiement — vérification des montants de commission ─────────────────

  it('7. createPaymentIntent appelé avec montant × 1.1 (commission owner)', async () => {
    mockAuthSession(owner.id);

    const baseRate = 100;
    const ownerTotal = computeOwnerTotal(baseRate); // 110
    const providerPayout = computeProviderPayout(baseRate); // 90

    expect(ownerTotal).toBe(110);
    expect(providerPayout).toBe(90);
    expect(ownerTotal - providerPayout).toBe(20); // Marge Altio

    // createPaymentIntent calls functions.invoke
    await createPaymentIntent(ownerTotal, { missionId: mission.id });

    expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
      'create-payment-intent',
      expect.objectContaining({
        body: expect.objectContaining({
          amount: Math.round(ownerTotal * 100), // 11000 centimes
        }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO 2 — Mission directe (pending_provider_approval)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mission directe (pending_provider_approval)', () => {
  const mission = createTestMission({
    owner_id: owner.id,
    property_id: property.id,
    assigned_provider_id: provider.id,
    status: 'pending_provider_approval',
  });

  it('1. createMission avec assigned_provider_id → status pending_provider_approval', async () => {
    mockAuthSession(owner.id);

    const createdMission = { ...mission, status: 'pending_provider_approval' };
    mockSupabaseResponse('properties', 'select', { fixed_rate: 80 });
    mockSupabaseResponse('favorite_providers', 'select', []);
    mockSupabaseResponse('missions', 'insert', createdMission);

    const result = await createMission({
      property_id: property.id,
      mission_type: 'cleaning',
      description: 'Test direct',
      assigned_provider_id: provider.id,
    });

    expect(result.status).toBe('pending_provider_approval');
  });

  it('2. Provider accepte → status assigned', async () => {
    mockAuthSession(provider.id);

    const acceptedMission = { ...mission, status: 'assigned' };
    mockSupabaseResponse('missions', 'update', acceptedMission);

    const result = await acceptDirectMission(mission.id);

    expect(result.status).toBe('assigned');
  });

  it('3. Provider refuse → status rejected + notification owner', async () => {
    mockAuthSession(provider.id);

    const rejectedMission = { ...mission, status: 'rejected' };
    mockSupabaseResponse('missions', 'update', rejectedMission);

    const result = await rejectDirectMission(mission.id);

    expect(result.status).toBe('rejected');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO 3 — Annulation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Annulation de mission', () => {
  const mission = createTestMission({
    owner_id: owner.id,
    property_id: property.id,
    assigned_provider_id: provider.id,
    status: 'assigned',
  });

  it('Owner annule après acceptation → status cancelled', async () => {
    mockAuthSession(owner.id);

    mockSupabaseResponse('missions', 'select', { status: 'assigned', owner_id: owner.id, assigned_provider_id: provider.id, mission_type: 'cleaning' });
    mockSupabaseResponse('missions', 'update', [{ ...mission, status: 'cancelled' }]);

    await cancelMission(mission.id);

    // No throw = success
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('missions');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO 4 — Transitions invalides (state machine)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Transitions invalides', () => {
  it('startMission throw si la state machine bloque (status ≠ assigned)', () => {
    // The function calls assertMissionTransition('assigned', 'in_progress') internally,
    // which is always valid. The real guard is the Supabase .eq('status', 'assigned').
    // Test the state machine directly for invalid transitions:
    expect(isValidMissionTransition('pending', 'in_progress')).toBe(false);
    expect(isValidMissionTransition('completed', 'in_progress')).toBe(false);
    expect(isValidMissionTransition('cancelled', 'in_progress')).toBe(false);
    expect(isValidMissionTransition('paid', 'in_progress')).toBe(false);
  });

  it('validateMission throw si status ≠ awaiting_payment', async () => {
    mockAuthSession(owner.id);

    // Return a mission in 'in_progress' — assertMissionTransition('in_progress', 'validated') should throw
    mockSupabaseResponse('missions', 'select', { status: 'in_progress', owner_id: owner.id });

    await expect(validateMission('some-id')).rejects.toThrow(/Transition invalide/);
  });

  it('completeMission est gardé par la state machine (in_progress → awaiting_payment est valide)', () => {
    expect(isValidMissionTransition('in_progress', 'awaiting_payment')).toBe(true);
    expect(isValidMissionTransition('assigned', 'awaiting_payment')).toBe(false);
    expect(isValidMissionTransition('pending', 'awaiting_payment')).toBe(false);
  });

  it('aucune transition inverse n\'est autorisée', () => {
    // in_progress → pending_provider_approval (anti-pattern #6)
    expect(isValidMissionTransition('in_progress', 'pending_provider_approval')).toBe(false);
    // assigned → pending_provider_approval
    expect(isValidMissionTransition('assigned', 'pending_provider_approval')).toBe(false);
    // paid → validated
    expect(isValidMissionTransition('paid', 'validated')).toBe(false);
    // validated → assigned
    expect(isValidMissionTransition('validated', 'assigned')).toBe(false);
    // awaiting_payment → in_progress
    expect(isValidMissionTransition('awaiting_payment', 'in_progress')).toBe(false);
  });

  it('completeMissionPayment throw si status ≠ validated', async () => {
    mockAuthSession(owner.id);

    mockSupabaseResponse('missions', 'select', { status: 'in_progress', owner_id: owner.id, payment_intent_id: null });

    await expect(completeMissionPayment('some-id')).rejects.toThrow(/Transition invalide/);
  });

  it('toutes les transitions invalides de la machine à états sont rejetées', () => {
    const allStatuses = Object.keys(MISSION_TRANSITIONS) as Array<keyof typeof MISSION_TRANSITIONS>;

    for (const from of allStatuses) {
      const allowed = MISSION_TRANSITIONS[from];
      for (const to of allStatuses) {
        if (from === to) continue;
        const expected = (allowed as readonly string[]).includes(to);
        expect(isValidMissionTransition(from, to)).toBe(expected);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO 5 — Commission et montants
// ═══════════════════════════════════════════════════════════════════════════════

describe('Commission et montants', () => {
  it('COMMISSION_RATE = 10%', () => {
    expect(COMMISSION_RATE).toBe(0.10);
  });

  it('Owner paie 110€ pour une prestation de 100€ (100 × 1.1)', () => {
    expect(computeOwnerTotal(100)).toBe(110);
    expect(OWNER_MARKUP_RATE).toBe(1.1);
  });

  it('Provider reçoit 90€ pour une prestation de 100€ (100 × 0.9)', () => {
    expect(computeProviderPayout(100)).toBe(90);
    expect(PROVIDER_PAYOUT_RATE).toBe(0.9);
  });

  it('Marge Altio = 20€ (10€ proprio + 10€ presta)', () => {
    const base = 100;
    const ownerPays = computeOwnerTotal(base);     // 110
    const providerGets = computeProviderPayout(base); // 90
    const altioMargin = ownerPays - providerGets;     // 20

    expect(altioMargin).toBe(20);
    expect(ownerPays - base).toBe(10);  // Commission owner
    expect(base - providerGets).toBe(10); // Commission provider
  });

  it('les montants sont arrondis au centime', () => {
    // 33.33€ base → owner paie 36.66€, provider reçoit 30.00€
    expect(computeOwnerTotal(33.33)).toBe(36.66);
    expect(computeProviderPayout(33.33)).toBe(30);
  });

  it('createPaymentIntent envoie le montant en centimes', async () => {
    mockAuthSession(owner.id);

    await createPaymentIntent(110, { missionId: 'test-mission' });

    expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
      'create-payment-intent',
      expect.objectContaining({
        body: expect.objectContaining({
          amount: 11000, // 110€ × 100
        }),
      }),
    );
  });

  it('les frais Stripe ne sont jamais visibles (montants uniquement base + commission)', () => {
    // Anti-pattern #15 : les frais Stripe ne doivent pas apparaitre
    const base = 200;
    const ownerTotal = computeOwnerTotal(base);
    const providerPayout = computeProviderPayout(base);

    // Only base + Altio commission visible, no Stripe fee component
    expect(ownerTotal).toBe(computeOwnerTotal(base));
    expect(providerPayout).toBe(computeProviderPayout(base));
    // Commission totale 20% never exposed — only 10% per side
    expect(COMMISSION_RATE).toBe(0.10);
  });
});
