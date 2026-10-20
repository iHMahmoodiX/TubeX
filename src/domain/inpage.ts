// Pure rules for TubeX's in-page tools on YouTube and Studio: per-video stats, the video SEO checklist score,
// search-result badges, channel summary, Studio links, template insertion, canned-reply filling, CSV and embed
// code. No browser APIs here; the islands in src/inpage call these with data from background RPC.
import { chapterProblems, extractChapters } from './chapters';
import { checkDraft, dedupeTags, extractHashtags, LIMITS, tagsCharCount } from './metadata';
import { charCount, normalizeForSearch, utf8Bytes } from './text';

export const DAY_MS = 86_400_000;

export interface PublicCounts {
  views?: number;
  likes?: number;
  comments?: number;
  publishedAt: string;
}

/** Whole and fractional days since publishing; undefined for an unknown date. */
export function ageDays(publishedAt: string, now = Date.now()): number | undefined {
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, (now - t) / DAY_MS);
}

/** Lifetime average views per day. Videos younger than one day count as one day, so the rate is not inflated. */
export function viewsPerDay(v: PublicCounts, now = Date.now()): number | undefined {
  const age = ageDays(v.publishedAt, now);
  if (v.views === undefined || age === undefined) return undefined;
  return v.views / Math.max(1, age);
}

/** (likes + comments) / views, in percent. Undefined when any counter is hidden or there are no views. */
export function engagementRate(v: PublicCounts): number | undefined {
  if (!v.views || v.likes === undefined || v.comments === undefined) return undefined;
  return ((v.likes + v.comments) / v.views) * 100;
}

/** Likes per 100 views (dislikes are not public, so a like/dislike ratio cannot be shown). */
export function likeRate(v: PublicCounts): number | undefined {
  if (!v.views || v.likes === undefined) return undefined;
  return (v.likes / v.views) * 100;
}

// ---------------------------------------------------------------- video SEO checklist score

export type SeoState = 'ok' | 'warn' | 'fail' | 'skip';
export type SeoCheckId =
  | 'title-length'
  | 'keyword-title'
  | 'description-length'
  | 'keyword-description'
  | 'hashtags'
  | 'chapters'
  | 'tags-count'
  | 'tags-length'
  | 'keyword-tags'
  | 'limits';

export interface SeoItem {
  id: SeoCheckId;
  state: SeoState;
  weight: number;
  values?: Record<string, number>;
}

export interface SeoResult {
  /** 0–100 checklist score; null when nothing could be checked. Not a YouTube ranking signal. */
  score: number | null;
  items: SeoItem[];
}

const has = (hay: string, needle: string) => {
  const n = normalizeForSearch(needle);
  return !!n && normalizeForSearch(hay).includes(n);
};

/**
 * TubeX's checklist score for a video's metadata. Built on the draft checks in metadata.ts plus a few
 * best-practice items. Keyword items are skipped (not counted) when there is no keyword.
 */
