import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureItem, setSecureItem } from './secure-storage';
import { networkStatus$ } from '../hooks/useNetworkStatus';

const QUEUE_KEY = 'altio_offline_queue';
const PROCESSED_KEYS_KEY = 'altio_offline_processed';
const MAX_RETRIES = 3;
const PROCESSED_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface QueuedItem {
  id: string;
  action: string;
  params: Record<string, unknown>;
  timestamp: string;
  retries: number;
  status: 'pending' | 'failed';
  idempotencyKey: string;
}

interface ProcessedEntry {
  key: string;
  processedAt: number;
}

/**
 * Registry of action handlers that can be replayed from the queue.
 * Call `registerAction(name, handler)` to add replay support.
 */
const actionHandlers = new Map<
  string,
  (params: Record<string, unknown>) => Promise<void>
>();

export function registerAction(
  name: string,
  handler: (params: Record<string, unknown>) => Promise<void>,
) {
  actionHandlers.set(name, handler);
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a deterministic idempotency key from action + params.
 * Same action + same params = same key → prevents duplicate enqueue.
 */
function computeIdempotencyKey(action: string, params: Record<string, unknown>): string {
  const payload = JSON.stringify({ action, params });
  // Simple hash — sufficient for dedup, not crypto
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return `${action}:${Math.abs(hash).toString(36)}`;
}

async function readQueue(): Promise<QueuedItem[]> {
  try {
    const raw = await getSecureItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedItem[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedItem[]): Promise<void> {
  await setSecureItem(QUEUE_KEY, JSON.stringify(queue));
}

async function readProcessedKeys(): Promise<ProcessedEntry[]> {
  try {
    const raw = await getSecureItem(PROCESSED_KEYS_KEY);
    return raw ? (JSON.parse(raw) as ProcessedEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeProcessedKeys(entries: ProcessedEntry[]): Promise<void> {
  await setSecureItem(PROCESSED_KEYS_KEY, JSON.stringify(entries));
}

/**
 * Mark an idempotency key as successfully processed.
 * Also prunes entries older than PROCESSED_TTL_MS.
 */
async function markProcessed(key: string): Promise<void> {
  const now = Date.now();
  const entries = (await readProcessedKeys()).filter(
    (e) => now - e.processedAt < PROCESSED_TTL_MS,
  );
  entries.push({ key, processedAt: now });
  await writeProcessedKeys(entries);
}

/**
 * Check if an idempotency key was already processed within TTL.
 */
async function wasAlreadyProcessed(key: string): Promise<boolean> {
  const now = Date.now();
  const entries = await readProcessedKeys();
  return entries.some(
    (e) => e.key === key && now - e.processedAt < PROCESSED_TTL_MS,
  );
}

/**
 * Add a mutation to the offline queue.
 * Duplicate actions (same action + params) are rejected via idempotency key.
 */
export async function enqueue(
  action: string,
  params: Record<string, unknown>,
): Promise<QueuedItem | null> {
  const idempotencyKey = computeIdempotencyKey(action, params);

  // Check if already processed recently
  if (await wasAlreadyProcessed(idempotencyKey)) {
    return null;
  }

  // Check if already in queue
  const queue = await readQueue();
  if (queue.some((item) => item.idempotencyKey === idempotencyKey && item.status === 'pending')) {
    return null;
  }

  const item: QueuedItem = {
    id: generateId(),
    action,
    params,
    timestamp: new Date().toISOString(),
    retries: 0,
    status: 'pending',
    idempotencyKey,
  };

  queue.push(item);
  await writeQueue(queue);

  return item;
}

/**
 * Process all pending items in FIFO order.
 * Items that fail after MAX_RETRIES are marked as 'failed'.
 * Successfully processed items are tracked to prevent re-processing.
 */
export async function processQueue(): Promise<void> {
  if (!networkStatus$.current.isOnline) return;

  const queue = await readQueue();
  if (queue.length === 0) return;

  const remaining: QueuedItem[] = [];

  for (const item of queue) {
    if (item.status === 'failed') {
      remaining.push(item);
      continue;
    }

    // Skip if already processed (e.g. queue persisted but key was marked done)
    if (await wasAlreadyProcessed(item.idempotencyKey)) {
      continue; // Drop from queue
    }

    const handler = actionHandlers.get(item.action);
    if (!handler) {
      remaining.push({ ...item, status: 'failed' });
      continue;
    }

    try {
      await handler(item.params);
      await markProcessed(item.idempotencyKey);
      // Success — item removed from queue
    } catch {
      const retries = item.retries + 1;
      if (retries >= MAX_RETRIES) {
        remaining.push({ ...item, retries, status: 'failed' });
      } else {
        remaining.push({ ...item, retries });
      }
    }
  }

  await writeQueue(remaining);
}

/**
 * Get all items currently in the queue (pending + failed).
 */
export async function getQueuedItems(): Promise<QueuedItem[]> {
  return readQueue();
}

/**
 * Clear the entire offline queue and processed keys.
 */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.multiRemove([QUEUE_KEY, PROCESSED_KEYS_KEY]);
}
