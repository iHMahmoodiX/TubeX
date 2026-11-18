// Typed helpers over the YouTube Data API. Normalizes responses into small, display-ready records.
import { loadIntegrations } from '../../storage/integrations';
import { ytGet, type YtResult } from './client';

const HOUR = 3600_000;
const TTL = { video: 6 * HOUR, channel: 12 * HOUR, search: 24 * HOUR, uploads: 3 * HOUR, popular: 3 * HOUR, categories: 7 * 24 * HOUR };

export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  tags: string[];
  categoryId?: string;
  durationSec: number;
  language?: string;
  thumbnail?: string;
  /** Public counters. Undefined when the owner hid them. */
  views?: number;
  likes?: number;
  comments?: number;
}

export interface ChannelInfo {
  id: string;
  title: string;
  handle: string;
  description: string;
  publishedAt: string;
  country?: string;
  thumbnail?: string;
  subscribers?: number;
  views?: number;
  videoCount?: number;
  uploadsPlaylistId?: string;
}

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {});
const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const n = (v: unknown): number | undefined => {
  const x = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : undefined;
};
const thumb = (snippet: Obj): string | undefined => {
  const t = o(snippet.thumbnails);
  return s(o(t.medium).url) || s(o(t.high).url) || s(o(t.default).url) || undefined;
};

