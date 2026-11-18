// Personalized suggestions for one queued video (#15). Rule advice comes first and needs no AI; the optional AI
// call gets only the dated, owner-approved evidence below and must answer in a fixed JSON shape. Any suggestion
// quoting a number that is not in the evidence is dropped, so the page never shows a made-up figure.
// Ask Studio (YouTube Studio's own assistant) has no public API: TubeX builds a prompt the owner copies there.
import type { Lang } from './models';
import type { QueueEntry, SignalKind } from './optimizeQueue';

export type Effort = 'low' | 'medium' | 'high';
export type Confidence = 'low' | 'medium';

export interface CoachSuggestion {
  title: string;
  why: string;
  nextStep: string;
  effort: Effort;
  confidence: Confidence;
  /** Evidence keys the suggestion relies on (must exist in the evidence). */
  uses: string[];
}

/** Built-in advice per signal, as i18n key suffixes (coach.rule.<kind>). */
export const RULE_ADVICE: Record<SignalKind, { effort: Effort }> = {
  'low-ctr': { effort: 'low' },
  'strong-retention-low-reach': { effort: 'low' },
  'evergreen-traffic': { effort: 'medium' },
  'weak-packaging': { effort: 'low' },
};

/** The exact data an AI request may contain: own-channel numbers with their period and date, no ids or tokens. */
export function coachEvidence(e: QueueEntry, medians: { ctr: number | null; avgViewPercent: number | null; views: number | null }, now = Date.now()): Record<string, number | string> {
  const ev: Record<string, number | string> = {
    title: e.title.slice(0, 200),
    ageDays: Math.max(0, Math.round((now - Date.parse(e.publishedAt)) / 86_400_000)),
    period: `last ${e.snap.periodDays} days to ${e.snap.at.slice(0, 10)}`,
    signals: e.signals.map((s) => s.kind).join(', '),
  };
  const put = (k: string, v: number | undefined | null) => {
    if (v !== undefined && v !== null && Number.isFinite(v)) ev[k] = v;
  };
  put('views', e.snap.views);
  put('impressions', e.snap.impressions);
  put('ctrPercent', e.snap.ctr);
  put('avgViewPercent', e.snap.avgViewPercent);
  put('channelMedianCtrPercent', medians.ctr);
  put('channelMedianAvgViewPercent', medians.avgViewPercent);
  put('channelMedianViews', medians.views === null ? null : Math.round(medians.views));
  const checks = e.signals.find((s) => s.kind === 'weak-packaging')?.evidence.checks;
  if (checks) ev.failingChecks = String(checks);
  return ev;
}

/** Numbers that appear in the evidence, as written (used to check AI text). */
export function evidenceNumbers(ev: Record<string, number | string>): Set<string> {
  const out = new Set<string>();
  for (const v of Object.values(ev)) for (const m of String(v).match(/\d+(?:\.\d+)?/g) ?? []) out.add(normalizeNum(m));
  return out;
}

const toAscii = (t: string) => t.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
const normalizeNum = (s: string) => String(Number(s.replace(/[,٬]/g, '')));

/** Numbers in free text (Latin, Persian and Arabic digits, thousands separators). */
export function numbersIn(text: string): string[] {
  return (toAscii(text).match(/\d[\d,٬]*(?:\.\d+)?/g) ?? []).map(normalizeNum);
}

const EFFORTS: Effort[] = ['low', 'medium', 'high'];
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Validates the AI answer: {"suggestions":[{title, why, nextStep, effort, confidence, uses[]}]}, at most 3.
 * Drops entries with missing text, unknown evidence keys or numbers not in the evidence (small counts 1–10 are
 * allowed for wording like "3 words"). Returns the kept suggestions and how many were dropped.
 */
export function validateCoach(raw: Record<string, unknown>, ev: Record<string, number | string>): { suggestions: CoachSuggestion[]; dropped: number } {
  const list = Array.isArray(raw.suggestions) ? raw.suggestions.slice(0, 5) : [];
  const allowed = evidenceNumbers(ev);
  const out: CoachSuggestion[] = [];
  let dropped = 0;
  for (const x of list) {
    if (typeof x !== 'object' || x === null) {
      dropped++;
      continue;
    }
    const o = x as Record<string, unknown>;
    const sug: CoachSuggestion = {
      title: s(o.title, 160),
      why: s(o.why, 600),
      nextStep: s(o.nextStep, 400),
      effort: EFFORTS.includes(o.effort as Effort) ? (o.effort as Effort) : 'medium',
      confidence: o.confidence === 'medium' ? 'medium' : 'low',
      uses: Array.isArray(o.uses) ? o.uses.filter((k): k is string => typeof k === 'string' && k in ev).slice(0, 8) : [],
    };
    const nums = numbersIn(`${sug.title} ${sug.why} ${sug.nextStep}`);
    const invented = nums.some((n) => !allowed.has(n) && !(Number(n) >= 1 && Number(n) <= 10 && Number.isInteger(Number(n))));
    if (!sug.title || !sug.nextStep || invented || out.length >= 3) {
      dropped++;
      continue;
    }
    out.push(sug);
  }
  return { suggestions: out, dropped };
}

export const COACH_INSTRUCTIONS =
  'You are advising the owner of this YouTube channel about ONE existing video. Use only the evidence given. ' +
  'Write in the language of the video title. Give 2 or 3 specific suggestions that go beyond generic advice (for example concrete title directions or what the first lines of the description should promise). ' +
  'Do not predict views, CTR, revenue or rankings and do not write any number that is not in the evidence. ' +
  'Return {"suggestions":[{"title": short headline, "why": which evidence supports it, "nextStep": one concrete action in YouTube Studio, "effort": "low"|"medium"|"high", "confidence": "low"|"medium", "uses": [evidence keys you relied on]}]}.';

/** Text the owner copies into Ask Studio. Contains only what the evidence shows, in the UI language. */
export function askStudioPrompt(ev: Record<string, number | string>, lang: Lang): string {
  const lines = Object.entries(ev).map(([k, v]) => `- ${k}: ${v}`);
  return lang === 'fa'
    ? ['برای این ویدیوی کانالم پیشنهاد بهبود می‌خواهم (عنوان، تامبنیل و توضیحات). داده‌هایی که TubeX نشان داد:', ...lines, 'لطفاً با داده‌های خود استودیو بررسی کن که این نشانه‌ها درست است و سه کار مشخص پیشنهاد بده.'].join('\n')
    : ['I want improvement ideas for this video on my channel (title, thumbnail, description). Numbers TubeX showed me:', ...lines, 'Please check these signals against Studio’s own data and suggest three specific actions.'].join('\n');
}

export const ASK_STUDIO_URL = (videoId: string) => `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/analytics/tab-overview/period-default`;
