// Pure rules for the tag tools at Studio's Tags field: the title's main phrase (default target keyword), tag
// sorting, recommended-tag merging and sorting, own search traffic per tag and rank badge labels.
// No browser APIs here (unit-tested in tests/unit/tagTools.test.ts).
import { LIMITS, sortTags, tagsCharCount } from '../../../domain/metadata';
import { normalizeForSearch } from '../../../domain/text';

export const norm = (s: string) => normalizeForSearch(s);

// ---------------------------------------------------------------- target keyword

const EPISODE = /(?:^|\s)(?:part|ep|episode|session|lesson|vol|قسمت|بخش|جلسه|درس|فصل)\.?\s*[#]?[\d۰-۹٠-٩]+\s*$/iu;
const SEPARATORS = /\s+[|｜\-–—~•·/]\s+|[|｜–—•·:؛;!?؟,،()[\]{}【】«»"“”]/u;

/**
 * The title's main phrase, used as the default target keyword: the first meaningful segment before a separator,
 * without hashtags, emoji, episode markers ("part 6", "قسمت ۶") and trailing numbers, at most 6 words.
 */
export function mainPhrase(title: string): string {
  const cleaned = title
    .replace(/#[^\s#]+/gu, ' ')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const raw of cleaned.split(SEPARATORS)) {
    let seg = raw.trim();
    for (let i = 0; i < 3; i++) seg = seg.replace(EPISODE, '').replace(/\s+[\d۰-۹٠-٩]+$/u, '').trim();
    const letters = seg.replace(/[^\p{L}]/gu, '');
    if (letters.length < 2) continue;
    return seg.split(' ').slice(0, 6).join(' ');
  }
  return '';
}

// ---------------------------------------------------------------- sorting the field's tags

export type TagSort = 'relevance' | 'score' | 'alpha';

/** Known keyword scores by normalized keyword (0–100). */
export type ScoreMap = Record<string, { score: number | null; at: string }>;

export const scoreOf = (scores: ScoreMap, tag: string): number | null | undefined => scores[norm(tag)]?.score;

/** New order for the field's tags. 'score' puts tags with a known score first (high to low), the rest keep their order. */
export function sortTagList(tags: string[], mode: TagSort, opts: { keyword?: string; scores?: ScoreMap; lang?: string } = {}): string[] {
  if (mode === 'relevance') return sortTags(tags, opts.keyword ?? '');
  if (mode === 'alpha') {
    const coll = new Intl.Collator(opts.lang === 'fa' ? 'fa' : 'en', { sensitivity: 'base', numeric: true });
    return tags.slice().sort((a, b) => coll.compare(a, b));
  }
  const scores = opts.scores ?? {};
  return tags
    .map((t, i) => ({ t, i, s: scoreOf(scores, t) }))
    .sort((a, b) => {
      const ka = typeof a.s === 'number', kb = typeof b.s === 'number';
      if (ka && kb) return (b.s as number) - (a.s as number) || a.i - b.i;
      if (ka !== kb) return ka ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.t);
}

export const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Tags typed into a box: comma, Persian comma or newline separated; '#' removed; duplicates (normalized) dropped. */
export function parsePasted(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[,\n،\t]/)) {
    const t = raw.replace(/^\s*#/, '').replace(/\s+/g, ' ').trim();
    const k = norm(t);
    if (!k || seen.has(k) || [...t].length > 100) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function tagCharsLeft(tags: string[]): number {
  return LIMITS.tagsChars - tagsCharCount(tags);
}

// ---------------------------------------------------------------- own search traffic

export interface SearchTerm {
  term: string;
  views: number;
}

/**
 * Views that came from YouTube searches containing this tag as a phrase (own Analytics, top terms only).
 * undefined when no term matches: the API returns only the top 25 terms, so "no match" is not "no traffic".
 */
export function trafficFor(tag: string, terms: SearchTerm[]): number | undefined {
  const k = norm(tag);
  if (!k) return undefined;
  const re = new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'u');
  let sum = 0;
  let hit = false;
  for (const t of terms) {
    const n = norm(t.term);
    if (n === k || re.test(n)) {
      sum += Number.isFinite(t.views) ? t.views : 0;
      hit = true;
    }
  }
  return hit ? sum : undefined;
}

// ---------------------------------------------------------------- recommended tags

export type SuggestSource = 'top' | 'ai' | 'search' | 'translate';

export interface Suggestion {
  tag: string;
  key: string;
  sources: SuggestSource[];
  /** Number of top-result videos using the tag. */
  count?: number;
  /** Own search-traffic views for searches containing the tag. */
  traffic?: number;
  relevance: number;
}

/**
 * Merges suggestions from the top results' tags, AI and the owner's own search terms into one list without the
 * tags already in the field. Relevance blends how many top videos use the tag, the AI's order, the target
 * keyword and own search traffic.
 */
export function mergeSuggestions(
  input: { top?: { tag: string; count: number }[]; sampleSize?: number; ai?: string[]; terms?: SearchTerm[] },
  exclude: string[],
  target = '',
): Suggestion[] {
  const skip = new Set(exclude.map(norm));
  const kw = norm(target);
  const map = new Map<string, Suggestion>();
  const add = (raw: string, source: SuggestSource, patch: Partial<Suggestion> = {}) => {
    const tag = raw.replace(/^#/, '').replace(/\s+/g, ' ').trim();
    const key = norm(tag);
    if (!key || skip.has(key) || [...tag].length > 100) return;
    const cur = map.get(key) ?? { tag, key, sources: [], relevance: 0 };
    if (!cur.sources.includes(source)) cur.sources.push(source);
    Object.assign(cur, patch);
    map.set(key, cur);
  };
  const sample = Math.max(1, input.sampleSize ?? Math.max(1, ...(input.top ?? []).map((x) => x.count)));
  (input.top ?? []).forEach((x) => add(x.tag, 'top', { count: x.count }));
  (input.ai ?? []).forEach((x) => add(x, 'ai'));
  const terms = input.terms ?? [];
  terms.forEach((x) => add(x.term, 'search'));
  const aiIdx = new Map((input.ai ?? []).map((x, i) => [norm(x), i]));
  const maxTraffic = Math.max(1, ...terms.map((x) => x.views || 0));
  for (const s of map.values()) {
    s.traffic = terms.length ? trafficFor(s.tag, terms) : undefined;
    let r = 0;
    if (s.count) r += Math.min(1, s.count / sample) * 60;
    const ai = aiIdx.get(s.key);
    if (ai !== undefined) r += Math.max(5, 25 - ai);
    if (kw && (s.key.includes(kw) || kw.includes(s.key))) r += 20;
    if (s.traffic) r += 10 + Math.min(1, s.traffic / maxTraffic) * 15;
    s.relevance = Math.round(r * 10) / 10;
  }
  return [...map.values()].sort((a, b) => b.relevance - a.relevance || a.tag.localeCompare(b.tag));
}

export type SuggestSort = 'relevance' | 'score' | 'traffic';

/** Sorts suggestions; for 'score' and 'traffic' the ones without a known value go last (in relevance order). */
export function sortSuggestions(list: Suggestion[], by: SuggestSort, scores: ScoreMap = {}): Suggestion[] {
  const val = (s: Suggestion): number | undefined => {
    if (by === 'score') {
      const v = scoreOf(scores, s.tag);
      return typeof v === 'number' ? v : undefined;
    }
    if (by === 'traffic') return s.traffic;
    return s.relevance;
  };
  return list
    .map((s, i) => ({ s, i, v: val(s) }))
    .sort((a, b) => {
      if (a.v !== undefined && b.v !== undefined) return b.v - a.v || b.s.relevance - a.s.relevance || a.i - b.i;
      if ((a.v === undefined) !== (b.v === undefined)) return a.v === undefined ? 1 : -1;
      return b.s.relevance - a.s.relevance || a.i - b.i;
    })
    .map((x) => x.s);
}

// ---------------------------------------------------------------- rank badges

export interface RankEntry {
  tag: string;
  /** 1-based position in the checked results, null when the video was not in them. */
  rank: number | null;
  at: string;
}
export type RankMap = Record<string, RankEntry>;

/** Badge text for a chip: undefined = not checked (no badge), '—' = not in the checked results. Never 0. */
export function rankLabel(entry: RankEntry | undefined, fmt: (n: number) => string = String): string | undefined {
  if (!entry) return undefined;
  const r = entry.rank;
  if (typeof r !== 'number' || !Number.isFinite(r) || r < 1) return '—';
  return fmt(Math.round(r));
}

/** Merges new results (from seo.tagRanks, normalized to {tag, rank}) into the per-video map. */
export function mergeRanks(prev: RankMap, results: { tag: string; rank: number | null }[], at: string): RankMap {
  const next: RankMap = { ...prev };
  for (const r of results) {
    const k = norm(r.tag);
    if (!k) continue;
    next[k] = { tag: r.tag, rank: typeof r.rank === 'number' && r.rank >= 1 ? r.rank : null, at };
  }
  return next;
}

/** Ranks for the tags currently in the field, in field order. */
export function ranksFor(tags: string[], ranks: RankMap): { checked: number; top10: number; found: number } {
  let checked = 0, top10 = 0, found = 0;
  for (const t of tags) {
    const e = ranks[norm(t)];
    if (!e) continue;
    checked++;
    if (e.rank !== null) {
      found++;
      if (e.rank <= 10) top10++;
    }
  }
  return { checked, top10, found };
}

/** Splits a list into batches (seo.tagRanks accepts up to 30 tags per call). */
export function batches<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------- video switcher

/** Previous (newer) and next (older) video around the current one in an uploads list (newest first). */
export function neighbours<T extends { id: string }>(list: T[], currentId: string): { prev?: T; next?: T; index: number } {
  const index = list.findIndex((v) => v.id === currentId);
  if (index < 0) return { index, next: list[0] };
  return { index, prev: list[index - 1], next: list[index + 1] };
}

export const studioEditUrl = (id: string) => `https://studio.youtube.com/video/${encodeURIComponent(id)}/edit`;
