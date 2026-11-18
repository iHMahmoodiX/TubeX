// Improve queue (#10): the few existing videos worth improving now, each with plain reasons and the numbers
// behind them. No composite score: an item's priority is the list of independent signals it has, ordered by an
// explicit rule (more signals first, then the strongest signal kind, then recent views). Unknown data never
// counts as a signal and never shows as 0. Pure rules, no browser APIs.
import type { MetricSnap, OptimizeItem, QueueStatus } from './models';
import { auditVideo, type AuditInput, type AuditId } from './reportsAudit';
import type { ClickRow } from './reportsClick';
import { median } from './research';

export type SignalKind = 'low-ctr' | 'strong-retention-low-reach' | 'evergreen-traffic' | 'weak-packaging';
/** Order used to break ties: the signal the owner can act on fastest with the most evidence first. */
export const SIGNAL_ORDER: SignalKind[] = ['low-ctr', 'strong-retention-low-reach', 'evergreen-traffic', 'weak-packaging'];

export interface Signal {
  kind: SignalKind;
  /** Numbers behind the signal, shown verbatim. */
  evidence: Record<string, number | string>;
}

export interface QueueVideo extends AuditInput {
  publishedAt: string;
  thumbnail?: string;
  privacy?: string;
}

export interface QueueInputs {
  videos: QueueVideo[];
  /** Last-28-days Analytics per video (views, average view percentage); null when that read failed. */
  perf28: { videoId: string; views: number; avgViewPercent: number | null }[] | null;
  /** Reporting API reach rows for the same period (impressions, CTR as share); null when not collected yet. */
  reach: ClickRow[] | null;
  /** ISO time the numbers were read. */
  measuredAt: string;
  now?: number;
}

