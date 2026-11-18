// Pure rules for the channel page (#5): Channelytics figures and Channel Insights (growth benchmark, content
// calendar, activity feed, performance distribution, topical analysis). No browser APIs here.
//
// Honesty rules applied throughout:
// - Growth of other channels comes only from TubeX's own daily snapshots (the public API has no history). With less
//   than a day of history the result is `tracking` (with the date tracking started), never 0 or an estimate.
// - "Short" is judged from the duration only, because the Data API does not say whether a video is a Short:
//   ≤ 60 s = Short; 61–180 s = "possibly a Short" (Shorts may be up to 3 minutes since October 2024); > 180 s = long-form.
import { normalizeForSearch } from './text';

export const DAY = 86_400_000;
export const SHORT_SURE_SEC = 60;
export const SHORT_MAX_SEC = 180;
/** Uploads read for a channel by default (2 units: one playlistItems page + one videos page), and the largest load offered. */
export const UPLOADS_DEFAULT = 50;
export const UPLOADS_MAX = 200;
/** Units an uploads load costs when nothing is cached: 1 per 50 for the playlist + 1 per 50 for statistics. */
export const uploadsCost = (n: number) => 2 * Math.ceil(Math.max(1, n) / 50);
/** Growth needs at least this much history between two snapshots. */
export const MIN_SPAN_DAYS = 0.9;

// ---------------------------------------------------------------- small numeric helpers

export function median(values: (number | undefined)[]): number | undefined {
  const xs = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return undefined;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1]! + xs[m]!) / 2;
}

/** Share (0–100) of `sorted` values strictly below `x`, plus half of the ties (mid-rank percentile). */
export function percentileOf(sorted: number[], x: number): number {
  if (!sorted.length) return 0;
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return ((below + equal / 2) / sorted.length) * 100;
}

// ---------------------------------------------------------------- video kind

export type VideoKind = 'long' | 'short' | 'maybeShort' | 'unknown';

export function videoKind(durationSec: number | undefined): VideoKind {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 'unknown'; // live, upcoming or not processed
  if (durationSec <= SHORT_SURE_SEC) return 'short';
  if (durationSec <= SHORT_MAX_SEC) return 'maybeShort';
  return 'long';
}

// ---------------------------------------------------------------- channel keywords

/**
 * Parses `brandingSettings.channel.keywords`: words separated by spaces, phrases in double quotes
 * (e.g. `"UI Design" figma "آموزش فیگما"`). Duplicates (after normalization) are dropped; order is kept.
 */
