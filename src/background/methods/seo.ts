// RPC methods for the seo area. Names are prefixed 'seo.'. Arguments are validated: callers include
// content scripts running next to untrusted pages.
import { parseVideoInput } from '../../domain/seo';
import { checkRank, createRankTracker, tagRanks } from '../../features/ranks/service';
import { loadKeyword } from '../../features/research/keywordData';
import { loadGoogleState } from '../../integrations/google/auth';
import { getVideos } from '../../integrations/youtube/api';

const str = (v: unknown, max: number): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('bad argument');
  return v.trim();
};
const videoId = (v: unknown): string => {
  const id = parseVideoInput(str(v, 300));
  if (!id) throw new Error('bad argument');
  return id;
};

export const seoMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /**
   * Keyword score estimate for a keyword: { score, parts, sampleSize, fetchedAt }.
   * Uses the cached search sample when present (24 h); otherwise about 102 units.
   */
  'seo.keywordScore': async (keyword: unknown) => {
    const k = str(keyword, 200);
    const d = await loadKeyword(k);
    return { score: d.score.score, parts: d.score.parts, sampleSize: d.score.sampleSize, fetchedAt: d.sample.fetchedAt, fromCache: d.sample.fromCache };
  },

  /**
   * Search position of a video for each tag: [{ tag, position|null, top, fromCache, checkedAt }].
   * Expensive: 100 units per tag not checked in the last 24 h. The caller must ask the user first.
   */
  'seo.tagRanks': async (video: unknown, tags: unknown) => {
    const id = videoId(video);
    if (!Array.isArray(tags) || !tags.length || tags.length > 30) throw new Error('bad argument');
    return tagRanks(
      id,
      tags.map((x) => str(x, 100)),
    );
  },

  /**
   * Creates (or returns the existing) rank tracker for a keyword, for one video when `videoId` is given,
   * otherwise for the signed-in channel. Does not check right away (no units spent); the daily tick does.
   */
  'seo.trackKeyword': async (keyword: unknown, video?: unknown) => {
    const k = str(keyword, 200);
    if (video !== undefined && video !== null && video !== '') {
      const id = videoId(video);
      const v = (await getVideos([id]).catch(() => ({ data: [] }))).data[0];
      return createRankTracker({ keyword: k, videoId: id, targetTitle: v?.title });
    }
    const g = await loadGoogleState();
    const ch = g.channels.find((c) => c.channelId === g.activeChannelId);
    if (!ch) throw new Error('not signed in');
    return createRankTracker({ keyword: k, channelId: ch.channelId, targetTitle: ch.title });
  },

  /** Checks one rank tracker now (101 units). */
  'seo.checkRank': async (trackerId: unknown) => checkRank(str(trackerId, 64)),
};
