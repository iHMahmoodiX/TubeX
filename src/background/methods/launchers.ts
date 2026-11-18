// RPC methods for In-page launchers (edge tab, top-bar buttons), the TubeX drawer and the watch-page Videolytics panel.
// Names are prefixed 'launchers.'. Arguments come from content scripts next to an untrusted page, so each is validated.
import { uncachedTags } from '../../features/ranks/service';
import { ytGet } from '../../integrations/youtube/client';
import { factsFromItem, MAX_RANK_TAGS } from '../../inpage/launch/logic';
import { all } from '../../storage/stores';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOUR = 3_600_000;

const videoId = (v: unknown): string => {
  if (typeof v !== 'string' || !VIDEO_ID.test(v)) throw new Error('bad argument');
  return v;
};
const tagList = (v: unknown): string[] => {
  if (!Array.isArray(v) || !v.length || v.length > MAX_RANK_TAGS) throw new Error('bad argument');
  return v.map((x) => {
    if (typeof x !== 'string' || !x.trim() || x.length > 100) throw new Error('bad argument');
    return x.trim();
  });
};

export const launchersMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /**
   * Best-practice facts for one video: { maxres, caption, definition } or null when YouTube does not return it.
   * Same request (and cache entry) as yt.videos for one id, so usually 0 units; otherwise 1 unit.
   */
  'launchers.videoFacts': async (id: unknown) => {
    const vid = videoId(id);
    const r = await ytGet<{ items?: unknown[] }>('videos', { part: 'snippet,statistics,contentDetails', id: vid, maxResults: 50 }, 6 * HOUR);
    const item = (Array.isArray(r.data?.items) ? r.data.items : []).find((x) => (x as { id?: unknown })?.id === vid);
    return factsFromItem(item);
  },

  /** How many of these tags would cost search units now (not checked in the last 24 h). No units spent. */
  'launchers.uncachedTags': async (tags: unknown) => (await uncachedTags(tagList(tags))).length,

  /** Latest alerts for the drawer (newest first, at most 30). */
  'launchers.alerts': async () =>
    (await all('alerts'))
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30)
      .map((a) => ({ id: a.id, at: a.at, kind: a.kind, title: a.title.slice(0, 200), body: a.body.slice(0, 500), url: a.url && /^https:\/\//.test(a.url) ? a.url : undefined, read: a.read })),
};
