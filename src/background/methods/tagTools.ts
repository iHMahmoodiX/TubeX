// RPC methods for Studio video details: tag tools woven into Studio's Tags field. Arguments from content scripts
// are validated. Names are prefixed 'tagTools.'. Methods that spend Data API units say so; the islands show the
// cost and ask before calling them.
import { tagsFromVideos } from '../../domain/inpage';
import { commonTags } from '../../domain/research';
import { parseVideoInput, relatedTerms } from '../../domain/seo';
import { loadKeyword } from '../../features/research/keywordData';
import { uncachedTags } from '../../features/ranks/service';
import { loadGoogleState } from '../../integrations/google/auth';
import { ownVideos, report } from '../../integrations/google/own';
import { ownSearchTerms } from '../../integrations/youtube/seoApi';
import { cacheGet, hashKey } from '../../storage/cache';
import { loadIntegrations } from '../../storage/integrations';

const str = (v: unknown, max: number): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('bad argument');
  return v.trim();
};
const strs = (v: unknown, n: number, max = 100): string[] => {
  if (!Array.isArray(v) || v.length > n) throw new Error('bad argument');
  return v.map((x) => str(x, max));
};
const videoId = (v: unknown): string => {
  const id = parseVideoInput(str(v, 300));
  if (!id) throw new Error('bad argument');
  return id;
};

async function activeChannel() {
  const g = await loadGoogleState();
  return g.channels.find((c) => c.channelId === g.activeChannelId) ?? null;
}

/** True when loadKeyword(q) would answer its search from the 24 h cache (same parameters as searchSample). */
async function sampleCached(q: string): Promise<boolean> {
  const { youtube } = await loadIntegrations();
  const params: Record<string, string | number | undefined> = {
    part: 'snippet',
    type: 'video',
    q: q.trim(),
    maxResults: 25,
    order: 'relevance',
    regionCode: youtube.region,
    relevanceLanguage: youtube.language,
  };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') clean[k] = String(v);
  return !!(await cacheGet(await hashKey(['yt', 'search', Object.entries(clean).sort()])));
}

const isoDay = (offsetDays: number) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

export const tagToolsMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /** Which keywords are already researched (search cached 24 h, so research costs about nothing). No units. */
  'tagTools.cached': async (keywords: unknown) => Promise.all(strs(keywords, 80, 200).map(sampleCached)),

  /** Tags whose rank check would cost units now (not in the 24 h search cache). No units. */
  'tagTools.rankCost': async (tags: unknown) => ({ uncached: await uncachedTags(strs(tags, 120)) }),

  /**
   * Keyword research for one keyword: score with its parts, related terms and the top results' tags (for
   * recommended tags). About 102 units on a cold cache (search 100 + videos 1 + channels 1), nothing when cached.
   */
  'tagTools.research': async (keyword: unknown) => {
    const k = str(keyword, 200);
    const d = await loadKeyword(k);
    const videos = d.sample.videos;
    const p = d.score.parts;
    return {
      keyword: k,
      score: d.score.score,
      parts: { competition: p.competition.score, demand: p.demand.score, chance: p.chance.score },
      sampleSize: d.score.sampleSize,
      fetchedAt: d.sample.fetchedAt,
      fromCache: d.sample.fromCache,
      related: relatedTerms(k, [commonTags(videos, 2, 40).map((f) => f.term), commonTags(videos, 1, 60).map((f) => f.term)], 24),
      topTags: tagsFromVideos(videos, [], 120),
      ownPositions: p.chance.myPositions,
    };
  },

  /**
   * The owner's own YouTube search terms (Analytics, no Data API units): channel-wide and for this video, last
   * 90 days, top 25 each (the API's limit for this report). The video part is null when Analytics refuses it.
   */
  'tagTools.searchTerms': async (video: unknown) => {
    const id = videoId(video);
    const ch = await activeChannel();
    if (!ch) throw new Error('not signed in');
    const channel = await ownSearchTerms(ch.channelId, 90);
    let forVideo: { term: string; views: number }[] | null = null;
    try {
      const r = await report(ch.channelId, {
        startDate: isoDay(90),
        endDate: isoDay(0),
        metrics: 'views',
        dimensions: 'insightTrafficSourceDetail',
        filters: `video==${id};insightTrafficSourceType==YT_SEARCH`,
        sort: '-views',
        maxResults: 25,
      });
      const ti = r.columns.indexOf('insightTrafficSourceDetail');
      const vi = r.columns.indexOf('views');
      forVideo = r.rows.map((row) => ({ term: String(row[ti < 0 ? 0 : ti] ?? ''), views: Number(row[vi < 0 ? 1 : vi]) })).filter((x) => x.term && Number.isFinite(x.views));
    } catch {
      forVideo = null;
    }
    return { channel: channel.map((x) => ({ term: x.term, views: x.views })), video: forVideo, days: 90 };
  },

  /**
   * The signed-in channel's uploads, newest first (video switcher, import from another video). About 2 units per
   * 50 videos, cached 30 min.
   */
  'tagTools.ownVideos': async (max?: unknown) => {
    const n = typeof max === 'number' && Number.isFinite(max) ? Math.max(1, Math.min(200, Math.floor(max))) : 50;
    const ch = await activeChannel();
    if (!ch) throw new Error('not signed in');
    if (!ch.uploadsPlaylistId) return { channelId: ch.channelId, videos: [] };
    const list = await ownVideos(ch.channelId, ch.uploadsPlaylistId, n);
    return {
      channelId: ch.channelId,
      videos: list.slice(0, n).map((v) => ({ id: v.id, title: v.title, thumbnail: v.thumbnail, publishedAt: v.publishedAt, privacy: v.privacy, tags: v.tags.slice(0, 120) })),
    };
  },
};
