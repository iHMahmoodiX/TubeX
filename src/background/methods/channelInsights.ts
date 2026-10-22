// RPC methods for the YouTube channel page: Channelytics section and Channel Insights (niche). Names are prefixed 'ci.'.
// Arguments come from content scripts running next to an untrusted page, so each one is validated.
//
// Data sources (all official): channels.list (snippet, statistics, contentDetails, brandingSettings; 1 unit, cached 12 h),
// the uploads playlist + videos.list (2 units per 50 uploads, cached 3–6 h), YouTube Analytics for the owner's own
// channels (free of Data API units), and TubeX's own daily snapshots in the 'snapshots' work store.
import {
  growthFromAnalytics,
  growthFromSnapshots,
  parseChannelKeywords,
  snapPoints,
  UPLOADS_DEFAULT,
  UPLOADS_MAX,
  type Growth,
  type SnapPoint,
} from '../../domain/channelInsights';
import { periods } from '../../domain/reports';
import { addWatched } from '../../features/competitors/watchActions';
import { nicheChannels, nicheRef } from '../../features/ranks/service';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { loadGoogleState } from '../../integrations/google/auth';
import { report } from '../../integrations/google/own';
import { allUploads, getChannel, toChannel, type ChannelInfo, type VideoInfo } from '../../integrations/youtube/api';
import { ytGet } from '../../integrations/youtube/client';
import { list, put as putRecord, remove } from '../../storage/db';
import { history, one, put, snapshot } from '../../storage/stores';

export const ciRef = (channelId: string) => `ci:${channelId}`;
export const CI_SEEN = 'ci:seen';
export const CI_SETTINGS = 'ci:settings';
const CI_REMOVED = 'ci:removed';
/** Channels visited on YouTube are snapshotted daily for this long after the last visit (so their growth becomes real). */
export const SEEN_KEEP_DAYS = 21;
export const SEEN_MAX = 30;

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const id = (v: unknown): string => {
  if (typeof v !== 'string' || !CHANNEL_ID.test(v)) throw new Error('bad argument');
  return v;
};
const str = (v: unknown, max = 200): string => {
  if (typeof v !== 'string' || !v || v.length > max) throw new Error('bad argument');
  return v;
};
const ref = (v: unknown): { id?: string; handle?: string } => {
  const r = (typeof v === 'object' && v !== null ? v : {}) as { id?: unknown; handle?: unknown };
  if (r.id) return { id: id(r.id) };
  if (r.handle) return { handle: str(r.handle, 120) };
  throw new Error('bad argument');
};

export interface SeenChannel {
  channelId: string;
  title: string;
  seenAt: string;
}

/** Remembers a visited channel so the daily tick keeps snapshotting it for a while. */
export async function markSeen(ch: { id: string; title: string }, now = new Date()): Promise<void> {
  const t = await one('trackers', CI_SEEN);
  const prev = ((t?.config.channels as SeenChannel[] | undefined) ?? []).filter((c) => c.channelId !== ch.id);
  const keepFrom = now.getTime() - SEEN_KEEP_DAYS * 86_400_000;
  const channels = [{ channelId: ch.id, title: ch.title, seenAt: now.toISOString() }, ...prev.filter((c) => Date.parse(c.seenAt) >= keepFrom)].slice(0, SEEN_MAX);
  await put('trackers', { id: CI_SEEN, kind: 'ci-seen', label: 'channel insights: visited channels', config: { channels }, createdAt: t?.createdAt ?? now.toISOString(), enabled: true, lastCheckedAt: t?.lastCheckedAt });
}

export async function seenChannels(now = Date.now()): Promise<SeenChannel[]> {
  const t = await one('trackers', CI_SEEN);
  return ((t?.config.channels as SeenChannel[] | undefined) ?? []).filter((c) => Date.parse(c.seenAt) >= now - SEEN_KEEP_DAYS * 86_400_000);
}

export function snapshotData(ch: ChannelInfo): Record<string, unknown> {
  return { title: ch.title, thumbnail: ch.thumbnail, subscribers: ch.subscribers, views: ch.views, videoCount: ch.videoCount };
}

/** Daily points of a channel from both TubeX snapshot series: the niche leaderboard's and Channel Insights' own. */
export async function channelHistory(channelId: string): Promise<SnapPoint[]> {
  const [a, b] = await Promise.all([history(nicheRef(channelId)), history(ciRef(channelId))]);
  return snapPoints([...a, ...b]);
}

async function signedInChannels() {
  return (await loadGoogleState()).channels;
}

