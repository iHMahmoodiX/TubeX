// Best time to publish: an estimate from the channel's own upload history (first-week views by publish
// weekday and hour). YouTube's APIs do not expose when the audience is online, so nothing here claims that.
import { median } from './research';
import type { ReportTable } from './reports';

export interface Slot {
  /** 0 = Sunday … 6 = Saturday, in the given time zone. */
  weekday: number;
  hour: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday and hour of an instant in a time zone (IANA name, e.g. 'Asia/Tehran'). */
export function slotOf(iso: string, timeZone: string): Slot | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hr = Number(parts.find((p) => p.type === 'hour')?.value);
  if (!(wd in WEEKDAYS) || !Number.isFinite(hr)) return null;
  return { weekday: WEEKDAYS[wd]!, hour: hr % 24 };
}

/** Sum of the `views` column of a per-day report (the first week of one video). Null when there are no rows. */
export function sumViews(r: ReportTable | null | undefined): number | null {
  if (!r || !r.rows.length) return null;
  const i = r.columns.indexOf('views');
  if (i < 0) return null;
  return r.rows.reduce((n, row) => n + (Number(row[i]) || 0), 0);
}

/** Start and end dates (inclusive, UTC days) of a video's first 7 days. */
export function firstWeekRange(publishedAt: string): { startDate: string; endDate: string } | null {
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return null;
  return { startDate: new Date(t).toISOString().slice(0, 10), endDate: new Date(t + 6 * 86_400_000).toISOString().slice(0, 10) };
}

/** True when the first week is complete, with two extra days for Analytics to settle. */
export const firstWeekComplete = (publishedAt: string, now = Date.now()): boolean => Date.parse(publishedAt) + 9 * 86_400_000 <= now;

export interface Sample {
  videoId: string;
  publishedAt: string;
  views7: number;
}

export interface Cell {
  weekday: number;
  /** First hour of the bin. */
  hour: number;
  n: number;
  median: number;
  videoIds: string[];
}

export interface BestTime {
  cells: Cell[];
  /** Median first-week views over all samples. */
  overall: number | null;
  top: Cell[];
  byWeekday: { weekday: number; n: number; median: number | null }[];
  samples: number;
}

/**
 * Groups samples into weekday × hour bins of `binHours` hours and ranks bins by median first-week views.
 * Top slots prefer bins with at least two uploads; single uploads are listed only when nothing else exists.
 */
export function bestTime(samples: Sample[], timeZone: string, binHours = 3, topN = 3): BestTime {
  const bins = new Map<string, { weekday: number; hour: number; views: number[]; ids: string[] }>();
  const byWd = new Map<number, number[]>();
  for (const s of samples) {
    const slot = slotOf(s.publishedAt, timeZone);
    if (!slot) continue;
    const hour = Math.floor(slot.hour / binHours) * binHours;
    const key = `${slot.weekday}-${hour}`;
    const b = bins.get(key) ?? { weekday: slot.weekday, hour, views: [], ids: [] };
    b.views.push(s.views7);
    b.ids.push(s.videoId);
    bins.set(key, b);
    byWd.set(slot.weekday, [...(byWd.get(slot.weekday) ?? []), s.views7]);
  }
  const cells: Cell[] = [...bins.values()].map((b) => ({ weekday: b.weekday, hour: b.hour, n: b.views.length, median: median(b.views) ?? 0, videoIds: b.ids }));
  const rank = (a: Cell, b: Cell) => b.median - a.median || b.n - a.n;
  const multi = cells.filter((c) => c.n >= 2).sort(rank);
  const single = cells.filter((c) => c.n < 2).sort(rank);
  const top = (multi.length ? multi : single).slice(0, topN);
  return {
    cells,
    overall: median(samples.map((s) => s.views7)) ?? null,
    top,
    byWeekday: [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const xs = byWd.get(weekday) ?? [];
      return { weekday, n: xs.length, median: xs.length ? (median(xs) ?? null) : null };
    }),
    samples: samples.length,
  };
}

/** Channel views by weekday from a per-day report (dates are Analytics days). Mean views per day of week. */
export function viewsByWeekday(r: ReportTable | null | undefined): { weekday: number; days: number; mean: number | null }[] {
  const sums = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }));
  if (r) {
    const di = r.columns.indexOf('day');
    const vi = r.columns.indexOf('views');
    if (di >= 0 && vi >= 0)
      for (const row of r.rows) {
        const t = Date.parse(`${row[di]}T12:00:00Z`);
        if (!Number.isFinite(t)) continue;
        const s = sums[new Date(t).getUTCDay()]!;
        s.total += Number(row[vi]) || 0;
        s.days++;
      }
  }
  return sums.map((s, weekday) => ({ weekday, days: s.days, mean: s.days ? s.total / s.days : null }));
}

/** Runs async work over items with limited concurrency, preserving order. Stops on the first error. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, onProgress?: (done: number) => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
