// Pure rules for the launchers, the TubeX drawer and Videolytics (no browser APIs; unit-tested).
import { chapterProblems, extractChapters } from '../../domain/chapters';
import { parsePageUrl } from '../../domain/pageContext';

// ---------------------------------------------------------------- which page the drawer is on

export type Site = 'youtube' | 'studio';
/** The page-aware panel the drawer shows; 'none' falls back to the general tools list. */
export type PagePanel = 'videolytics' | 'channelInsights' | 'studioContent' | 'tagTools' | 'none';

const STUDIO_CONTENT = /^\/channel\/UC[\w-]{22}\/(videos|content)(\/|$)/;
const STUDIO_VIDEO_EDIT = /^\/video\/[A-Za-z0-9_-]{11}\/edit(\/|$)/;

export function pagePanelFor(site: Site, href: string): PagePanel {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return 'none';
  }
  if (site === 'studio') {
    if (u.hostname !== 'studio.youtube.com') return 'none';
    if (STUDIO_VIDEO_EDIT.test(u.pathname)) return 'tagTools';
    if (STUDIO_CONTENT.test(u.pathname)) return 'studioContent';
    return 'none';
  }
  if (u.hostname !== 'www.youtube.com') return 'none';
  if (u.pathname === '/watch' && /^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get('v') ?? '')) return 'videolytics';
  if (/^\/(@[^/]+|channel\/UC[\w-]{22}|c\/[^/]+|user\/[^/]+)(\/|$)/.test(u.pathname)) return 'channelInsights';
  return 'none';
}

/** The video id when the URL is a watch page (same rule the watch card uses). */
export function watchIdFrom(href: string): string | null {
  const ctx = parsePageUrl(href);
  return ctx.kind === 'watch' && ctx.videoId ? ctx.videoId : null;
}

// ---------------------------------------------------------------- edge tab and drawer geometry

/** Physical screen edge the launcher docks to: the page's end edge (right on LTR pages, left on RTL pages). */
export function edgeSide(pageDir: string | null | undefined): 'left' | 'right' {
  return pageDir === 'rtl' ? 'left' : 'right';
}

export const DRAWER_MIN = 320;
export const DRAWER_DEFAULT = 380;
export const DRAWER_MAX = 720;

/** Drawer width clamped to the viewport (keeps at least 80 px of the page visible). */
export function clampWidth(w: number, viewport: number): number {
  const max = Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, viewport - 80));
  if (!Number.isFinite(w)) return Math.min(DRAWER_DEFAULT, max);
  return Math.round(Math.min(max, Math.max(DRAWER_MIN, w)));
}

/** Vertical position of the edge tab (px from the top), kept below the top bar and above the bottom. */
export function clampTabTop(y: number, viewport: number, tabHeight = 48): number {
  const min = 64;
  const max = Math.max(min, viewport - tabHeight - 16);
  if (!Number.isFinite(y)) return Math.min(160, max);
  return Math.round(Math.min(max, Math.max(min, y)));
}

// ---------------------------------------------------------------- Videolytics: best practices

/** 'unknown' is used when no official API reports the fact; it is never shown as a failed check. */
export type PracticeState = 'ok' | 'fail' | 'warn' | 'unknown';
export type PracticeId = 'thumbnail' | 'captions' | 'chapters' | 'pinned' | 'hearted' | 'cards' | 'endScreen';

export interface VideoFacts {
  /** snippet.thumbnails.maxres present. */
  maxres: boolean;
  /** contentDetails.caption ("true"/"false"); undefined when YouTube did not say. */
  caption?: boolean;
  /** contentDetails.definition: 'hd' | 'sd'. */
  definition?: string;
}

export interface Practice {
  id: PracticeId;
  state: PracticeState;
}

export type ChapterState = 'ok' | 'warn' | 'fail';

/** Chapters from description timestamps: valid list (≥3, from 0:00, ≥10 s apart) / timestamps with problems / none. */
export function chapterState(description: string): ChapterState {
  if (!extractChapters(description).length) return 'fail';
  return chapterProblems(description).length ? 'warn' : 'ok';
}

export function bestPractices(description: string, facts: VideoFacts | null | undefined): Practice[] {
  return [
    { id: 'thumbnail', state: facts ? (facts.maxres ? 'ok' : 'fail') : 'unknown' },
    { id: 'captions', state: facts && facts.caption !== undefined ? (facts.caption ? 'ok' : 'fail') : 'unknown' },
    { id: 'chapters', state: chapterState(description) },
    // Not in the YouTube Data API (Inferred): never a failed check.
    { id: 'pinned', state: 'unknown' },
    { id: 'hearted', state: 'unknown' },
    { id: 'cards', state: 'unknown' },
    { id: 'endScreen', state: 'unknown' },
  ];
}

/** Reads the facts Videolytics needs from a raw videos.list item (snippet + contentDetails). */
export function factsFromItem(item: unknown): VideoFacts | null {
  if (!item || typeof item !== 'object') return null;
  const it = item as { snippet?: { thumbnails?: Record<string, unknown> }; contentDetails?: { caption?: unknown; definition?: unknown } };
  const thumbs = it.snippet?.thumbnails;
  const cap = it.contentDetails?.caption;
  return {
    maxres: !!thumbs && typeof thumbs === 'object' && !!thumbs.maxres,
    caption: cap === 'true' || cap === true ? true : cap === 'false' || cap === false ? false : undefined,
    definition: typeof it.contentDetails?.definition === 'string' ? it.contentDetails.definition : undefined,
  };
}

// ---------------------------------------------------------------- Videolytics: compare with the channel

export interface Counts {
  id?: string;
  views?: number;
  likes?: number;
  comments?: number;
}

export interface ChannelAverage {
  views?: number;
  likes?: number;
  comments?: number;
  /** Uploads that went into each average (hidden counters are skipped, not counted as zero). */
  sample: number;
}

/** Mean counts of the channel's recent uploads, excluding the video being compared. */
export function recentAverage(recent: Counts[], excludeId?: string): ChannelAverage {
  const list = recent.filter((v) => v.id !== excludeId);
  const mean = (k: 'views' | 'likes' | 'comments') => {
    const xs = list.map((v) => v[k]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  return { views: mean('views'), likes: mean('likes'), comments: mean('comments'), sample: list.filter((v) => v.views !== undefined).length };
}

/** Ratio of a value to an average (1 = equal); undefined when either side is missing or the average is 0. */
export function ratioTo(value: number | undefined, avg: number | undefined): number | undefined {
  if (value === undefined || avg === undefined || !Number.isFinite(value) || !Number.isFinite(avg) || avg <= 0) return undefined;
  return value / avg;
}

// ---------------------------------------------------------------- Videolytics: ranked tags

/** search.list cost per tag rank check (Inferred, docs/INTEGRATIONS.md). */
export const RANK_UNITS_PER_TAG = 100;
/** seo.tagRanks accepts at most 30 tags per call. */
export const MAX_RANK_TAGS = 30;

export function rankPlan(tags: string[], uncached: number | undefined): { tags: string[]; units: number; cached: number } {
  const picked = tags.slice(0, MAX_RANK_TAGS);
  const pay = uncached === undefined ? picked.length : Math.min(picked.length, Math.max(0, uncached));
  return { tags: picked, units: pay * RANK_UNITS_PER_TAG, cached: picked.length - pay };
}

/** How many checked tags the video ranks for (found in the checked results). */
export function rankedCount(ranks: { rank: number | null }[]): number {
  return ranks.filter((r) => r.rank !== null).length;
}
