// The owner's own channel through OAuth: videos (including private/unlisted), analytics and metadata writes.
// Writes always re-read the live snippet first and send every writable snippet field, because fields left
// out of a videos.update snippet are cleared (Inferred from the API reference).
import { addUsage, loadIntegrations, loadUsage } from '../../storage/integrations';
import { cacheGet, cacheSet, hashKey } from '../../storage/cache';
import { toVideo, type VideoInfo } from '../youtube/api';
import { mapYtError, YtError, YT_BASE } from '../youtube/client';
import { AuthError, forgetToken, getToken } from './auth';

const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';
const WRITE_COST = 50; // videos.update (Inferred)

async function authed(channelId: string, url: string, init: RequestInit = {}): Promise<unknown> {
  const token = await getToken(channelId);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new YtError('unreachable', e instanceof Error ? e.message : String(e));
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) {
    await forgetToken(channelId);
    throw new AuthError('expired');
  }
  if (!res.ok) throw mapYtError(res.status, body);
  return body;
}

async function spend(units: number): Promise<void> {
  const { youtube } = await loadIntegrations();
  const u = await loadUsage();
  if (youtube.dailyUnitCap > 0 && u.ytUnits + units > youtube.dailyUnitCap) throw new YtError('budget');
  await addUsage({ ytUnits: units });
}

async function ownGet<T>(channelId: string, resource: string, params: Record<string, string | number | undefined>, ttlMs: number, fresh = false): Promise<T> {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string | number][];
  const key = await hashKey(['own', channelId, resource, clean.sort()]);
  if (!fresh && ttlMs > 0) {
    const hit = await cacheGet<T>(key);
    if (hit) return hit.value;
  }
  const url = new URL(resource.startsWith('https://') ? resource : `${YT_BASE}/${resource}`);
  for (const [k, v] of clean) url.searchParams.set(k, String(v));
  if (!resource.startsWith('https://')) await spend(1);
  const body = (await authed(channelId, url.toString())) as T;
  if (ttlMs > 0) await cacheSet(key, body, ttlMs);
  return body;
}

export interface OwnVideo extends VideoInfo {
  privacy: string;
}

type Obj = Record<string, any>;

/** All uploads (public, unlisted and private) of the signed-in channel, newest first, up to `max`. */
export async function ownVideos(channelId: string, uploadsPlaylistId: string, max = 500, fresh = false): Promise<OwnVideo[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await ownGet<Obj>(channelId, 'playlistItems', { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 50, pageToken }, 30 * 60_000, fresh);
    for (const i of r.items ?? []) if (i.contentDetails?.videoId) ids.push(i.contentDetails.videoId);
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < max);
  const out: OwnVideo[] = [];
  for (let i = 0; i < Math.min(ids.length, max); i += 50) {
    const r = await ownGet<Obj>(channelId, 'videos', { part: 'snippet,statistics,contentDetails,status', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, 30 * 60_000, fresh);
    for (const it of r.items ?? []) out.push({ ...toVideo(it), privacy: String(it.status?.privacyStatus ?? '') });
  }
  return out;
}

// ---- analytics ----
export interface Report {
  columns: string[];
  rows: (string | number)[][];
}

export async function report(
  channelId: string,
  q: { startDate: string; endDate: string; metrics: string; dimensions?: string; sort?: string; maxResults?: number; filters?: string },
  fresh = false,
): Promise<Report> {
  const r = await ownGet<Obj>(channelId, ANALYTICS, { ids: 'channel==MINE', ...q }, 6 * 3600_000, fresh);
  return { columns: (r.columnHeaders ?? []).map((c: Obj) => String(c.name)), rows: r.rows ?? [] };
}

// ---- writes ----
export interface SnippetEdit {
  title: string;
  description: string;
  tags: string[];
}

export interface WriteResult {
  videoId: string;
  before: SnippetEdit;
  after: SnippetEdit;
}

/** Writable snippet fields, copied from the live snippet so nothing is cleared by omission. */
export function writableSnippet(live: Obj, edit: SnippetEdit): Obj {
  const out: Obj = { title: edit.title, description: edit.description, tags: edit.tags, categoryId: live.categoryId };
  if (live.defaultLanguage) out.defaultLanguage = live.defaultLanguage;
  if (live.defaultAudioLanguage) out.defaultAudioLanguage = live.defaultAudioLanguage;
  return out;
}

/**
 * Re-reads the live snippet, applies `change` to it and writes it back. Returns null when the change
 * leaves the video as it is (nothing is written).
 */
export async function updateVideo(channelId: string, videoId: string, change: (live: SnippetEdit) => SnippetEdit): Promise<WriteResult | null> {
  await spend(1);
  const r = (await authed(channelId, `${YT_BASE}/videos?part=snippet&id=${encodeURIComponent(videoId)}`)) as Obj;
  const live = r.items?.[0]?.snippet;
  if (!live) throw new YtError('not-found', videoId);
  const before: SnippetEdit = { title: live.title ?? '', description: live.description ?? '', tags: live.tags ?? [] };
  const after = change(before);
  if (after.title === before.title && after.description === before.description && after.tags.join('\n') === before.tags.join('\n')) return null;
  await spend(WRITE_COST);
  await authed(channelId, `${YT_BASE}/videos?part=snippet`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: videoId, snippet: writableSnippet(live, after) }),
  });
  return { videoId, before, after };
}

export const UPDATE_COST = WRITE_COST + 1;

/**
 * Generic authorized call for the signed-in channel (playlists, comments, thumbnails, status...).
 * `units` is the documented quota cost (Inferred values in docs/INTEGRATIONS.md); it is checked against the
 * local daily cap and counted before the request is sent.
 */
export async function ownRequest<T = Obj>(
  channelId: string,
  opts: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; params?: Record<string, string | number | undefined>; body?: unknown; rawBody?: Blob; contentType?: string; units: number; base?: string },
): Promise<T> {
  const url = new URL(opts.path.startsWith('https://') ? opts.path : `${opts.base ?? YT_BASE}/${opts.path}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  await spend(opts.units);
  const init: RequestInit = { method: opts.method ?? 'GET' };
  if (opts.rawBody) {
    init.body = opts.rawBody;
    init.headers = { 'Content-Type': opts.contentType ?? opts.rawBody.type };
  } else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return (await authed(channelId, url.toString(), init)) as T;
}

/** Cached authorized GET (1 unit for Data API resources, free for Analytics). */
export function ownRead<T = Obj>(channelId: string, resource: string, params: Record<string, string | number | undefined>, ttlMs = 10 * 60_000, fresh = false): Promise<T> {
  return ownGet<T>(channelId, resource, params, ttlMs, fresh);
}
