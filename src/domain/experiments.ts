// A/B test assistant (#12): prepare up to three title/thumbnail variants for one owned video, hand them to
// YouTube Studio's own Test & Compare, then record the result the owner reads there. TubeX never runs a test
// itself, never calls hidden endpoints and never claims a winner from before/after numbers.
// Studio facts (Inferred from YouTube Help, 2025–2026): Test & Compare takes up to 3 thumbnails (and titles on
// eligible channels), decides by watch time share, can take up to about 2 weeks, needs advanced features access
// and is not available for some videos (e.g. made for kids, private).
import type { Experiment, Variant } from './models';
import { charCount } from './text';

export const MAX_VARIANTS = 3;
export const TITLE_MAX = 100;
/** Studio's thumbnail rules (Inferred): at least 640 px wide, 16:9 recommended 1280×720, under 2 MB. */
export const THUMB_RULES = { minWidth: 640, ratio: 16 / 9, maxBytes: 2 * 1024 * 1024 } as const;
/** Stored previews stay small: TubeX keeps a 640×360 JPEG; the owner uploads the original file in Studio. */
export const PREVIEW_SIZE = { width: 640, height: 360 } as const;

export type VariantIssue = 'empty' | 'title-long' | 'duplicate-title' | 'same-as-current';
export type ExperimentIssue = 'need-two' | 'nothing-differs';

export function variantIssues(v: Variant, all: Variant[], current: { title: string }): VariantIssue[] {
  const out: VariantIssue[] = [];
  const title = v.title.trim();
  if (!title && !v.thumb) out.push('empty');
  if (charCount(title) > TITLE_MAX) out.push('title-long');
  if (title && all.some((o) => o.id !== v.id && o.title.trim() === title) && !v.thumb) out.push('duplicate-title');
  if (all[0]?.id !== v.id && title === current.title.trim() && !v.thumb) out.push('same-as-current');
  return out;
}

/** Ready for Studio when at least two variants exist and they differ in title or thumbnail. */
export function experimentIssues(e: Pick<Experiment, 'variants'>): ExperimentIssue[] {
  const vs = e.variants.filter((v) => v.title.trim() || v.thumb);
  if (vs.length < 2) return ['need-two'];
  const titles = new Set(vs.map((v) => v.title.trim()));
  const thumbs = new Set(vs.map((v) => v.thumb ?? ''));
  if (titles.size < 2 && thumbs.size < 2) return ['nothing-differs'];
  return [];
}

/** What Studio will test: thumbnails if they differ, titles if they differ (both when both differ). */
export function testKind(e: Pick<Experiment, 'variants'>): { thumbnails: boolean; titles: boolean } {
  const vs = e.variants.filter((v) => v.title.trim() || v.thumb);
  return { thumbnails: new Set(vs.map((v) => v.thumb ?? '')).size > 1, titles: new Set(vs.map((v) => v.title.trim())).size > 1 };
}

export interface ResultCheck {
  /** Sum of entered shares, null when none entered. */
  total: number | null;
  /** Shares should add up to about 100 (Studio shows watch time share per variant). */
  sumOk: boolean;
  /** Highest share's variant; null on a tie or without shares. */
  leader: string | null;
}

export function checkResults(e: Pick<Experiment, 'results' | 'variants'>): ResultCheck {
  const withShare = e.results.filter((r) => r.share !== undefined && e.variants.some((v) => v.id === r.variantId));
  if (!withShare.length) return { total: null, sumOk: false, leader: null };
  const total = Math.round(withShare.reduce((n, r) => n + r.share!, 0) * 10) / 10;
  const max = Math.max(...withShare.map((r) => r.share!));
  const top = withShare.filter((r) => r.share === max);
  return { total, sumOk: Math.abs(total - 100) <= 1.5, leader: top.length === 1 ? top[0]!.variantId : null };
}

/** The checklist text keys for the Studio handoff, in order. */
export const HANDOFF_STEPS = ['open', 'menu', 'upload', 'titles', 'start', 'wait', 'record'] as const;

export const testCompareUrl = (videoId: string) => `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/edit`;

/** Picks the position of each own candidate among competitor cards so the mockup is stable but not always first. */
export function placeAmong<T>(own: T[], others: T[], seed: string): T[] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out = [...others];
  own.forEach((o, i) => {
    const pos = (h + i * 7) % (out.length + 1);
    out.splice(pos, 0, o);
  });
  return out;
}
