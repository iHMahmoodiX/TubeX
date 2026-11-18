// Suggested Shorts: deterministic segment suggestions from audience retention, chapters and an optional
// transcript. Every suggestion says which signal it came from; nothing is invented when no signal exists.
// Pure functions, no browser APIs.

export const SHORT_MIN = 15;
export const SHORT_MAX = 60;

export interface RetentionPoint {
  /** Elapsed share of the video, 0..1. */
  ratio: number;
  /** audienceWatchRatio: share of viewers watching at this point (can exceed 1 with rewatches). */
  watch: number;
  /** relativeRetentionPerformance 0..1 vs. videos of similar length; null when YouTube does not report it. */
  relative: number | null;
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface Chapter {
  seconds: number;
  title: string;
}

export type Signal = 'retention' | 'chapter' | 'transcript';

export interface ShortSuggestion {
  start: number;
  end: number;
  title: string;
  hook: string;
  signals: Signal[];
  /** Short reason in the UI's terms, e.g. retention peak strength; filled by the page. */
  score: number;
  /** AI-written explanation, when the suggestion was refined by AI. */
  why?: string;
}

/** Retention rows from YouTube Analytics (columns elapsedVideoTimeRatio, audienceWatchRatio, relativeRetentionPerformance). */
export function parseRetention(columns: string[], rows: (string | number)[][]): RetentionPoint[] {
  const ci = (n: string) => columns.indexOf(n);
  const r = ci('elapsedVideoTimeRatio');
  const w = ci('audienceWatchRatio');
  const p = ci('relativeRetentionPerformance');
  if (r < 0 || w < 0) return [];
  return rows
    .map((row) => ({ ratio: Number(row[r]), watch: Number(row[w]), relative: p >= 0 && row[p] !== null && row[p] !== '' ? Number(row[p]) : null }))
    .filter((x) => Number.isFinite(x.ratio) && Number.isFinite(x.watch))
    .map((x) => ({ ...x, relative: x.relative !== null && Number.isFinite(x.relative) ? x.relative : null }))
    .sort((a, b) => a.ratio - b.ratio);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fits a segment into 15–60 s inside the video. */
export function fitSegment(start: number, end: number, duration: number): { start: number; end: number } {
  let s = clamp(Math.round(start), 0, Math.max(0, duration - SHORT_MIN));
  let e = Math.round(end);
  if (e - s < SHORT_MIN) e = s + SHORT_MIN;
  if (e - s > SHORT_MAX) e = s + SHORT_MAX;
  if (e > duration) {
    e = Math.round(duration);
    s = Math.max(0, e - Math.max(SHORT_MIN, Math.min(SHORT_MAX, end - start)));
  }
  return { start: s, end: e };
}

/**
 * Retention peaks: windows of about 30 s where viewers stay (relative performance) or come back (the watch
 * ratio rises against the preceding trend, i.e. rewatches or skips into that part). Skips the first and last
 * 5 % (intros and end screens are always high or low). Returns windows strongest first, with a 0..1 score.
 */
export function retentionPeaks(points: RetentionPoint[], duration: number, windowSec = 30): { start: number; end: number; score: number }[] {
  if (points.length < 10 || duration < SHORT_MIN * 2) return [];
  const step = duration / points.length;
  const w = Math.max(1, Math.round(windowSec / step));
  const rise = points.map((p, i) => {
    const prev = points.slice(Math.max(0, i - 5), i);
    if (!prev.length) return 0;
    return p.watch - prev.reduce((a, b) => a + b.watch, 0) / prev.length;
  });
  const hasRel = points.some((p) => p.relative !== null);
  const norm = (xs: number[]) => {
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return xs.map((x) => (hi - lo < 1e-9 ? 0 : (x - lo) / (hi - lo)));
  };
  const nr = norm(rise);
  const nrel = hasRel ? norm(points.map((p) => p.relative ?? 0)) : points.map(() => 0);
  const score = points.map((_, i) => (hasRel ? 0.6 * nrel[i]! + 0.4 * nr[i]! : nr[i]!));
  const windows: { start: number; end: number; score: number }[] = [];
  for (let i = 0; i + w <= points.length; i++) {
    const startRatio = points[i]!.ratio - 1 / points.length;
    if (startRatio < 0.05 || points[i + w - 1]!.ratio > 0.95) continue;
    const avg = score.slice(i, i + w).reduce((a, b) => a + b, 0) / w;
    windows.push({ ...fitSegment(startRatio * duration, startRatio * duration + windowSec, duration), score: avg });
  }
  windows.sort((a, b) => b.score - a.score);
  const picked: typeof windows = [];
  for (const win of windows) {
    if (picked.some((p) => overlaps(p, win))) continue;
    picked.push(win);
    if (picked.length >= 6) break;
  }
  return picked;
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** A chapter as a Short: from its start, up to 45 s or the next chapter. */
export function chapterSegments(chapters: Chapter[], duration: number): { start: number; end: number; title: string }[] {
  const sorted = [...chapters].sort((a, b) => a.seconds - b.seconds);
  return sorted
    .map((c, i) => {
      const next = sorted[i + 1]?.seconds ?? duration;
      return { ...fitSegment(c.seconds, Math.min(next, c.seconds + 45), duration), title: c.title };
    })
    .filter((c) => c.end > c.start);
}

/** SRT or WebVTT text → cues. */
export function parseSubtitles(text: string): Cue[] {
  const out: Cue[] = [];
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  const ts = (t: string) => {
    const m = t.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
    if (!m) return NaN;
    return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000;
  };
  for (const b of blocks) {
    const lines = b.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, z] = lines[i]!.split('-->');
    const start = ts(a ?? '');
    const end = ts((z ?? '').trim().split(/\s+/)[0] ?? '');
    const body = lines
      .slice(i + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (Number.isFinite(start) && Number.isFinite(end) && body) out.push({ start, end, text: body });
  }
  return out;
}

/** Plain pasted transcript with optional "m:ss text" lines → cues (lines without times are ignored). */
export function parseTimedLines(text: string): Cue[] {
  const out: Cue[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–—:]?\s*(.+)$/);
    if (!m) continue;
    const parts = m[1]!.split(':').map(Number);
    const sec = parts.reduce((a, b) => a * 60 + b, 0);
    out.push({ start: sec, end: sec, text: m[2]!.trim() });
  }
  for (let i = 0; i < out.length; i++) out[i]!.end = out[i + 1]?.start ?? out[i]!.start + 5;
  return out;
}

export function textBetween(cues: Cue[], start: number, end: number): string {
  return cues
    .filter((c) => c.end > start && c.start < end)
    .map((c) => c.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first sentence (or first ~12 words) of a passage, as a hook line. */
export function hookLine(text: string, maxWords = 14): string {
  const t = text.trim();
  if (!t) return '';
  const sentence = t.split(/(?<=[.!?؟…])\s+/)[0] ?? t;
  const words = sentence.split(/\s+/);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : sentence;
}

/** Transcript windows that hold questions, exclamations or numbers (weak signal, used when others are missing). */
export function transcriptSegments(cues: Cue[], duration: number): { start: number; end: number; score: number }[] {
  if (!cues.length) return [];
  const out: { start: number; end: number; score: number }[] = [];
  for (let s = 0; s + SHORT_MIN <= duration; s += 30) {
    const txt = textBetween(cues, s, s + 30);
    if (!txt) continue;
    const score = (txt.match(/[?؟!]/g)?.length ?? 0) * 2 + (txt.match(/\d+|[۰-۹]+/g)?.length ?? 0);
    if (score > 0) out.push({ ...fitSegment(s, s + 30, duration), score });
  }
  const max = Math.max(1, ...out.map((o) => o.score));
  return out.map((o) => ({ ...o, score: o.score / max })).sort((a, b) => b.score - a.score);
}

export interface SuggestInput {
  duration: number;
  videoTitle: string;
  chapters: Chapter[];
  retention: RetentionPoint[];
  cues: Cue[];
}

/** 3–6 non-overlapping suggestions (fewer when the signals do not support more), strongest first. */
export function suggestShorts(input: SuggestInput, max = 6): ShortSuggestion[] {
  const { duration, cues } = input;
  if (duration < SHORT_MIN * 2) return [];
  type Cand = { start: number; end: number; score: number; signals: Signal[]; title?: string };
  const cands: Cand[] = [];
  for (const r of retentionPeaks(input.retention, duration)) cands.push({ ...r, signals: ['retention'], score: 0.5 + r.score / 2 });
  for (const c of chapterSegments(input.chapters, duration)) {
    const peak = cands.find((x) => x.signals.includes('retention') && overlaps(x, c));
    if (peak) {
      peak.signals.push('chapter');
      peak.title = c.title;
      peak.score += 0.3;
    } else cands.push({ start: c.start, end: c.end, score: c.start === 0 ? 0.2 : 0.4, signals: ['chapter'], title: c.title });
  }
  if (cues.length) {
    for (const tseg of transcriptSegments(cues, duration)) {
      const hit = cands.find((x) => overlaps(x, tseg));
      if (hit) {
        if (!hit.signals.includes('transcript')) hit.signals.push('transcript');
        hit.score += 0.1 * tseg.score;
      } else if (cands.length < max * 2) cands.push({ ...tseg, score: 0.15 + tseg.score * 0.2, signals: ['transcript'] });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const picked: Cand[] = [];
  for (const c of cands) {
    if (picked.some((p) => overlaps(p, c))) continue;
    picked.push(c);
    if (picked.length >= max) break;
  }
  return picked.map((c) => {
    const said = cues.length ? textBetween(cues, c.start, c.end) : '';
    const hook = hookLine(said);
    return {
      start: c.start,
      end: c.end,
      title: (c.title || hookLine(said, 8) || '').slice(0, 100),
      hook,
      signals: c.signals,
      score: Math.min(1, c.score),
    };
  });
}

/** Validates an AI suggestion against the video length; null when unusable. */
export function coerceAiShort(raw: unknown, duration: number): ShortSuggestion | null {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const start = Number(r.start);
  const end = Number(r.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start >= duration) return null;
  const seg = fitSegment(start, end, duration);
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const title = str(r.title, 100);
  if (!title) return null;
  return { ...seg, title, hook: str(r.hook, 200), why: str(r.why, 300), signals: [], score: 0 };
}

export const watchUrl = (videoId: string, start: number) => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.max(0, Math.floor(start))}s`;
export const studioEditUrl = (videoId: string) => `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/edit`;

export const CAPTIONS_LIST_COST = 50;
export const CAPTIONS_DOWNLOAD_COST = 200;
