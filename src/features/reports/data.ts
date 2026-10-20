// Data loaders for Reports and Home. Reads go through ownRead/report (cached, counted against the local
// daily unit cap). Uploads use the same requests as ownVideos, so both share one cache entry.
import { newBase, type Draft } from '../../domain/models';
import { firstValue, healthScore, periods, type Health } from '../../domain/reports';
import { auditAll, passesAudit } from '../../domain/reportsAudit';
import { firstWeekRange, sumViews } from '../../domain/reportsBestTime';
import { toShare } from '../../domain/reportsClick';
import { AuthError } from '../../integrations/google/auth';
import { report, ownRead, type OwnVideo, type Report } from '../../integrations/google/own';
import { toVideo } from '../../integrations/youtube/api';
import { cacheGet, cacheSet, hashKey } from '../../storage/cache';
import { create, list } from '../../storage/db';

type Obj = Record<string, any>;
const TTL = 30 * 60_000;

export interface RVideo extends OwnVideo {
  /** contentDetails.caption ("true"/"false"); null when the API did not say. */
  caption: boolean | null;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  /** 'none' for regular uploads, 'upcoming'/'live' for streams and premieres. */
  live?: string;
  /** Scheduled publish time of a private video, if any. */
  publishAt?: string;
}

export function toRVideo(it: Obj): RVideo {
  const cap = it.contentDetails?.caption;
  return {
    ...toVideo(it),
    privacy: String(it.status?.privacyStatus ?? ''),
    caption: cap === 'true' ? true : cap === 'false' ? false : null,
    defaultLanguage: it.snippet?.defaultLanguage || undefined,
    defaultAudioLanguage: it.snippet?.defaultAudioLanguage || undefined,
    live: it.snippet?.liveBroadcastContent || undefined,
    publishAt: it.status?.publishAt || undefined,
  };
}

/** Every upload (public, unlisted, private) newest first. Cost: 1 unit per 50 videos for the playlist + 1 per 50 for details. */
export async function loadOwnVideos(channelId: string, uploadsPlaylistId: string, fresh = false, max = 500): Promise<RVideo[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await ownRead<Obj>(channelId, 'playlistItems', { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 50, pageToken }, TTL, fresh);
    for (const i of r.items ?? []) if (i.contentDetails?.videoId) ids.push(i.contentDetails.videoId);
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < max);
  const out: RVideo[] = [];
  for (let i = 0; i < Math.min(ids.length, max); i += 50) {
    const r = await ownRead<Obj>(channelId, 'videos', { part: 'snippet,statistics,contentDetails,status', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, TTL, fresh);
    for (const it of r.items ?? []) out.push(toRVideo(it));
  }
  return out;
}

export interface ChannelStats {
  subscribers?: number;
  views?: number;
  videoCount?: number;
  hiddenSubscribers: boolean;
}

/** Public channel counters (1 unit, cached for an hour). */
export async function loadChannelStats(channelId: string, fresh = false): Promise<ChannelStats> {
  const r = await ownRead<Obj>(channelId, 'channels', { part: 'statistics', id: channelId }, 3600_000, fresh);
  const s = r.items?.[0]?.statistics ?? {};
  const n = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  return { subscribers: s.hiddenSubscriberCount ? undefined : n(s.subscriberCount), views: n(s.viewCount), videoCount: n(s.videoCount), hiddenSubscribers: !!s.hiddenSubscriberCount };
}

/**
 * Views in a video's first 7 days. Complete weeks never change, so the sum is cached for 60 days under its
 * own key (Analytics reads cost no Data API units, but each is a request).
 */
export async function firstWeekViews(channelId: string, videoId: string, publishedAt: string, fresh = false): Promise<number | null> {
  const range = firstWeekRange(publishedAt);
  if (!range) return null;
  const key = await hashKey(['reports-first-week', channelId, videoId, range.startDate]);
  if (!fresh) {
    const hit = await cacheGet<number | null>(key);
    if (hit) return hit.value;
  }
  const r = await report(channelId, { ...range, metrics: 'views', dimensions: 'day', filters: `video==${videoId}`, sort: 'day' }, fresh);
  const v = sumViews(r) ?? 0;
  await cacheSet(key, v, 60 * 24 * 3600_000);
  return v;
}

