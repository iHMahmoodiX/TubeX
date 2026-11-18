// Best-practice audit of published videos. A checklist of habits that make metadata clearer for viewers and
// search (Inferred from YouTube's help pages and limits in docs/INTEGRATIONS.md); it is not a ranking model.
import { chapterProblems, extractChapters } from './chapters';
import { checkDraft, extractHashtags, LIMITS, tagsCharCount } from './metadata';
import { charCount, normalizeForSearch, utf8Bytes } from './text';

export interface AuditInput {
  id: string;
  title: string;
  description: string;
  tags: string[];
  durationSec: number;
  /** contentDetails.caption: true when the video has captions; null when unknown. */
  caption: boolean | null;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  /** Focus keyword from a linked TubeX draft, when known. */
  keyword?: string;
}

export type AuditId =
  | 'title-length'
  | 'title-keyword'
  | 'desc-length'
  | 'desc-first-lines'
  | 'hashtags'
  | 'tags-count'
  | 'tags-limit'
  | 'chapters'
  | 'captions'
  | 'language'
  | 'links'
  | 'duplicate-title'
  | 'angle-brackets';

export const AUDIT_IDS: AuditId[] = [
  'title-length',
  'title-keyword',
  'desc-length',
  'desc-first-lines',
  'hashtags',
  'tags-count',
  'tags-limit',
  'chapters',
  'captions',
  'language',
  'links',
  'duplicate-title',
  'angle-brackets',
];

export type AuditSeverity = 'error' | 'warning' | 'tip';

export interface AuditCheck {
  id: AuditId;
  pass: boolean;
  /** How serious a failure is. */
  severity: AuditSeverity;
  weight: number;
  /** Which variant of the explanation applies (e.g. 'short' or 'long' for title length). */
  reason?: string;
  values?: Record<string, number | string>;
}

export interface AuditResult {
  id: string;
  score: number;
  checks: AuditCheck[];
  failing: AuditCheck[];
}

const WEIGHT: Record<AuditSeverity, number> = { error: 3, warning: 2, tip: 1 };
const URL_RE = /https?:\/\/\S+/i;

/** Normalized title used to detect duplicates. */
export const titleKey = (t: string): string => normalizeForSearch(t).replace(/[^\p{L}\p{N} ]/gu, '').trim();

/** Ids of videos whose title is the same (normalized) as another video's. */
export function duplicateTitles(videos: { id: string; title: string }[]): Set<string> {
  const by = new Map<string, string[]>();
  for (const v of videos) {
    const k = titleKey(v.title);
    if (!k) continue;
    by.set(k, [...(by.get(k) ?? []), v.id]);
  }
  return new Set([...by.values()].filter((ids) => ids.length > 1).flat());
}

/** The first two non-empty description lines (what viewers see before "more"). */
export function firstLines(description: string): string {
  return description
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
}

