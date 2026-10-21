// YouTube chapter rules (Inferred, see docs/INTEGRATIONS.md): first chapter at 0:00, at least three,
// ascending, each at least 10 seconds long.

export interface Chapter {
  seconds: number;
  time: string;
  title: string;
}

export function parseTimestamp(t: string): number | null {
  const m = t.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, h, mm, ss] = m;
  if (Number(ss) >= 60 || (h !== undefined && Number(mm) >= 60)) return null;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
}

export function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Applies YouTube's chapter rules (Inferred): start at 0:00, ascending, ≥3 chapters, ≥10 s each. */
export function normalizeChapters(raw: { time: string; title: string }[]): { chapters: Chapter[]; valid: boolean } {
  const parsed = raw
    .map((c) => ({ seconds: parseTimestamp(c.time), title: c.title.trim().replace(/[<>]/g, '').slice(0, 100) }))
    .filter((c): c is { seconds: number; title: string } => c.seconds !== null && !!c.title)
    .sort((a, b) => a.seconds - b.seconds);
  const chapters: Chapter[] = [];
  for (const c of parsed) {
    const prev = chapters[chapters.length - 1];
    if (prev && c.seconds - prev.seconds < 10) continue;
    chapters.push({ ...c, time: formatTimestamp(c.seconds) });
  }
  if (chapters[0] && chapters[0].seconds !== 0) chapters[0] = { ...chapters[0], seconds: 0, time: '0:00' };
  return { chapters, valid: chapters.length >= 3 };
}

export function chaptersToText(chapters: Chapter[]): string {
  return chapters.map((c) => `${c.time} ${c.title}`).join('\n');
}

const CHAPTER_LINE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—:|]?\s*(.+)$/;

/** Timestamp lines in a description, in written order. */
export function extractChapters(description: string): { time: string; seconds: number; title: string }[] {
  const out: { time: string; seconds: number; title: string }[] = [];
  for (const line of description.split('\n')) {
    const m = line.match(CHAPTER_LINE);
    if (!m) continue;
    const seconds = parseTimestamp(m[1]!);
    if (seconds !== null) out.push({ time: m[1]!, seconds, title: m[2]!.trim() });
  }
  return out;
}

export type ChapterProblem = 'not-at-zero' | 'too-few' | 'not-ascending' | 'too-short';

/** Problems with chapters written in a description; empty when there are none or they are valid. */
export function chapterProblems(description: string): ChapterProblem[] {
  const ch = extractChapters(description);
  if (ch.length === 0) return [];
  const p: ChapterProblem[] = [];
  if (ch[0]!.seconds !== 0) p.push('not-at-zero');
  if (ch.length < 3) p.push('too-few');
  for (let i = 1; i < ch.length; i++) {
    const gap = ch[i]!.seconds - ch[i - 1]!.seconds;
    if (gap <= 0 && !p.includes('not-ascending')) p.push('not-ascending');
    else if (gap > 0 && gap < 10 && !p.includes('too-short')) p.push('too-short');
  }
  return p;
}

// ---------------------------------------------------------------- tolerant reading (Videolytics best practices)
// The strict helpers above stay as they are for the chapter tools. The scanner below only answers "does this
// description hold a chapter list, and if it is broken, why": it tolerates what real (often Persian, RTL)
// descriptions contain, so a parser limit is never reported to the user as a chapter problem.

/** Bidi controls, zero-width marks and the BOM (copied text and RTL editors add them around timestamps). */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]/g;
const SPACES = /[\u00A0\u2007\u202F\u3000]/g;

/** One line normalized for timestamp matching: marks removed, odd spaces as spaces, Persian/Arabic-Indic digits as ASCII. */
export function cleanChapterLine(line: string): string {
  return line
    .replace(INVISIBLE, '')
    .replace(SPACES, ' ')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\uFF1A\uFE55]/g, ':');
}

const TS = '(?<![\\d:])((?:\\d{1,2}:)?\\d{1,2}:\\d{2})(?![\\d:])';
const LEAD = '[\\s•·*\\-–—>»▶►▸▪■●○◦✓✔#|]*';
/** Timestamp first: "00:00 Intro", "• (0:45) Frames", "[1:02:03] - Outro". */
const TS_FIRST = new RegExp(`^${LEAD}[(\\[]?\\s*${TS}\\s*[)\\]]?\\s*[-–—:|.،]*\\s*(.*)$`);
/** Timestamp last (common in RTL text): "Intro - 00:00", "Intro (0:45)". */
const TS_LAST = new RegExp(`^${LEAD}(.*?)\\s*[-–—:|،]*\\s*[(\\[]?\\s*${TS}\\s*[)\\]]?\\s*[.،]?\\s*$`);
const WORDY = /[\p{L}\p{N}]/u;

export interface ChapterLine {
  seconds: number;
  title: string;
}

/** Every line of a description that reads as "timestamp + title" (start or end of the line), in written order. */
export function chapterLines(description: string): ChapterLine[] {
  const out: ChapterLine[] = [];
  for (const raw of description.split(/\r\n|\r|\n|\u2028|\u2029/)) {
    const line = cleanChapterLine(raw).trim();
    if (!line) continue;
    let time: string | undefined;
    let title = '';
    const first = line.match(TS_FIRST);
    if (first && WORDY.test(first[2]!)) {
      time = first[1];
      title = first[2]!.trim();
    } else {
      const last = line.match(TS_LAST);
      if (last && WORDY.test(last[1]!)) {
        time = last[2];
        title = last[1]!.trim();
      }
    }
    if (!time) continue;
    const seconds = parseTimestamp(time);
    if (seconds !== null) out.push({ seconds, title });
  }
  return out;
}

export interface ChapterScan {
  /** The chapter list YouTube would read: from the first 0:00 line (or all timestamps when none is at 0:00). */
  chapters: ChapterLine[];
  /** Concrete, fixable problems of that list (empty when it is valid or when there is no list). */
  problems: ChapterProblem[];
  /** Timestamp lines found anywhere in the description. */
  found: number;
}

/**
 * Finds the chapter list in a description and what is wrong with it. A list starts at a 0:00 line and runs until
 * the next 0:00 line (a second list, e.g. timestamps of another part of a course, is ignored rather than called out
 * of order). Without a 0:00 line, three or more timestamps are a list that does not start at 0:00; one or two stray
 * timestamps ("at 5:30 I show…") are not a chapter list at all.
 */
export function scanChapters(description: string): ChapterScan {
  const lines = chapterLines(description);
  const start = lines.findIndex((l) => l.seconds === 0);
  let list: ChapterLine[];
  if (start >= 0) {
    list = [lines[start]!];
    for (const l of lines.slice(start + 1)) {
      if (l.seconds === 0) break;
      list.push(l);
    }
  } else if (lines.length >= 3) list = lines;
  else return { chapters: [], problems: [], found: lines.length };
  const problems: ChapterProblem[] = [];
  if (list[0]!.seconds !== 0) problems.push('not-at-zero');
  if (list.length < 3) problems.push('too-few');
  for (let i = 1; i < list.length; i++) {
    const gap = list[i]!.seconds - list[i - 1]!.seconds;
    if (gap <= 0 && !problems.includes('not-ascending')) problems.push('not-ascending');
    else if (gap > 0 && gap < 10 && !problems.includes('too-short')) problems.push('too-short');
  }
  return { chapters: list, problems, found: lines.length };
}
