// Read helpers for SEO features (keyword score, rank tracking, tag rankings, brand alerts, leaderboard,
// language analysis). Built on ytGet / ownRead so the local daily cap, caching and the OAuth fallback apply.
// Parameters mirror those in api.ts / own.ts where possible so both share cached responses.
import { parseSearchItems } from '../../domain/seo';
import { cacheGet, hashKey } from '../../storage/cache';
import { loadIntegrations } from '../../storage/integrations';
import { ownRead, report, type Report } from '../google/own';
import { toChannel, toVideo, type ChannelInfo, type VideoInfo } from './api';
import { ytGet } from './client';

const HOUR = 3600_000;

export type SearchHit = ReturnType<typeof parseSearchItems>[number];

export interface SearchOpts {
  max?: number;
  order?: 'relevance' | 'date' | 'viewCount';
  publishedAfter?: string;
  fresh?: boolean;
  ttlMs?: number;
}

async function searchParams(query: string, opts: SearchOpts): Promise<Record<string, string | number | undefined>> {
  const { youtube } = await loadIntegrations();
  return {
    part: 'snippet',
    type: 'video',
    q: query.trim(),
    maxResults: Math.min(opts.max ?? 50, 50),
    order: opts.order ?? 'relevance',
    regionCode: youtube.region,
    relevanceLanguage: youtube.language,
    publishedAfter: opts.publishedAfter,
  };
}

/** One search.list page (100 units, Inferred), parsed into video hits in result order. */
export async function searchTop(query: string, opts: SearchOpts = {}): Promise<{ items: SearchHit[]; fetchedAt: string; fromCache: boolean; region: string; language: string }> {
  const params = await searchParams(query, opts);
  const r = await ytGet<unknown>('search', params, opts.ttlMs ?? 24 * HOUR, { fresh: opts.fresh });
  return { items: parseSearchItems(r.data), fetchedAt: r.fetchedAt, fromCache: r.fromCache, region: String(params.regionCode), language: String(params.relevanceLanguage) };
}

/** True when a searchTop() call with these options would be answered from the local cache (costs nothing). */
export async function isSearchCached(query: string, opts: SearchOpts = {}): Promise<boolean> {
  const params = await searchParams(query, opts);
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') clean[k] = String(v);
  return !!(await cacheGet(await hashKey(['yt', 'search', Object.entries(clean).sort()])));
}

type Obj = Record<string, any>;
const items = (d: unknown): Obj[] => (Array.isArray((d as Obj | null)?.items) ? ((d as Obj).items as Obj[]) : []);

export interface ChannelMeta extends ChannelInfo {
  defaultLanguage?: string;
}

/** Channels by id, 50 per call (1 unit each call). Missing channels are left out. */
export async function getChannels(ids: string[], fresh = false): Promise<Record<string, ChannelMeta>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: Record<string, ChannelMeta> = {};
  for (let i = 0; i < unique.length; i += 50) {
    const r = await ytGet<unknown>('channels', { part: 'snippet,statistics,contentDetails', id: unique.slice(i, i + 50).join(','), maxResults: 50 }, 12 * HOUR, { fresh });
    for (const it of items(r.data)) out[String(it.id)] = { ...toChannel(it), defaultLanguage: it.snippet?.defaultLanguage || undefined };
  }
  return out;
}

export interface VideoMeta extends VideoInfo {
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
}

const toMeta = (it: Obj): VideoMeta => ({ ...toVideo(it), defaultLanguage: it.snippet?.defaultLanguage || undefined, defaultAudioLanguage: it.snippet?.defaultAudioLanguage || undefined });

/** Public videos with their declared languages (same request as getVideos, so cached together). 1 unit per 50. */
export async function videosMeta(ids: string[], fresh = false): Promise<VideoMeta[]> {
  const unique = [...new Set(ids)];
  const out: VideoMeta[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const r = await ytGet<unknown>('videos', { part: 'snippet,statistics,contentDetails', id: chunk.join(','), maxResults: 50 }, 6 * HOUR, { fresh });
    const byId = new Map(items(r.data).map((it) => [String(it.id), toMeta(it)]));
    for (const id of chunk) {
      const v = byId.get(id);
      if (v) out.push(v);
    }
  }
  return out;
}

/** The signed-in channel's uploads with declared languages (same requests as ownVideos, so cached together). */
export async function ownVideosMeta(channelId: string, uploadsPlaylistId: string, max = 50, fresh = false): Promise<(VideoMeta & { privacy: string })[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await ownRead<Obj>(channelId, 'playlistItems', { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 50, pageToken }, 30 * 60_000, fresh);
    for (const i of r.items ?? []) if (i.contentDetails?.videoId) ids.push(i.contentDetails.videoId);
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < max);
  const out: (VideoMeta & { privacy: string })[] = [];
  for (let i = 0; i < Math.min(ids.length, max); i += 50) {
    const r = await ownRead<Obj>(channelId, 'videos', { part: 'snippet,statistics,contentDetails,status', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, 30 * 60_000, fresh);
    for (const it of r.items ?? []) out.push({ ...toMeta(it), privacy: String(it.status?.privacyStatus ?? '') });
  }
  return out.slice(0, max);
}

/** The signed-in channel's own record, including its default language (1 unit, cached 1 h). */
export async function ownChannelMeta(channelId: string, fresh = false): Promise<ChannelMeta | null> {
  const r = await ownRead<Obj>(channelId, 'channels', { part: 'snippet,statistics,contentDetails', mine: 'true' }, HOUR, fresh);
  const it = items(r)[0];
  return it ? { ...toChannel(it), defaultLanguage: it.snippet?.defaultLanguage || undefined } : null;
}

const isoDay = (offsetDays: number) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

export interface SearchTerm {
  term: string;
  views: number;
  minutes: number;
}

/** The channel's real YouTube search terms (YouTube Analytics, free of Data API units). */
export async function ownSearchTerms(channelId: string, days: number, fresh = false): Promise<SearchTerm[]> {
  const r: Report = await report(
    channelId,
    {
      startDate: isoDay(days),
      endDate: isoDay(0),
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'insightTrafficSourceDetail',
      filters: 'insightTrafficSourceType==YT_SEARCH',
      sort: '-views',
      maxResults: 25,
    },
    fresh,
  );
  const ti = r.columns.indexOf('insightTrafficSourceDetail');
  const vi = r.columns.indexOf('views');
  const mi = r.columns.indexOf('estimatedMinutesWatched');
  return r.rows.map((row) => ({ term: String(row[ti < 0 ? 0 : ti]), views: Number(row[vi < 0 ? 1 : vi]), minutes: Number(row[mi < 0 ? 2 : mi]) })).filter((x) => x.term);
}
