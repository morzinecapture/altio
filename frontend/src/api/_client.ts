/**
 * Shared utilities for all API modules.
 * Every api/*.ts file imports from here instead of duplicating helpers.
 */
import { supabase } from '../lib/supabase';
export { supabase };
export { captureError } from '../sentry';
export { assertMissionTransition, assertEmergencyTransition } from '../services/mission-state-machine';

import type { SupabaseError, FunctionsInvokeError } from '../types/api';

// Re-export commonly used types
export type { MissionStatus, EmergencyStatus } from '../types/api';
export type {
  CreateMissionPayload, CreatePropertyPayload, UpdatePropertyPayload,
  UpdateProviderProfilePayload, CreateEmergencyPayload, AcceptEmergencyPayload,
  CompleteEmergencyPayload, ApplyToMissionPayload, CreateQuotePayload,
  UpdatePartnerPayload, ScheduleItem, AppNotification, PushNotificationData,
  PaymentMetadata, SupabaseError, FunctionsInvokeError, QuoteLineItem,
  MergedMission, EmergencyRequest, MissionApplicationEnriched,
  EmergencyBidEnriched, RecentMission, MissionFinanceRow, ProviderDocument,
  Reservation, FavoriteProvider,
} from '../types/api';

/** Wrap a promise with a timeout (ms). Rejects with a clear message on timeout. */
export function withTimeout<T>(promise: Promise<T>, ms = 10_000, label = 'Requête'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} : délai d'attente dépassé (${ms / 1000}s)`));
    }, ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

/** Require an authenticated session. Throws if not logged in. */
export const requireAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user;
};

/** Require admin role. Throws if not authenticated or not admin. */
export const requireAdmin = async () => {
  const user = await requireAuth();
  const { data: userData } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  if (!userData?.is_admin) throw new Error('Forbidden: admin access required');
  return user;
};

/** Throw if Supabase returned an error */
export const checkError = (error: SupabaseError | null) => {
  if (error) {
    throw new Error(error.message || 'Supabase query failed');
  }
};

/**
 * Extract a human-readable error message from an Edge Function error.
 * Handles JSON body, text body, and raw error.message gracefully.
 */
export const checkFunctionError = async (error: FunctionsInvokeError | null) => {
  if (!error) return;

  let message = error.message || 'Edge function call failed';

  // Try JSON body first (most common format)
  if (error.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) {
        message = String(body.error);
      }
    } catch {
      // JSON parse failed — try text
      if (typeof error.context.text === 'function') {
        try {
          const text = await error.context.text();
          if (text) {
            try {
              const parsed = JSON.parse(text);
              if (parsed?.error) message = String(parsed.error);
            } catch {
              message = text.substring(0, 200);
            }
          }
        } catch {
          // Keep original message
        }
      }
    }
  }

  throw new Error(message);
};

/** Unwrap Supabase FK join (may be object or single-element array) */
export const unwrapJoin = <T>(val: T | T[] | null | undefined): T | undefined => {
  if (!val) return undefined;
  if (Array.isArray(val)) return val[0];
  return val;
};

/** Extract property name from Supabase join */
export const getPropertyName = (property: unknown): string => {
  const p = unwrapJoin(property as Record<string, unknown> | Record<string, unknown>[] | null);
  return (p as { name?: string } | undefined)?.name || '';
};

/** Haversine distance in km */
export const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Supabase row types (shared across modules) ─────────────────────────────

export interface MissionRow {
  id: string;
  owner_id: string;
  property_id: string;
  assigned_provider_id?: string | null;
  mission_type: string;
  status: string;
  description?: string;
  scheduled_date?: string;
  fixed_rate?: number;
  favorites_only_until?: string | null;
  payment_intent_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  validated_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  dispute_reason?: string | null;
  dispute_at?: string | null;
  dispute_resolution?: string | null;
  dispute_resolved_at?: string | null;
  created_at: string;
  updated_at?: string;
  property?: { name?: string; address?: string; access_code?: string; instructions?: string; deposit_location?: string; linen_instructions?: string; latitude?: number; longitude?: number } | null;
}

export interface EmergencyRow {
  id: string;
  owner_id: string;
  property_id?: string;
  service_type: string;
  description?: string;
  status: string;
  accepted_provider_id?: string | null;
  displacement_fee?: number;
  diagnostic_fee?: number;
  repair_cost?: number;
  response_deadline?: string;
  completed_at?: string | null;
  target_provider_id?: string | null;
  scheduled_date?: string | null;
  created_at: string;
  updated_at?: string;
  property?: { name?: string; address?: string; city?: string; latitude?: number; longitude?: number } | null;
  provider?: { name?: string; picture?: string } | null;
  bids?: Array<{ id: string; status: string; provider_id: string }>;
}

export interface ApplicationRow {
  id: string;
  mission_id: string;
  provider_id: string;
  proposed_rate?: number;
  message?: string;
  status: string;
  created_at: string;
  provider?: { name?: string; picture?: string; profile?: { rating?: number; total_reviews?: number } | Array<{ rating?: number; total_reviews?: number }> } | null;
  mission?: { id?: string; mission_type?: string; status?: string; description?: string; scheduled_date?: string; fixed_rate?: number; property?: { name?: string; address?: string } | null } | null;
}

export interface BidRow {
  id: string;
  emergency_request_id: string;
  provider_id: string;
  travel_cost: number;
  diagnostic_cost: number;
  estimated_arrival: string;
  status: string;
  created_at: string;
  provider?: { name?: string; picture?: string; profile?: { rating?: number; total_reviews?: number } | Array<{ rating?: number; total_reviews?: number }> } | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  reference_id?: string | null;
  read: boolean;
  created_at: string;
}

export interface ReservationRow {
  id: string;
  property_id: string;
  guest_name?: string;
  check_in: string;
  check_out: string;
  source?: string;
  property?: { name?: string; address?: string } | null;
}

export interface ProviderWithUser {
  provider_id: string;
  specialties: string[];
  radius_km: number;
  latitude?: number;
  longitude?: number;
  users: { expo_push_token?: string } | { expo_push_token?: string }[];
}

export interface AdminMissionRow {
  id: string;
  status: string;
  mission_type: string;
  fixed_rate?: number;
  created_at: string;
  properties?: { name?: string; address?: string } | null;
}

export interface MonthlyVolumeRow {
  fixed_rate?: number;
  created_at: string;
  status: string;
}