export function videoSeo(input: { title: string; description: string; tags: string[]; keyword?: string }): SeoResult {
  const { title, description, tags } = input;
  const kw = (input.keyword ?? '').trim();
  const items: SeoItem[] = [];
  const draftChecks = checkDraft({ title, description, tags, focusKeyword: '' });
  const failsLimit = draftChecks.some((c) => c.severity === 'error' && c.id !== 'title-missing');

  const tLen = charCount(title.trim());
  items.push({
    id: 'title-length',
    weight: 15,
    values: { count: tLen, max: LIMITS.titleChars, approx: LIMITS.titleVisibleApprox },
    state: tLen === 0 || tLen > LIMITS.titleChars ? 'fail' : tLen > LIMITS.titleVisibleApprox || tLen < 20 ? 'warn' : 'ok',
  });
  items.push({ id: 'keyword-title', weight: 15, state: !kw ? 'skip' : has(title, kw) ? 'ok' : 'fail' });

  const dLen = charCount(description.trim());
  const bytes = utf8Bytes(description);
  items.push({
    id: 'description-length',
    weight: 15,
    values: { count: dLen, bytes, max: LIMITS.descriptionBytes },
    state: dLen === 0 || bytes > LIMITS.descriptionBytes ? 'fail' : dLen < 200 ? 'warn' : 'ok',
  });
  const firstLines = description.split('\n').slice(0, 2).join(' ');
  items.push({ id: 'keyword-description', weight: 10, state: !kw ? 'skip' : has(firstLines, kw) ? 'ok' : has(description, kw) ? 'warn' : 'fail' });

  const hashtags = extractHashtags(`${title}\n${description}`).length;
  items.push({ id: 'hashtags', weight: 5, values: { count: hashtags, max: LIMITS.hashtagsIgnoredAbove }, state: hashtags === 0 ? 'warn' : hashtags > LIMITS.hashtagsIgnoredAbove ? 'fail' : 'ok' });

  const chapters = extractChapters(description).length;
  items.push({ id: 'chapters', weight: 5, values: { count: chapters }, state: chapters === 0 ? 'warn' : chapterProblems(description).length ? 'warn' : 'ok' });

  const tagChars = tagsCharCount(tags);
  items.push({ id: 'tags-count', weight: 10, values: { count: tags.length }, state: tags.length === 0 ? 'fail' : tags.length < 5 ? 'warn' : 'ok' });
  items.push({ id: 'tags-length', weight: 5, values: { count: tagChars, max: LIMITS.tagsChars }, state: tagChars > LIMITS.tagsChars ? 'fail' : tagChars < 200 ? 'warn' : 'ok' });
  items.push({ id: 'keyword-tags', weight: 10, state: !kw ? 'skip' : tags.some((t) => has(t, kw)) ? 'ok' : 'fail' });

  items.push({ id: 'limits', weight: 10, state: failsLimit ? 'fail' : 'ok' });

  const counted = items.filter((i) => i.state !== 'skip');
  const total = counted.reduce((n, i) => n + i.weight, 0);
  const got = counted.reduce((n, i) => n + i.weight * (i.state === 'ok' ? 1 : i.state === 'warn' ? 0.5 : 0), 0);
  return { score: total ? Math.round((got / total) * 100) : null, items };
}

/** The keyword the checklist uses: the one saved for the video, else its first tag, else none. */
export function pickKeyword(saved: string | undefined, tags: string[]): { keyword: string; source: 'saved' | 'first-tag' | 'none' } {
  if (saved?.trim()) return { keyword: saved.trim(), source: 'saved' };
  if (tags[0]?.trim()) return { keyword: tags[0].trim(), source: 'first-tag' };
  return { keyword: '', source: 'none' };
}

// ---------------------------------------------------------------- search-result badges

export interface BadgeVideo extends PublicCounts {
  id: string;
  channelId: string;
  tags: string[];
}

export interface ResultBadge {
  videoId: string;
  viewsPerDay?: number;
  ageDays?: number;
  tagCount: number;
  own: boolean;
}

export function resultBadge(v: BadgeVideo, ownChannelIds: ReadonlySet<string>, now = Date.now()): ResultBadge {
  return { videoId: v.id, viewsPerDay: viewsPerDay(v, now), ageDays: ageDays(v.publishedAt, now), tagCount: v.tags.length, own: ownChannelIds.has(v.channelId) };
}

/** Splits ids not yet fetched into API pages of at most 50. */
export function pendingPages(visible: string[], known: ReadonlySet<string>, pageSize = 50): string[][] {
  const todo = [...new Set(visible)].filter((id) => !known.has(id));
  const pages: string[][] = [];
  for (let i = 0; i < todo.length; i += pageSize) pages.push(todo.slice(i, i + pageSize));
  return pages;
}

// ---------------------------------------------------------------- channel summary

export interface ChannelCounts {
  subscribers?: number;
  views?: number;
  videoCount?: number;
}

