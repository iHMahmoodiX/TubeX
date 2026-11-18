// Research → Idea → Draft → Optimize (#14): one provenance record (ResearchRef) travels with the work so the
// keyword, topic, source and public signals are typed once. Pure rules, no browser APIs.
import { checkDraft } from './metadata';
import type { Draft, Idea, Intent, Lang, ResearchRef } from './models';

const INTENT_RULES: [Intent, RegExp][] = [
  ['fix', /(?:مشکل|رفع|ارور|خطا|درست کردن|حل\s|fix|error|not working|problem|issue)/i],
  ['compare', /(?:مقایسه|بهتر(?:ین)?|یا\s|\bvs\.?\b|versus|compare|comparison|better|best)/i],
  ['buy', /(?:خرید|قیمت|بررسی|آنباکس|ارزش خرید|buy|price|review|unboxing|worth it|deal)/i],
  ['news', /(?:خبر|اخبار|جدید|آپدیت|منتشر شد|news|update|announced|released|leak)/i],
  ['learn', /(?:آموزش|یادگیری|چطور|چگونه|نحوه|راهنما|دوره|tutorial|how to|guide|learn|course|tips|beginner)/i],
];

/** Rough intent from wording; undefined when no rule matches (the owner can set it). */
export function inferIntent(text: string): Intent | undefined {
  for (const [intent, re] of INTENT_RULES) if (re.test(text)) return intent;
  return undefined;
}

export const scriptLang = (text: string): Lang => (/[؀-ۿ]/.test(text) ? 'fa' : 'en');

/** From a keyword research result: score and sample facts as they were at `retrievedAt`. */
export function researchFromKeyword(input: { keyword: string; score?: number; sampleSize?: number; medianViews?: number; retrievedAt: string; channelId?: string }): ResearchRef {
  const signals: Record<string, number> = {};
  if (input.score !== undefined) signals.keywordScore = Math.round(input.score);
  if (input.sampleSize !== undefined) signals.sampleSize = input.sampleSize;
  if (input.medianViews !== undefined) signals.medianViews = Math.round(input.medianViews);
  const intent = inferIntent(input.keyword);
  return {
    keyword: input.keyword.trim(),
    topic: input.keyword.trim(),
    language: scriptLang(input.keyword),
    retrievedAt: input.retrievedAt,
    ...(intent && { intent }),
    ...(input.channelId && { channelId: input.channelId }),
    ...(Object.keys(signals).length && { signals }),
  };
}

/** From a public video (watch page, competitor upload, outlier): its public counters at `retrievedAt`. */
export function researchFromVideo(input: { title: string; views?: number; publishedAt?: string; channelTitle?: string; keyword?: string; retrievedAt: string; channelId?: string; extra?: Record<string, number | string> }): ResearchRef {
  const signals: Record<string, number | string> = { ...(input.extra ?? {}) };
  if (input.views !== undefined) signals.views = input.views;
  if (input.publishedAt) signals.publishedAt = input.publishedAt.slice(0, 10);
  if (input.channelTitle) signals.channel = input.channelTitle.slice(0, 100);
  const intent = inferIntent(`${input.title} ${input.keyword ?? ''}`);
  return {
    topic: input.title.trim().slice(0, 300),
    language: scriptLang(input.title),
    retrievedAt: input.retrievedAt,
    ...(input.keyword && { keyword: input.keyword.trim() }),
    ...(intent && { intent }),
    ...(input.channelId && { channelId: input.channelId }),
    ...(Object.keys(signals).length && { signals }),
  };
}

/** Fields a new draft takes from its idea: keyword, language, the research record. Never overwrites typed text. */
export function draftSeed(idea: Pick<Idea, 'text' | 'research'>, fallbackLang: Lang): Pick<Draft, 'focusKeyword' | 'language'> & { research?: ResearchRef } {
  const r = idea.research;
  return {
    focusKeyword: r?.keyword ?? '',
    language: r?.language ?? (idea.text.trim() ? scriptLang(idea.text) : fallbackLang),
    ...(r && { research: r }),
  };
}

export type StepId = 'research' | 'idea' | 'keyword' | 'text' | 'tags' | 'checks' | 'publish';
export interface Step {
  id: StepId;
  done: boolean;
}

/**
 * Where a draft stands on the way to publishing, and the one next action. A draft linked to an already
 * published own video ends at "publish" with the Improve queue as the follow-up.
 */
export function draftSteps(d: Draft): { steps: Step[]; next: StepId | null } {
  const errors = checkDraft(d).filter((c) => c.severity === 'error').length;
  const steps: Step[] = [
    { id: 'research', done: !!d.research || !!d.source },
    { id: 'idea', done: !!d.ideaId || !!d.source?.videoId },
    { id: 'keyword', done: !!d.focusKeyword.trim() },
    { id: 'text', done: !!d.title.trim() && !!d.description.trim() },
    { id: 'tags', done: d.tags.length > 0 },
    { id: 'checks', done: !!d.title.trim() && !!d.description.trim() && errors === 0 },
    { id: 'publish', done: false },
  ];
  const next = steps.find((s) => !s.done && s.id !== 'research' && s.id !== 'idea')?.id ?? null;
  return { steps, next };
}
