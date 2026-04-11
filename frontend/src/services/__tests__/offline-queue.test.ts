/**
 * Tests for offline-queue idempotency and core behavior.
 * Mocks AsyncStorage and networkStatus$.
 */

// Mock AsyncStorage
const storage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(storage[key] || null)),
    setItem: jest.fn((key: string, value: string) => {
      storage[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete storage[key];
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach((k) => delete storage[k]);
      return Promise.resolve();
    }),
  },
}));

// Mock secure-storage to pass through to AsyncStorage
jest.mock('../secure-storage', () => ({
  getSecureItem: jest.fn((key: string) => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage.getItem(key);
  }),
  setSecureItem: jest.fn((key: string, value: string) => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage.setItem(key, value);
  }),
  removeSecureItem: jest.fn((key: string) => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage.removeItem(key);
  }),
}));

// Mock networkStatus$
jest.mock('../../hooks/useNetworkStatus', () => ({
  networkStatus$: { current: { isOnline: true, isInternetReachable: true } },
}));

import { enqueue, processQueue, getQueuedItems, clearQueue, registerAction } from '../offline-queue';

beforeEach(() => {
  // Clear storage between tests
  Object.keys(storage).forEach((k) => delete storage[k]);
});

describe('offline-queue', () => {
  test('enqueue adds item to queue', async () => {
    const item = await enqueue('test_action', { id: '123' });
    expect(item).not.toBeNull();
    expect(item!.action).toBe('test_action');
    expect(item!.idempotencyKey).toBeTruthy();

    const items = await getQueuedItems();
    expect(items).toHaveLength(1);
  });

  test('enqueue rejects duplicate action+params', async () => {
    await enqueue('create_mission', { propertyId: 'abc', type: 'cleaning' });
    const dup = await enqueue('create_mission', { propertyId: 'abc', type: 'cleaning' });
    expect(dup).toBeNull();

    const items = await getQueuedItems();
    expect(items).toHaveLength(1);
  });

  test('enqueue allows different params for same action', async () => {
    await enqueue('create_mission', { propertyId: 'abc' });
    const second = await enqueue('create_mission', { propertyId: 'def' });
    expect(second).not.toBeNull();

    const items = await getQueuedItems();
    expect(items).toHaveLength(2);
  });

  test('processQueue calls registered handler and removes item', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerAction('process_test', handler);

    await enqueue('process_test', { x: 1 });
    await processQueue();

    expect(handler).toHaveBeenCalledWith({ x: 1 });

    const items = await getQueuedItems();
    expect(items).toHaveLength(0);
  });

  test('processQueue marks item as failed after MAX_RETRIES', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('network'));
    registerAction('fail_test', handler);

    await enqueue('fail_test', { y: 2 });

    // Process 3 times (MAX_RETRIES = 3)
    await processQueue();
    await processQueue();
    await processQueue();

    const items = await getQueuedItems();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('failed');
    expect(items[0].retries).toBe(3);
  });

  test('processQueue skips already-processed idempotency keys', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerAction('idem_test', handler);

    await enqueue('idem_test', { z: 3 });
    await processQueue();
    expect(handler).toHaveBeenCalledTimes(1);

    // Re-enqueue same params — should be rejected (key already processed)
    const dup = await enqueue('idem_test', { z: 3 });
    expect(dup).toBeNull();
  });

  test('clearQueue removes all items and processed keys', async () => {
    await enqueue('clear_test', { a: 1 });
    await clearQueue();

    const items = await getQueuedItems();
    expect(items).toHaveLength(0);
  });

  test('items without registered handler are marked as failed', async () => {
    await enqueue('unknown_action', { b: 2 });
    await processQueue();

    const items = await getQueuedItems();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('failed');
  });
});
