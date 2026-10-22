// Writes (and the reads they need) for the engage area on the signed-in channel: comment replies and
// moderation, playlists, video status (scheduled publish, sunset), thumbnails and captions. Built on
// ownRequest/ownRead, so every call is counted against the local daily cap before it is sent.
// Quota costs are the documented values (Inferred, docs/INTEGRATIONS.md).
import { toThread, type CommentReply, type CommentThread, type ModerationStatus, COMMENT_WRITE_COST } from '../../domain/engageComments';
import { PLAYLIST_WRITE_COST } from '../../domain/engagePlaylists';
import { writableStatus, type Privacy, type StatusBlock } from '../../domain/engageSchedule';
import { CAPTIONS_DOWNLOAD_COST, CAPTIONS_LIST_COST } from '../../domain/engageShorts';
import { THUMB_COST } from '../../domain/engageThumbs';
import { cacheGet, cacheSet, hashKey } from '../../storage/cache';
import { addUsage, loadIntegrations, loadUsage } from '../../storage/integrations';
import { mapYtError, YtError, YT_BASE } from '../youtube/client';
import { AuthError, forgetToken, getToken } from './auth';
import { ownRead, ownRequest } from './own';

type Obj = Record<string, any>;
const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined => {
  const x = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : undefined;
};
const thumbOf = (sn: Obj): string | undefined => {
  const t = sn?.thumbnails ?? {};
  const u = s(t.medium?.url) || s(t.high?.url) || s(t.default?.url);
  return u.startsWith('https://') ? u : undefined;
};

// ---------------------------------------------------------------- comments

export interface ThreadPage {
  threads: CommentThread[];
  nextPageToken?: string;
}

/**
 * Latest comment threads on the channel's videos (1 unit per page of up to 100, cached 2 minutes).
 * `videoId` narrows to one video instead of the whole channel.
 */
export async function listCommentThreads(
  channelId: string,
  opts: { status?: Exclude<ModerationStatus, 'rejected'>; pageToken?: string; videoId?: string; fresh?: boolean } = {},
): Promise<ThreadPage> {
  const r = await ownRead<Obj>(
    channelId,
    'commentThreads',
    {
      part: 'snippet,replies',
      ...(opts.videoId ? { videoId: opts.videoId } : { allThreadsRelatedToChannelId: channelId }),
      moderationStatus: opts.status ?? 'published',
      maxResults: 100,
      order: 'time',
      textFormat: 'plainText',
      pageToken: opts.pageToken,
    },
    2 * 60_000,
    opts.fresh,
  );
  return { threads: (r.items ?? []).map(toThread), nextPageToken: r.nextPageToken || undefined };
}

/** Posts a reply under a top-level comment (comments.insert, 50 units). */
export async function replyToComment(channelId: string, parentId: string, text: string): Promise<CommentReply> {
  if (!parentId || !text.trim()) throw new YtError('bad-request', 'empty reply');
  const r = await ownRequest<Obj>(channelId, {
    method: 'POST',
    path: 'comments',
    params: { part: 'snippet' },
    body: { snippet: { parentId, textOriginal: text } },
    units: COMMENT_WRITE_COST,
  });
  const sn = r?.snippet ?? {};
  return {
    id: s(r?.id),
    authorName: s(sn.authorDisplayName),
    authorChannelId: s(sn.authorChannelId?.value) || channelId,
    authorAvatar: s(sn.authorProfileImageUrl).startsWith('https://') ? sn.authorProfileImageUrl : undefined,
    text: s(sn.textOriginal) || text,
    publishedAt: s(sn.publishedAt) || new Date().toISOString(),
    likes: 0,
  };
}

/** Deletes a comment the channel wrote (comments.delete, 50 units). Cannot be undone. */
export async function deleteComment(channelId: string, commentId: string): Promise<void> {
  await ownRequest(channelId, { method: 'DELETE', path: 'comments', params: { id: commentId }, units: COMMENT_WRITE_COST });
}

/**
 * Sets the moderation status of comments on the channel's videos (comments.setModerationStatus, 50 units per
 * request; the API takes a comma-separated id list). Never bans the author.
 */
