// Audience retention from the YouTube Analytics API (dimension elapsedVideoTimeRatio, 100 points per video).
import type { ReportTable } from './reports';

export interface RetentionPoint {
  /** Position in the video, 0–1. */
  ratio: number;
  /** audienceWatchRatio: share of views still watching (can exceed 1 with rewatches). */
  watch: number;
  /** relativeRetentionPerformance: 0–1 compared with videos of similar length (0.5 = typical). Null when missing. */
  relative: number | null;
}

export function retentionPoints(r: ReportTable | null | undefined): RetentionPoint[] {
  if (!r) return [];
  const ri = r.columns.indexOf('elapsedVideoTimeRatio');
  const wi = r.columns.indexOf('audienceWatchRatio');
  const pi = r.columns.indexOf('relativeRetentionPerformance');
  if (ri < 0 || wi < 0) return [];
  return r.rows
    .map((row) => {
      const rel = pi >= 0 ? Number(row[pi]) : NaN;
      return { ratio: Number(row[ri]), watch: Number(row[wi]), relative: Number.isFinite(rel) ? rel : null };
    })
    .filter((p) => Number.isFinite(p.ratio) && Number.isFinite(p.watch))
    .sort((a, b) => a.ratio - b.ratio);
}

export interface Drop {
  ratio: number;
  seconds: number;
  /** Fall in audienceWatchRatio between the previous point and this one. */
  drop: number;
  from: number;
  to: number;
}

/**
 * The biggest falls in retention, at least `minGap` of the video apart so one steep slope is not reported
 * three times. The opening (first 3 %) is skipped: almost every video loses viewers there.
 */
export function biggestDrops(points: RetentionPoint[], durationSec: number, n = 3, minGap = 0.05): Drop[] {
  const drops: Drop[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.ratio < 0.03) continue;
    const d = a.watch - b.watch;
    if (d > 0) drops.push({ ratio: a.ratio, seconds: Math.round(a.ratio * durationSec), drop: d, from: a.watch, to: b.watch });
  }
  drops.sort((x, y) => y.drop - x.drop);
  const out: Drop[] = [];
  for (const d of drops) {
    if (out.length >= n) break;
    if (out.every((o) => Math.abs(o.ratio - d.ratio) >= minGap)) out.push(d);
  }
  return out.sort((x, y) => x.ratio - y.ratio);
}

/** Mean relativeRetentionPerformance over the video, or null. */
export function meanRelative(points: RetentionPoint[]): number | null {
  const xs = points.map((p) => p.relative).filter((x): x is number => x !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export type RelativeLabel = 'above' | 'typical' | 'below';
export function relativeLabel(v: number | null): RelativeLabel | null {
  if (v === null) return null;
  return v >= 0.6 ? 'above' : v <= 0.4 ? 'below' : 'typical';
}

/** Share still watching at the given position (linear interpolation), or null. */
export function watchAt(points: RetentionPoint[], ratio: number): number | null {
  if (!points.length) return null;
  if (ratio <= points[0]!.ratio) return points[0]!.watch;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (ratio <= b.ratio) return a.watch + ((b.watch - a.watch) * (ratio - a.ratio)) / Math.max(1e-9, b.ratio - a.ratio);
  }
  return points[points.length - 1]!.watch;
}

export const watchUrl = (videoId: string, seconds: number): string => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.max(0, Math.round(seconds))}s`;

export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
