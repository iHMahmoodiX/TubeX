// Bulk edits over drafts and templates. Pure functions: the UI previews every change before saving.
import { applyProfile, type ProfileOp } from './engageBulk';
import { dedupeTags } from './metadata';
import { normalizeForSearch } from './text';

export type BulkField = 'title' | 'description' | 'tags';

export type BulkOp =
  | { kind: 'replace'; find: string; replace: string; matchCase: boolean; wholeWord: boolean; fields: BulkField[] }
  | { kind: 'addTags'; tags: string[] }
  | { kind: 'removeTags'; tags: string[] }
  | { kind: 'addText'; text: string; position: 'start' | 'end' };

export interface Editable {
  title?: string;
  description: string;
  tags: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Literal (not regex) search pattern; whole-word matching is Unicode-aware so Persian words work. */
export function findPattern(op: Extract<BulkOp, { kind: 'replace' }>): RegExp | null {
  if (!op.find) return null;
  const body = escapeRe(op.find);
  const src = op.wholeWord ? `(?<![\\p{L}\\p{N}_\\u200c])${body}(?![\\p{L}\\p{N}_\\u200c])` : body;
  return new RegExp(src, `gu${op.matchCase ? '' : 'i'}`);
}

export function countMatches(text: string, re: RegExp | null): number {
  if (!re) return 0;
  re.lastIndex = 0;
  return text.match(re)?.length ?? 0;
}

export function applyBulk<T extends Editable>(rec: T, op: BulkOp): T {
  switch (op.kind) {
    case 'replace': {
      const re = findPattern(op);
      if (!re) return rec;
      // A function replacement keeps "$" in the user's text literal.
      const rep = (s: string) => s.replace(re, () => op.replace);
      const next = { ...rec };
      if (op.fields.includes('title') && typeof rec.title === 'string') next.title = rep(rec.title);
      if (op.fields.includes('description')) next.description = rep(rec.description);
      if (op.fields.includes('tags')) next.tags = dedupeTags(rec.tags.map(rep));
      return next;
    }
    case 'addTags':
      return { ...rec, tags: dedupeTags([...rec.tags, ...op.tags]) };
    case 'removeTags': {
      const drop = new Set(op.tags.map(normalizeForSearch));
      return { ...rec, tags: rec.tags.filter((t) => !drop.has(normalizeForSearch(t))) };
    }
    case 'addText': {
      const add = op.text.trim();
      if (!add) return rec;
      if (rec.description.includes(add)) return rec; // already there: running twice changes nothing
      const base = rec.description.trim();
      const description = !base ? add : op.position === 'start' ? `${add}\n\n${base}` : `${base}\n\n${add}`;
      return { ...rec, description };
    }
  }
}

export function changedFields(a: Editable, b: Editable): BulkField[] {
  const out: BulkField[] = [];
  if ((a.title ?? '') !== (b.title ?? '')) out.push('title');
  if (a.description !== b.description) out.push('description');
  if (a.tags.join('\n') !== b.tags.join('\n')) out.push('tags');
  return out;
}

/** Lines of `after` that differ from `before`, for a compact preview of long descriptions. */
export function changedLines(before: string, after: string): { before: string[]; after: string[] } {
  const a = before.split('\n');
  const b = after.split('\n');
  const setA = new Set(a);
  const setB = new Set(b);
  return { before: a.filter((l) => !setB.has(l)), after: b.filter((l) => !setA.has(l)) };
}

// ============================================================================================================
// Find & replace engine for many published videos (0.5.2). Pure functions; the background job and the preview
// both use them, so what the owner sees is exactly what is written.
//
// Matching runs on a "folded" copy of the text that keeps a map back to the original positions, so the found
// range is always cut from the original text and the replacement is inserted exactly as typed.
// ============================================================================================================

export interface MatchOptions {
  /** Treat ي/ی, ك/ک, ة/ه, Persian/Arabic/Latin digits, ZWNJ/space and repeated spaces as equal. */
  persian: boolean;
  matchCase: boolean;
  wholeWord: boolean;
  /** Regular expression (with $1 / $<name> in the replacement) instead of plain text. */
  regex: boolean;
}

export const DEFAULT_MATCH: MatchOptions = { persian: true, matchCase: false, wholeWord: false, regex: false };

interface Folded {
  text: string;
  /** Original index where folded char i starts. */
  start: number[];
  /** Original index (exclusive) where folded char i ends. */
  end: number[];
}

const FOLD_CHARS: Record<string, string> = { '\u064a': '\u06cc', '\u0649': '\u06cc', '\u0643': '\u06a9', '\u0629': '\u0647' };
const PERSIAN_SPACE = /[ \t\u00a0\u200c\u2000-\u200a\u202f\u205f\u3000]/;
const PLAIN_SPACE = /[ \t]/;

function foldChar(c: string): string {
  const m = FOLD_CHARS[c];
  if (m) return m;
  const code = c.charCodeAt(0);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  return c;
}

/**
 * Folded text with a position map. Always: \r\n and \r become \n, spaces at the end of a line are ignored.
 * Persian mode: letter variants and digits unified, any run of spaces/ZWNJ/NBSP becomes one space.
 * `dropTrailingAtEnd` also ignores spaces at the very end (for the searched text, not for a one-line needle).
 */
function fold(input: string, persian: boolean, dropTrailingAtEnd = true): Folded {
  const text: string[] = [];
  const start: number[] = [];
  const end: number[] = [];
  const space = persian ? PERSIAN_SPACE : PLAIN_SPACE;
  const n = input.length;
  let i = 0;
  while (i < n) {
    const c = input[i]!;
    if (c === '\r') {
      if (input[i + 1] === '\n') {
        i++; // the \n that follows is kept
        continue;
      }
      text.push('\n');
      start.push(i);
      end.push(i + 1);
      i++;
      continue;
    }
    if (space.test(c)) {
      let j = i;
      while (j < n && space.test(input[j]!)) j++;
      const next = input[j];
      if (next === '\n' || next === '\r' || (j >= n && dropTrailingAtEnd)) {
        i = j; // trailing spaces: ignored for matching
        continue;
      }
      if (persian) {
        text.push(' ');
        start.push(i);
        end.push(j);
      } else {
        for (let k = i; k < j; k++) {
          text.push(input[k]!);
          start.push(k);
          end.push(k + 1);
        }
      }
      i = j;
      continue;
    }
    text.push(persian ? foldChar(c) : c);
    start.push(i);
    end.push(i + 1);
    i++;
  }
  return { text: text.join(''), start, end };
}

/** Letters and digits only (no whitespace changes): used on a regular expression typed in Persian mode. */
function foldLetters(s: string): string {
  return s.replace(/[\u064a\u0649\u0643\u0629\u06f0-\u06f9\u0660-\u0669]/g, foldChar);
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = /[\p{L}\p{N}_\u200c]/u;

function codePointBefore(s: string, i: number): string {
  if (i <= 0) return '';
  const lo = s.charCodeAt(i - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && i >= 2) return s.slice(i - 2, i);
  return s[i - 1]!;
}
function codePointAt(s: string, i: number): string {
  const cp = s.codePointAt(i);
  return cp === undefined ? '' : String.fromCodePoint(cp);
}

export interface Matcher {
  re: RegExp;
  opts: MatchOptions;
  /** Folded needle (plain mode), for idempotent replacements. */
  needle?: string;
}

export type Compiled<T> = { ok: true; value: T } | { ok: false; error: string };

/** Compiles what to find (null = nothing to find). Multi-line plain text is trimmed of blank lines around it. */
export function compileFind(find: string, opts: MatchOptions): Compiled<Matcher> | null {
  if (!find || !find.replace(/\s+/g, '')) return null;
  const flags = `gmud${opts.matchCase ? '' : 'i'}`;
  if (opts.regex) {
    try {
      return { ok: true, value: { re: new RegExp(opts.persian ? foldLetters(find) : find, flags), opts } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  let needle = fold(find, opts.persian, false).text;
  if (needle.includes('\n')) needle = needle.replace(/^[ \n]*\n|\n[ \n]*$/g, '');
  needle = needle.replace(/^ +| +$/g, (s) => (needle.includes('\n') ? '' : s));
  if (!needle.trim()) return null;
  return { ok: true, value: { re: new RegExp(reEscape(needle), flags), opts, needle } };
}

/** Checks a regular expression as the owner types it (null = fine or empty). */
export function regexError(pattern: string, opts: Pick<MatchOptions, 'matchCase' | 'persian'> = DEFAULT_MATCH): string | null {
  if (!pattern) return null;
  const r = compileFind(pattern, { ...DEFAULT_MATCH, ...opts, regex: true, wholeWord: false });
  return r && !r.ok ? r.error : null;
}

export interface Found {
  /** Range in the original text. */
  s: number;
  e: number;
  /** Capture groups cut from the original text. */
  groups: (string | undefined)[];
  named: Record<string, string | undefined>;
}

type Indices = ([number, number] | undefined)[] & { groups?: Record<string, [number, number] | undefined> };

export function findAll(text: string, m: Matcher): Found[] {
  const f = fold(text, m.opts.persian);
  const re = new RegExp(m.re.source, m.re.flags);
  const out: Found[] = [];
  const cut = (a: number, b: number) => (b > a ? text.slice(f.start[a]!, f.end[b - 1]!) : '');
  let x: RegExpExecArray | null;
  while ((x = re.exec(f.text))) {
    const fs = x.index;
    const fe = fs + x[0].length;
    if (fe === fs) {
      re.lastIndex = fs + (codePointAt(f.text, fs).length || 1);
      continue; // empty matches never replace anything
    }
    const s = f.start[fs]!;
    const e = f.end[fe - 1]!;
    if (m.opts.wholeWord && (WORD.test(codePointBefore(text, s)) || WORD.test(codePointAt(text, e)))) {
      re.lastIndex = fs + 1;
      continue;
    }
    const idx = (x as RegExpExecArray & { indices?: Indices }).indices;
    const groups: (string | undefined)[] = [];
    for (let g = 1; g < x.length; g++) {
      const r = idx?.[g];
      groups.push(r ? cut(r[0], r[1]) : undefined);
    }
    const named: Record<string, string | undefined> = {};
    for (const [k, r] of Object.entries(idx?.groups ?? {})) named[k] = r ? cut(r[0], r[1]) : undefined;
    out.push({ s, e, groups, named });
  }
  return out;
}

/** Expands $1, $<name>, $& and $$ in a regex replacement; everything else is literal. */
export function expandReplacement(tpl: string, whole: string, f: Pick<Found, 'groups' | 'named'>): string {
  return tpl.replace(/\$(\$|&|<([^>]+)>|(\d{1,2}))/g, (all, tok: string, name?: string, num?: string) => {
    if (tok === '$') return '$';
    if (tok === '&') return whole;
    if (name !== undefined) return f.named[name] ?? '';
    const k = Number(num);
    if (k >= 1 && k <= f.groups.length) return f.groups[k - 1] ?? '';
    const one = Number(num![0]);
    if (num!.length === 2 && one >= 1 && one <= f.groups.length) return (f.groups[one - 1] ?? '') + num![1];
    return all;
  });
}

const nl = (s: string) => s.replace(/\r\n?/g, '\n');

/**
 * Replaces every match. Plain mode is idempotent: a match that already sits inside the replacement text
 * (e.g. find "t.me/a", replace "t.me/a_new") is left alone, so running twice changes nothing.
 */
export function replaceIn(text: string, m: Matcher, replacement: string): { text: string; count: number } {
  const found = findAll(text, m);
  if (!found.length) return { text, count: 0 };
  const rep = nl(replacement);
  let guard: [number, number][] = [];
  if (!m.opts.regex && m.needle) {
    const repFolded = fold(rep, m.opts.persian, false).text;
    if (repFolded && (m.opts.matchCase ? repFolded.includes(m.needle) : repFolded.toLowerCase().includes(m.needle.toLowerCase()))) {
      const rm = compileFind(rep, { ...m.opts, wholeWord: false });
      if (rm?.ok) guard = findAll(text, rm.value).map((g) => [g.s, g.e]);
    }
  }
  let out = '';
  let last = 0;
  let count = 0;
  for (const f of found) {
    if (guard.some(([a, b]) => f.s >= a && f.e <= b)) continue;
    out += text.slice(last, f.s) + (m.opts.regex ? expandReplacement(rep, text.slice(f.s, f.e), f) : rep);
    last = f.e;
    count++;
  }
  return count ? { text: out + text.slice(last), count } : { text, count: 0 };
}

const lineStart = (t: string, i: number) => t.lastIndexOf('\n', i - 1) + 1;
const lineEnd = (t: string, i: number) => {
  const j = t.indexOf('\n', i);
  return j < 0 ? t.length : j;
};

/** Normalizes a pasted block: \r\n → \n, no blank lines around it, no trailing spaces. */
export function cleanBlock(s: string): string {
  return nl(s)
    .replace(/[ \t]+$/gm, '')
    .replace(/^\s*\n/, '')
    .replace(/\s+$/, '');
}

/**
 * Replaces what lies between a start marker and an end marker (every pair, in order). With `keepMarkers`
 * the marker lines stay and only the lines between them change; otherwise the marker lines go too.
 */
export function replaceBetween(text: string, startM: Matcher, endM: Matcher, block: string, keepMarkers: boolean): { text: string; count: number; endMissing: boolean } {
  const b = cleanBlock(block);
  const starts = findAll(text, startM);
  if (!starts.length) return { text, count: 0, endMissing: false };
  const ends = findAll(text, endM);
  let out = '';
  let last = 0;
  let count = 0;
  let pairs = 0;
  let endMissing = false;
  for (const s of starts) {
    if (s.s < last) continue;
    const e = ends.find((x) => x.s >= s.e);
    if (!e) {
      endMissing = pairs === 0;
      break;
    }
    pairs++;
    let a: number;
    let z: number;
    let ins: string;
    if (keepMarkers) {
      const sEnd = lineEnd(text, s.e);
      const eStart = lineStart(text, e.s);
      if (eStart <= sEnd) {
        a = s.e; // both markers on one line: replace inline
        z = e.s;
        ins = b;
      } else {
        a = sEnd;
        z = eStart;
        ins = b ? `\n${b}\n` : '\n';
      }
    } else {
      a = lineStart(text, s.s);
      z = lineEnd(text, e.e);
      ins = b;
      if (!b && text[z] === '\n') z++;
    }
    if (text.slice(a, z) !== ins) count++;
    out += text.slice(last, a) + ins;
    last = z;
  }
  return count ? { text: out + text.slice(last), count, endMissing } : { text, count: 0, endMissing };
}

/** Adds a block at the start or end unless the description already contains it (Persian-aware). */
export function addBlock(text: string, block: string, position: 'start' | 'end', opts: MatchOptions): { text: string; count: number } {
  const b = cleanBlock(block);
  if (!b) return { text, count: 0 };
  const m = compileFind(b, { ...opts, regex: false, wholeWord: false });
  if (m?.ok && findAll(text, m.value).length) return { text, count: 0 };
  if (!text.trim()) return { text: b, count: 1 };
  return { text: position === 'start' ? `${b}\n\n${text.replace(/^\s*\n/, '')}` : `${text.replace(/\s+$/, '')}\n\n${b}`, count: 1 };
}

/** Removes every line that contains a match (with its line break). */
export function removeLines(text: string, m: Matcher): { text: string; count: number } {
  const found = findAll(text, m);
  if (!found.length) return { text, count: 0 };
  const ranges: [number, number][] = [];
  for (const f of found) {
    const a = lineStart(text, f.s);
    const z = lineEnd(text, Math.max(f.s, f.e - 1));
    const prev = ranges[ranges.length - 1];
    if (prev && a <= prev[1]) prev[1] = Math.max(prev[1], z);
    else ranges.push([a, z]);
  }
  let out = '';
  let last = 0;
  let lines = 0;
  for (const [a, z] of ranges) {
    lines += text.slice(a, z).split('\n').length;
    let ra = a;
    let rz = z;
    if (text[rz] === '\n') rz++;
    else if (ra > 0 && text[ra - 1] === '\n' && ra - 1 >= last) ra--;
    out += text.slice(last, ra);
    last = rz;
  }
  return { text: out + text.slice(last), count: lines };
}

// ---- links ----
export interface UrlRule {
  from: string;
  to: string;
}

interface UrlParts {
  scheme: string;
  host: string;
  path: string;
}

function urlParts(raw: string): UrlParts | null {
  const s = raw.trim().replace(/\/+$/, '');
  const m = /^(?:(https?):\/\/)?(?:www\.)?([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)(\/[^\s?#]*)?$/iu.exec(s);
  if (!m) return null;
  return { scheme: (m[1] ?? '').toLowerCase(), host: m[2]!.toLowerCase(), path: (m[3] ?? '').replace(/\/+$/, '') };
}

/** Why a link rule cannot run (null = fine). */
export function urlRuleError(rule: UrlRule): 'from' | 'to' | 'same' | null {
  const f = urlParts(rule.from);
  if (!f) return 'from';
  const t = urlParts(rule.to);
  if (!t) return 'to';
  if (f.host === t.host && f.path.toLowerCase() === t.path.toLowerCase() && (!t.scheme || t.scheme === f.scheme)) return 'same';
  return null;
}

const URL_RE = /(?<![\p{L}\p{N}.@/_-])(https?:\/\/)?(www\.)?([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)((?:[/?#][^\s<>"'«»]*)?)/giu;

/**
 * Changes links: `from` is a domain ("old.com") or a link prefix ("t.me/oldname"); every link on that host
 * (with or without www/https) whose path starts with the prefix gets the prefix replaced by `to`; the rest of
 * the link (path, query, trailing punctuation) is kept. E-mail addresses and look-alike domains are left alone.
 */
export function replaceUrls(text: string, rule: UrlRule): { text: string; count: number } {
  if (urlRuleError(rule)) return { text, count: 0 };
  const f = urlParts(rule.from)!;
  const t = urlParts(rule.to)!;
  const toTyped = rule.to.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  let count = 0;
  const out = text.replace(URL_RE, (all: string, scheme: string | undefined, _www: string | undefined, host: string, rest: string) => {
    if (host.toLowerCase() !== f.host) return all;
    let tail = rest;
    if (f.path) {
      if (!rest.toLowerCase().startsWith(f.path.toLowerCase())) return all;
      tail = rest.slice(f.path.length);
      if (tail && !/^[/?#&]/.test(tail)) return all;
    }
    count++;
    const sch = scheme ? `${t.scheme || scheme.slice(0, -3).toLowerCase()}://` : '';
    return sch + toTyped + tail;
  });
  return { text: count ? out : text, count };
}

// ---- operations ----
export type FrOp =
  | { kind: 'replace'; find: string; replace: string; fields: BulkField[]; opts: MatchOptions }
  | { kind: 'block'; start: string; end: string; block: string; keepMarkers: boolean; opts: MatchOptions }
  | { kind: 'append'; block: string; position: 'start' | 'end'; opts: MatchOptions }
  | { kind: 'removeLines'; find: string; opts: MatchOptions }
  | { kind: 'urls'; from: string; to: string }
  | { kind: 'addTags' | 'removeTags'; tags: string[] }
  | ({ kind: 'profile' } & ProfileOp);

export type FrKind = FrOp['kind'];

export interface FrResult<T extends Editable> {
  next: T;
  /** Occurrences (lines for removeLines, links for urls, blocks for block/append). */
  count: number;
  endMissing?: boolean;
}

export type FrRun = <T extends Editable>(rec: T) => FrResult<T>;
export type FrCompileError = 'empty' | 'regex' | 'url-from' | 'url-to' | 'url-same';

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ');

/** Compiles an operation once; the returned function is applied to every item. */
export function compileOp(op: FrOp): { ok: true; run: FrRun } | { ok: false; error: FrCompileError; detail?: string } {
  switch (op.kind) {
    case 'replace': {
      const m = compileFind(op.find, op.opts);
      if (!m || !op.fields.length) return { ok: false, error: 'empty' };
      if (!m.ok) return { ok: false, error: 'regex', detail: m.error };
      const mm = m.value;
      return {
        ok: true,
        run: (rec) => {
          let count = 0;
          const next = { ...rec };
          if (op.fields.includes('title') && typeof rec.title === 'string') {
            const r = replaceIn(rec.title, mm, oneLine(op.replace));
            next.title = r.text;
            count += r.count;
          }
          if (op.fields.includes('description')) {
            const r = replaceIn(rec.description, mm, op.replace);
            next.description = r.text;
            count += r.count;
          }
          if (op.fields.includes('tags')) {
            let n = 0;
            const tags = rec.tags.map((tg) => {
              const r = replaceIn(tg, mm, oneLine(op.replace));
              n += r.count;
              return r.text;
            });
            if (n) next.tags = dedupeTags(tags);
            count += n;
          }
          return { next, count };
        },
      };
    }
    case 'block': {
      const s = compileFind(op.start, { ...op.opts, wholeWord: false });
      const e = compileFind(op.end, { ...op.opts, wholeWord: false });
      if (!s || !e) return { ok: false, error: 'empty' };
      if (!s.ok) return { ok: false, error: 'regex', detail: s.error };
      if (!e.ok) return { ok: false, error: 'regex', detail: e.error };
      return {
        ok: true,
        run: (rec) => {
          const r = replaceBetween(rec.description, s.value, e.value, op.block, op.keepMarkers);
          return { next: { ...rec, description: r.text }, count: r.count, endMissing: r.endMissing };
        },
      };
    }
    case 'append':
      if (!cleanBlock(op.block)) return { ok: false, error: 'empty' };
      return {
        ok: true,
        run: (rec) => {
          const r = addBlock(rec.description, op.block, op.position, op.opts);
          return { next: { ...rec, description: r.text }, count: r.count };
        },
      };
    case 'removeLines': {
      const m = compileFind(op.find, op.opts);
      if (!m) return { ok: false, error: 'empty' };
      if (!m.ok) return { ok: false, error: 'regex', detail: m.error };
      return {
        ok: true,
        run: (rec) => {
          const r = removeLines(rec.description, m.value);
          return { next: { ...rec, description: r.text }, count: r.count };
        },
      };
    }
    case 'urls': {
      if (!op.from.trim() || !op.to.trim()) return { ok: false, error: 'empty' };
      const err = urlRuleError(op);
      if (err) return { ok: false, error: `url-${err}` };
      return {
        ok: true,
        run: (rec) => {
          const r = replaceUrls(rec.description, op);
          return { next: { ...rec, description: r.text }, count: r.count };
        },
      };
    }
    case 'addTags':
    case 'removeTags': {
      const tags = op.tags.map((t) => t.trim()).filter(Boolean);
      if (!tags.length) return { ok: false, error: 'empty' };
      return {
        ok: true,
        run: (rec) => {
          const next = applyBulk(rec, { kind: op.kind, tags });
          return { next, count: Math.abs(next.tags.length - rec.tags.length) };
        },
      };
    }
    case 'profile': {
      if ((op.descriptionMode === 'keep' || !op.description.trim()) && (op.tagsMode === 'keep' || !op.tags.length)) return { ok: false, error: 'empty' };
      return {
        ok: true,
        run: (rec) => {
          const next = applyProfile(rec, op);
          return { next, count: next === rec ? 0 : 1 };
        },
      };
    }
  }
}

// ---- YouTube limits ----
export type LimitProblem =
  | { code: 'title-empty' }
  | { code: 'title-long' | 'desc-long' | 'tags-long'; value: number; max: number }
  | { code: 'angle'; field: BulkField };

export const YT_LIMITS = { titleChars: 100, descriptionBytes: 5000, tagsChars: 500 } as const;

const cps = (s: string) => Array.from(s).length;
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** Tag length as YouTube counts it: commas between tags, quotes around tags with spaces. */
export function ytTagsLength(tags: string[]): number {
  if (!tags.length) return 0;
  return tags.reduce((n, t) => n + cps(t) + (/\s/.test(t) ? 2 : 0), 0) + tags.length - 1;
}

export interface Snip {
  title: string;
  description: string;
  tags: string[];
}

/** Everything that would make videos.update reject the snippet. Such items are skipped, never cut. */
export function limitProblems(e: Snip): LimitProblem[] {
  const out: LimitProblem[] = [];
  const tl = cps(e.title.trim());
  if (!tl) out.push({ code: 'title-empty' });
  else if (tl > YT_LIMITS.titleChars) out.push({ code: 'title-long', value: tl, max: YT_LIMITS.titleChars });
  const db = bytes(e.description);
  if (db > YT_LIMITS.descriptionBytes) out.push({ code: 'desc-long', value: db, max: YT_LIMITS.descriptionBytes });
  const tg = ytTagsLength(e.tags);
  if (tg > YT_LIMITS.tagsChars) out.push({ code: 'tags-long', value: tg, max: YT_LIMITS.tagsChars });
  if (/[<>]/.test(e.title)) out.push({ code: 'angle', field: 'title' });
  if (/[<>]/.test(e.description)) out.push({ code: 'angle', field: 'description' });
  if (e.tags.some((t) => /[<>]/.test(t))) out.push({ code: 'angle', field: 'tags' });
  return out;
}

export type PlanStatus = 'change' | 'none' | 'invalid' | 'end-missing';

export interface Plan {
  status: PlanStatus;
  next: Snip;
  count: number;
  fields: BulkField[];
  problems: LimitProblem[];
}

/** What one video would become, and whether it may be written. */
export function planVideo(cur: Snip, run: FrRun): Plan {
  const r = run(cur);
  const next: Snip = { title: r.next.title ?? cur.title, description: r.next.description, tags: r.next.tags };
  const fields = changedFields(cur, next);
  if (!fields.length) return { status: r.endMissing ? 'end-missing' : 'none', next: cur, count: r.count, fields, problems: [] };
  const problems = limitProblems(next);
  return { status: problems.length ? 'invalid' : 'change', next, count: r.count, fields, problems };
}

/** Equal after the normalization YouTube itself may apply (line endings, trailing spaces, tag spacing). */
export function sameSnippet(a: Snip, b: Snip): boolean {
  const d = (s: string) => nl(s).replace(/[ \t]+$/gm, '').trim();
  const tg = (t: string[]) => t.map((x) => x.trim()).filter(Boolean).join('\n');
  return a.title.trim() === b.title.trim() && d(a.description) === d(b.description) && tg(a.tags) === tg(b.tags);
}

// ---- line/word diff for the preview ----
export interface DiffSeg {
  text: string;
  changed: boolean;
}
export type SameRow = { kind: 'same'; text: string };
export type DiffRow = SameRow | { kind: 'del' | 'add'; text: string; segs: DiffSeg[] } | { kind: 'gap'; rows: SameRow[] };

/** Longest-common-subsequence edit script (inputs are capped by the callers). */
function lcs<T>(a: T[], b: T[]): ('=' | '-' | '+')[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: ('=' | '-' | '+')[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push('=');
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push('-');
      i++;
    } else {
      out.push('+');
      j++;
    }
  }
  for (; i < n; i++) out.push('-');
  for (; j < m; j++) out.push('+');
  return out;
}

// Links count as one token, so a changed link is highlighted whole.
const tokens = (s: string) => s.match(/(?:https?:\/\/)?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:[/?#]\S*)?|[\p{L}\p{N}_\u200c]+|\s+|./gsu) ?? [];

/** Word-level highlight of one changed line pair. */
export function wordDiff(before: string, after: string): { del: DiffSeg[]; add: DiffSeg[] } {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > 250_000) return { del: [{ text: before, changed: true }], add: [{ text: after, changed: true }] };
  const del: DiffSeg[] = [];
  const add: DiffSeg[] = [];
  const push = (arr: DiffSeg[], text: string, changed: boolean) => {
    const last = arr[arr.length - 1];
    if (last && last.changed === changed) last.text += text;
    else arr.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  for (const op of lcs(a, b)) {
    if (op === '=') {
      push(del, a[i++]!, false);
      push(add, b[j++]!, false);
    } else if (op === '-') push(del, a[i++]!, true);
    else push(add, b[j++]!, true);
  }
  return { del, add };
}

/** Line diff with in-line word highlights; unchanged runs longer than 2×context fold into a 'gap'. */
export function diffText(before: string, after: string, context = 2): DiffRow[] {
  const a = nl(before).split('\n');
  const b = nl(after).split('\n');
  const ops = a.length * b.length > 1_000_000 ? [...a.map(() => '-' as const), ...b.map(() => '+' as const)] : lcs(a, b);
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  while (k < ops.length) {
    if (ops[k] === '=') {
      rows.push({ kind: 'same', text: a[i++]! });
      j++;
      k++;
      continue;
    }
    const dels: string[] = [];
    const adds: string[] = [];
    while (k < ops.length && ops[k] !== '=') {
      if (ops[k] === '-') dels.push(a[i++]!);
      else adds.push(b[j++]!);
      k++;
    }
    const pairs = Math.min(dels.length, adds.length);
    const aRows: DiffRow[] = [];
    dels.forEach((d, x) => {
      const w = x < pairs ? wordDiff(d, adds[x]!) : null;
      // Word marks only help when the two lines are mostly alike; otherwise the row colour says it all.
      const same = w ? w.del.filter((g) => !g.changed).reduce((n, g) => n + g.text.trim().length, 0) : 0;
      if (w && same >= Math.max(d.length, adds[x]!.length) * 0.3) {
        rows.push({ kind: 'del', text: d, segs: w.del });
        aRows.push({ kind: 'add', text: adds[x]!, segs: w.add });
      } else {
        rows.push({ kind: 'del', text: d, segs: [{ text: d, changed: false }] });
        if (x < pairs) aRows.push({ kind: 'add', text: adds[x]!, segs: [{ text: adds[x]!, changed: false }] });
      }
    });
    adds.slice(pairs).forEach((x) => aRows.push({ kind: 'add', text: x, segs: [{ text: x, changed: false }] }));
    rows.push(...aRows);
  }
  const out: DiffRow[] = [];
  let run: SameRow[] = [];
  const flush = (atEnd: boolean) => {
    const keepHead = out.length === 0 ? 0 : context;
    const keepTail = atEnd ? 0 : context;
    if (run.length > keepHead + keepTail + 1) {
      out.push(...run.slice(0, keepHead), { kind: 'gap', rows: run.slice(keepHead, run.length - keepTail) }, ...run.slice(run.length - keepTail));
    } else out.push(...run);
    run = [];
  };
  for (const r of rows) {
    if (r.kind === 'same') run.push(r);
    else {
      flush(false);
      out.push(r);
    }
  }
  flush(true);
  return out;
}

// ---- quota planning ----
/** videos.list (1) + videos.update (50) per written video. */
export const UNITS_PER_VIDEO = 51;
/** Default Data API project quota per day. */
export const PROJECT_QUOTA = 10_000;

export interface QuotaPlan {
  /** Units still usable today (local cap and project quota). */
  left: number;
  today: number;
  later: number;
  /** Calendar days (Pacific) the whole run needs, counting today. */
  days: number;
  perDay: number;
}

export function quotaPlan(videos: number, cap: number, used: number): QuotaPlan {
  const limit = cap > 0 ? Math.min(cap, PROJECT_QUOTA) : PROJECT_QUOTA;
  const left = Math.max(0, limit - used);
  const today = Math.min(videos, Math.floor(left / UNITS_PER_VIDEO));
  const later = videos - today;
  const perDay = Math.max(1, Math.floor(limit / UNITS_PER_VIDEO));
  return { left, today, later, perDay, days: 1 + Math.ceil(later / perDay) };
}

function pacificParts(ms: number): { y: number; m: number; d: number; h: number } {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour') };
}

/** The next midnight in America/Los_Angeles (when the YouTube quota resets), as epoch ms. */
export function nextPacificMidnight(now: number): number {
  const p = pacificParts(now);
  for (const off of [7, 8]) {
    const t = Date.UTC(p.y, p.m - 1, p.d + 1, off);
    if (pacificParts(t).h === 0 && t > now) return t;
  }
  return now + 24 * 3600_000;
}

// ---- results export ----
const csvCell = (v: string | number | undefined) => {
  let s = v === undefined ? '' : String(v);
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`; // never a formula in a spreadsheet
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a BOM so Excel opens Persian text correctly. */
export function toCsv(rows: (string | number | undefined)[][]): string {
  return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---- background job records (stored by src/background/jobs/bulk.ts) ----
/**
 * running: writing now \u00b7 waiting: today's quota is used, continues after the Pacific-midnight reset \u00b7
 * paused: by the owner \u00b7 stopped: needs the owner (sign-in, permission, network) \u00b7 done \u00b7 canceled.
 */
export type JobStatus = 'running' | 'waiting' | 'paused' | 'stopped' | 'done' | 'canceled';
export type JobPhase = 'apply' | 'undo';

export interface JobError {
  kind: string;
  code: string;
  detail?: string;
}

export interface BulkJob {
  id: string;
  channelId: string;
  channelTitle?: string;
  label: string;
  op: FrOp;
  createdAt: string;
  status: JobStatus;
  phase: JobPhase;
  total: number;
  /** A one-video trial run. */
  test?: boolean;
  heartbeatAt?: string;
  /** When a waiting job continues. */
  nextRunAt?: string;
  waitReason?: 'budget' | 'quota';
  finishedAt?: string;
  /** Why the job stopped (status 'stopped') or the last quota error. */
  error?: JobError;
}

export type ItemState = 'pending' | 'written' | 'skipped' | 'failed';
export type SkipReason = 'no-match' | 'limit' | 'end-missing' | 'canceled';
/** Undo: restored, already as before ('same'), edited since ('conflict', asks first), or forced overwrite. */
export type UndoState = 'pending' | 'force' | 'restored' | 'same' | 'conflict' | 'failed';

export interface BulkItem {
  jobId: string;
  videoId: string;
  /** Position in the job. */
  n: number;
  title: string;
  state: ItemState;
  reason?: SkipReason;
  problems?: LimitProblem[];
  error?: JobError;
  count?: number;
  /** Exact snippet before TubeX wrote, and what YouTube stored after. */
  before?: Snip;
  after?: Snip;
  /** Set just before a write is sent; recognizes a write whose response was lost. */
  attempt?: { before: Snip; after: Snip };
  at?: string;
  localizations?: string[];
  undo?: UndoState;
  undoAt?: string;
  undoError?: JobError;
  /** The video as found at undo time when it was edited since (shown before overwriting). */
  current?: Snip;
}

export interface JobCounts {
  pending: number;
  written: number;
  skipped: number;
  failed: number;
  undoPending: number;
  restored: number;
  conflict: number;
  undoFailed: number;
}

export function countItems(items: BulkItem[]): JobCounts {
  const c: JobCounts = { pending: 0, written: 0, skipped: 0, failed: 0, undoPending: 0, restored: 0, conflict: 0, undoFailed: 0 };
  for (const i of items) {
    c[i.state]++;
    if (i.undo === 'pending' || i.undo === 'force') c.undoPending++;
    else if (i.undo === 'restored' || i.undo === 'same') c.restored++;
    else if (i.undo === 'conflict') c.conflict++;
    else if (i.undo === 'failed') c.undoFailed++;
  }
  return c;
}

/** Items the job still has to process in its current phase. */
export function needsWork(i: BulkItem, phase: JobPhase): boolean {
  return phase === 'apply' ? i.state === 'pending' : i.undo === 'pending' || i.undo === 'force';
}

export const isActive = (j: Pick<BulkJob, 'status'>) => j.status === 'running' || j.status === 'waiting';
