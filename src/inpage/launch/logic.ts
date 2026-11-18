// Pure rules for the launchers, the TubeX drawer and Videolytics (no browser APIs; unit-tested).
import { scanChapters, type ChapterProblem } from '../../domain/chapters';
import { parsePageUrl } from '../../domain/pageContext';
import type { WatchSignals } from './dom';

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

/** Where a verdict comes from (shown in its tooltip). */
export type PracticeSource = 'api' | 'page' | 'description';

export interface Practice {
  id: PracticeId;
  state: PracticeState;
  source: PracticeSource;
  /** Message key suffix of the explanation: `ln.bp.<id>.<reason>`. */
  reason: string;
  /** Values for the explanation (e.g. the chapter count). */
  values?: Record<string, number>;
}

export type ChapterState = 'ok' | 'warn' | 'fail';

const PROBLEM_REASON: Record<ChapterProblem, string> = { 'not-at-zero': 'notAtZero', 'too-few': 'tooFew', 'not-ascending': 'notAscending', 'too-short': 'tooShort' };

/**
 * Chapters: YouTube decides, so chapters the page shows are always ok. Otherwise the description is read with the
 * tolerant scanner; 'warn' only names a concrete problem the creator can fix.
 */
export function chapterPractice(description: string, page?: WatchSignals['chapters']): Practice {
  if (page === 'shown') return { id: 'chapters', state: 'ok', source: 'page', reason: 'page' };
  const scan = scanChapters(description);
  if (scan.chapters.length && !scan.problems.length) return { id: 'chapters', state: 'ok', source: 'description', reason: 'desc', values: { n: scan.chapters.length } };
  if (page === 'auto') return { id: 'chapters', state: 'ok', source: 'page', reason: 'auto' };
  if (scan.problems.length) return { id: 'chapters', state: 'warn', source: 'description', reason: PROBLEM_REASON[scan.problems[0]!], values: { n: scan.chapters.length } };
  return { id: 'chapters', state: 'fail', source: 'description', reason: 'none' };
}

/** Chapters from the description alone: valid list / list with a fixable problem / none. */
export function chapterState(description: string): ChapterState {
  return chapterPractice(description).state as ChapterState;
}

function captionPractice(facts: VideoFacts | null | undefined, cc: WatchSignals['cc']): Practice {
  // contentDetails.caption reports uploaded caption tracks only; automatic captions show in the player's CC button.
  if (facts?.caption === true) return { id: 'captions', state: 'ok', source: 'api', reason: 'uploaded' };
  if (cc === 'on') return { id: 'captions', state: 'ok', source: 'page', reason: 'auto' };
  if (cc === 'off') return { id: 'captions', state: 'fail', source: 'page', reason: 'none' };
  if (facts?.caption === false) return { id: 'captions', state: 'fail', source: 'api', reason: 'noUploaded' };
  return { id: 'captions', state: 'unknown', source: 'api', reason: 'unknown' };
}

/** The checklist. `page` is what the visible watch page shows (readWatchSignals); omitted = page not readable. */
export function bestPractices(description: string, facts: VideoFacts | null | undefined, page?: WatchSignals | null): Practice[] {
  const pinned = page?.pinned ?? 'notLoaded';
  return [
    facts ? { id: 'thumbnail', state: facts.maxres ? 'ok' : 'fail', source: 'api', reason: facts.maxres ? 'maxres' : 'noMaxres' } : { id: 'thumbnail', state: 'unknown', source: 'api', reason: 'unknown' },
    captionPractice(facts, page?.cc),
    chapterPractice(description, page?.chapters),
    // Not in any official API: read from the comments as shown. 'fail' only when the first thread is loaded without a pin.
    { id: 'pinned', state: pinned === 'yes' ? 'ok' : pinned === 'no' ? 'fail' : 'unknown', source: 'page', reason: pinned === 'yes' ? 'page' : pinned === 'no' ? 'none' : pinned },
    // A heart may be further down than the loaded comments: never a failed check.
    { id: 'hearted', state: page?.hearted ? 'ok' : 'unknown', source: 'page', reason: page?.hearted ? 'page' : page?.hearted === false ? 'notFound' : 'notLoaded' },
    { id: 'cards', state: page?.cards ? 'ok' : 'unknown', source: 'page', reason: page?.cards ? 'page' : 'notFound' },
    { id: 'endScreen', state: page?.endScreen ? 'ok' : 'unknown', source: 'page', reason: page?.endScreen ? 'page' : 'notFound' },
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