export interface ChannelSummary {
  /** Mean views of the latest uploads that show a view count (sample size in `sample`). */
  avgRecentViews?: number;
  sample: number;
  /** Lifetime views / public videos. */
  avgAllViews?: number;
  /** Uploads per week over the span of the latest uploads. */
  uploadsPerWeek?: number;
  lastUploadDays?: number;
}

export function channelSummary(ch: ChannelCounts, recent: PublicCounts[], now = Date.now()): ChannelSummary {
  const latest = [...recent].filter((v) => Number.isFinite(Date.parse(v.publishedAt))).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 10);
  const withViews = latest.filter((v) => v.views !== undefined);
  const avgRecentViews = withViews.length ? withViews.reduce((n, v) => n + (v.views ?? 0), 0) / withViews.length : undefined;
  let uploadsPerWeek: number | undefined;
  if (latest.length >= 2) {
    const span = (Date.parse(latest[0]!.publishedAt) - Date.parse(latest[latest.length - 1]!.publishedAt)) / DAY_MS;
    uploadsPerWeek = span > 0 ? ((latest.length - 1) / span) * 7 : undefined;
  }
  return {
    avgRecentViews,
    sample: withViews.length,
    avgAllViews: ch.views !== undefined && ch.videoCount ? ch.views / ch.videoCount : undefined,
    uploadsPerWeek,
    lastUploadDays: latest[0] ? ageDays(latest[0].publishedAt, now) : undefined,
  };
}

// ---------------------------------------------------------------- Studio links

export const STUDIO_SECTIONS = ['dashboard', 'content', 'analytics', 'comments', 'monetization'] as const;
export type StudioSection = (typeof STUDIO_SECTIONS)[number];
const STUDIO_PATHS: Record<StudioSection, string> = {
  dashboard: '',
  content: '/videos/upload',
  analytics: '/analytics/tab-overview/period-default',
  comments: '/comments/inbox',
  monetization: '/monetization/overview',
};

/** Studio deep link for a channel; without a known channel id, Studio's home (it opens the signed-in channel). */
export function studioUrl(section: StudioSection, channelId?: string): string {
  if (!channelId || !/^UC[\w-]{22}$/.test(channelId)) return 'https://studio.youtube.com/';
  return `https://studio.youtube.com/channel/${channelId}${STUDIO_PATHS[section]}`;
}

export function studioVideoUrl(videoId: string): string {
  return `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/edit`;
}

// ---------------------------------------------------------------- template insertion (Studio fields)

/** Appends a block after a blank line. Unchanged when the block is empty or already present. */
export function insertBlock(current: string, block: string): { text: string; changed: boolean } {
  const add = block.trim();
  if (!add) return { text: current, changed: false };
  if (normalizeForSearch(current).includes(normalizeForSearch(add))) return { text: current, changed: false };
  const base = current.trimEnd();
  return { text: base ? `${base}\n\n${add}` : add, changed: true };
}