export async function setModerationStatus(channelId: string, commentIds: string[], status: Exclude<ModerationStatus, 'likelySpam'>): Promise<void> {
  if (!commentIds.length) return;
  await ownRequest(channelId, {
    method: 'POST',
    path: 'comments/setModerationStatus',
    params: { id: commentIds.join(','), moderationStatus: status, banAuthor: 'false' },
    units: COMMENT_WRITE_COST,
  });
}

// ---------------------------------------------------------------- playlists

export interface Playlist {
  id: string;
  title: string;
  description: string;
  privacy: Privacy | string;
  itemCount?: number;
  thumbnail?: string;
  publishedAt: string;
  defaultLanguage?: string;
}

export interface PlaylistEntry {
  /** playlistItem id. */
  id: string;
  playlistId: string;
  videoId: string;
  title: string;
  position: number;
  thumbnail?: string;
  /** Publish date of the video (absent for private or deleted videos). */
  videoPublishedAt?: string;
  privacy?: string;
}

function toPlaylist(it: Obj): Playlist {
  return {
    id: s(it.id),
    title: s(it.snippet?.title),
    description: s(it.snippet?.description),
    privacy: s(it.status?.privacyStatus),
    itemCount: num(it.contentDetails?.itemCount),
    thumbnail: thumbOf(it.snippet),
    publishedAt: s(it.snippet?.publishedAt),
    defaultLanguage: s(it.snippet?.defaultLanguage) || undefined,
  };
}

function toEntry(it: Obj): PlaylistEntry {
  return {
    id: s(it.id),
    playlistId: s(it.snippet?.playlistId),
    videoId: s(it.contentDetails?.videoId) || s(it.snippet?.resourceId?.videoId),
    title: s(it.snippet?.title),
    position: num(it.snippet?.position) ?? 0,
    thumbnail: thumbOf(it.snippet),
    videoPublishedAt: s(it.contentDetails?.videoPublishedAt) || undefined,
    privacy: s(it.status?.privacyStatus) || undefined,
  };
}

/** The channel's own playlists (1 unit per 50, cached 5 minutes). */
export async function listMyPlaylists(channelId: string, fresh = false, max = 500): Promise<Playlist[]> {
  const out: Playlist[] = [];
  let pageToken: string | undefined;
  do {
    const r = await ownRead<Obj>(channelId, 'playlists', { part: 'snippet,contentDetails,status', mine: 'true', maxResults: 50, pageToken }, 5 * 60_000, fresh);
    out.push(...(r.items ?? []).map(toPlaylist));
    pageToken = r.nextPageToken || undefined;
  } while (pageToken && out.length < max);
  return out;
}

/** Every item of a playlist in playlist order (1 unit per 50, cached 2 minutes). */
export async function listPlaylistItems(channelId: string, playlistId: string, fresh = false, max = 5000): Promise<PlaylistEntry[]> {
  const out: PlaylistEntry[] = [];
  let pageToken: string | undefined;
  do {
    const r = await ownRead<Obj>(channelId, 'playlistItems', { part: 'snippet,contentDetails,status', playlistId, maxResults: 50, pageToken }, 2 * 60_000, fresh);
    out.push(...(r.items ?? []).map(toEntry));
    pageToken = r.nextPageToken || undefined;
  } while (pageToken && out.length < max);
  return out.sort((a, b) => a.position - b.position);
}

export interface PlaylistInput {
  title: string;
  description: string;
  privacy: Privacy;
}

export async function createPlaylist(channelId: string, p: PlaylistInput): Promise<Playlist> {
  const r = await ownRequest<Obj>(channelId, {
    method: 'POST',
    path: 'playlists',
    params: { part: 'snippet,status' },
    body: { snippet: { title: p.title, description: p.description }, status: { privacyStatus: p.privacy } },
    units: PLAYLIST_WRITE_COST,
  });
  return toPlaylist(r);
}

