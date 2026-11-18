// Outlier Discovery Lite (#11): which recent public videos are doing unusually well against a stated baseline, from
// data the owner already pulls (watched channels' recent uploads, one topic search). Raw public facts only: views,
// views per day, the baseline median and the sample size, plus a qualitative flag. No proprietary multiplier score.
import { median, viewsPerDay } from './research';

export type OutlierFlag = 'well-above' | 'above';
export type OutlierBaseline = 'channel' | 'sample';

export interface OutlierVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  views?: number;
  thumbnail?: string;
}

export interface Outlier<V extends OutlierVideo = OutlierVideo> {
  video: V;
  perDay: number;
  /** Median views per day of the baseline the video is compared with. */
  baseline: number;
  baselineKind: OutlierBaseline;
  /** Videos with public counters in that baseline. */
  sampleSize: number;
  flag: OutlierFlag;
}

/** Fewer than this many comparable videos and nothing is compared. */
export const MIN_BASELINE = 5;
/** Qualitative thresholds against the baseline median (not shown as a number). */
export const FLAG_AT = { above: 2, 'well-above': 4 } as const;
export const PERIODS = [7, 30, 90] as const;
/** Bounds per run: watched channels checked and uploads read per channel. */
export const MAX_CHANNELS = 12;
export const UPLOADS_PER_CHANNEL = 20;
/** Data API units for one watchlist run: one channels call, then playlistItems + videos per channel. */
export const watchlistUnits = (channels: number) => (channels ? 1 + Math.min(channels, MAX_CHANNELS) * 2 : 0);

const DAY = 86_400_000;

export function flagFor(perDay: number, baseline: number): OutlierFlag | undefined {
  if (!(baseline > 0)) return undefined;
  if (perDay >= baseline * FLAG_AT['well-above']) return 'well-above';
  if (perDay >= baseline * FLAG_AT.above) return 'above';
  return undefined;
}

/**
 * Compares each video published within `periodDays` with the median views/day of its group. A group is one channel's
 * recent uploads (baseline 'channel') or one search sample (baseline 'sample'). Groups with fewer than MIN_BASELINE
 * public counters are skipped instead of guessed. Videos younger than 2 days are left out: early per-day numbers swing.
 */
export function findOutliers<V extends OutlierVideo>(groups: { videos: V[]; kind: OutlierBaseline }[], periodDays: number, now = Date.now()): Outlier<V>[] {
  const out: Outlier<V>[] = [];
  for (const g of groups) {
    const rates = g.videos.map((v) => ({ v, r: viewsPerDay(v, now) })).filter((x): x is { v: V; r: number } => x.r !== undefined);
    if (rates.length < MIN_BASELINE) continue;
    const base = median(rates.map((x) => x.r))!;
    for (const { v, r } of rates) {
      const age = (now - Date.parse(v.publishedAt)) / DAY;
      if (!(age >= 2 && age <= periodDays)) continue;
      const flag = flagFor(r, base);
      if (flag) out.push({ video: v, perDay: r, baseline: base, baselineKind: g.kind, sampleSize: rates.length, flag });
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => (a.flag === b.flag ? b.perDay / b.baseline - a.perDay / a.baseline : a.flag === 'well-above' ? -1 : 1))
    .filter((o) => (seen.has(o.video.id) ? false : (seen.add(o.video.id), true)));
}
