// Pure SEO rules: keyword score from a search sample, rank parsing and change detection, tag advice,
// brand mention filtering and niche leaderboard growth. Everything here works on data that was actually
// fetched; the keyword score is an explained estimate, never a search volume.
import { daysSince, median, viewsPerDay } from './research';
import { normalizeForSearch } from './text';

export interface ScoreVideo {
  id: string;
  title: string;
  channelId: string;
  publishedAt: string;
  views?: number;
}

/** Maps x on a log10 scale between lo (→0) and hi (→100), clamped. */
export function logScale(x: number | undefined, lo: number, hi: number): number | undefined {
  if (x === undefined || !Number.isFinite(x)) return undefined;
  const v = Math.log10(Math.max(1, x));
  const a = Math.log10(Math.max(1, lo));
  const b = Math.log10(Math.max(1, hi));
  return clamp(((v - a) / (b - a)) * 100);
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const round = (x: number | undefined) => (x === undefined ? undefined : Math.round(x));

/** True when every word of the phrase appears, in order and adjacent, in the title (case/diacritic-insensitive). */
export function hasExactPhrase(title: string, phrase: string): boolean {
  const p = normalizeForSearch(phrase).replace(/\s+/g, ' ').trim();
  if (!p) return false;
  const t = ` ${normalizeForSearch(title).replace(/[\s|,.!?:;"'()[\]{}«»؟،…\-–—/#]+/g, ' ').trim()} `;
  return t.includes(` ${p} `);
}

export interface KeywordScoreInput {
  keyword: string;
  /** Sample in search order. */
  videos: ScoreVideo[];
  /** Subscriber counts by channel id; undefined when hidden or unknown. */
  subscribers: Record<string, number | undefined>;
  /** The creator's own channel(s), if known. */
  mine?: { channelIds: string[]; subscribers?: number };
  now?: number;
}

export interface KeywordScore {
  /** 0–100 estimate. Higher means a better opportunity for this channel. */
  score: number;
  sampleSize: number;
  /** How many of the top results the medians use. */
  topN: number;
  parts: {
    competition: {
      /** 0–100, higher = harder. */
      score: number;
      medianViews?: number;
      medianSubscribers?: number;
      /** Share of top results with the exact phrase in the title (0..1). */
      exactShare: number;
    };
    demand: {
      /** 0–100, higher = more viewer interest (proxy, not search volume). */
      score: number;
      medianViewsPerDay?: number;
      /** Share of top results published in the last 90 days (0..1). */
      recentShare: number;
    };
    chance: {
      /** 0–100; null when nothing is known about the channel and no sizes are public. */
      score: number | null;
      myPositions: number[];
      /** Share of top-20 results from channels the same size or smaller (0..1). */
      similarShare?: number;
      /** 'similar': compared with the creator's own subscriber count; 'small': channels under 10K. */
      basis: 'similar' | 'small' | 'none';
    };
  };
}

export const SCORE_WEIGHTS = { demand: 0.4, competition: 0.35, chance: 0.25 } as const;

/**
 * Keyword score from a search sample. Sub-signals:
 * - competition: median views and median channel size of the top 10, and how many titles use the exact phrase;
 * - demand: median views/day of the top 10 and how many were published in the last 90 days;
 * - chance: whether the creator's channel already ranks, and how many top-20 results come from channels of a similar size.
 */
export function keywordScore(input: KeywordScoreInput): KeywordScore {
  const now = input.now ?? Date.now();
  const vids = input.videos;
  const top = vids.slice(0, 10);
  const top20 = vids.slice(0, 20);
  const views = top.map((v) => v.views).filter((x): x is number => x !== undefined);
  const subsTop = top.map((v) => input.subscribers[v.channelId]).filter((x): x is number => x !== undefined);
  const medianViews = median(views);
  const medianSubscribers = median(subsTop);
  const exactShare = top.length ? top.filter((v) => hasExactPhrase(v.title, input.keyword)).length / top.length : 0;

  const cParts: [number | undefined, number][] = [
    [logScale(medianViews, 1_000, 2_000_000), 0.4],
    [logScale(medianSubscribers, 1_000, 2_000_000), 0.4],
    [exactShare * 100, 0.2],
  ];
  const competition = weighted(cParts) ?? 50;

  const vpd = median(top.map((v) => viewsPerDay(v, now)).filter((x): x is number => x !== undefined));
  const recentShare = top.length ? top.filter((v) => daysSince(v.publishedAt, now) <= 90).length / top.length : 0;
  const demand = weighted([
    [logScale(vpd, 2, 20_000), 0.7],
    [recentShare * 100, 0.3],
  ]) ?? 0;

  const mineIds = new Set(input.mine?.channelIds ?? []);
  const myPositions = vids.flatMap((v, i) => (mineIds.has(v.channelId) ? [i + 1] : []));
  const mySubs = input.mine?.subscribers;
  let basis: KeywordScore['parts']['chance']['basis'] = 'none';
  let similarShare: number | undefined;
  const known = top20.filter((v) => input.subscribers[v.channelId] !== undefined && !mineIds.has(v.channelId));
  if (known.length) {
    const limit = mySubs !== undefined ? Math.max(3 * mySubs, 1_000) : 10_000;
    basis = mySubs !== undefined ? 'similar' : 'small';
    similarShare = known.filter((v) => (input.subscribers[v.channelId] ?? Infinity) <= limit).length / known.length;
  }
  let chance: number | null = null;
  if (similarShare !== undefined || myPositions.length) {
    const best = myPositions[0];
    const rankBonus = best === undefined ? 0 : best <= 3 ? 50 : best <= 10 ? 35 : best <= 25 ? 20 : 10;
    chance = clamp((similarShare ?? 0) * 70 + rankBonus + (similarShare === undefined ? 30 : 0));
  }

  const parts = [
    [demand, SCORE_WEIGHTS.demand],
    [100 - competition, SCORE_WEIGHTS.competition],
    [chance ?? undefined, SCORE_WEIGHTS.chance],
  ] as [number | undefined, number][];
  const score = vids.length ? Math.round(weighted(parts) ?? 0) : 0;
  return {
    score,
    sampleSize: vids.length,
    topN: top.length,
    parts: {
      competition: { score: Math.round(competition), medianViews: round(medianViews), medianSubscribers: round(medianSubscribers), exactShare },
      demand: { score: Math.round(demand), medianViewsPerDay: vpd, recentShare },
      chance: { score: chance === null ? null : Math.round(chance), myPositions, similarShare, basis },
    },
  };
}

/** Weighted mean of the defined values; the weights of undefined values are dropped. */
export function weighted(parts: [number | undefined, number][]): number | undefined {
  let sum = 0;
  let w = 0;
  for (const [v, wt] of parts) {
    if (v === undefined || !Number.isFinite(v)) continue;
    sum += v * wt;
    w += wt;
  }
  return w ? sum / w : undefined;
}

export type ScoreBand = 'low' | 'medium' | 'high';
export const band = (x: number | null | undefined): ScoreBand | null => (x === null || x === undefined ? null : x >= 70 ? 'high' : x >= 40 ? 'medium' : 'low');

// ---- rank tracking ----

export interface RankTarget {
  videoId?: string;
  channelId?: string;
}
export interface RankItem {
  id: string;
  channelId: string;
}

/** 1-based position of the target in the results (the best one for a channel), or null when absent. */
export function findPosition(items: RankItem[], target: RankTarget): number | null {
  const i = items.findIndex((x) => (target.videoId ? x.id === target.videoId : !!target.channelId && x.channelId === target.channelId));
  return i < 0 ? null : i + 1;
}

/** Video ids from a search.list response, in order (non-video results skipped). */
export function parseSearchItems(body: unknown): { id: string; channelId: string; title: string; channelTitle: string; publishedAt: string; thumbnail?: string }[] {
  const items = (body as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: ReturnType<typeof parseSearchItems> = [];
  for (const raw of items) {
    const it = (raw ?? {}) as Record<string, any>;
    const id = typeof it.id?.videoId === 'string' ? it.id.videoId : '';
    if (!id) continue;
    const sn = (it.snippet ?? {}) as Record<string, any>;
    out.push({
      id,
      channelId: String(sn.channelId ?? ''),
      title: String(sn.title ?? ''),
      channelTitle: String(sn.channelTitle ?? ''),
      publishedAt: String(sn.publishedAt ?? ''),
      thumbnail: typeof sn.thumbnails?.medium?.url === 'string' ? sn.thumbnails.medium.url : undefined,
    });
  }
  return out;
}

export interface RankChange {
  /** Positive = moved up (better). null when either side is missing. */
  delta: number | null;
  enteredTop10: boolean;
  leftTop10: boolean;
  enteredTop50: boolean;
  leftTop50: boolean;
  /** True when this change deserves an alert (moved by ≥3 or crossed the top-10 line). */
  alert: boolean;
}

export function rankChange(prev: number | null | undefined, cur: number | null): RankChange {
  const had = prev !== undefined;
  const p = prev ?? null;
  const delta = p !== null && cur !== null ? p - cur : null;
  const inTop10 = (x: number | null) => x !== null && x <= 10;
  const enteredTop10 = had && !inTop10(p) && inTop10(cur);
  const leftTop10 = had && inTop10(p) && !inTop10(cur);
  const enteredTop50 = had && p === null && cur !== null;
  const leftTop50 = had && p !== null && cur === null;
  const alert = had && ((delta !== null && Math.abs(delta) >= 3) || enteredTop10 || leftTop10 || enteredTop50 || leftTop50);
  return { delta, enteredTop10, leftTop10, enteredTop50, leftTop50, alert };
}

/** Results around a position (two above and two below), or the top `n` when not ranked. */
export function around<T>(items: T[], position: number | null, n = 5): { pos: number; item: T }[] {
  const start = position === null ? 0 : Math.max(0, position - 3);
  const end = position === null ? n : Math.min(items.length, position + 2);
  return items.slice(start, end).map((item, i) => ({ pos: start + i + 1, item }));
}

/** True when a tracker is due: never checked, or last checked at least `everyMs` ago. */
export function isDue(lastCheckedAt: string | undefined, everyMs: number, now = Date.now()): boolean {
  if (!lastCheckedAt) return true;
  const t = Date.parse(lastCheckedAt);
  return Number.isNaN(t) || now - t >= everyMs;
}

export const SEARCH_COST = 100;
export const RANK_CHECK_COST = SEARCH_COST + 1;

/** Units the background may still spend today, keeping a reserve for the owner's own actions. */
export function spendable(ytUnitsUsed: number, dailyCap: number): number {
  const cap = dailyCap > 0 ? dailyCap : 10_000;
  const reserve = Math.max(500, Math.round(cap * 0.1));
  return Math.max(0, cap - ytUnitsUsed - reserve);
}

// ---- tag rankings ----

export type TagAdvice = 'keep' | 'improve' | 'drop';

/** Keep tags that rank in the top 20, improve those ranking 21–50, consider dropping the rest. */
export function tagAdvice(position: number | null): TagAdvice {
  if (position === null) return 'drop';
  return position <= 20 ? 'keep' : 'improve';
}

// ---- brand mentions ----

export interface MentionCandidate {
  id: string;
  channelId: string;
}

/** New videos by other channels, not seen before. */
export function newMentions<T extends MentionCandidate>(items: T[], ownChannelIds: string[], seen: string[]): T[] {
  const own = new Set(ownChannelIds);
  const old = new Set(seen);
  return items.filter((x) => !own.has(x.channelId) && !old.has(x.id));
}

// ---- competitor uploads ----

/** Upload ids not seen before; the first check only records a baseline. */
export function freshUploads(current: string[], seen: string[] | undefined): string[] {
  if (!seen) return [];
  const old = new Set(seen);
  return current.filter((id) => !old.has(id));
}

// ---- niche leaderboard ----

export interface NichePoint {
  at: string;
  subscribers?: number;
  views?: number;
  videoCount?: number;
  uploads30?: number;
  avgViews10?: number;
}

export interface Growth {
  abs: number;
  /** Relative change (0.05 = +5%); undefined when the base is 0. */
  pct?: number;
  /** Days actually covered (may be shorter than asked when history is short). */
  spanDays: number;
  /** True when history is shorter than the asked window. */
  partial: boolean;
}

/**
 * Growth of a field over the last `days`, using the latest snapshot as the end and the latest snapshot at or
 * before the window start as the base (or the oldest one, marked partial). Needs at least two snapshots
 * with the field present; returns null otherwise.
 */
export function growth(points: NichePoint[], field: 'subscribers' | 'views' | 'videoCount', days: number): Growth | null {
  const xs = points
    .filter((p) => typeof p[field] === 'number' && !Number.isNaN(Date.parse(p.at)))
    .sort((a, b) => a.at.localeCompare(b.at));
  if (xs.length < 2) return null;
  const end = xs[xs.length - 1]!;
  const endT = Date.parse(end.at);
  const startT = endT - days * 86_400_000;
  const before = xs.filter((p) => Date.parse(p.at) <= startT + 3600_000);
  const base = before.length ? before[before.length - 1]! : xs[0]!;
  if (base === end) return null;
  const a = base[field] as number;
  const b = end[field] as number;
  const spanDays = (endT - Date.parse(base.at)) / 86_400_000;
  return { abs: b - a, pct: a ? (b - a) / a : undefined, spanDays, partial: !before.length };
}

/** Number of dates within the last `days` (uploads per period). */
export function countSince(dates: string[], days: number, now = Date.now()): number {
  return dates.filter((d) => {
    const t = Date.parse(d);
    return !Number.isNaN(t) && now - t <= days * 86_400_000;
  }).length;
}

/** Mean of the defined values among the first `n`. */
export function meanOfFirst(values: (number | undefined)[], n: number): number | undefined {
  const xs = values.slice(0, n).filter((x): x is number => x !== undefined);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}

export type LeaderSort = 'subs' | 'subs7' | 'subs30' | 'views30' | 'uploads30' | 'avgViews';

export interface LeaderRow {
  channelId: string;
  title: string;
  mine: boolean;
  latest?: NichePoint;
  subs7: Growth | null;
  subs30: Growth | null;
  views30: Growth | null;
  history: NichePoint[];
}

export function leaderRow(channelId: string, title: string, mine: boolean, history: NichePoint[]): LeaderRow {
  const sorted = [...history].sort((a, b) => a.at.localeCompare(b.at));
  return {
    channelId,
    title,
    mine,
    latest: sorted[sorted.length - 1],
    subs7: growth(sorted, 'subscribers', 7),
    subs30: growth(sorted, 'subscribers', 30),
    views30: growth(sorted, 'views', 30),
    history: sorted,
  };
}

/** Sort value for a leaderboard column; rows without a value sort last. */
export function leaderValue(r: LeaderRow, by: LeaderSort): number | undefined {
  switch (by) {
    case 'subs':
      return r.latest?.subscribers;
    case 'subs7':
      return r.subs7?.abs;
    case 'subs30':
      return r.subs30?.abs;
    case 'views30':
      return r.views30?.abs;
    case 'uploads30':
      return r.latest?.uploads30;
    case 'avgViews':
      return r.latest?.avgViews10;
  }
}

export function sortLeaders(rows: LeaderRow[], by: LeaderSort): LeaderRow[] {
  return [...rows].sort((a, b) => {
    const x = leaderValue(a, by);
    const y = leaderValue(b, by);
    if (x === undefined && y === undefined) return a.title.localeCompare(b.title);
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return y - x;
  });
}

/** Extracts a video id from a URL (watch, youtu.be, shorts, live, embed) or a bare 11-character id. */
export function parseVideoInput(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/|\/video\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m?.[1] ?? null;
}

/** Up to `n` related terms from tags and AI suggestions, without the keyword itself and duplicates. */
export function relatedTerms(keyword: string, sources: string[][], n = 20): string[] {
  const seen = new Set([normalizeForSearch(keyword)]);
  const out: string[] = [];
  for (const list of sources)
    for (const raw of list) {
      const term = raw.trim();
      const key = normalizeForSearch(term);
      if (!key || seen.has(key) || term.length > 80) continue;
      seen.add(key);
      out.push(term);
      if (out.length >= n) return out;
    }
  return out;
}
