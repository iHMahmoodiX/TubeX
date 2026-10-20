// The one owner of persisted TubeX records (IndexedDB). Preferences live in src/storage/prefs.ts.
import { openDB, type IDBPDatabase } from 'idb';
import { emptyData, type BackupData } from '../domain/backup';
import { COLLECTIONS, nowIso } from '../domain/models';
import type { CollectionName, Collections } from '../domain/models';
import { sanitizeRecord } from '../domain/records';

export const DB_NAME = 'tubex';
export const DB_VERSION = 2;
const META = 'meta';
const SNAPSHOT_KEY = 'preImportSnapshot';
export const CACHE = 'cache';

type Db = IDBPDatabase<unknown>;
let dbPromise: Promise<Db> | null = null;

/** Versioned schema upgrades. Each step must be safe to run on data written by every earlier version. */
const MIGRATIONS: Record<number, (db: Db) => void> = {
  // Store lists are written out per version: COLLECTIONS grows over time, migrations must not.
  1: (db) => {
    for (const name of ['profiles', 'ideas', 'drafts', 'templates'] as const) {
      const store = db.createObjectStore(name, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
    db.createObjectStore(META, { keyPath: 'key' });
  },
  2: (db) => {
    for (const name of ['keywordLists', 'watchlist', 'replies'] as const) {
      db.createObjectStore(name, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
    }
    // Cache of API/AI responses. Not part of backups; entries expire (see src/storage/cache.ts).
    db.createObjectStore(CACHE, { keyPath: 'key' }).createIndex('expiresAt', 'expiresAt');
  },
};

export function openDb(name = DB_NAME): Promise<Db> {
  if (!dbPromise) {
    dbPromise = openDB(name, DB_VERSION, {
      upgrade(db, oldVersion) {
        for (let v = oldVersion + 1; v <= DB_VERSION; v++) MIGRATIONS[v]?.(db as Db);
      },
      blocked() {
        console.warn('[TubeX] database upgrade blocked by another open TubeX page');
      },
    }).catch((err) => {
      dbPromise = null; // allow a retry from the recovery UI
      throw err;
    });
  }
  return dbPromise;
}

/** Test helper: forget the cached connection. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

// ---- change notifications (same page + other extension pages) ----
type Listener = (name: CollectionName) => void;
const listeners = new Set<Listener>();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tubex-data') : null;
channel?.addEventListener('message', (e: MessageEvent) => {
  const name = (e.data as { collection?: string })?.collection;
  if (name && (COLLECTIONS as string[]).includes(name)) listeners.forEach((l) => l(name as CollectionName));
});
function notify(name: CollectionName) {
  listeners.forEach((l) => l(name));
  channel?.postMessage({ collection: name });
}
export function onDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- repository ----
export interface ListResult<T> {
  items: T[];
  /** Stored rows that failed validation; they are left untouched in storage and excluded here. */
  corrupt: number;
}

export async function list<K extends CollectionName>(name: K): Promise<ListResult<Collections[K]>> {
  const db = await openDb();
  const rows = await db.getAll(name);
  const items: Collections[K][] = [];
  let corrupt = 0;
  for (const row of rows) {
    const rec = sanitizeRecord(name, row);
    if (rec) items.push(rec);
    else corrupt++;
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { items, corrupt };
}

export async function get<K extends CollectionName>(name: K, id: string): Promise<Collections[K] | undefined> {
  const db = await openDb();
  return sanitizeRecord(name, await db.get(name, id)) ?? undefined;
}

export async function create<K extends CollectionName>(name: K, rec: Collections[K]): Promise<Collections[K]> {
  const db = await openDb();
  await db.add(name, rec);
  notify(name);
  return rec;
}

export type SaveResult<T> = { ok: true; record: T } | { ok: false; conflict: T | undefined };

/**
 * Saves `rec` only if the stored revision still equals `rec.rev` (optimistic concurrency).
 * On success the stored record has rev + 1 and a new updatedAt.
 */
export async function save<K extends CollectionName>(name: K, rec: Collections[K]): Promise<SaveResult<Collections[K]>> {
  const db = await openDb();
  const tx = db.transaction(name, 'readwrite');
  const current = sanitizeRecord(name, await tx.store.get(rec.id)) ?? undefined;
  if (!current || current.rev !== rec.rev) {
    await tx.done;
    return { ok: false, conflict: current };
  }
  const next = { ...rec, rev: rec.rev + 1, updatedAt: nowIso() };
  await tx.store.put(next);
  await tx.done;
  notify(name);
  return { ok: true, record: next };
}

/** Writes regardless of revision. Used for an explicit "keep my version" choice and for undo. */
export async function put<K extends CollectionName>(name: K, rec: Collections[K]): Promise<Collections[K]> {
  const db = await openDb();
  const current = sanitizeRecord(name, await db.get(name, rec.id));
  const next = { ...rec, rev: Math.max(rec.rev, current?.rev ?? 0) + 1, updatedAt: nowIso() };
  await db.put(name, next);
  notify(name);
  return next;
}

export async function remove<K extends CollectionName>(name: K, id: string): Promise<Collections[K] | undefined> {
  const db = await openDb();
  const existing = sanitizeRecord(name, await db.get(name, id)) ?? undefined;
  await db.delete(name, id);
  notify(name);
  return existing;
}

export async function exportAll(): Promise<BackupData> {
  const data = emptyData();
  for (const name of COLLECTIONS) (data[name] as unknown[]) = (await list(name)).items;
  return data;
}

export interface ImportResult {
  added: number;
  updated: number;
  keptLocal: number;
}

/**
 * merge: incoming records are added; an existing id is replaced only when the incoming copy is newer.
 * replace: all local records are removed first.
 * Either way the previous data is kept as a snapshot for undoLastImport().
 */
export async function importData(data: BackupData, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const before = await exportAll();
  const db = await openDb();
  const tx = db.transaction([...COLLECTIONS, META], 'readwrite');
  const result: ImportResult = { added: 0, updated: 0, keptLocal: 0 };
  await tx.objectStore(META).put({ key: SNAPSHOT_KEY, takenAt: nowIso(), data: before });
  for (const name of COLLECTIONS) {
    const store = tx.objectStore(name);
    if (mode === 'replace') await store.clear();
    for (const rec of data[name]) {
      const existing = mode === 'merge' ? ((await store.get(rec.id)) as { updatedAt?: string } | undefined) : undefined;
      if (!existing) {
        await store.put(rec);
        result.added++;
      } else if ((existing.updatedAt ?? '') < rec.updatedAt) {
        await store.put(rec);
        result.updated++;
      } else {
        result.keptLocal++;
      }
    }
  }
  await tx.done;
  COLLECTIONS.forEach(notify);
  return result;
}

export async function hasImportSnapshot(): Promise<string | undefined> {
  const db = await openDb();
  const snap = (await db.get(META, SNAPSHOT_KEY)) as { takenAt?: string } | undefined;
  return snap?.takenAt;
}

/** Restores the data as it was immediately before the last import. */
export async function undoLastImport(): Promise<boolean> {
  const db = await openDb();
  const snap = (await db.get(META, SNAPSHOT_KEY)) as { data?: BackupData } | undefined;
  if (!snap?.data) return false;
  const tx = db.transaction([...COLLECTIONS, META], 'readwrite');
  for (const name of COLLECTIONS) {
    const store = tx.objectStore(name);
    await store.clear();
    for (const rec of snap.data[name] ?? []) await store.put(rec);
  }
  await tx.objectStore(META).delete(SNAPSHOT_KEY);
  await tx.done;
  COLLECTIONS.forEach(notify);
  return true;
}

export async function deleteAllData(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...COLLECTIONS, META], 'readwrite');
  for (const name of [...COLLECTIONS, META]) await tx.objectStore(name).clear();
  await db.clear(CACHE);
  await tx.done;
  COLLECTIONS.forEach(notify);
}