/** Own channel growth from YouTube Analytics (last 30 days) against public totals; snapshots when Analytics fails. */
async function ownGrowth(channelId: string, totals?: { views?: number; subscribers?: number }): Promise<Growth> {
  try {
    const p = periods(30).cur;
    const r = await report(channelId, { ...p, metrics: 'views,subscribersGained,subscribersLost' });
    const row = r.rows[0];
    if (row) {
      const col = (n: string) => {
        const i = r.columns.indexOf(n);
        const v = i >= 0 ? Number(row[i]) : NaN;
        return Number.isFinite(v) ? v : undefined;
      };
      const gained = col('subscribersGained');
      const lost = col('subscribersLost');
      const t = totals ?? (await getChannel({ id: channelId })).data ?? {};
      const g = growthFromAnalytics(t, { views: col('views'), subsNet: gained !== undefined && lost !== undefined ? gained - lost : undefined, days: 30, ...p });
      if (g.state === 'ok') return g;
    }
  } catch (e) {
    console.warn('[TubeX] own analytics for growth failed; using snapshots', e);
  }
  return growthFromSnapshots(await channelHistory(channelId));
}

export const channelInsightsMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /**
   * Channel details with its keywords (brandingSettings). 1 unit unless cached. Records today's snapshot (from the
   * fetched figures, dated when they were fetched) and remembers the visit for the daily tick.
   */
  'ci.channel': async (r: unknown) => {
    const q = ref(r);
    const params = q.id ? { id: q.id } : { forHandle: (q.handle ?? '').replace(/^@?/, '@') };
    const res = await ytGet<{ items?: unknown[] }>('channels', { part: 'snippet,statistics,contentDetails,brandingSettings', ...params }, 12 * 3600_000);
    const item = res.data?.items?.[0] as { brandingSettings?: { channel?: { keywords?: string } } } | undefined;
    if (!item) return { channel: null, keywords: [], fetchedAt: res.fetchedAt };
    const channel = toChannel(item);
    const keywords = parseChannelKeywords(item.brandingSettings?.channel?.keywords);
    try {
      await snapshot(ciRef(channel.id), snapshotData(channel), new Date(res.fetchedAt));
      await markSeen(channel);
    } catch (e) {
      console.warn('[TubeX] channel snapshot failed', e);
    }
    return { channel, keywords, fetchedAt: res.fetchedAt };
  },

  /** Latest uploads of a channel (default 50, at most 200). 1 unit for the channel (cached) + 2 per 50 uploads. */
  'ci.uploads': async (channelId: unknown, max?: unknown) => {
    const cid = id(channelId);
    const n = typeof max === 'number' && Number.isFinite(max) ? Math.max(1, Math.min(UPLOADS_MAX, Math.round(max))) : UPLOADS_DEFAULT;
    const ch = (await getChannel({ id: cid })).data;
    if (!ch?.uploadsPlaylistId) return [];
    const vids: VideoInfo[] = await allUploads(ch.uploadsPlaylistId, n);
    // Trim descriptions: the page only needs titles, tags and counts.
    return vids.map((v) => ({ ...v, description: '' }));
  },

  /** TubeX's daily points for a channel (free: local store). */
  'ci.history': async (channelId: unknown) => channelHistory(id(channelId)),

  /**
   * Growth of this channel, of the owner's channel (Analytics when signed in) and of every niche channel, all over the
   * latest 30 days of what is known. No YouTube units except an uncached channels.list for the owner's totals.
   */
  'ci.growth': async (channelId: unknown) => {
    const cid = id(channelId);
    const g = await loadGoogleState();
    const own = new Set(g.channels.map((c) => c.channelId));
    const you = g.channels.find((c) => c.channelId === g.activeChannelId) ?? g.channels[0];
    const self = own.has(cid) ? await ownGrowth(cid) : growthFromSnapshots(await channelHistory(cid));
    const selfPoints = await channelHistory(cid);
    const youGrowth = you ? (you.channelId === cid ? self : await ownGrowth(you.channelId)) : undefined;
    const members = [];
    for (const c of await nicheChannels()) {
      if (c.mine) continue;
      const pts = await channelHistory(c.channelId);
      const last = (await history(nicheRef(c.channelId))).at(-1)?.data ?? (await history(ciRef(c.channelId))).at(-1)?.data;
      members.push({ channelId: c.channelId, title: c.title, thumbnail: typeof last?.thumbnail === 'string' ? last.thumbnail : undefined, growth: growthFromSnapshots(pts), points: pts.length });
    }
    return {
      self,
      trackingSince: selfPoints[0]?.at,
      you: you ? { channelId: you.channelId, title: you.title, thumbnail: you.thumbnail, growth: youGrowth } : undefined,
      members,
    };
  },

  /** Daily views of one of the owner's own channels over the last 30 days (YouTube Analytics). */
  'ci.ownDaily': async (channelId: unknown) => {
    const cid = id(channelId);
    if (!(await signedInChannels()).some((c) => c.channelId === cid)) throw new Error('not signed in');
    const p = periods(30).cur;
    const r = await report(cid, { ...p, metrics: 'views', dimensions: 'day', sort: 'day' });
    const di = r.columns.indexOf('day');
    const vi = r.columns.indexOf('views');
    return { ...p, rows: r.rows.map((row) => ({ day: String(row[di]), views: Number(row[vi]) })).filter((x) => Number.isFinite(x.views)) };
  },

  /** The niche: watched channels plus the owner's own channels, with the latest snapshot of each (free). */
  'ci.niche.list': async () => {
    const out = [];
    for (const c of await nicheChannels()) {
      const pts = await channelHistory(c.channelId);
      const last = (await history(nicheRef(c.channelId))).at(-1)?.data ?? (await history(ciRef(c.channelId))).at(-1)?.data;
      out.push({ ...c, thumbnail: typeof last?.thumbnail === 'string' ? last.thumbnail : undefined, latest: pts.at(-1), since: pts[0]?.at });
    }
    return out;
  },

  /** Adds a channel to the niche (the competitor watchlist) and records its first snapshot. 1 unit unless cached. */
  'ci.niche.add': async (channelId: unknown) => {
    const ch = (await getChannel({ id: id(channelId) })).data;
    if (!ch) throw new Error('channel not found');
    const r = await addWatched(ch);
    await snapshot(ciRef(ch.id), snapshotData(ch)).catch(() => undefined);
    return { existed: r.existed };
  },

  /** Removes a channel from the niche. The removed record is kept so `ci.niche.undoRemove` can restore it with its notes. */
  'ci.niche.remove': async (channelId: unknown) => {
    const cid = id(channelId);
    const rec = (await list('watchlist')).items.find((w) => w.channelId === cid);
    if (!rec) return { removed: false };
    await put('trackers', { id: CI_REMOVED, kind: 'ci-removed', label: 'last removed niche channel', config: { record: rec }, createdAt: new Date().toISOString(), enabled: false });
    await remove('watchlist', rec.id);
    return { removed: true };
  },

  'ci.niche.undoRemove': async (channelId: unknown) => {
    const cid = id(channelId);
    const t = await one('trackers', CI_REMOVED);
    const rec = t?.config.record as { channelId?: string } | undefined;
    if (!rec || rec.channelId !== cid) return { restored: false };
    if ((await list('watchlist')).items.some((w) => w.channelId === cid)) return { restored: true };
    await putRecord('watchlist', rec as Parameters<typeof putRecord<'watchlist'>>[1]);
    return { restored: true };
  },

  /**
   * Optional AI names for topics found by the local tokenizer (uses the owner's own AI setup; cached 30 days).
   * Input: [{ key, titles }]; output: { labels: { key → short label } }.
   */
  'ci.topicLabels': async (topics: unknown, lang: unknown) => {
    if (!Array.isArray(topics) || !topics.length || topics.length > 20) throw new Error('bad argument');
    const items = topics.map((t) => {
      const o = (typeof t === 'object' && t !== null ? t : {}) as { key?: unknown; titles?: unknown };
      const titles = Array.isArray(o.titles) ? o.titles.slice(0, 6).map((x) => str(x, 200)) : [];
      return { key: str(o.key, 80), titles };
    });
    const language = lang === 'fa' ? 'Persian' : 'English';
    const res = await runAiJson({
      task: 'ci.topics.v1',
      instructions:
        `Each topic below is a keyword cluster from YouTube video titles, with sample titles. Give each a short, human topic name (2-4 words) in ${language}. ` +
        'Return {"labels": {"<key>": "<name>"}} using exactly the given keys. Do not add topics.',
      data: dataBlock('Topics', JSON.stringify(items), 8000),
      maxTokens: 800,
    });
    const labels = (res.output.labels ?? {}) as Record<string, unknown>;
    return { labels: Object.fromEntries(items.map((i) => [i.key, labels[i.key]]).filter(([, v]) => typeof v === 'string')) };
  },
};