/** Re-reads the playlist, then writes title, description and privacy, keeping defaultLanguage. */
export async function updatePlaylist(channelId: string, playlistId: string, p: PlaylistInput): Promise<{ before: PlaylistInput; after: PlaylistInput }> {
  const r = await ownRead<Obj>(channelId, 'playlists', { part: 'snippet,status', id: playlistId }, 0, true);
  const live = r.items?.[0];
  if (!live) throw new YtError('not-found', playlistId);
  const snippet: Obj = { title: p.title, description: p.description };
  if (live.snippet?.defaultLanguage) snippet.defaultLanguage = live.snippet.defaultLanguage;
  await ownRequest(channelId, {
    method: 'PUT',
    path: 'playlists',
    params: { part: 'snippet,status' },
    body: { id: playlistId, snippet, status: { privacyStatus: p.privacy } },
    units: PLAYLIST_WRITE_COST,
  });
  return { before: { title: s(live.snippet?.title), description: s(live.snippet?.description), privacy: s(live.status?.privacyStatus) as Privacy }, after: p };
}

/** Deletes a playlist (videos stay on the channel). Cannot be undone. */
export async function deletePlaylist(channelId: string, playlistId: string): Promise<void> {
  await ownRequest(channelId, { method: 'DELETE', path: 'playlists', params: { id: playlistId }, units: PLAYLIST_WRITE_COST });
}

export async function insertPlaylistItem(channelId: string, playlistId: string, videoId: string, position?: number): Promise<PlaylistEntry> {
  const snippet: Obj = { playlistId, resourceId: { kind: 'youtube#video', videoId } };
  if (position !== undefined) snippet.position = position;
  const r = await ownRequest<Obj>(channelId, { method: 'POST', path: 'playlistItems', params: { part: 'snippet' }, body: { snippet }, units: PLAYLIST_WRITE_COST });
  return toEntry(r);
}

/** Moves an item to `position` (zero-based). Needs a playlist sorted manually in YouTube. */
export async function movePlaylistItem(channelId: string, item: Pick<PlaylistEntry, 'id' | 'playlistId' | 'videoId'>, position: number): Promise<void> {
  await ownRequest(channelId, {
    method: 'PUT',
    path: 'playlistItems',
    params: { part: 'snippet' },
    body: { id: item.id, snippet: { playlistId: item.playlistId, resourceId: { kind: 'youtube#video', videoId: item.videoId }, position } },
    units: PLAYLIST_WRITE_COST,
  });
}

export async function deletePlaylistItem(channelId: string, itemId: string): Promise<void> {
  await ownRequest(channelId, { method: 'DELETE', path: 'playlistItems', params: { id: itemId }, units: PLAYLIST_WRITE_COST });
}

/** View counts for sorting (1 unit per 50 videos, cached 30 minutes). Hidden counts stay undefined. */
export async function videoViews(channelId: string, videoIds: string[]): Promise<Map<string, number | undefined>> {
  const out = new Map<string, number | undefined>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const r = await ownRead<Obj>(channelId, 'videos', { part: 'statistics', id: videoIds.slice(i, i + 50).join(','), maxResults: 50 }, 30 * 60_000);
    for (const it of r.items ?? []) out.set(s(it.id), num(it.statistics?.viewCount));
  }
  return out;
}

// ---------------------------------------------------------------- video status

export interface LiveStatus extends StatusBlock {
  videoId: string;
  uploadStatus?: string;
}

/** Status blocks of the channel's videos (1 unit per 50; cached 2 minutes unless `fresh`). */
export async function readStatuses(channelId: string, videoIds: string[], fresh = false): Promise<Map<string, LiveStatus>> {
  const out = new Map<string, LiveStatus>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const r = await ownRead<Obj>(channelId, 'videos', { part: 'status', id: videoIds.slice(i, i + 50).join(','), maxResults: 50 }, 2 * 60_000, fresh);
    for (const it of r.items ?? []) out.set(s(it.id), { videoId: s(it.id), ...(it.status ?? {}) });
  }
  return out;
}

export interface StatusWrite {
  videoId: string;
  before: StatusBlock;
  after: StatusBlock;
}

/**
 * Re-reads the live status and writes it back with `patch` applied, sending every writable status field
 * (1 + 50 units). `publishAt: null` cancels a scheduled publish and keeps the video private.
 */
