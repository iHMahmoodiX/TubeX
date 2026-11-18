// Pure helpers for research views. Everything here describes a fetched sample; nothing estimates
// search volume, ranking or reach.
import { normalizeForSearch } from './text';

export interface SampleVideo {
  id: string;
  title: string;
  channelId: string;
  publishedAt: string;
  tags: string[];
  views?: number;
  likes?: number;
  comments?: number;
}

export interface Frequency {
  term: string;
  count: number;
}

/** Tags used by more than one video in the sample, most common first. The first spelling seen is kept. */
export function commonTags(videos: Pick<SampleVideo, 'tags'>[], min = 2, limit = 40): Frequency[] {
  const counts = new Map<string, Frequency>();
  for (const v of videos) {
    const seen = new Set<string>();
    for (const tag of v.tags) {
      const key = normalizeForSearch(tag);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const f = counts.get(key);
      if (f) f.count++;
      else counts.set(key, { term: tag.trim(), count: 1 });
    }
  }
  return [...counts.values()].filter((f) => f.count >= min).sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, limit);
}

const STOP = new Set(
  (
    'a an and are as at be by for from how i in is it its my of on or so that the this to vs was what when why with you your ' +
    'از با به برای بر تا در را که و یا این آن هم چه چرا چطور چگونه یک می است هست شد شده کرد کنید کن ها های ای اون'
  ).split(' '),
);

/** Words that appear in at least `min` titles of the sample (stop words and numbers removed). */
export function titleWords(videos: Pick<SampleVideo, 'title'>[], min = 2, limit = 30): Frequency[] {
  const counts = new Map<string, Frequency>();
  for (const v of videos) {
    const seen = new Set<string>();
    for (const raw of v.title.split(/[\s|,.!?:;"'()[\]{}«»؟،…\-–—/#]+/)) {
      const key = normalizeForSearch(raw);
      if (key.length < 2 || STOP.has(key) || /^\d+$/.test(key) || seen.has(key)) continue;
      seen.add(key);
      const f = counts.get(key);
      if (f) f.count++;
      else counts.set(key, { term: raw, count: 1 });
    }
  }
  return [...counts.values()].filter((f) => f.count >= min).sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, limit);
}

export function daysSince(iso: string, now = Date.now()): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : Math.max(0, (now - t) / 86_400_000);
}

/** Views divided by days since publishing (at least one day). Undefined when views are hidden. */
export function viewsPerDay(v: Pick<SampleVideo, 'views' | 'publishedAt'>, now = Date.now()): number | undefined {
  if (v.views === undefined) return undefined;
  return v.views / Math.max(1, daysSince(v.publishedAt, now));
}

export function engagementRate(v: Pick<SampleVideo, 'views' | 'likes' | 'comments'>): number | undefined {
  if (!v.views || v.likes === undefined) return undefined;
  return (v.likes + (v.comments ?? 0)) / v.views;
}

export function median(values: number[]): number | undefined {
  const xs = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return undefined;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1]! + xs[mid]!) / 2;
}

export interface SampleSummary {
  count: number;
  medianViews?: number;
  medianAgeDays?: number;
  channels: number;
  /** Share of sampled videos published in the last 30 days. */
  recentShare: number;
}

export function summarizeSample(videos: SampleVideo[], now = Date.now()): SampleSummary {
  const ages = videos.map((v) => daysSince(v.publishedAt, now));
  return {
    count: videos.length,
    medianViews: median(videos.map((v) => v.views).filter((x): x is number => x !== undefined)),
    medianAgeDays: median(ages),
    channels: new Set(videos.map((v) => v.channelId)).size,
    recentShare: videos.length ? ages.filter((a) => a <= 30).length / videos.length : 0,
  };
}

/** 1-based positions of a channel's videos in the sample order. */
export function positionsOf(videos: Pick<SampleVideo, 'channelId'>[], channelId: string): number[] {
  return videos.flatMap((v, i) => (v.channelId === channelId ? [i + 1] : []));
}

/** CSV cell that cannot be interpreted as a spreadsheet formula. */
export function csvCell(value: string | number | undefined): string {
  let s = value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | undefined)[][]): string {
  // BOM so spreadsheet apps read Persian text as UTF-8.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Ids in `current` that were not in `seen`. The first check ever marks nothing as new. */
export function newUploads(current: string[], seen: string[], firstCheck: boolean): string[] {
  if (firstCheck) return [];
  const old = new Set(seen);
  return current.filter((id) => !old.has(id));
}

/** Compact counts for display (1.2K / 3.4M style in English, Persian digits in Persian). */
export function compactNumber(n: number | undefined, lang: 'fa' | 'en'): string {
  if (n === undefined) return '—';
  return new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Most frequent words across free text (comments), stop words removed. */
export function wordFrequencies(texts: string[], limit = 40): Frequency[] {
  return titleWords(texts.map((title) => ({ title })), 2, limit);
}

/** Next round subscriber milestone above `n` (100, 500, 1K, 5K, 10K, 50K, 100K, …). */
export function nextMilestone(n: number): number {
  const steps = [100, 500, 1000];
  for (const s of steps) if (n < s) return s;
  let m = 1000;
  for (;;) {
    if (n < m * 5) return m * 5;
    if (n < m * 10) return m * 10;
    m *= 10;
  }
}

export interface EmbedOptions {
  videoId: string;
  start?: number;
  end?: number;
  autoplay?: boolean;
  mute?: boolean;
  loop?: boolean;
  controls?: boolean;
  captions?: boolean;
  privacy?: boolean;
  width?: number;
  height?: number;
}

export function embedCode(o: EmbedOptions): string {
  const p = new URLSearchParams();
  if (o.start) p.set('start', String(o.start));
  if (o.end) p.set('end', String(o.end));
  if (o.autoplay) p.set('autoplay', '1');
  if (o.mute || o.autoplay) p.set('mute', '1'); // browsers block unmuted autoplay
  if (o.loop) {
    p.set('loop', '1');
    p.set('playlist', o.videoId); // loop of a single video needs the playlist parameter
  }
  if (o.controls === false) p.set('controls', '0');
  if (o.captions) p.set('cc_load_policy', '1');
  const host = o.privacy ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';
  const qs = p.toString();
  return `<iframe width="${o.width ?? 560}" height="${o.height ?? 315}" src="${host}/embed/${o.videoId}${qs ? `?${qs}` : ''}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}
