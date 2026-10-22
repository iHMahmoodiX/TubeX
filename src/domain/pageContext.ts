// Pure URL-based page-context detection. DOM enrichment lives in src/platform/youtubeDom.ts.

export type PageKind =
  | 'watch'
  | 'shorts'
  | 'search'
  | 'channel'
  | 'playlist'
  | 'home'
  | 'studio-video'
  | 'studio'
  | 'youtube-other'
  | 'unsupported'
  | 'unknown';

export interface PageContext {
  kind: PageKind;
  url?: string;
  videoId?: string;
  searchQuery?: string;
  channelHandle?: string;
  channelId?: string;
  playlistId?: string;
  /** Title from the browser tab or page DOM. */
  title?: string;
  channelName?: string;
  /** Where the descriptive fields came from. URL-derived ids are always from the URL. */
  origin: 'url' | 'dom';
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export function isValidVideoId(id: string | null | undefined): id is string {
  return !!id && VIDEO_ID.test(id);
}

export function parsePageUrl(rawUrl: string | undefined | null): PageContext {
  if (!rawUrl) return { kind: 'unknown', origin: 'url' };
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { kind: 'unknown', origin: 'url' };
  }
  const url = u.toString();
  if (u.protocol !== 'https:') return { kind: 'unsupported', url, origin: 'url' };
  const parts = u.pathname.split('/').filter(Boolean);

  if (u.hostname === 'studio.youtube.com') {
    if (parts[0] === 'video' && isValidVideoId(parts[1])) {
      return { kind: 'studio-video', url, videoId: parts[1], origin: 'url' };
    }
    const channelId = parts[0] === 'channel' && parts[1] && CHANNEL_ID.test(parts[1]) ? parts[1] : undefined;
    return { kind: 'studio', url, channelId, origin: 'url' };
  }

  if (u.hostname !== 'www.youtube.com') return { kind: 'unsupported', url, origin: 'url' };

  if (parts.length === 0) return { kind: 'home', url, origin: 'url' };
  if (parts[0] === 'watch') {
    const v = u.searchParams.get('v');
    if (isValidVideoId(v)) return { kind: 'watch', url, videoId: v, origin: 'url' };
    return { kind: 'youtube-other', url, origin: 'url' };
  }
  if (parts[0] === 'shorts' && isValidVideoId(parts[1])) {
    return { kind: 'shorts', url, videoId: parts[1], origin: 'url' };
  }
  if (parts[0] === 'results') {
    const q = u.searchParams.get('search_query')?.trim();
    if (q) return { kind: 'search', url, searchQuery: q, origin: 'url' };
    return { kind: 'youtube-other', url, origin: 'url' };
  }
  if (parts[0] === 'playlist') {
    const list = u.searchParams.get('list');
    if (list) return { kind: 'playlist', url, playlistId: list, origin: 'url' };
  }
  if (parts[0]?.startsWith('@') && parts[0].length > 1) {
    return { kind: 'channel', url, channelHandle: decodeURIComponent(parts[0]), origin: 'url' };
  }
  if (parts[0] === 'channel' && parts[1] && CHANNEL_ID.test(parts[1])) {
    return { kind: 'channel', url, channelId: parts[1], origin: 'url' };
  }
  return { kind: 'youtube-other', url, origin: 'url' };
}

/** Kinds where a captured idea gets a meaningful source link. */
export function isCapturable(kind: PageKind): boolean {
  return kind !== 'unknown' && kind !== 'unsupported';
}

/** Strips the " - YouTube" suffix browsers show in tab titles. */
export function cleanTabTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const t = title.replace(/^\(\d+\)\s*/, '').replace(/\s+-\s+YouTube( Studio)?$/, '').trim();
  return t && t !== 'YouTube' && t !== 'YouTube Studio' ? t : undefined;
}

/** Canonical link for a context (drops tracking/timestamp params). */
export function canonicalUrl(ctx: PageContext): string | undefined {
  switch (ctx.kind) {
    case 'watch':
      return `https://www.youtube.com/watch?v=${ctx.videoId}`;
    case 'shorts':
      return `https://www.youtube.com/shorts/${ctx.videoId}`;
    case 'studio-video':
      return `https://studio.youtube.com/video/${ctx.videoId}/edit`;
    case 'search':
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(ctx.searchQuery ?? '')}`;
    case 'playlist':
      return `https://www.youtube.com/playlist?list=${encodeURIComponent(ctx.playlistId ?? '')}`;
    case 'channel':
      return ctx.channelHandle
        ? `https://www.youtube.com/${encodeURIComponent(ctx.channelHandle).replace('%40', '@')}`
        : `https://www.youtube.com/channel/${ctx.channelId}`;
    default:
      return ctx.url;
  }
}