/** Tags to add to a tag field: new ones only (normalized), in order, while the 500-character budget allows. */
export function tagsToAdd(current: string[], add: string[], limit: number = LIMITS.tagsChars): { add: string[]; duplicate: string[]; overLimit: string[] } {
  const have = new Set(current.map(normalizeForSearch));
  const out: string[] = [];
  const duplicate: string[] = [];
  const overLimit: string[] = [];
  for (const t of dedupeTags(add.map((x) => x.replace(/^#/, '')))) {
    if (have.has(normalizeForSearch(t))) {
      duplicate.push(t);
      continue;
    }
    if (tagsCharCount([...current, ...out, t]) > limit) {
      overLimit.push(t);
      continue;
    }
    out.push(t);
  }
  return { add: out, duplicate, overLimit };
}

/** Tag suggestions from other videos' tags: most frequent first, excluding tags already used. */
export function tagsFromVideos(videos: { tags: string[] }[], exclude: string[], max = 25): { tag: string; count: number }[] {
  const skip = new Set(exclude.map(normalizeForSearch));
  const counts = new Map<string, { tag: string; count: number }>();
  for (const v of videos) {
    const seen = new Set<string>();
    for (const t of v.tags) {
      const k = normalizeForSearch(t);
      if (!k || skip.has(k) || seen.has(k) || charCount(t) > 100) continue;
      seen.add(k);
      const e = counts.get(k);
      if (e) e.count++;
      else counts.set(k, { tag: t.trim(), count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, max);
}

// ---------------------------------------------------------------- canned replies

/** Fills `{name}` (also `{author}`, `{نام}`) with the comment author's display name, without a leading @. */
export function fillReply(text: string, vars: { name?: string }): string {
  const name = (vars.name ?? '').replace(/^@/, '').trim();
  const out = text.replace(/\{(name|author|نام)\}/g, name);
  return name ? out : out.replace(/[ \t]{2,}/g, ' ').replace(/^[\s,،]+/, '').replace(/\s+([,،!.؟?])/g, '$1');
}

// ---------------------------------------------------------------- comments CSV

export interface CsvComment {
  id: string;
  author: string;
  text: string;
  likes: number;
  replies: number;
  publishedAt: string;
}

const csvCell = (v: string | number): string => {
  let s = String(v);
  // Spreadsheet formula injection: a cell starting with = + - @ would be executed by Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** UTF-8 CSV with a BOM so Excel reads Persian text correctly. */
export function commentsCsv(comments: CsvComment[]): string {
  const rows = [['id', 'author', 'published_at', 'likes', 'replies', 'text'], ...comments.map((c) => [c.id, c.author, c.publishedAt, c.likes, c.replies, c.text])];
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- embed code

export interface EmbedOptions {
  videoId: string;
  width: number;
  height: number;
  start?: number;
  autoplay?: boolean;
  mute?: boolean;
  controls?: boolean;
  loop?: boolean;
  privacy?: boolean;
  captions?: boolean;
}

export function embedCode(o: EmbedOptions): string {
  const host = o.privacy ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';
  const p = new URLSearchParams();
  if (o.start && o.start > 0) p.set('start', String(Math.floor(o.start)));
  if (o.autoplay) p.set('autoplay', '1');
  if (o.mute || o.autoplay) p.set('mute', '1'); // browsers block autoplay with sound
  if (o.controls === false) p.set('controls', '0');
  if (o.loop) {
    p.set('loop', '1');
    p.set('playlist', o.videoId);
  }
  if (o.captions) p.set('cc_load_policy', '1');
  const q = p.toString();
  const w = Math.max(200, Math.min(3840, Math.round(o.width)));
  const h = Math.max(113, Math.min(2160, Math.round(o.height)));
  const id = o.videoId.replace(/[^\w-]/g, '');
  return `<iframe width="${w}" height="${h}" src="${host}/embed/${id}${q ? `?${q}` : ''}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}

/** Parses "1:23", "01:02:03" or "83" into seconds. */
export function parseStart(input: string): number | undefined {
  const s = input.trim();
  if (!s) return undefined;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return undefined;
  return s.split(':').reduce((n, part) => n * 60 + Number(part), 0);
}

// ---------------------------------------------------------------- inline edit diff

export interface SnippetFields {
  title: string;
  description: string;
  tags: string[];
}

export interface SnippetDiff {
  title?: { from: string; to: string };
  description?: { from: string; to: string };
  tagsAdded: string[];
  tagsRemoved: string[];
  tagOrderChanged: boolean;
  changed: boolean;
}

export function snippetDiff(before: SnippetFields, after: SnippetFields): SnippetDiff {
  const norm = (ts: string[]) => ts.map((t) => t.trim()).filter(Boolean);
  const b = norm(before.tags);
  const a = norm(after.tags);
  const bs = new Set(b);
  const as = new Set(a);
  const tagsAdded = a.filter((t) => !bs.has(t));
  const tagsRemoved = b.filter((t) => !as.has(t));
  const tagOrderChanged = !tagsAdded.length && !tagsRemoved.length && a.join('\n') !== b.join('\n');
  const d: SnippetDiff = { tagsAdded, tagsRemoved, tagOrderChanged, changed: false };
  if (before.title !== after.title) d.title = { from: before.title, to: after.title };
  if (before.description !== after.description) d.description = { from: before.description, to: after.description };
  d.changed = !!(d.title || d.description || tagsAdded.length || tagsRemoved.length || tagOrderChanged);
  return d;
}

/** Quota cost of checking where a video ranks for each tag (one search.list per tag, Inferred 100 units). */
export const TAG_RANK_UNITS = 100;
export const tagRankCost = (n: number) => n * TAG_RANK_UNITS;
/** search.list + videos.list for one keyword score (Inferred). */
export const KEYWORD_SCORE_UNITS = 101;
/** videos.update (50) plus the re-read (1), Inferred. */
export const UPDATE_UNITS = 51;

// ---------------------------------------------------------------- results from other areas' methods

export interface TagRank {
  tag: string;
  /** 1-based position of the video in results for the tag; null when not found in the checked results. */
  rank: number | null;
}

/** Accepts the shapes seo.tagRanks may return ([{tag, rank|position}] or {tag: rank}) and keeps the asked order. */
export function normalizeTagRanks(raw: unknown, asked: string[]): TagRank[] {
  const map = new Map<string, number | null>();
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { ranks?: unknown }).ranks) ? (raw as { ranks: unknown[] }).ranks : null;
  if (list) {
    for (const r of list) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const tag = typeof o.tag === 'string' ? o.tag : typeof o.keyword === 'string' ? o.keyword : '';
      if (tag) map.set(normalizeForSearch(tag), num(o.rank ?? o.position));
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) map.set(normalizeForSearch(k), num(typeof v === 'object' && v ? (v as { rank?: unknown }).rank : v));
  }
  return asked.map((tag) => ({ tag, rank: map.get(normalizeForSearch(tag)) ?? null }));
}

export interface KeywordScore {
  score: number | null;
  parts: { key: string; value: number }[];
  sampleSize?: number;
  fetchedAt?: string;
}

/** Reads seo.keywordScore's `{score, parts, sampleSize, fetchedAt}` defensively. */
export function normalizeKeywordScore(raw: unknown): KeywordScore {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const score = typeof o.score === 'number' && Number.isFinite(o.score) ? Math.max(0, Math.min(100, o.score)) : null;
  const parts: { key: string; value: number }[] = [];
  if (o.parts && typeof o.parts === 'object' && !Array.isArray(o.parts)) {
    for (const [key, v] of Object.entries(o.parts as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) parts.push({ key, value: v });
  } else if (Array.isArray(o.parts)) {
    for (const p of o.parts) {
      const q = (p ?? {}) as Record<string, unknown>;
      const key = typeof q.key === 'string' ? q.key : typeof q.id === 'string' ? q.id : typeof q.label === 'string' ? q.label : '';
      const value = typeof q.value === 'number' ? q.value : typeof q.score === 'number' ? q.score : NaN;
      if (key && Number.isFinite(value)) parts.push({ key, value });
    }
  }
  return {
    score,
    parts: parts.slice(0, 8),
    sampleSize: typeof o.sampleSize === 'number' ? o.sampleSize : undefined,
    fetchedAt: typeof o.fetchedAt === 'string' ? o.fetchedAt : undefined,
  };
}

/** Reads canned replies from engage.listReplies or the local collection: [{id, name, text}]. */
export function normalizeReplies(raw: unknown): { id: string; name: string; text: string }[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [];
  const out: { id: string; name: string; text: string }[] = [];
  list.forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    const o = r as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text : typeof o.body === 'string' ? o.body : '';
    if (!text.trim()) return;
    out.push({ id: typeof o.id === 'string' ? o.id : String(i), name: typeof o.name === 'string' && o.name ? o.name : typeof o.title === 'string' ? o.title : text.slice(0, 40), text });
  });
  return out;
}
