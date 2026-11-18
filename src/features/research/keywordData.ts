// Loads everything the keyword score needs: the search sample (cached 24 h), channel sizes of the results and
// the owner's channel(s). Shared by the Research page and the seo.keywordScore RPC method.
import { keywordScore, type KeywordScore } from '../../domain/seo';
import { loadGoogleState } from '../../integrations/google/auth';
import { searchSample, type SearchSample } from '../../integrations/youtube/api';
import { getChannels, type ChannelMeta } from '../../integrations/youtube/seoApi';

export interface KeywordData {
  sample: SearchSample;
  channels: Record<string, ChannelMeta>;
  score: KeywordScore;
  /** Channel ids treated as the owner's. */
  mine: string[];
}

export interface KeywordOpts {
  order?: SearchSample['order'];
  publishedAfterDays?: number;
  fresh?: boolean;
  /** Extra channel ids to treat as the owner's (e.g. from a handle typed in the page). */
  mine?: string[];
}

/** About 102 units on a cold cache (search 100 + videos 1 + channels 1), nothing when cached. */
export async function loadKeyword(keyword: string, opts: KeywordOpts = {}): Promise<KeywordData> {
  const sample = await searchSample(keyword, { order: opts.order, publishedAfterDays: opts.publishedAfterDays, fresh: opts.fresh });
  const g = await loadGoogleState();
  const mine = [...new Set([...g.channels.map((c) => c.channelId), ...(opts.mine ?? [])])];
  const activeId = g.activeChannelId ?? mine[0];
  const channels = await getChannels([...sample.videos.map((v) => v.channelId), ...(activeId ? [activeId] : [])], opts.fresh);
  const subscribers: Record<string, number | undefined> = {};
  for (const [id, c] of Object.entries(channels)) subscribers[id] = c.subscribers;
  const score = keywordScore({
    keyword,
    videos: sample.videos,
    subscribers,
    mine: mine.length ? { channelIds: mine, subscribers: activeId ? channels[activeId]?.subscribers : undefined } : undefined,
  });
  return { sample, channels, score, mine };
}
