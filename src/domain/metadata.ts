// Metadata draft rules. Limits are documented in docs/INTEGRATIONS.md with their evidence status;
// they are a pre-flight checklist, not a ranking score.
import type { Draft } from './models';
import { chapterProblems } from './chapters';
import { charCount, normalizeForSearch, utf8Bytes } from './text';

export const LIMITS = {
  titleChars: 100,
  descriptionBytes: 5000,
  tagsChars: 500,
  hashtagsIgnoredAbove: 60,
  /** Approximate characters before a title is visually cut in search results (varies by device). */
  titleVisibleApprox: 70,
  /** Approximate description characters shown in a search-result snippet (varies). */
  snippetApprox: 150,
} as const;

export type Severity = 'error' | 'warning' | 'info';
export type CheckId =
  | 'title-missing'
  | 'title-too-long'
  | 'title-may-truncate'
  | 'angle-brackets'
  | 'description-missing'
  | 'description-too-long'
  | 'tags-too-long'
  | 'too-many-hashtags'
  | 'chapters-invalid'
  | 'keyword-in-title'
  | 'keyword-in-description-start'
  | 'keyword-in-tags';

export interface Check {
  id: CheckId;
  severity: Severity;
  /** For info checks: whether the item is satisfied. */
  ok?: boolean;
  values?: Record<string, number>;
}

/** Splits a comma/newline separated tag input. Keeps the user's spelling; drops empty and duplicate (normalized) tags. */
export function parseTags(input: string): string[] {
  return dedupeTags(input.split(/[,\n،]/));
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, ' ').trim();
    if (!tag) continue;
    const key = normalizeForSearch(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Character count as the upload form appears to count it: tags containing spaces count their surrounding quotes, plus separators. */
export function tagsCharCount(tags: string[]): number {
  if (tags.length === 0) return 0;
  const body = tags.reduce((n, t) => n + charCount(t) + (/\s/.test(t) ? 2 : 0), 0);
  return body + (tags.length - 1);
}

/** Hashtags in order of appearance (#word, Persian letters and ZWNJ allowed). */
export function extractHashtags(text: string): string[] {
  const re = /(^|[\s(])#([\p{L}\p{N}_‌]+)/gu;
  const out: string[] = [];
  for (const m of text.matchAll(re)) out.push(`#${m[2]}`);
  return out;
}

function includesNormalized(haystack: string, needle: string): boolean {
  const n = normalizeForSearch(needle);
  return !!n && normalizeForSearch(haystack).includes(n);
}

export function checkDraft(d: Pick<Draft, 'title' | 'description' | 'tags' | 'focusKeyword'>): Check[] {
  const checks: Check[] = [];
  const titleLen = charCount(d.title.trim());
  if (titleLen === 0) checks.push({ id: 'title-missing', severity: 'error' });
  else if (titleLen > LIMITS.titleChars)
    checks.push({ id: 'title-too-long', severity: 'error', values: { count: titleLen, max: LIMITS.titleChars } });
  else if (titleLen > LIMITS.titleVisibleApprox)
    checks.push({ id: 'title-may-truncate', severity: 'warning', values: { count: titleLen, approx: LIMITS.titleVisibleApprox } });

  if (/[<>]/.test(d.title) || /[<>]/.test(d.description)) checks.push({ id: 'angle-brackets', severity: 'error' });

  const bytes = utf8Bytes(d.description);
  if (d.description.trim() === '') checks.push({ id: 'description-missing', severity: 'warning' });
  else if (bytes > LIMITS.descriptionBytes)
    checks.push({ id: 'description-too-long', severity: 'error', values: { count: bytes, max: LIMITS.descriptionBytes } });

  const tagChars = tagsCharCount(d.tags);
  if (tagChars > LIMITS.tagsChars)
    checks.push({ id: 'tags-too-long', severity: 'error', values: { count: tagChars, max: LIMITS.tagsChars } });

  const hashtags = extractHashtags(`${d.title}\n${d.description}`);
  if (hashtags.length > LIMITS.hashtagsIgnoredAbove)
    checks.push({ id: 'too-many-hashtags', severity: 'warning', values: { count: hashtags.length, max: LIMITS.hashtagsIgnoredAbove } });

  if (chapterProblems(d.description).length) checks.push({ id: 'chapters-invalid', severity: 'warning' });

  const kw = d.focusKeyword.trim();
  if (kw) {
    const firstLines = d.description.split('\n').slice(0, 2).join(' ');
    checks.push({ id: 'keyword-in-title', severity: 'info', ok: includesNormalized(d.title, kw) });
    checks.push({ id: 'keyword-in-description-start', severity: 'info', ok: includesNormalized(firstLines, kw) });
    checks.push({ id: 'keyword-in-tags', severity: 'info', ok: d.tags.some((t) => includesNormalized(t, kw)) });
  }
  return checks;
}

export function hasBlockingErrors(checks: Check[]): boolean {
  return checks.some((c) => c.severity === 'error');
}

/** First characters of the description as a single line, cut on a word boundary when possible. */
export function snippet(text: string, max: number = LIMITS.snippetApprox): { text: string; cut: boolean } {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  if (chars.length <= max) return { text: flat, cut: false };
  const head = chars.slice(0, max).join('');
  const lastSpace = head.lastIndexOf(' ');
  return { text: (lastSpace > max * 0.6 ? head.slice(0, lastSpace) : head).trimEnd(), cut: true };
}

/** Plain-text package for copy/export. */
export function formatDraftAsText(d: Pick<Draft, 'title' | 'description' | 'tags'>): string {
  return `${d.title}\n\n${d.description}\n\n${d.tags.join(', ')}`.trim() + '\n';
}

/** Applies a template: description is appended after a blank line (or used as-is when empty); tags are merged without duplicates. */
export function applyTemplate<T extends Pick<Draft, 'description' | 'tags'>>(
  draft: T,
  tpl: { description: string; tags: string[] },
): T {
  const add = tpl.description.trim();
  const base = draft.description.trimEnd();
  const description = !add ? draft.description : base ? `${base}\n\n${add}` : add;
  return { ...draft, description, tags: dedupeTags([...draft.tags, ...tpl.tags]) };
}

/** Tag order: tags containing the focus keyword first, then specific (multi-word, longer) before broad. Stable otherwise. */
export function sortTags(tags: string[], focusKeyword = ''): string[] {
  const kw = normalizeForSearch(focusKeyword);
  const score = (t: string) => {
    const n = normalizeForSearch(t);
    return (kw && n.includes(kw) ? 1000 : 0) + (n === kw ? 500 : 0) + n.split(' ').length * 10 + Math.min(n.length, 9);
  };
  return tags
    .map((t, i) => ({ t, i, s: score(t) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}
