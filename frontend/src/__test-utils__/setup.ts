/**
 * Global test setup — loaded via setupFilesAfterSetup in jest.config.ts.
 *
 * Mocks modules that have native dependencies or side-effects so that
 * every test file starts with a clean, working mock environment.
 */

import { mockSupabaseClient, resetAllMocks as resetSupabaseMocks } from './supabase-mock';

// ─── Mock src/lib/supabase ──────────────────────────────────────────────────
jest.mock('../lib/supabase', () => ({
  supabase: mockSupabaseClient,
}));

// ─── Mock src/sentry ────────────────────────────────────────────────────────
jest.mock('../sentry', () => ({
  initSentry: jest.fn(),
  captureError: jest.fn(),
  Sentry: {
    init: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setUser: jest.fn(),
  },
}));

// ─── Mock expo-image-manipulator (native module) ────────────────────────────
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file://mock-compressed.jpg', width: 1920, height: 1080 }),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

// ─── Mock AsyncStorage ──────────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    multiGet: jest.fn().mockResolvedValue([]),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));

// ─── Cleanup after each test ────────────────────────────────────────────────
afterEach(() => {
  jest.clearAllMocks();
  resetSupabaseMocks();
});
