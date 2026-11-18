// Expiring cache for permitted API and AI results. Keys must include every input that changes the result.
import { CACHE, openDb } from './db';

interface Entry {
  key: string;
  value: unknown;
  storedAt: string;
  expiresAt: number;
}

export async function cacheGet<T>(key: string): Promise<{ value: T; storedAt: string } | undefined> {
  const db = await openDb();
  const e = (await db.get(CACHE, key)) as Entry | undefined;
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    await db.delete(CACHE, key);
    return undefined;
  }
  return { value: e.value as T, storedAt: e.storedAt };
}

export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const db = await openDb();
  await db.put(CACHE, { key, value, storedAt: new Date().toISOString(), expiresAt: Date.now() + ttlMs } satisfies Entry);
}

/** Removes expired entries. Called opportunistically; never required for correctness. */
export async function cachePrune(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(CACHE, 'readwrite');
  let removed = 0;
  let cursor = await tx.store.index('expiresAt').openCursor(IDBKeyRange.upperBound(Date.now()));
  while (cursor) {
    await cursor.delete();
    removed++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

export async function cacheClear(): Promise<void> {
  const db = await openDb();
  await db.clear(CACHE);
}

/** Stable short hash for cache keys (not for security). */
export async function hashKey(parts: unknown[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}