export interface Thresholds {
  /** Impressions a video needs before its CTR is compared (small samples are noise). */
  minImpressions: number;
  /** Views (28 days) a video needs before its retention is compared. */
  minViews: number;
  /** Age in days for "evergreen". */
  evergreenDays: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { minImpressions: 1000, minViews: 100, evergreenDays: 180 };

/** Packaging checks from the best-practice audit that the queue treats as "weak packaging". */
const PACKAGING_CHECKS: AuditId[] = ['title-length', 'title-keyword', 'desc-length', 'desc-first-lines', 'tags-count'] as AuditId[];

export interface QueueEntry {
  videoId: string;
  title: string;
  thumbnail?: string;
  publishedAt: string;
  signals: Signal[];
  /** Views in the last 28 days when known. */
  views28?: number;
  /** Numbers as measured now, for the observation log's "after". */
  snap: MetricSnap;
  /** True when the channel has too little data for CTR or retention comparisons (shown as a note). */
  thinData: boolean;
}

const days = (iso: string, now: number) => (now - Date.parse(iso)) / 86_400_000;

/** Signals for every public video, then the ones with at least one signal, in priority order. */
export function buildQueue(i: QueueInputs, th: Thresholds = DEFAULT_THRESHOLDS): { entries: QueueEntry[]; thinCtr: boolean; thinRetention: boolean; medians: { ctr: number | null; avgViewPercent: number | null; views: number | null } } {
  const now = i.now ?? Date.now();
  const pub = i.videos.filter((v) => !v.privacy || v.privacy === 'public');
  const perf = new Map((i.perf28 ?? []).map((p) => [p.videoId, p]));
  const reach = new Map((i.reach ?? []).map((r) => [r.videoId, r]));

  const ctrBase = (i.reach ?? []).filter((r) => r.impressions >= th.minImpressions);
  const medCtr = ctrBase.length >= 3 ? (median(ctrBase.map((r) => r.ctr)) ?? null) : null;
  const medImpr = ctrBase.length >= 3 ? (median(ctrBase.map((r) => r.impressions)) ?? null) : null;
  const retBase = (i.perf28 ?? []).filter((p) => p.avgViewPercent !== null && p.views >= th.minViews);
  const medRet = retBase.length >= 3 ? (median(retBase.map((p) => p.avgViewPercent!)) ?? null) : null;
  const medViews = retBase.length >= 3 ? (median(retBase.map((p) => p.views)) ?? null) : null;

  const entries: QueueEntry[] = [];
  for (const v of pub) {
    const p = perf.get(v.id);
    const r = reach.get(v.id);
    const signals: Signal[] = [];
    // 1. Shown often, clicked rarely: packaging is the bottleneck (needs enough impressions to compare).
    if (r && medCtr !== null && medImpr !== null && r.impressions >= th.minImpressions && r.impressions >= medImpr && r.ctr <= 0.75 * medCtr)
      signals.push({ kind: 'low-ctr', evidence: { impressions: r.impressions, ctr: round(r.ctr * 100, 1), medianCtr: round(medCtr * 100, 1), missedClicks: Math.round(r.impressions * (medCtr - r.ctr)) } });
    // 2. Viewers who come stay, but few come: title/thumbnail or discovery, not content.
    if (p && p.avgViewPercent !== null && medRet !== null && medViews !== null && p.views >= th.minViews && p.avgViewPercent >= 1.15 * medRet && p.views <= medViews)
      signals.push({ kind: 'strong-retention-low-reach', evidence: { avgViewPercent: round(p.avgViewPercent, 1), medianAvgViewPercent: round(medRet, 1), views: p.views, medianViews: Math.round(medViews) } });
    // 3. Old video that still gets traffic: update links, chapters, end screens, playlists.
    const age = days(v.publishedAt, now);
    if (p && age >= th.evergreenDays && medViews !== null && p.views >= Math.max(th.minViews, medViews))
      signals.push({ kind: 'evergreen-traffic', evidence: { ageDays: Math.round(age), views: p.views, medianViews: Math.round(medViews) } });
    // 4. Metadata checks fail; counted only together with traffic so the queue stays about videos people see.
    const failing = auditVideo(v).failing.filter((c) => PACKAGING_CHECKS.includes(c.id)).map((c) => c.id);
    if (failing.length && p && p.views >= th.minViews) signals.push({ kind: 'weak-packaging', evidence: { checks: failing.join(', '), views: p.views } });
    if (!signals.length) continue;
    entries.push({
      videoId: v.id,
      title: v.title,
      thumbnail: v.thumbnail,
      publishedAt: v.publishedAt,
      signals: signals.sort((a, b) => SIGNAL_ORDER.indexOf(a.kind) - SIGNAL_ORDER.indexOf(b.kind)),
      ...(p && { views28: p.views }),
      snap: snapOf(i.measuredAt, p, r),
      thinData: medCtr === null || medRet === null,
    });
  }
  entries.sort(
    (a, b) =>
      b.signals.length - a.signals.length ||
      SIGNAL_ORDER.indexOf(a.signals[0]!.kind) - SIGNAL_ORDER.indexOf(b.signals[0]!.kind) ||
      (b.views28 ?? -1) - (a.views28 ?? -1) ||
      a.videoId.localeCompare(b.videoId),
  );
  return { entries, thinCtr: medCtr === null, thinRetention: medRet === null, medians: { ctr: medCtr === null ? null : round(medCtr * 100, 1), avgViewPercent: medRet === null ? null : round(medRet, 1), views: medViews } };
}

export function snapOf(at: string, p?: { views: number; avgViewPercent: number | null }, r?: ClickRow): MetricSnap {
  return {
    at,
    periodDays: 28,
    ...(p && { views: p.views }),
    ...(p && p.avgViewPercent !== null && { avgViewPercent: round(p.avgViewPercent, 1) }),
    ...(r && { impressions: r.impressions, ctr: round(r.ctr * 100, 2) }),
  };
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export const queueId = (channelId: string, videoId: string) => `${channelId}:${videoId}`;

/** Status as the owner sees it now: a snooze that has ended reads as open again. */
export function effectiveStatus(item: Pick<OptimizeItem, 'status' | 'snoozeUntil'> | undefined, now = Date.now()): QueueStatus {
  if (!item) return 'open';
  if (item.status === 'snoozed' && (!item.snoozeUntil || Date.parse(item.snoozeUntil) <= now)) return 'open';
  return item.status;
}

/** Entries the owner should see in the active list (open or in progress), at most `limit`. */
export function activeQueue(entries: QueueEntry[], items: Map<string, OptimizeItem>, channelId: string, now = Date.now(), limit = 10): QueueEntry[] {
  return entries.filter((e) => ['open', 'doing'].includes(effectiveStatus(items.get(queueId(channelId, e.videoId)), now))).slice(0, limit);
}

export type Change = { metric: keyof Omit<MetricSnap, 'at' | 'periodDays'>; before: number; after: number; delta: number };

/**
 * Before/after for the observation log: only metrics present in both snapshots, and only when at least
 * `minDays` passed since the baseline (earlier numbers mostly overlap the "before" window).
 */
export function compareSnaps(before: MetricSnap | undefined, after: MetricSnap | undefined, minDays = 7): { ready: boolean; changes: Change[] } {
  if (!before || !after) return { ready: false, changes: [] };
  const ready = (Date.parse(after.at) - Date.parse(before.at)) / 86_400_000 >= minDays;
  const changes: Change[] = [];
  for (const metric of ['views', 'impressions', 'ctr', 'avgViewPercent'] as const) {
    const b = before[metric];
    const a = after[metric];
    if (b === undefined || a === undefined) continue;
    changes.push({ metric, before: b, after: a, delta: round(a - b, 2) });
  }
  return { ready, changes };
}
