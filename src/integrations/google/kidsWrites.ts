// "Made for kids" (COPPA) on the signed-in channel's videos: list uploads with their status, read the live
// status, write status.selfDeclaredMadeForKids with every other writable status field kept, and an undo log in
// the snapshots work store. Built on ownRead/ownRequest so every call counts against the local daily cap.
// Documented fields (Inferred from the videos resource reference): status.madeForKids (read-only, YouTube's
// designation) and status.selfDeclaredMadeForKids (writable on videos.update part=status).
import { KIDS_WRITE_COST, type KidsBatch, type KidsUndoEntry, type KidsVideo, undoTarget } from '../../domain/coppa';
import { STATUS_WRITABLE } from '../../domain/engageSchedule';
import { byIndex, del, put } from '../../storage/stores';
import { toVideo } from '../youtube/api';
import { YtError } from '../youtube/client';
import { AuthError } from './auth';
import { ownRead, ownRequest } from './own';

type Obj = Record<string, any>;
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

export const KIDS_BATCH_REF = 'coppa.batches';
const KEEP_BATCHES = 20;

function toKids(it: Obj): KidsVideo {
  const v = toVideo(it);
  return {
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnail,
    publishedAt: v.publishedAt,
    durationSec: v.durationSec,
    privacy: String(it.status?.privacyStatus ?? ''),
    madeForKids: bool(it.status?.madeForKids),
    selfDeclared: bool(it.status?.selfDeclaredMadeForKids),
  };
}

/** Uploads (public, unlisted, private) newest first with their kids status. ~2 units per 50 videos, cached 10 minutes. */
export async function listKidsVideos(channelId: string, uploadsPlaylistId: string, max = 500, fresh = false): Promise<KidsVideo[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await ownRead<Obj>(channelId, 'playlistItems', { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 50, pageToken }, 10 * 60_000, fresh);
    for (const i of r.items ?? []) if (i.contentDetails?.videoId) ids.push(String(i.contentDetails.videoId));
    pageToken = r.nextPageToken || undefined;
  } while (pageToken && ids.length < max);
  return readKids(channelId, ids.slice(0, max), fresh, 10 * 60_000);
}

/** Kids status of specific own videos, in the order given (missing ids are left out). 1 unit per 50. */
export async function readKids(channelId: string, videoIds: string[], fresh = true, ttlMs = 0): Promise<KidsVideo[]> {
  const byId = new Map<string, KidsVideo>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const r = await ownRead<Obj>(channelId, 'videos', { part: 'snippet,contentDetails,status', id: videoIds.slice(i, i + 50).join(','), maxResults: 50 }, ttlMs, fresh);
    for (const it of r.items ?? []) byId.set(String(it.id), toKids(it));
  }
  return videoIds.map((id) => byId.get(id)).filter((v): v is KidsVideo => !!v);
}

