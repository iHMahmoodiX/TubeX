// Pure rules for the Studio Content tools (#2, #3): "made for kids" (COPPA) state and bulk plans, the
// workspace selection hand-off (`ids=...` route ids), Studio content tabs, and the related-video queue for Shorts.
// No browser APIs.

/** videos.list (1) + videos.update part=status (50) per video (Inferred, docs/INTEGRATIONS.md). */
export const KIDS_WRITE_COST = 51;
/** Most videos one bulk "made for kids" run may touch. */
export const KIDS_MAX_BATCH = 200;
/** Shorts are up to 3 minutes long (YouTube, since October 2024). Duration is only a hint; Studio's tab is the truth. */
export const SHORT_MAX_SEC = 180;
export const VIDEO_ID = /^[\w-]{11}$/;

export interface KidsVideo {
  id: string;
  title: string;
  thumbnail?: string;
  publishedAt: string;
  durationSec: number;
  privacy: string;
  /** status.madeForKids: YouTube's effective designation (read-only). Undefined when the API did not return it. */
  madeForKids?: boolean;
  /** status.selfDeclaredMadeForKids: what the channel declared (only visible to the owner). */
  selfDeclared?: boolean;
}

export type KidsState = 'yes' | 'no' | 'unknown';

/** Effective state: YouTube's designation first, then the channel's own declaration. Never guesses. */
export function kidsState(v: Pick<KidsVideo, 'madeForKids' | 'selfDeclared'>): KidsState {
  const x = v.madeForKids ?? v.selfDeclared;
  return x === undefined ? 'unknown' : x ? 'yes' : 'no';
}

/** True when YouTube's designation differs from what the channel declared (YouTube overrode it). */
export function kidsOverridden(v: Pick<KidsVideo, 'madeForKids' | 'selfDeclared'>): boolean {
  return v.madeForKids !== undefined && v.selfDeclared !== undefined && v.madeForKids !== v.selfDeclared;
}

export interface KidsPlan<T> {
  /** Will be written. */
  change: T[];
  /** Already declared with the wanted value: skipped. */
  same: T[];
}

/** Splits videos into those whose declaration would change and those already set to `value`. */
export function kidsPlan<T extends Pick<KidsVideo, 'selfDeclared' | 'madeForKids'>>(videos: T[], value: boolean): KidsPlan<T> {
  const change: T[] = [];
  const same: T[] = [];
  for (const v of videos) ((v.selfDeclared ?? v.madeForKids) === value ? same : change).push(v);
  return { change, same };
}

export type KidsFilter = 'all' | KidsState;
export type KindFilter = 'all' | 'shorts' | 'videos';

export function isShortLength(sec: number): boolean {
  return sec > 0 && sec <= SHORT_MAX_SEC;
}

export function filterKids<T extends KidsVideo>(videos: T[], f: { state: KidsFilter; kind: KindFilter; query: string }): T[] {
  const q = f.query.trim().toLowerCase();
  return videos.filter(
    (v) =>
      (f.state === 'all' || kidsState(v) === f.state) &&
      (f.kind === 'all' || (f.kind === 'shorts') === isShortLength(v.durationSec)) &&
      (!q || v.title.toLowerCase().includes(q) || v.id.toLowerCase() === q),
  );
}

export function kidsCounts(videos: KidsVideo[]): Record<KidsFilter, number> {
  const c: Record<KidsFilter, number> = { all: videos.length, yes: 0, no: 0, unknown: 0 };
  for (const v of videos) c[kidsState(v)]++;
  return c;
}

/** One write of a batch, kept for undo. `before` is the declaration the video had (or its effective state). */
export interface KidsUndoEntry {
  videoId: string;
  title: string;
  before: boolean;
  after: boolean;
}
export interface KidsBatch {
  id: string;
  at: string;
  value: boolean;
  entries: KidsUndoEntry[];
  undoneAt?: string;
}

/**
 * Value to restore for an undo entry given the live declaration now: the old value when the video still has
 * what TubeX wrote, otherwise null (someone changed it since; keep their change).
 */
export function undoTarget(entry: KidsUndoEntry, liveSelfDeclared: boolean | undefined): boolean | null {
  if (liveSelfDeclared !== entry.after) return null;
  return entry.before === entry.after ? null : entry.before;
}

// ---------------------------------------------------------------- workspace hand-off

export interface Selection {
  ids: string[];
  tab?: ContentTab;
}

/** Route id carrying a selection, e.g. `ids=abc...,def...&tab=shorts`. */
export function selectionRouteId(sel: Selection): string {
  const ids = [...new Set(sel.ids.filter((x) => VIDEO_ID.test(x)))];
  const parts = [];
  if (ids.length) parts.push(`ids=${ids.join(',')}`);
  if (sel.tab) parts.push(`tab=${sel.tab}`);
  return parts.join('&');
}