/** Parses ISO 8601 durations like PT1H2M3S. */
export function parseIsoDuration(d: string): number {
  const m = d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

export function toVideo(item: unknown): VideoInfo {
  const it = o(item);
  const sn = o(it.snippet);
  const st = o(it.statistics);
  return {
    id: s(it.id),
    title: s(sn.title),
    description: s(sn.description),
    channelId: s(sn.channelId),
    channelTitle: s(sn.channelTitle),
    publishedAt: s(sn.publishedAt),
    tags: Array.isArray(sn.tags) ? sn.tags.filter((x): x is string => typeof x === 'string') : [],
    categoryId: s(sn.categoryId) || undefined,
    durationSec: parseIsoDuration(s(o(it.contentDetails).duration)),
    language: s(sn.defaultAudioLanguage) || s(sn.defaultLanguage) || undefined,
    thumbnail: thumb(sn),
    views: n(st.viewCount),
    likes: n(st.likeCount),
    comments: n(st.commentCount),
  };
}

export function toChannel(item: unknown): ChannelInfo {
  const it = o(item);
  const sn = o(it.snippet);
  const st = o(it.statistics);
  return {
    id: s(it.id),
    title: s(sn.title),
    handle: s(sn.customUrl),
    description: s(sn.description),
    publishedAt: s(sn.publishedAt),
    country: s(sn.country) || undefined,
    thumbnail: thumb(sn),
    subscribers: st.hiddenSubscriberCount === true ? undefined : n(st.subscriberCount),
    views: n(st.viewCount),
    videoCount: n(st.videoCount),
    uploadsPlaylistId: s(o(o(it.contentDetails).relatedPlaylists).uploads) || undefined,
  };
}

const items = (data: unknown): unknown[] => (Array.isArray(o(data).items) ? (o(data).items as unknown[]) : []);

export async function getVideos(ids: string[], fresh = false): Promise<YtResult<VideoInfo[]>> {
  const unique = [...new Set(ids)].slice(0, 50);
  if (!unique.length) return { data: [], fromCache: true, fetchedAt: new Date().toISOString() };
  const r = await ytGet<unknown>('videos', { part: 'snippet,statistics,contentDetails', id: unique.join(','), maxResults: 50 }, TTL.video, { fresh });
  const byId = new Map(items(r.data).map((i) => [s(o(i).id), toVideo(i)]));
  return { ...r, data: unique.map((id) => byId.get(id)).filter((v): v is VideoInfo => !!v) };
}

export async function getChannel(ref: { id?: string; handle?: string }, fresh = false): Promise<YtResult<ChannelInfo | null>> {
  const params = ref.id ? { id: ref.id } : { forHandle: (ref.handle ?? '').replace(/^@?/, '@') };
  const r = await ytGet<unknown>('channels', { part: 'snippet,statistics,contentDetails', ...params }, TTL.channel, { fresh });
  const first = items(r.data)[0];
  return { ...r, data: first ? toChannel(first) : null };
}

export interface SearchSample {
  query: string;
  region: string;
  language: string;
  order: 'relevance' | 'date' | 'viewCount';
  publishedAfter?: string;
  videos: VideoInfo[];
  fetchedAt: string;
  fromCache: boolean;
}

/** One search page (100 units, Inferred) plus one videos call for statistics (1 unit). */
export async function searchSample(
  query: string,
  opts: { order?: SearchSample['order']; publishedAfterDays?: number; max?: number; fresh?: boolean } = {},
): Promise<SearchSample> {
  const { youtube } = await loadIntegrations();
  const order = opts.order ?? 'relevance';
  const publishedAfter = opts.publishedAfterDays
    ? new Date(Math.floor(Date.now() / (24 * HOUR)) * 24 * HOUR - opts.publishedAfterDays * 24 * HOUR).toISOString()
    : undefined;
  const r = await ytGet<unknown>(
    'search',
    {
      part: 'snippet',
      type: 'video',
      q: query.trim(),
      maxResults: Math.min(opts.max ?? 25, 50),
      order,
      regionCode: youtube.region,
      relevanceLanguage: youtube.language,
      publishedAfter,
    },
    TTL.search,
    { fresh: opts.fresh },
  );
  const ids = items(r.data)
    .map((i) => s(o(o(i).id).videoId))
    .filter(Boolean);
  const v = await getVideos(ids, opts.fresh);
  return { query: query.trim(), region: youtube.region, language: youtube.language, order, publishedAfter, videos: v.data, fetchedAt: r.fetchedAt, fromCache: r.fromCache };
}

/** Latest uploads of a channel through its uploads playlist (1 unit + 1 for statistics). */
export async function channelUploads(uploadsPlaylistId: string, max = 15, fresh = false): Promise<YtResult<VideoInfo[]>> {
  const r = await ytGet<unknown>('playlistItems', { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: Math.min(max, 50) }, TTL.uploads, { fresh });
  const ids = items(r.data)
    .map((i) => s(o(o(i).contentDetails).videoId))
    .filter(Boolean);
  const v = await getVideos(ids, fresh);
  return { ...r, data: v.data };
}

export async function mostPopular(categoryId?: string, fresh = false): Promise<YtResult<VideoInfo[]>> {
  const { youtube } = await loadIntegrations();
  const r = await ytGet<unknown>(
    'videos',
    { part: 'snippet,statistics,contentDetails', chart: 'mostPopular', regionCode: youtube.region, videoCategoryId: categoryId, maxResults: 25 },
    TTL.popular,
    { fresh },
  );
  return { ...r, data: items(r.data).map(toVideo) };
}

export async function videoCategories(): Promise<YtResult<{ id: string; title: string }[]>> {
  const { youtube } = await loadIntegrations();
  const r = await ytGet<unknown>('videoCategories', { part: 'snippet', regionCode: youtube.region, hl: youtube.language }, TTL.categories);
  return {
    ...r,
    data: items(r.data)
      .filter((i) => o(o(i).snippet).assignable !== false)
      .map((i) => ({ id: s(o(i).id), title: s(o(o(i).snippet).title) })),
  };
}

export interface CommentInfo {
  id: string;
  author: string;
  text: string;
  likes: number;
  replies: number;
  publishedAt: string;
}

/** Top-level public comments of a video, newest first (1 unit per 100, Inferred). */
export async function videoComments(videoId: string, max = 500): Promise<{ comments: CommentInfo[]; disabled: boolean }> {
  const comments: CommentInfo[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const r = await ytGet<unknown>('commentThreads', { part: 'snippet', videoId, maxResults: 100, order: 'time', textFormat: 'plainText', pageToken }, TTL.uploads);
      for (const i of items(r.data)) {
        const top = o(o(o(i).snippet).topLevelComment);
        const sn = o(top.snippet);
        comments.push({
          id: s(top.id),
          author: s(sn.authorDisplayName),
          text: s(sn.textDisplay) || s(sn.textOriginal),
          likes: n(sn.likeCount) ?? 0,
          replies: n(o(o(i).snippet).totalReplyCount) ?? 0,
          publishedAt: s(sn.publishedAt),
        });
      }
      pageToken = s(o(r.data).nextPageToken) || undefined;
    } while (pageToken && comments.length < max);
  } catch (e) {
    // Comments turned off on the video come back as 403 commentsDisabled.
    if ((e as { detail?: string }).detail?.includes('commentsDisabled')) return { comments, disabled: true };
    throw e;
  }
  return { comments: comments.slice(0, max), disabled: false };
}

/** Every upload of a channel up to `max` (1 unit per 50 for the list, 1 per 50 for statistics). */
export async function allUploads(uploadsPlaylistId: string, max = 500): Promise<VideoInfo[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const r = await ytGet<unknown>('playlistItems', { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 50, pageToken }, TTL.uploads);
    ids.push(...items(r.data).map((i) => s(o(o(i).contentDetails).videoId)).filter(Boolean));
    pageToken = s(o(r.data).nextPageToken) || undefined;
  } while (pageToken && ids.length < max);
  const out: VideoInfo[] = [];
  for (let i = 0; i < Math.min(ids.length, max); i += 50) out.push(...(await getVideos(ids.slice(i, i + 50))).data);
  return out;
}

/** Thumbnail image URLs YouTube serves for a video (maxres may not exist for older videos). */
export function thumbnailUrls(videoId: string): { label: string; url: string }[] {
  return [
    { label: '1280×720', url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` },
    { label: '480×360', url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` },
    { label: '320×180', url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` },
  ];
}