/** Focus keywords of TubeX drafts linked to a published video (draft.source.videoId). */
export async function draftKeywords(): Promise<Map<string, string>> {
  const { items } = await list('drafts');
  const m = new Map<string, string>();
  for (const d of items) if (d.source?.videoId && d.focusKeyword.trim()) m.set(d.source.videoId, d.focusKeyword.trim());
  return m;
}

/** Copies a published video's metadata into a new local draft. */
export async function videoToDraft(v: { id: string; title: string; description: string; tags: string[] }): Promise<Draft> {
  return create('drafts', {
    ...newBase(),
    language: /[؀-ۿ]/.test(v.title) ? 'fa' : 'en',
    focusKeyword: '',
    title: v.title,
    description: v.description,
    tags: v.tags,
    source: { kind: 'watch', url: `https://www.youtube.com/watch?v=${v.id}`, videoId: v.id, title: v.title, capturedAt: new Date().toISOString(), origin: 'url' },
  });
}

export const studioUrl = (id: string) => `https://studio.youtube.com/video/${encodeURIComponent(id)}/edit`;
export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

export type { Report };

// ---------------------------------------------------------------- health

export const TOTAL_METRICS = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares';

/**
 * Channel-wide thumbnail CTR for a period, or null when the API rejects these metrics (their availability
 * through the Analytics API is Inferred, not verified). Sign-in errors are rethrown.
 */
export async function tryCtr(channelId: string, range: { startDate: string; endDate: string }, fresh = false): Promise<{ ctr: number | null; impressions: number | null; error?: unknown }> {
  try {
    const r = await report(channelId, { ...range, metrics: 'videoThumbnailImpressions,videoThumbnailImpressionsClickRate' }, fresh);
    const imp = firstValue(r, 'videoThumbnailImpressions');
    const rate = firstValue(r, 'videoThumbnailImpressionsClickRate');
    return { impressions: imp, ctr: rate === null ? null : toShare([rate])[0]! };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return { ctr: null, impressions: null, error };
  }
}

export interface HealthData {
  health: Health;
  ctrError?: unknown;
  audited: number;
  computedAt: string;
}

/** Everything the Health report needs, computed from cached reads. Used by the page and the daily snapshot job. */
export async function computeHealth(channelId: string, videos: RVideo[], fresh = false, now = Date.now()): Promise<HealthData> {
  const p = periods(28, now);
  const [cur, prev, ctr, keywords] = await Promise.all([
    report(channelId, { ...p.cur, metrics: TOTAL_METRICS }, fresh),
    report(channelId, { ...p.prev, metrics: 'views' }, fresh),
    tryCtr(channelId, p.cur, fresh),
    draftKeywords().catch(() => new Map<string, string>()),
  ]);
  const pub = videos.filter((v) => v.privacy === 'public');
  const audits = auditAll(pub.map((v) => ({ ...v, keyword: keywords.get(v.id) })));
  const health = healthScore({
    now,
    uploads: pub.map((v) => v.publishedAt),
    views28: firstValue(cur, 'views'),
    viewsPrev28: firstValue(prev, 'views'),
    likes28: firstValue(cur, 'likes'),
    comments28: firstValue(cur, 'comments'),
    shares28: firstValue(cur, 'shares'),
    minutes28: firstValue(cur, 'estimatedMinutesWatched'),
    avgViewPercent: firstValue(cur, 'averageViewPercentage'),
    subsGained28: firstValue(cur, 'subscribersGained'),
    subsLost28: firstValue(cur, 'subscribersLost'),
    auditPassShare: audits.length ? audits.filter(passesAudit).length / audits.length : null,
    ctr: ctr.ctr,
  });
  return { health, ctrError: ctr.error, audited: audits.length, computedAt: new Date(now).toISOString() };
}

export const healthRef = (channelId: string) => `reports.health:${channelId}`;
export const healthTrackerId = (channelId: string) => `reports.health:${channelId}`;
