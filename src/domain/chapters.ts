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
