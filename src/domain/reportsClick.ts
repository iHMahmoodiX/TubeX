// Click Magnet: thumbnail impressions and click-through rate per video, flagged against the channel's own
// medians. When the API does not provide impressions, a fallback ranks by views and retention instead and
// says so; it never presents anything as CTR.
import { median } from './research';
import { rowsOf, type ReportTable } from './reports';

export interface ClickRow {
  videoId: string;
  impressions: number;
  /** Click-through rate as a share (0–1). */
  ctr: number;
  views?: number;
}

export type ClickFlag = 'low-ctr' | 'hidden-gem' | null;

/** The API documents rates as percentages; accept both 5.2 (percent) and 0.052 (share). */
export function toShare(rates: number[]): number[] {
  const percent = rates.some((r) => r > 1);
  return rates.map((r) => (percent ? r / 100 : r));
}

export function clickRows(r: ReportTable | null | undefined): ClickRow[] {
  const rows = rowsOf(r).filter((x) => x.video !== undefined && x.videoThumbnailImpressions !== undefined);
  const shares = toShare(rows.map((x) => Number(x.videoThumbnailImpressionsClickRate)));
  return rows
    .map((x, i) => ({
      videoId: String(x.video),
      impressions: Number(x.videoThumbnailImpressions),
      ctr: shares[i]!,
      ...(x.views !== undefined && { views: Number(x.views) }),
    }))
    .filter((x) => Number.isFinite(x.impressions) && Number.isFinite(x.ctr));
}

export interface Classified extends ClickRow {
  flag: ClickFlag;
  /** Extra clicks if this video reached the channel's median CTR (only for low-CTR videos). */
  missedClicks?: number;
}

/**
 * Flags against the channel's medians (videos with at least `minImpressions`):
 * - low-ctr: impressions ≥ 1.5 × median and CTR ≤ 0.75 × median CTR → the packaging (title/thumbnail) is the bottleneck
 * - hidden-gem: CTR ≥ 1.25 × median CTR and impressions ≤ 0.5 × median → viewers like it, YouTube shows it rarely
 */
export function classifyClicks(rows: ClickRow[], minImpressions = 100): { rows: Classified[]; medianImpressions: number | null; medianCtr: number | null } {
  const base = rows.filter((r) => r.impressions >= minImpressions);
  const mi = median(base.map((r) => r.impressions)) ?? null;
  const mc = median(base.map((r) => r.ctr)) ?? null;
  const out = rows.map((r): Classified => {
    if (mi === null || mc === null || r.impressions < minImpressions) return { ...r, flag: null };
    if (r.impressions >= 1.5 * mi && r.ctr <= 0.75 * mc) return { ...r, flag: 'low-ctr', missedClicks: Math.round(r.impressions * (mc - r.ctr)) };
    if (r.ctr >= 1.25 * mc && r.impressions <= 0.5 * mi) return { ...r, flag: 'hidden-gem' };
    return { ...r, flag: null };
  });
  return { rows: out, medianImpressions: mi, medianCtr: mc };
}

export interface FallbackRow {
  videoId: string;
  views: number;
  avgViewPercent: number | null;
  avgViewDuration: number | null;
  flag: 'strong-retention-low-views' | null;
}

/** Fallback without CTR: videos whose retention beats the channel median while views trail it. */
export function fallbackRanking(r: ReportTable | null | undefined): { rows: FallbackRow[]; medianViews: number | null; medianPercent: number | null } {
  const rows = rowsOf(r).map((x) => ({
    videoId: String(x.video),
    views: Number(x.views) || 0,
    avgViewPercent: Number.isFinite(Number(x.averageViewPercentage)) && x.averageViewPercentage !== '' && x.averageViewPercentage !== undefined ? Number(x.averageViewPercentage) : null,
    avgViewDuration: Number.isFinite(Number(x.averageViewDuration)) && x.averageViewDuration !== '' && x.averageViewDuration !== undefined ? Number(x.averageViewDuration) : null,
  }));
  const mv = median(rows.map((x) => x.views)) ?? null;
  const mp = median(rows.map((x) => x.avgViewPercent).filter((x): x is number => x !== null)) ?? null;
  return {
    rows: rows.map((x) => ({
      ...x,
      flag: mv !== null && mp !== null && x.avgViewPercent !== null && x.avgViewPercent >= mp * 1.1 && x.views < mv ? 'strong-retention-low-views' : null,
    })),
    medianViews: mv,
    medianPercent: mp,
  };
}