export async function writeStatus(channelId: string, videoId: string, patch: { privacyStatus?: Privacy; publishAt?: string | null }): Promise<StatusWrite> {
  const r = await ownRead<Obj>(channelId, 'videos', { part: 'status', id: videoId }, 0, true);
  const live = r.items?.[0]?.status;
  if (!live) throw new YtError('not-found', videoId);
  const before = writableStatus(live, {});
  const after = writableStatus(live, patch);
  await ownRequest(channelId, { method: 'PUT', path: 'videos', params: { part: 'status' }, body: { id: videoId, status: after }, units: 50 });
  return { videoId, before, after };
}

// ---------------------------------------------------------------- thumbnails

export const THUMB_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';

/** Uploads a custom thumbnail (thumbnails.set, 50 units). Needs a channel verified for custom thumbnails. */
export async function setThumbnail(channelId: string, videoId: string, image: Blob): Promise<void> {
  await ownRequest(channelId, { method: 'POST', path: THUMB_UPLOAD, params: { videoId, uploadType: 'media' }, rawBody: image, contentType: image.type || 'image/jpeg', units: THUMB_COST });
}

/**
 * The video's current thumbnail as YouTube serves it publicly: 1280×720 when it exists, else 480×360
 * (letterboxed). Needs the optional https://i.ytimg.com host permission in extension pages.
 */
export async function fetchCurrentThumbnail(videoId: string, fetcher: typeof fetch = fetch): Promise<{ blob: Blob; size: 'maxres' | 'hq' }> {
  for (const [file, size] of [
    ['maxresdefault.jpg', 'maxres'],
    ['hqdefault.jpg', 'hq'],
  ] as const) {
    let res: Response;
    try {
      // A cache-buster: YouTube's CDN keeps old thumbnails for a while after a change.
      res = await fetcher(`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${file}?tx=${Date.now()}`, { signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw new YtError('unreachable', e instanceof Error ? e.message : String(e));
    }
    if (res.ok) return { blob: await res.blob(), size };
    if (res.status !== 404) throw new YtError('server', `${res.status} thumbnail`);
  }
  throw new YtError('not-found', `thumbnail ${videoId}`);
}

// ---------------------------------------------------------------- captions

export interface CaptionTrack {
  id: string;
  language: string;
  name: string;
  kind: string;
  isDraft: boolean;
}

/** Caption tracks of an own video (captions.list, 50 units; cached 1 hour). */
export async function listCaptions(channelId: string, videoId: string): Promise<CaptionTrack[]> {
  const key = await hashKey(['own-captions', channelId, videoId]);
  const hit = await cacheGet<CaptionTrack[]>(key);
  if (hit) return hit.value;
  const r = await ownRequest<Obj>(channelId, { path: 'captions', params: { part: 'snippet', videoId }, units: CAPTIONS_LIST_COST });
  const tracks: CaptionTrack[] = (r.items ?? []).map((it: Obj) => ({
    id: s(it.id),
    language: s(it.snippet?.language),
    name: s(it.snippet?.name),
    kind: s(it.snippet?.trackKind),
    isDraft: it.snippet?.isDraft === true,
  }));
  await cacheSet(key, tracks, 3600_000);
  return tracks;
}

async function spend(units: number): Promise<void> {
  const { youtube } = await loadIntegrations();
  const u = await loadUsage();
  if (youtube.dailyUnitCap > 0 && u.ytUnits + units > youtube.dailyUnitCap) throw new YtError('budget');
  await addUsage({ ytUnits: units });
}

/** Downloads a caption track as SRT text (captions.download, 200 units; cached 1 day). */
export async function downloadCaption(channelId: string, captionId: string, fetcher: typeof fetch = fetch): Promise<string> {
  const key = await hashKey(['own-caption-srt', channelId, captionId]);
  const hit = await cacheGet<string>(key);
  if (hit) return hit.value;
  await spend(CAPTIONS_DOWNLOAD_COST);
  const token = await getToken(channelId);
  let res: Response;
  try {
    res = await fetcher(`${YT_BASE}/captions/${encodeURIComponent(captionId)}?tfmt=srt`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new YtError('unreachable', e instanceof Error ? e.message : String(e));
  }
  if (res.status === 401) {
    await forgetToken(channelId);
    throw new AuthError('expired');
  }
  if (!res.ok) throw mapYtError(res.status, await res.json().catch(() => null));
  const text = await res.text();
  await cacheSet(key, text, 24 * 3600_000);
  return text;
}
