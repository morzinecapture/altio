/**
 * Factory functions for creating realistic test objects.
 *
 * Every factory accepts an optional `overrides` parameter to customise any field.
 * IDs use crypto.randomUUID(), dates are relative to Date.now().
 */

import type {
  MissionStatus,
  EmergencyStatus,
  ApplicationStatus,
  BidStatus,
  QuoteStatus,
} from '../types/api';

// ─── Helpers ────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function isoNow(): string {
  return new Date().toISOString();
}

function isoFuture(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ─── Owner ──────────────────────────────────────────────────────────────────

export function createTestOwner(overrides?: Record<string, unknown>) {
  return {
    id: uuid(),
    email: 'maximegakiere@gmail.com',
    name: 'Maxime Test',
    role: 'owner' as const,
    is_admin: false,
    onboarding_completed: true,
    created_at: isoNow(),
    updated_at: isoNow(),
    ...overrides,
  };
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function createTestProvider(overrides?: Record<string, unknown>) {
  const providerId = (overrides?.id as string) ?? uuid();
  return {
    id: providerId,
    email: 'provider@test.com',
    name: 'Marie Presta',
    role: 'provider' as const,
    is_admin: false,
    onboarding_completed: true,
    created_at: isoNow(),
    updated_at: isoNow(),
    provider_profile: {
      provider_id: providerId,
      specialties: ['cleaning', 'maintenance'],
      radius_km: 30,
      available: true,
      latitude: 46.1914,
      longitude: 6.7046,
      rating: 4.5,
      total_reviews: 12,
      total_earnings: 3200,
      bio: 'Prestataire expérimentée en Haute-Savoie',
      zone: 'Morzine',
      location_label: 'Morzine, Haute-Savoie',
    },
    ...overrides,
  };
}

// ─── Property ───────────────────────────────────────────────────────────────

export function createTestProperty(overrides?: Record<string, unknown>) {
  return {
    id: uuid(),
    owner_id: uuid(),
    name: 'Chalet Test Morzine',
    address: '123 Route des Alpes, 74110 Morzine',
    type: 'chalet',
    property_type: 'seasonal_rental',
    latitude: 46.1787,
    longitude: 6.7090,
    photos: [],
    created_at: isoNow(),
    updated_at: isoNow(),
    ...overrides,
  };
}

// ─── Reservation ────────────────────────────────────────────────────────────

export function createTestReservation(overrides?: Record<string, unknown>) {
  return {
    id: uuid(),
    property_id: uuid(),
    guest_name: 'Martin Dupont',
    check_in: isoFuture(3),
    check_out: isoFuture(10),
    source: 'airbnb',
    created_at: isoNow(),
    ...overrides,
  };
}

// ─── Mission ────────────────────────────────────────────────────────────────

export function createTestMission(overrides?: Record<string, unknown>) {
  return {
    id: uuid(),
    owner_id: uuid(),
    property_id: uuid(),
    mission_type: 'cleaning',
    status: 'pending' as MissionStatus,
    description: 'Ménage complet après départ locataire',
    scheduled_date: isoFuture(5),
    fixed_rate: 80,
    assigned_provider_id: null,
    require_photos: false,
    created_at: isoNow(),
    updated_at: isoNow(),
    ...overrides,
  };
}

// ─── Emergency ──────────────────────────────────────────────────────────────

export function createTestEmergency(overrides?: Record<string, unknown>) {
  return {
    id: uuid(),
    owner_id: uuid(),
    property_id: uuid(),
    service_type: 'plumbing',
    status: 'bids_open' as EmergencyStatus,
    description: 'Fuite d\'eau importante sous l\'évier',
    accepted_provider_id: null,
    displacement_fee: null,
    diagnostic_fee: null,
    repair_cost: null,
    photos: [],
    target_provider_id: null,
    created_at: isoNow(),
    updated_at: isoNow(),
    ...overrides,
  };
}

// ─── Mission Application ────────────────────────────────────────────────────

export function createTestApplication(overrides?: Record<string, unknown>) {
  return {
    id: uuid(),
    mission_id: uuid(),
    provider_id: uuid(),
    proposed_rate: 75,
    message: 'Disponible pour cette mission',
    status: 'pending' as ApplicationStatus,
    created_at: isoNow(),
    ...overrides,
  };
}

// ─── Emergency Bid ──────────────────────────────────────────────────────────

export function createTestBid(overrides?: Record<string, unknown>) {
  return {
    id: uuid(),
    emergency_request_id: uuid(),
    provider_id: uuid(),
    travel_cost: 50,
    diagnostic_cost: 30,
    estimated_arrival: isoFuture(0), // today
    status: 'pending' as BidStatus,
    created_at: isoNow(),
    ...overrides,
  };
}

// ─── Quote ──────────────────────────────────────────────────────────────────

export function createTestQuote(overrides?: Record<string, unknown>) {
  return {
    id: uuid(),
    emergency_request_id: uuid(),
    provider_id: uuid(),
    description: 'Remplacement joint + siphon',
    repair_cost: 350,
    repair_delay_days: 1,
    status: 'pending' as QuoteStatus,
    line_items: [
      {
        id: uuid(),
        quote_id: '',
        description: 'Joint étanchéité',
        quantity: 2,
        unit_price: 15,
        sort_order: 0,
      },
      {
        id: uuid(),
        quote_id: '',
        description: 'Main d\'œuvre — remplacement siphon',
        quantity: 1,
        unit_price: 320,
        sort_order: 1,
      },
    ],
    created_at: isoNow(),
    ...overrides,
  };
}

// ─── Notification ───────────────────────────────────────────────────────────

export function createTestNotification(overrides?: Record<string, unknown>) {
  return {
    notification_id: uuid(),
    user_id: uuid(),
    type: 'mission_status_changed',
    title: 'Nouvelle mission disponible',
    body: 'Une mission de ménage est disponible à Morzine',
    reference_id: uuid(),
    read: false,
    created_at: isoNow(),
    ...overrides,
  };
}