export function auditVideo(v: AuditInput, duplicates: Set<string> = new Set()): AuditResult {
  const checks: AuditCheck[] = [];
  const push = (id: AuditId, pass: boolean, severity: AuditSeverity, reason?: string, values?: Record<string, number | string>) =>
    checks.push({ id, pass, severity, weight: WEIGHT[severity], ...(reason && { reason }), ...(values && { values }) });

  const title = v.title.trim();
  const tLen = charCount(title);
  if (tLen > LIMITS.titleChars) push('title-length', false, 'error', 'over', { count: tLen, max: LIMITS.titleChars });
  else if (tLen > LIMITS.titleVisibleApprox) push('title-length', false, 'warning', 'long', { count: tLen, approx: LIMITS.titleVisibleApprox });
  else if (tLen < 20) push('title-length', false, 'warning', 'short', { count: tLen });
  else push('title-length', true, 'warning', undefined, { count: tLen });

  const kw = normalizeForSearch(v.keyword ?? '');
  if (kw) {
    const nt = normalizeForSearch(title);
    const at = nt.indexOf(kw);
    // Front-loaded: the keyword starts within the first 40 % of the title (where it is not cut off).
    const pass = at >= 0 && at <= Math.max(10, nt.length * 0.4);
    push('title-keyword', pass, 'warning', at < 0 ? 'missing' : pass ? undefined : 'late', { keyword: v.keyword!.trim() });
  }

  const bytes = utf8Bytes(v.description);
  const dLen = charCount(v.description.trim());
  if (!dLen) push('desc-length', false, 'error', 'empty');
  else if (bytes > LIMITS.descriptionBytes) push('desc-length', false, 'error', 'over', { count: bytes, max: LIMITS.descriptionBytes });
  else if (dLen < 200) push('desc-length', false, 'warning', 'short', { count: dLen });
  else push('desc-length', true, 'warning', undefined, { count: dLen });

  if (dLen) {
    const head = firstLines(v.description);
    const stripped = head.replace(URL_RE, '').replace(/#[\p{L}\p{N}_‌]+/gu, '').trim();
    const headKwOk = !kw || normalizeForSearch(head).includes(kw);
    const pass = charCount(stripped) >= 50 && headKwOk;
    push('desc-first-lines', pass, 'warning', pass ? undefined : charCount(stripped) < 50 ? 'thin' : 'keyword', { count: charCount(stripped) });
  }

  const hashtags = extractHashtags(v.description);
  const allTags = extractHashtags(`${v.title}\n${v.description}`);
  if (allTags.length > LIMITS.hashtagsIgnoredAbove) push('hashtags', false, 'error', 'over', { count: allTags.length, max: LIMITS.hashtagsIgnoredAbove });
  else if (allTags.length > 15) push('hashtags', false, 'warning', 'many', { count: allTags.length });
  else if (hashtags.length === 0) push('hashtags', false, 'tip', 'none', { count: 0 });
  else push('hashtags', true, 'tip', undefined, { count: allTags.length });

  const tagChars = tagsCharCount(v.tags);
  if (v.tags.length === 0) push('tags-count', false, 'tip', 'none', { count: 0 });
  else if (v.tags.length > 30) push('tags-count', false, 'tip', 'many', { count: v.tags.length });
  else push('tags-count', true, 'tip', undefined, { count: v.tags.length });
  push('tags-limit', tagChars <= LIMITS.tagsChars, 'error', tagChars <= LIMITS.tagsChars ? undefined : 'over', { count: tagChars, max: LIMITS.tagsChars });

  const chapters = extractChapters(v.description);
  if (chapters.length) {
    const problems = chapterProblems(v.description);
    push('chapters', problems.length === 0, 'error', problems[0], { count: chapters.length });
  } else if (v.durationSec >= 8 * 60) {
    push('chapters', false, 'tip', 'none', { minutes: Math.round(v.durationSec / 60) });
  }

  if (v.caption !== null) push('captions', v.caption, 'warning', v.caption ? undefined : 'none');
  const langOk = !!v.defaultLanguage && !!v.defaultAudioLanguage;
  push('language', langOk, 'tip', langOk ? undefined : !v.defaultLanguage && !v.defaultAudioLanguage ? 'both' : !v.defaultLanguage ? 'title' : 'audio');
  push('links', URL_RE.test(v.description), 'tip', URL_RE.test(v.description) ? undefined : 'none');
  push('duplicate-title', !duplicates.has(v.id), 'error');
  const brackets = checkDraft({ title: v.title, description: v.description, tags: v.tags, focusKeyword: '' }).some((c) => c.id === 'angle-brackets');
  push('angle-brackets', !brackets, 'error');

  const total = checks.reduce((n, c) => n + c.weight, 0);
  const passed = checks.reduce((n, c) => n + (c.pass ? c.weight : 0), 0);
  const failing = checks.filter((c) => !c.pass).sort((a, b) => b.weight - a.weight);
  return { id: v.id, score: total ? Math.round((passed / total) * 100) : 100, checks, failing };
}

/** Audits every video, detecting duplicate titles across the set. */
export function auditAll(videos: AuditInput[]): AuditResult[] {
  const dup = duplicateTitles(videos);
  return videos.map((v) => auditVideo(v, dup));
}

/** A video passes the audit when it has no failing error and scores at least 70. */
export const passesAudit = (r: AuditResult): boolean => r.score >= 70 && !r.failing.some((c) => c.severity === 'error');

/** Count of failing videos per check, most common first. */
export function failureCounts(results: AuditResult[]): { id: AuditId; count: number }[] {
  const m = new Map<AuditId, number>();
  for (const r of results) for (const c of r.failing) m.set(c.id, (m.get(c.id) ?? 0) + 1);
  return [...m.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}