export function parseChannelKeywords(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const k = (m[1] ?? m[2] ?? '').replace(/"/g, '').trim();
    const key = normalizeForSearch(k);
    if (!k || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/** Copy format: comma separated, the way YouTube's own tag/keyword fields accept them. */
export const keywordsText = (kws: string[]) => kws.join(', ');

// ---------------------------------------------------------------- snapshots and growth

export interface SnapPoint {
  at: string;
  subscribers?: number;
  views?: number;
  videoCount?: number;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Merges snapshot records (from several refs) into one point per UTC day, keeping the latest of each day. */
export function snapPoints(records: { at: string; data: Record<string, unknown> }[]): SnapPoint[] {
  const byDay = new Map<string, SnapPoint>();
  for (const r of records) {
    const t = Date.parse(r.at);
    if (!Number.isFinite(t)) continue;
    const p: SnapPoint = { at: new Date(t).toISOString(), subscribers: num(r.data.subscribers), views: num(r.data.views), videoCount: num(r.data.videoCount) };
    if (p.subscribers === undefined && p.views === undefined && p.videoCount === undefined) continue;
    const day = p.at.slice(0, 10);
    const prev = byDay.get(day);
    if (!prev || prev.at < p.at) byDay.set(day, { ...prev, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as SnapPoint);
  }
  return [...byDay.values()].sort((a, b) => a.at.localeCompare(b.at));
}

export interface Delta {
  from: number;
  to: number;
  delta: number;
  /** Growth in percent of the starting value; undefined when the start is 0. */
  pct?: number;
}

export type GrowthSource = 'snapshots' | 'analytics';

export type Growth =
  | { state: 'none' }
  | { state: 'tracking'; since: string }
  | { state: 'ok'; source: GrowthSource; spanDays: number; since: string; until: string; views?: Delta; subs?: Delta };

const delta = (a: number | undefined, b: number | undefined): Delta | undefined => {
  if (a === undefined || b === undefined) return undefined;
  return { from: a, to: b, delta: b - a, pct: a > 0 ? ((b - a) / a) * 100 : undefined };
};

/**
 * Growth over the latest `windowDays` of history: from the earliest snapshot inside the window to the latest one.
 * Fewer than two snapshots a day apart → `tracking` with the first snapshot's date.
 */
export function growthFromSnapshots(points: SnapPoint[], windowDays = 30): Growth {
  if (!points.length) return { state: 'none' };
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const last = sorted[sorted.length - 1]!;
  const lastT = Date.parse(last.at);
  const base = sorted.find((p) => Date.parse(p.at) >= lastT - windowDays * DAY - 6 * 3600_000) ?? sorted[0]!;
  const spanDays = (lastT - Date.parse(base.at)) / DAY;
  if (spanDays < MIN_SPAN_DAYS) return { state: 'tracking', since: sorted[0]!.at };
  const views = delta(base.views, last.views);
  const subs = delta(base.subscribers, last.subscribers);
  if (!views && !subs) return { state: 'tracking', since: sorted[0]!.at };
  return { state: 'ok', source: 'snapshots', spanDays, since: base.at, until: last.at, views, subs };
}

/**
 * Own channel: real 30-day figures from YouTube Analytics against the current public totals.
 * `days` views and net subscribers over the period; start = total − period gain.
 */
export function growthFromAnalytics(totals: { views?: number; subscribers?: number }, period: { views?: number; subsNet?: number; days: number; startDate: string; endDate: string }): Growth {
  const d = (total: number | undefined, gain: number | undefined): Delta | undefined => {
    if (total === undefined || gain === undefined) return undefined;
    return delta(total - gain, total);
  };
  const views = d(totals.views, period.views);
  const subs = d(totals.subscribers, period.subsNet);
  if (!views && !subs) return { state: 'none' };
  return { state: 'ok', source: 'analytics', spanDays: period.days, since: `${period.startDate}T00:00:00.000Z`, until: `${period.endDate}T23:59:59.000Z`, views, subs };
}

export type GrowthMetric = 'views' | 'subs';

/** Average growth per day in percent over the measured span, so channels measured over different spans compare fairly. */
export function dailyRate(g: Growth | undefined, metric: GrowthMetric): number | undefined {
  if (!g || g.state !== 'ok' || g.spanDays <= 0) return undefined;
  const pct = g[metric]?.pct;
  return pct === undefined ? undefined : pct / g.spanDays;
}

/** The figure shown for "growth over the last 30 days": the measured growth, scaled to 30 days only when a full window was measured. */
export function rateOver(g: Growth | undefined, metric: GrowthMetric): { pct: number; days: number } | undefined {
  if (!g || g.state !== 'ok') return undefined;
  const pct = g[metric]?.pct;
  if (pct === undefined) return undefined;
  return { pct, days: Math.max(1, Math.round(g.spanDays)) };
}

export interface BenchEntry {
  id: string;
  label: string;
  rate?: number;
  role: 'this' | 'you' | 'niche' | 'member';
}

export interface Benchmark {
  min: number;
  max: number;
  median: number;
  /** Position on the bar (0 = lowest, 1 = highest) of every entry that has a rate. */
  marks: { id: string; label: string; role: BenchEntry['role']; rate: number; pos: number }[];
  /** How many channels had a rate. */
  n: number;
}

/**
 * Places channels on a Lowest → Median → Highest bar. The niche median is computed from the niche members' rates
 * and added as its own mark. Needs at least two channels with a rate; otherwise undefined.
 */
export function benchmark(entries: BenchEntry[]): Benchmark | undefined {
  const rated = entries.filter((e): e is BenchEntry & { rate: number } => e.rate !== undefined && Number.isFinite(e.rate));
  // A channel can be in the niche and also be "this" channel; count each id once for the scale.
  const unique = new Map<string, number>();
  for (const e of rated) unique.set(e.id, e.rate);
  if (unique.size < 2) return undefined;
  const rates = [...unique.values()];
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const med = median(rates)!;
  const pos = (r: number) => (max === min ? 0.5 : (r - min) / (max - min));
  const marks = rated.filter((e) => e.role !== 'member').map((e) => ({ id: e.id, label: e.label, role: e.role, rate: e.rate, pos: pos(e.rate) }));
  const nicheRates = rated.filter((e) => e.role === 'member').map((e) => e.rate);
  const nm = median(nicheRates);
  if (nm !== undefined) marks.push({ id: 'niche', label: '', role: 'niche', rate: nm, pos: pos(nm) });
  return { min, max, median: med, marks, n: unique.size };
}

/** Difference in percentage points between two growth figures (this − other). */
export function pointsDiff(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined || b === undefined ? undefined : a - b;
}

// ---------------------------------------------------------------- uploads: last 30 days, calendar, feed

export interface UploadLite {
  id: string;
  title: string;
  publishedAt: string;
  durationSec: number;
  views?: number;
  likes?: number;
  comments?: number;
  tags?: string[];
  thumbnail?: string;
  channelId?: string;
}

/**
 * Uploads in the last `days`. `complete` is false when the fetched list may not reach back far enough
 * (every fetched upload is inside the window and the channel has more videos than were fetched).
 */
export function uploadsSince(videos: UploadLite[], days: number, now: number, totalVideos?: number): { count: number; complete: boolean } {
  const from = now - days * DAY;
  const times = videos.map((v) => Date.parse(v.publishedAt)).filter(Number.isFinite);
  const count = times.filter((t) => t >= from).length;
  const reachesBack = times.some((t) => t < from);
  const fetchedAll = totalVideos !== undefined && videos.length >= totalVideos;
  return { count, complete: reachesBack || fetchedAll };
}

/** Views per upload by publish date (oldest first) for the compare chart of channels without analytics. */
export function viewsByPublishDate(videos: UploadLite[]): { t: number; views: number; id: string; title: string }[] {
  return videos
    .filter((v) => v.views !== undefined && Number.isFinite(Date.parse(v.publishedAt)))
    .map((v) => ({ t: Date.parse(v.publishedAt), views: v.views!, id: v.id, title: v.title }))
    .sort((a, b) => a.t - b.t);
}

/** Calendar parts of a date in some calendar (Gregorian or Persian), supplied by the UI through Intl. */
export type DateParts = (d: Date) => { y: number; m: number; d: number };

export const gregorianParts: DateParts = (d) => ({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });

/** Local calendar day key (YYYY-MM-DD in the Gregorian calendar of this browser's time zone). */
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const atNoon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

export interface CalendarCell {
  key: string;
  date: Date;
  day: number;
  inMonth: boolean;
  uploads: UploadLite[];
}

/** First and last day of the month that contains `anchor`, in the given calendar. */
export function monthBounds(anchor: Date, parts: DateParts): { first: Date; last: Date } {
  const a = atNoon(anchor);
  const { y, m } = parts(a);
  let first = a;
  while (true) {
    const prev = addDays(first, -1);
    const p = parts(prev);
    if (p.y !== y || p.m !== m) break;
    first = prev;
  }
  let last = a;
  while (true) {
    const next = addDays(last, 1);
    const p = parts(next);
    if (p.y !== y || p.m !== m) break;
    last = next;
  }
  return { first, last };
}

/** A month grid (weeks × 7) starting on `weekStart` (0 = Sunday, 6 = Saturday), with each day's uploads. */
export function monthGrid(anchor: Date, parts: DateParts, weekStart: number, videos: UploadLite[]): { weeks: CalendarCell[][]; first: Date; last: Date } {
  const { first, last } = monthBounds(anchor, parts);
  const byDay = new Map<string, UploadLite[]>();
  for (const v of videos) {
    const t = Date.parse(v.publishedAt);
    if (!Number.isFinite(t)) continue;
    const k = localDay(new Date(t));
    byDay.set(k, [...(byDay.get(k) ?? []), v]);
  }
  const lead = (first.getDay() - weekStart + 7) % 7;
  let d = addDays(first, -lead);
  const weeks: CalendarCell[][] = [];
  while (weeks.length < 6) {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const key = localDay(d);
      week.push({ key, date: d, day: parts(d).d, inMonth: d >= first && d <= last, uploads: byDay.get(key) ?? [] });
      d = addDays(d, 1);
    }
    weeks.push(week);
    if (d > last) break;
  }
  return { weeks, first, last };
}

export const prevMonth = (first: Date) => addDays(first, -1);
export const nextMonth = (last: Date) => addDays(last, 1);

/** Activity feed groups: uploads by local day, newest first, with how many calendar days ago that day was. */
export function feedGroups<T extends UploadLite>(videos: T[], now: Date): { key: string; daysAgo: number; date: Date; videos: T[] }[] {
  const today = atNoon(now);
  const groups = new Map<string, { key: string; daysAgo: number; date: Date; videos: T[] }>();
  for (const v of [...videos].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const t = Date.parse(v.publishedAt);
    if (!Number.isFinite(t)) continue;
    const d = atNoon(new Date(t));
    const key = localDay(d);
    const daysAgo = Math.round((today.getTime() - d.getTime()) / DAY);
    const g = groups.get(key) ?? { key, daysAgo, date: d, videos: [] };
    g.videos.push(v);
    groups.set(key, g);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- performance distribution

export type Band = 'typical' | 'uncommon' | 'rare' | 'veryRare';
export const bandOf = (percentile: number): Band => (percentile >= 95 ? 'veryRare' : percentile >= 85 ? 'rare' : percentile >= 75 ? 'uncommon' : 'typical');

/** Videos younger than this are listed as "too new" instead of being judged. */
export const MIN_AGE_DAYS = 7;
/** A group needs this many judged videos for percentiles to mean anything. */
export const MIN_GROUP = 5;
/** Flop: in the bottom 10% of its group and under half the group's median. */
export const FLOP_PERCENTILE = 10;

export interface PerfItem<T extends UploadLite = UploadLite> {
  video: T;
  group: 'short' | 'long';
  /** Views ÷ the group's median views. */
  ratio: number;
  percentile: number;
  band: Band;
  flop: boolean;
}

export interface Performance<T extends UploadLite = UploadLite> {
  items: PerfItem<T>[];
  baseline: { long?: number; short?: number };
  counts: Record<Band, number>;
  hits: PerfItem<T>[];
  flops: PerfItem<T>[];
  tooNew: T[];
  hidden: T[];
  /** Groups with too few videos to judge. */
  thin: ('short' | 'long')[];
}

/**
 * Each video against the channel's own baseline: views ÷ median views of the same group (Shorts, incl. "possibly
 * Shorts", vs long-form), percentile within the group, and the bands typical < 75 ≤ uncommon < 85 ≤ rare < 95 ≤ very rare.
 */
export function performance<T extends UploadLite>(videos: T[], now: number): Performance<T> {
  const tooNew: T[] = [];
  const hidden: T[] = [];
  const groups: Record<'short' | 'long', T[]> = { short: [], long: [] };
  for (const v of videos) {
    const t = Date.parse(v.publishedAt);
    if (v.views === undefined) hidden.push(v);
    else if (!Number.isFinite(t) || now - t < MIN_AGE_DAYS * DAY) tooNew.push(v);
    else {
      const k = videoKind(v.durationSec);
      groups[k === 'short' || k === 'maybeShort' ? 'short' : 'long'].push(v);
    }
  }
  const items: PerfItem<T>[] = [];
  const baseline: Performance['baseline'] = {};
  const thin: ('short' | 'long')[] = [];
  for (const g of ['long', 'short'] as const) {
    const list = groups[g];
    if (!list.length) continue;
    if (list.length < MIN_GROUP) {
      thin.push(g);
      continue;
    }
    const views = list.map((v) => v.views!).sort((a, b) => a - b);
    const med = median(views)!;
    baseline[g] = med;
    for (const v of list) {
      const p = percentileOf(views, v.views!);
      const ratio = med > 0 ? v.views! / med : v.views! > 0 ? Infinity : 1;
      items.push({ video: v, group: g, ratio, percentile: p, band: bandOf(p), flop: p < FLOP_PERCENTILE && ratio < 0.5 });
    }
  }
  const counts: Record<Band, number> = { typical: 0, uncommon: 0, rare: 0, veryRare: 0 };
  for (const i of items) counts[i.band]++;
  const hits = items.filter((i) => i.band !== 'typical').sort((a, b) => b.ratio - a.ratio);
  const flops = items.filter((i) => i.flop).sort((a, b) => a.ratio - b.ratio);
  return { items, baseline, counts, hits, flops, tooNew, hidden, thin };
}

/** Engagement: (likes + comments) ÷ views; undefined when views or likes are hidden. */
export function engagement(v: Pick<UploadLite, 'views' | 'likes' | 'comments'>): number | undefined {
  if (!v.views || v.likes === undefined) return undefined;
  return (v.likes + (v.comments ?? 0)) / v.views;
}

// ---------------------------------------------------------------- topical analysis (local tokenizer)

const STOP = new Set(
  (
    'a an and are as at be but by can do does for from get got has have how i if in into is it its just me my new no not of on or our out so than that the their them then there these they this to too up us vs was we what when where which who why will with you your ' +
    'part ep episode video videos official full live shorts short channel youtube vlog new 2020 2021 2022 2023 2024 2025 2026 2027 ' +
    'از با به برای بر تا در را که و یا این آن هم چه چرا چطور چگونه یک دو سه می است هست نیست شد شده شود میشود کرد کردن کنید کنیم کن ها های ای اون ' +
    'من تو ما شما او آنها ایشان همه هر خیلی بسیار باید نباید دارد داره داریم دارم بود بودن بوده نه اگر ولی اما پس بعد قبل روی زیر بین مثل همین همان ' +
    'قسمت ویدیو ویدئو کانال جدید شورت لایو'
  ).split(' '),
);

/** Persian suffixes joined with a zero-width non-joiner are dropped before normalizing (کتاب‌ها → کتاب). */
const ZWNJ_SUFFIX = /‌(?:هایی|های|ها|ای|ی|تر|ترین|ام|ات|اش|مان|تان|شان)(?=[^\p{L}\p{N}]|$)/gu;

/** Splits text into normalized word keys (Persian-aware: letter variants folded, ZWNJ suffixes removed, digits unified). */
export function tokenize(text: string): string[] {
  const s = normalizeForSearch(text.replace(ZWNJ_SUFFIX, ''));
  return s.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** Candidate topic keys of one video: title words, adjacent title word pairs, short tag phrases and tag words. */
export function videoTerms(v: Pick<UploadLite, 'title' | 'tags'>): Set<string> {
  const out = new Set<string>();
  const words = normalizeForSearch(v.title.replace(ZWNJ_SUFFIX, '')).split(/[^\p{L}\p{N}]+/u);
  let prev: string | null = null;
  for (const w of words) {
    const ok = w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w);
    if (ok) {
      out.add(w);
      if (prev) out.add(`${prev} ${w}`);
    }
    prev = ok ? w : null;
  }
  for (const tag of v.tags ?? []) {
    const toks = tokenize(tag);
    for (const t of toks) out.add(t);
    if (toks.length >= 2 && toks.length <= 3) out.add(toks.join(' '));
  }
  return out;
}

export interface TopicChannel<T extends UploadLite = UploadLite> {
  channelId: string;
  title: string;
  videos: T[];
}

export interface Topic {
  key: string;
  label: string;
  /** Video ids per channel id. */
  byChannel: Record<string, string[]>;
  total: number;
}

export interface TopicMatrix {
  topics: Topic[];
  /** Videos analysed per channel. */
  sizes: Record<string, number>;
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

/**
 * Clusters the channels' videos into up to `maxTopics` topics: candidate terms that occur in at least two videos, not
 * in more than 60% of all videos (too generic), scored by how many videos and channels use them, picked greedily
 * while skipping candidates that mostly cover the same videos as an earlier pick.
 */
export function topicMatrix(channels: TopicChannel[], maxTopics = 12): TopicMatrix {
  const sizes: Record<string, number> = {};
  const termVideos = new Map<string, Set<string>>();
  const videoChannel = new Map<string, string>();
  let total = 0;
  for (const c of channels) {
    sizes[c.channelId] = c.videos.length;
    for (const v of c.videos) {
      if (videoChannel.has(v.id)) continue;
      videoChannel.set(v.id, c.channelId);
      total++;
      for (const term of videoTerms(v)) {
        const set = termVideos.get(term) ?? new Set<string>();
        set.add(v.id);
        termVideos.set(term, set);
      }
    }
  }
  const minDf = Math.max(2, Math.ceil(total * 0.02));
  const maxDf = total >= 10 ? Math.floor(total * 0.6) : total;
  const scored = [...termVideos.entries()]
    .filter(([, set]) => set.size >= minDf && set.size <= maxDf)
    .map(([key, set]) => {
      const chans = new Set([...set].map((id) => videoChannel.get(id)));
      const phrase = key.includes(' ') ? 1.25 : 1;
      return { key, set, score: set.size * phrase * (1 + 0.5 * (chans.size - 1)) };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const picked: { key: string; set: Set<string> }[] = [];
  for (const c of scored) {
    if (picked.length >= maxTopics) break;
    if (picked.some((p) => jaccard(p.set, c.set) > 0.6 || ((p.key.includes(c.key) || c.key.includes(p.key)) && jaccard(p.set, c.set) > 0.35))) continue;
    picked.push(c);
  }
  const topics: Topic[] = picked.map((p) => {
    const byChannel: Record<string, string[]> = {};
    for (const id of p.set) {
      const ch = videoChannel.get(id)!;
      (byChannel[ch] ??= []).push(id);
    }
    return { key: p.key, label: p.key, byChannel, total: p.set.size };
  });
  return { topics, sizes };
}

/** Share (0–1) of a channel's analysed videos on a topic; undefined when the channel has no videos analysed. */
export function topicShare(m: TopicMatrix, topic: Topic, channelId: string): number | undefined {
  const n = m.sizes[channelId];
  if (!n) return undefined;
  return (topic.byChannel[channelId]?.length ?? 0) / n;
}

export type TopicSort = 'views' | 'engagement' | 'outlier';

export interface TopicVideo<T extends UploadLite = UploadLite> {
  video: T;
  channelId: string;
  engagement?: number;
  /** Views ÷ median views of the video's own channel. */
  outlier?: number;
}

/** Videos of a topic with engagement and outlier score (views against the video's own channel median), sorted. */
export function topicVideos<T extends UploadLite>(channels: TopicChannel<T>[], topic: Topic, sort: TopicSort): TopicVideo<T>[] {
  const out: TopicVideo<T>[] = [];
  for (const c of channels) {
    const ids = new Set(topic.byChannel[c.channelId] ?? []);
    if (!ids.size) continue;
    const med = median(c.videos.map((v) => v.views));
    for (const v of c.videos)
      if (ids.has(v.id)) out.push({ video: v, channelId: c.channelId, engagement: engagement(v), outlier: med && v.views !== undefined ? v.views / med : undefined });
  }
  const key = (x: TopicVideo<T>) => (sort === 'views' ? x.video.views : sort === 'engagement' ? x.engagement : x.outlier) ?? -1;
  return out.sort((a, b) => key(b) - key(a));
}

/** Topic-level figures for sorting the matrix rows. */
export function topicStats<T extends UploadLite>(channels: TopicChannel<T>[], topic: Topic): { views?: number; engagement?: number; outlier?: number } {
  const vids = topicVideos(channels, topic, 'views');
  const views = vids.map((x) => x.video.views).filter((x): x is number => x !== undefined);
  const eng = vids.map((x) => x.engagement).filter((x): x is number => x !== undefined);
  const out = vids.map((x) => x.outlier).filter((x): x is number => x !== undefined);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
  return { views: views.length ? views.reduce((a, b) => a + b, 0) : undefined, engagement: mean(eng), outlier: median(out) };
}

/** Applies AI labels ({ key → label }) to topics, ignoring unknown keys and empty or overlong labels. */
export function relabelTopics(m: TopicMatrix, labels: unknown): TopicMatrix {
  if (!labels || typeof labels !== 'object') return m;
  const map = labels as Record<string, unknown>;
  return {
    ...m,
    topics: m.topics.map((t) => {
      const l = map[t.key];
      return typeof l === 'string' && l.trim() && l.length <= 60 ? { ...t, label: l.trim() } : t;
    }),
  };
}
