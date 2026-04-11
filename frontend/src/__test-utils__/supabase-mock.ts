/**
 * Supabase client mock with chainable methods.
 *
 * Usage in tests:
 *   import { mockSupabaseResponse, resetAllMocks } from '@test-utils';
 *   mockSupabaseResponse('missions', 'select', [{ id: '1', status: 'pending' }]);
 */

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

interface MockResponse {
  data: unknown;
  error: unknown;
  count?: number | null;
}

// Store per-table, per-operation mock responses
const responseStore = new Map<string, MockResponse>();

function storeKey(table: string, operation: Operation): string {
  return `${table}:${operation}`;
}

// Store RPC mock responses
const rpcStore = new Map<string, MockResponse>();

// ─── Chainable query builder ────────────────────────────────────────────────

function createChainableBuilder(response: MockResponse): Record<string, unknown> {
  const self: Record<string, unknown> = {};

  const chainMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'like', 'ilike', 'is', 'in', 'contains', 'containedBy',
    'filter', 'not', 'or', 'and',
    'order', 'limit', 'range', 'offset',
    'single', 'maybeSingle',
    'csv', 'geojson', 'explain',
    'match', 'textSearch',
    'overlaps', 'rangeGt', 'rangeLt', 'rangeGte', 'rangeLte', 'rangeAdjacent',
  ];

  for (const method of chainMethods) {
    self[method] = jest.fn().mockReturnValue(self);
  }

  // Terminal: make the builder thenable so `await supabase.from(...).select(...)` resolves
  self.then = (resolve: (v: MockResponse) => void, reject?: (e: unknown) => void) => {
    return Promise.resolve(response).then(resolve, reject);
  };

  return self;
}

// ─── from() mock ────────────────────────────────────────────────────────────

function createFromMock() {
  return jest.fn((table: string) => {
    const operationProxy: Record<string, unknown> = {};

    for (const op of ['select', 'insert', 'update', 'delete', 'upsert'] as Operation[]) {
      operationProxy[op] = jest.fn((..._args: unknown[]) => {
        const key = storeKey(table, op);
        const response = responseStore.get(key) ?? { data: null, error: null };
        return createChainableBuilder(response);
      });
    }

    return operationProxy;
  });
}

// ─── rpc() mock ─────────────────────────────────────────────────────────────

function createRpcMock() {
  return jest.fn((name: string, _params?: unknown) => {
    const response = rpcStore.get(name) ?? { data: null, error: null };
    return createChainableBuilder(response);
  });
}

// ─── Auth mock ──────────────────────────────────────────────────────────────

function createAuthMock() {
  return {
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInWithPassword: jest.fn().mockResolvedValue({ data: { session: null, user: null }, error: null }),
    signUp: jest.fn().mockResolvedValue({ data: { session: null, user: null }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    resetPasswordForEmail: jest.fn().mockResolvedValue({ data: null, error: null }),
    updateUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
  };
}

// ─── Storage mock ───────────────────────────────────────────────────────────

function createStorageMock() {
  return {
    from: jest.fn().mockReturnValue({
      upload: jest.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null }),
      getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://test.supabase.co/storage/test' } }),
      download: jest.fn().mockResolvedValue({ data: new Blob(), error: null }),
      remove: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
}

// ─── Functions mock ─────────────────────────────────────────────────────────

function createFunctionsMock() {
  return {
    invoke: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
}

// ─── Channel / Realtime mock ────────────────────────────────────────────────

function createChannelMock() {
  const channelSelf: Record<string, unknown> = {};
  channelSelf.on = jest.fn().mockReturnValue(channelSelf);
  channelSelf.subscribe = jest.fn().mockReturnValue(channelSelf);
  channelSelf.unsubscribe = jest.fn().mockResolvedValue('ok');
  return channelSelf;
}

// ─── Public helpers ─────────────────────────────────────────────────────────

/**
 * Configure the mock response for a specific table + operation.
 *
 *   mockSupabaseResponse('missions', 'select', [{ id: '1' }]);
 *   mockSupabaseResponse('missions', 'insert', { id: '2' }, { message: 'RLS' });
 */
export function mockSupabaseResponse(
  table: string,
  operation: Operation,
  data: unknown,
  error?: unknown,
): void {
  responseStore.set(storeKey(table, operation), { data, error: error ?? null });
}

/**
 * Configure the mock response for an RPC call.
 *
 *   mockRpcResponse('get_provider_stats', { total_earnings: 1200 });
 */
export function mockRpcResponse(name: string, data: unknown, error?: unknown): void {
  rpcStore.set(name, { data, error: error ?? null });
}

/**
 * Create a standalone chainable builder for advanced mocking.
 */
export function mockSupabaseChain(data: unknown = null, error: unknown = null) {
  return createChainableBuilder({ data, error: error ?? null });
}

/**
 * Clear all stored mock responses. Call in afterEach.
 */
export function resetAllMocks(): void {
  responseStore.clear();
  rpcStore.clear();
}

// ─── The mock client ────────────────────────────────────────────────────────

export const mockSupabaseClient = {
  from: createFromMock(),
  rpc: createRpcMock(),
  auth: createAuthMock(),
  storage: createStorageMock(),
  functions: createFunctionsMock(),
  channel: jest.fn().mockImplementation(() => createChannelMock()),
  removeChannel: jest.fn().mockResolvedValue('ok'),
};
