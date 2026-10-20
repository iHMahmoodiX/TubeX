// Pure rules for the Reports area and the Home page: Analytics report helpers, period comparison and the
// channel health scorecard. Every sub-score is transparent: it exposes its inputs and the formula, and is
// null (never zero) when its inputs are missing.

export interface ReportTable {
  columns: string[];
  rows: (string | number)[][];
}

const DAY = 86_400_000;

/** A number from the first row of a report, or null when the column or row is missing. */
export function firstValue(r: ReportTable | undefined | null, name: string): number | null {
  const i = r?.columns.indexOf(name) ?? -1;
  const row = r?.rows[0];
  if (i < 0 || !row) return null;
  const v = Number(row[i]);
  return Number.isFinite(v) ? v : null;
}

/** Report rows as objects keyed by column name. */
export function rowsOf(r: ReportTable | undefined | null): Record<string, string | number>[] {
  if (!r) return [];
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i] ?? ''])));
}

export const isoDay = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** Current and previous periods of equal length, ending today (inclusive). */
export function periods(days: number, now = Date.now()): { cur: { startDate: string; endDate: string }; prev: { startDate: string; endDate: string } } {
  const n = Math.max(1, Math.round(days));
  return {
    cur: { startDate: isoDay(now - (n - 1) * DAY), endDate: isoDay(now) },
    prev: { startDate: isoDay(now - (2 * n - 1) * DAY), endDate: isoDay(now - n * DAY) },
  };
}

/** Relative change from `prev` to `cur`; null when either is unknown or the previous value is zero. */
export function change(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

export const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- health scorecard

export type HealthId = 'consistency' | 'trend' | 'engagement' | 'watch' | 'subscribers' | 'metadata' | 'ctr';
export type Band = 'low' | 'mid' | 'high';

export interface HealthInputs {
  now?: number;
  /** Publish times of public uploads (any age; only the last 90 days are used). */
  uploads: string[];
  /** Views in the last 28 days and in the 28 days before. */
  views28: number | null;
  viewsPrev28: number | null;
  likes28: number | null;
  comments28: number | null;
  shares28: number | null;
  /** Estimated minutes watched in the last 28 days. */
  minutes28: number | null;
  /** Average percentage viewed (0–100) in the last 28 days. */
  avgViewPercent: number | null;
  subsGained28: number | null;
  subsLost28: number | null;
  /** Share (0–1) of videos passing the metadata audit; null when there are no videos. */
  auditPassShare: number | null;
  /** Thumbnail click-through rate (0–1) when the API provides it. */
  ctr: number | null;
}

export interface SubScore {
  id: HealthId;
  /** 0–100, or null when the inputs are missing. */
  score: number | null;
  weight: number;
  band: Band | null;
  /** Raw inputs shown next to the score (numbers are formatted by the UI). */
  inputs: Record<string, number | null>;
}

export interface Health {
  total: number | null;
  parts: SubScore[];
  /** Number of sub-scores with data. */
  available: number;
}

export const HEALTH_WEIGHTS: Record<HealthId, number> = { consistency: 20, trend: 20, engagement: 15, watch: 15, subscribers: 10, metadata: 10, ctr: 10 };

export function band(score: number | null): Band | null {
  if (score === null) return null;
  return score < 40 ? 'low' : score < 70 ? 'mid' : 'high';
}

/** Weeks (of the last 13) with at least one upload, uploads in 90 days and the longest gap in days. */
export function uploadConsistency(uploads: string[], now = Date.now()): { uploads90: number; activeWeeks: number; longestGapDays: number | null } {
  const from = now - 91 * DAY;
  const ts = uploads
    .map((u) => Date.parse(u))
    .filter((t) => Number.isFinite(t) && t >= from && t <= now)
    .sort((a, b) => a - b);
  const weeks = new Set(ts.map((t) => Math.min(12, Math.floor((now - t) / (7 * DAY)))));
  let gap: number | null = null;
  if (ts.length) {
    gap = (ts[0]! - from) / DAY;
    for (let i = 1; i < ts.length; i++) gap = Math.max(gap, (ts[i]! - ts[i - 1]!) / DAY);
    gap = Math.max(gap, (now - ts[ts.length - 1]!) / DAY);
    gap = Math.round(gap);
  }
  return { uploads90: ts.length, activeWeeks: weeks.size, longestGapDays: gap };
}

const ok = (...xs: (number | null)[]): boolean => xs.every((x) => x !== null && Number.isFinite(x));

/**
 * Health scorecard. Formulas (documented in the UI):
 * - consistency: weeks with an upload in the last 13 ÷ 13 × 100 (target: one upload a week)
 * - trend: 50 + views change vs the previous 28 days × 100 (+50 % or more → 100, −50 % or less → 0)
 * - engagement: (likes + comments + shares) ÷ views ÷ 5 % × 100
 * - watch: average percentage viewed ÷ 50 % × 100
 * - subscribers: 50 + net subscribers per 1,000 views × 10
 * - metadata: share of videos passing the audit × 100
 * - ctr: (CTR − 2 %) ÷ 6 % × 100 (2 % → 0, 8 % → 100)
 * Total: weighted mean of the sub-scores that have data; null when fewer than three have data.
 */
export function healthScore(i: HealthInputs): Health {
  const now = i.now ?? Date.now();
  const parts: SubScore[] = [];
  const add = (id: HealthId, score: number | null, inputs: Record<string, number | null>) => {
    const s = score === null || !Number.isFinite(score) ? null : Math.round(clamp(score));
    parts.push({ id, score: s, weight: HEALTH_WEIGHTS[id], band: band(s), inputs });
  };

  const c = uploadConsistency(i.uploads, now);
  add('consistency', (c.activeWeeks / 13) * 100, { uploads90: c.uploads90, activeWeeks: c.activeWeeks, longestGapDays: c.longestGapDays });

  const ch = change(i.views28, i.viewsPrev28);
  add('trend', ch === null ? null : 50 + ch * 100, { views28: i.views28, viewsPrev28: i.viewsPrev28, change: ch });

  const interactions = ok(i.likes28, i.comments28) ? i.likes28! + i.comments28! + (i.shares28 ?? 0) : null;
  const er = interactions !== null && i.views28 ? interactions / i.views28 : null;
  add('engagement', er === null ? null : (er / 0.05) * 100, { interactions, views28: i.views28, rate: er });

  const perView = ok(i.minutes28) && i.views28 ? i.minutes28! / i.views28 : null;
  add('watch', i.avgViewPercent === null ? null : (i.avgViewPercent / 50) * 100, { avgViewPercent: i.avgViewPercent, minutesPerView: perView });

  const net = ok(i.subsGained28, i.subsLost28) ? i.subsGained28! - i.subsLost28! : null;
  const per1k = net !== null && i.views28 ? (net / i.views28) * 1000 : null;
  add('subscribers', per1k === null ? null : 50 + per1k * 10, { net, per1k });

  add('metadata', i.auditPassShare === null ? null : i.auditPassShare * 100, { share: i.auditPassShare });

  add('ctr', i.ctr === null ? null : ((i.ctr - 0.02) / 0.06) * 100, { ctr: i.ctr });

  const scored = parts.filter((p) => p.score !== null);
  const wsum = scored.reduce((n, p) => n + p.weight, 0);
  const total = scored.length >= 3 && wsum > 0 ? Math.round(scored.reduce((n, p) => n + p.score! * p.weight, 0) / wsum) : null;
  return { total, parts, available: scored.length };
}