/** The status block to send: every writable field of the live status, with the declaration set. */
export function kidsStatusBody(live: Obj, value: boolean): Obj {
  const out: Obj = {};
  for (const k of STATUS_WRITABLE) {
    const v = live[k];
    if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  out.selfDeclaredMadeForKids = value;
  if (out.privacyStatus !== 'private') delete out.publishAt;
  return out;
}

export interface KidsWrite {
  videoId: string;
  title: string;
  /** Declaration before (falls back to YouTube's designation when nothing was declared). */
  before?: boolean;
  after: boolean;
  /** False when the video already had the value (nothing written). */
  changed: boolean;
  /** YouTube's designation after the write, when returned. */
  madeForKids?: boolean;
}

/** Re-reads the live status, then writes the declaration (1 + 50 units). Skips the write when nothing changes. */
export async function setKids(channelId: string, videoId: string, value: boolean): Promise<KidsWrite> {
  const r = await ownRead<Obj>(channelId, 'videos', { part: 'snippet,status', id: videoId }, 0, true);
  const it = r.items?.[0];
  if (!it?.status) throw new YtError('not-found', videoId);
  const title = String(it.snippet?.title ?? '');
  const before = bool(it.status.selfDeclaredMadeForKids) ?? bool(it.status.madeForKids);
  if (bool(it.status.selfDeclaredMadeForKids) === value) return { videoId, title, before, after: value, changed: false, madeForKids: bool(it.status.madeForKids) };
  const res = await ownRequest<Obj>(channelId, { method: 'PUT', path: 'videos', params: { part: 'status' }, body: { id: videoId, status: kidsStatusBody(it.status, value) }, units: KIDS_WRITE_COST - 1 });
  return { videoId, title, before, after: value, changed: true, madeForKids: bool(res?.status?.madeForKids) };
}

export interface ItemResult {
  videoId: string;
  title: string;
  ok: boolean;
  changed: boolean;
  /** Undo left alone because the video changed since (undo only). */
  kept?: boolean;
  error?: unknown;
}

const fatal = (e: unknown) => e instanceof YtError && ['quota', 'budget', 'permission', 'unreachable'].includes(e.code);
const isAuth = (e: unknown) => e instanceof AuthError;

/**
 * Sets the declaration on each video, one at a time, stopping at errors the rest would hit too.
 * Records an undo batch of the videos that changed.
 */
export async function applyKidsBatch(channelId: string, videoIds: string[], value: boolean, onItem?: (r: ItemResult) => void): Promise<{ results: ItemResult[]; batch?: KidsBatch; stopped: boolean }> {
  const results: ItemResult[] = [];
  const entries: KidsUndoEntry[] = [];
  let stopped = false;
  for (const id of videoIds) {
    let r: ItemResult;
    try {
      const w = await setKids(channelId, id, value);
      if (w.changed) entries.push({ videoId: id, title: w.title, before: w.before ?? !value, after: value });
      r = { videoId: id, title: w.title, ok: true, changed: w.changed };
    } catch (e) {
      r = { videoId: id, title: '', ok: false, changed: false, error: e };
      if (fatal(e) || isAuth(e)) stopped = true;
    }
    results.push(r);
    onItem?.(r);
    if (stopped) break;
  }
  let batch: KidsBatch | undefined;
  if (entries.length) {
    batch = { id: crypto.randomUUID(), at: new Date().toISOString(), value, entries };
    await saveBatch(channelId, batch);
  }
  return { results, batch, stopped };
}

/** Restores the declarations of a batch where the video still has what TubeX wrote. */
export async function undoKidsBatch(channelId: string, batchId: string): Promise<{ results: ItemResult[]; stopped: boolean }> {
  const batch = (await listKidsBatches(channelId)).find((b) => b.id === batchId);
  if (!batch) throw new YtError('not-found', 'undo batch');
  const results: ItemResult[] = [];
  let stopped = false;
  const live = new Map((await readKids(channelId, batch.entries.map((e) => e.videoId))).map((v) => [v.id, v]));
  for (const e of batch.entries) {
    const target = undoTarget(e, live.get(e.videoId)?.selfDeclared);
    if (target === null) {
      results.push({ videoId: e.videoId, title: e.title, ok: true, changed: false, kept: true });
      continue;
    }
    try {
      const w = await setKids(channelId, e.videoId, target);
      results.push({ videoId: e.videoId, title: e.title, ok: true, changed: w.changed });
    } catch (err) {
      results.push({ videoId: e.videoId, title: e.title, ok: false, changed: false, error: err });
      if (fatal(err) || isAuth(err)) {
        stopped = true;
        break;
      }
    }
  }
  if (!stopped && results.every((r) => r.ok)) await saveBatch(channelId, { ...batch, undoneAt: new Date().toISOString() });
  return { results, stopped };
}

const batchRef = (channelId: string) => `${KIDS_BATCH_REF}:${channelId}`;

async function saveBatch(channelId: string, b: KidsBatch): Promise<void> {
  await put('snapshots', { id: `${batchRef(channelId)}:${b.id}`, ref: batchRef(channelId), at: b.at, data: b as unknown as Record<string, unknown> });
  const old = (await listKidsBatches(channelId)).slice(KEEP_BATCHES);
  for (const o of old) await del('snapshots', `${batchRef(channelId)}:${o.id}`);
}

/** Undo batches of the channel, newest first. */
export async function listKidsBatches(channelId: string): Promise<KidsBatch[]> {
  return (await byIndex('snapshots', 'ref', batchRef(channelId)))
    .map((s) => s.data as unknown as KidsBatch)
    .sort((a, b) => b.at.localeCompare(a.at));
}
