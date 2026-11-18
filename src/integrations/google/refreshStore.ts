// Refresh tokens at rest (D-020). Each channel's Google refresh token is encrypted with AES-GCM under a
// non-extractable CryptoKey that is generated once and kept in its own IndexedDB database (structured clone
// keeps it non-extractable: the raw key bytes can never be read back by script). The ciphertext lives in
// chrome.storage.local under `googleRefresh`. Never logged, never in backups (backups pick fields
// explicitly and do not read this key or this database), removed on disconnect.
// Honest limit: this protects against copying the storage files or a settings export, not against code
// running inside the extension itself.
import { openDB, type IDBPDatabase } from 'idb';
import { browser } from 'wxt/browser';

export const KEY_DB = 'tubex-keys';
const KEY_STORE = 'keys';
const KEY_ID = 'google-refresh';
export const REFRESH_KEY = 'googleRefresh';

interface Sealed {
  iv: string;
  ct: string;
  at: string;
}

const b64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let dbp: Promise<IDBPDatabase> | null = null;
function keyDb(): Promise<IDBPDatabase> {
  dbp ??= openDB(KEY_DB, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    },
    blocking() {
      // Another context wants to delete or upgrade the database: let it, and reopen on next use.
      void dbp?.then((d) => d.close());
      dbp = null;
    },
  }).catch((e) => {
    dbp = null;
    throw e;
  });
  return dbp;
}

/** Test hook: forget the cached connection (after deleting the database). */
export async function resetKeyCache(): Promise<void> {
  const p = dbp;
  dbp = null;
  await p?.then((d) => d.close()).catch(() => undefined);
}

async function storeKey(): Promise<CryptoKey> {
  const db = await keyDb();
  const have = (await db.get(KEY_STORE, KEY_ID)) as CryptoKey | undefined;
  if (have) return have;
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // `add` fails if another extension page created the key meanwhile; then use theirs.
  try {
    await db.add(KEY_STORE, fresh, KEY_ID);
    return fresh;
  } catch {
    const other = (await db.get(KEY_STORE, KEY_ID)) as CryptoKey | undefined;
    if (other) return other;
    throw new Error('key store unavailable');
  }
}

async function sealedAll(): Promise<Record<string, Sealed>> {
  const raw = (await browser.storage.local.get(REFRESH_KEY))[REFRESH_KEY];
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, Sealed> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const s = v as Partial<Sealed> | null;
    if (s && typeof s.iv === 'string' && typeof s.ct === 'string') out[k] = { iv: s.iv, ct: s.ct, at: String(s.at ?? '') };
  }
  return out;
}

/** Encrypts and stores the channel's refresh token (replacing any previous one). */
export async function saveRefreshToken(channelId: string, token: string): Promise<void> {
  const key = await storeKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(channelId) }, key, new TextEncoder().encode(token)));
  const all = await sealedAll();
  all[channelId] = { iv: b64(iv), ct: b64(ct), at: new Date().toISOString() };
  await browser.storage.local.set({ [REFRESH_KEY]: all });
}

/**
 * The channel's refresh token, or undefined. An entry that cannot be decrypted (key database cleared, data
 * damaged, or moved to another channel) is removed, so the channel falls back to the normal sign-in.
 */
export async function loadRefreshToken(channelId: string): Promise<string | undefined> {
  const s = (await sealedAll())[channelId];
  if (!s) return undefined;
  try {
    const db = await keyDb();
    const key = (await db.get(KEY_STORE, KEY_ID)) as CryptoKey | undefined;
    if (!key) throw new Error('no key');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv), additionalData: new TextEncoder().encode(channelId) }, key, unb64(s.ct));
    return new TextDecoder().decode(pt);
  } catch {
    await deleteRefreshToken(channelId);
    return undefined;
  }
}

export async function deleteRefreshToken(channelId: string): Promise<void> {
  const all = await sealedAll();
  if (!(channelId in all)) return;
  delete all[channelId];
  await browser.storage.local.set({ [REFRESH_KEY]: all });
}

/** Channels that have a stored refresh token (no decryption; for status display). */
export async function refreshChannelIds(): Promise<string[]> {
  return Object.keys(await sealedAll());
}

export function onRefreshChanged(cb: (ids: string[]) => void): () => void {
  const l = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[REFRESH_KEY]) void refreshChannelIds().then(cb);
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}
