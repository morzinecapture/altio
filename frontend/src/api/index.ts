/**
 * Barrel export — all API modules re-exported from a single entry point.
 * Import from '@/api' or '../api' instead of '../api.ts'.
 */

// Shared utilities (for internal use by other modules, but also exported)
export { supabase } from './_client';
export { unwrapJoin, getPropertyName, haversineKm, checkError, checkFunctionError } from './_client';

// Domain modules
export * from './profile';
export * from './properties';
export * from './missions';
export * from './emergencies';
export * from './payments';
export * from './notifications';
export * from './messaging';
export * from './reviews';
export * from './admin';
export * from './partners';

// State machine (for screens that need to check transitions)
export { isValidMissionTransition, isValidEmergencyTransition, MISSION_TRANSITIONS, EMERGENCY_TRANSITIONS } from '../services/mission-state-machine';