/** Parses a route id (or a whole `#route/<id>` hash) into a selection; unknown parts are ignored. */
export function parseSelection(raw: string | undefined | null): Selection {
  let s = raw ?? '';
  if (s.startsWith('#')) s = s.replace(/^#[^/]*\/?/, '');
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  const out: Selection = { ids: [] };
  for (const part of s.split('&')) {
    const [k, v = ''] = part.split('=');
    if (k === 'ids') out.ids = [...new Set(v.split(',').filter((x) => VIDEO_ID.test(x)))].slice(0, 500);
    if (k === 'tab' && (CONTENT_TABS as readonly string[]).includes(v)) out.tab = v as ContentTab;
  }
  return out;
}

// ---------------------------------------------------------------- Studio content page

export const CONTENT_TABS = ['videos', 'shorts', 'live', 'posts', 'playlists', 'podcasts', 'other'] as const;
export type ContentTab = (typeof CONTENT_TABS)[number];

/**
 * The Content page tab from a Studio URL, or null when the URL is not the Content page.
 * Studio paths (Inferred): /channel/<id>/videos/upload (Videos), /videos/short, /videos/live, /videos/posts,
 * /channel/<id>/playlists, /podcasts, /courses, /promotions, /collaborations, /ideas, /videos (default tab).
 */
export function contentTab(url: string): ContentTab | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== 'studio.youtube.com') return null;
  const m = u.pathname.match(/^\/channel\/[\w-]+\/(videos|content|playlists|podcasts|courses|promotions|collaborations|ideas|shows)(?:\/([\w-]+))?\/?$/);
  if (!m) return null;
  const [, section, sub] = m;
  if (section === 'playlists') return 'playlists';
  if (section === 'podcasts') return 'podcasts';
  if (section !== 'videos' && section !== 'content') return 'other';
  switch (sub) {
    case undefined:
    case 'upload':
      return 'videos';
    case 'short':
    case 'shorts':
      return 'shorts';
    case 'live':
      return 'live';
    case 'posts':
    case 'post':
      return 'posts';
    default:
      return 'other';
  }
}

/** Tabs whose rows are videos (selection actions apply). */
export const VIDEO_TABS: readonly ContentTab[] = ['videos', 'shorts', 'live'];

// ---------------------------------------------------------------- related video queue (Shorts)

export interface RelatedQueue {
  mode: 'add' | 'clear';
  /** The video to link (add mode). */
  target?: { id: string; title: string };
  items: { id: string; title: string }[];
  /** Index of the Short being edited. */
  index: number;
  /** Ids the user marked done (pressed Next after filling). */
  done: string[];
  startedAt: string;
  /** Studio Content URL to return to. */
  returnUrl?: string;
}

export const QUEUE_MAX = 100;
const QUEUE_TTL_MS = 24 * 3600_000;

export function startQueue(mode: 'add' | 'clear', items: { id: string; title: string }[], target: { id: string; title: string } | undefined, now = new Date(), returnUrl?: string): RelatedQueue {
  const seen = new Set<string>();
  const list = items.filter((x) => VIDEO_ID.test(x.id) && x.id !== target?.id && !seen.has(x.id) && seen.add(x.id)).slice(0, QUEUE_MAX);
  return { mode, target: mode === 'add' ? target : undefined, items: list, index: 0, done: [], startedAt: now.toISOString(), returnUrl };
}

/** A queue that can still be used (well formed, not empty, not older than a day). */
export function liveQueue(q: unknown, now = Date.now()): RelatedQueue | null {
  const x = q as RelatedQueue | null;
  if (!x || typeof x !== 'object' || (x.mode !== 'add' && x.mode !== 'clear') || !Array.isArray(x.items) || !x.items.length) return null;
  if (x.mode === 'add' && (!x.target || !VIDEO_ID.test(x.target.id))) return null;
  const t = Date.parse(x.startedAt);
  if (!Number.isFinite(t) || now - t > QUEUE_TTL_MS) return null;
  if (typeof x.index !== 'number' || x.index < 0 || x.index > x.items.length) return null;
  return x;
}

/** Position of a video in the queue, or -1. */
export function queuePos(q: RelatedQueue | null, videoId: string): number {
  return q ? q.items.findIndex((x) => x.id === videoId) : -1;
}

/** Marks the current video done and moves on. Returns the next item (or null when finished). */
export function advanceQueue(q: RelatedQueue, videoId: string): { queue: RelatedQueue; next: { id: string; title: string } | null } {
  const pos = queuePos(q, videoId);
  const done = pos >= 0 && !q.done.includes(videoId) ? [...q.done, videoId] : q.done;
  const from = pos >= 0 ? pos + 1 : q.index;
  const nextIndex = q.items.findIndex((x, i) => i >= from && !done.includes(x.id));
  const queue = { ...q, done, index: nextIndex < 0 ? q.items.length : nextIndex };
  return { queue, next: nextIndex < 0 ? null : q.items[nextIndex]! };
}

export const studioEditUrl = (videoId: string) => `https://studio.youtube.com/video/${videoId}/edit`;
