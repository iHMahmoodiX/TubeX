// Metadata readiness: a 0–100 summary of the pre-publish checklist (checkDraft). It measures how complete
// and within-limits a draft is. It is NOT a prediction of ranking or views; the UI says so.
import type { Check } from './metadata';
import type { Draft } from './models';

export const READINESS_WEIGHTS = {
  error: 30,
  warning: 12,
  infoMissing: 8,
  noTags: 10,
  noKeyword: 10,
} as const;

export function readiness(d: Pick<Draft, 'title' | 'description' | 'tags' | 'focusKeyword'>, checks: Check[]): number | null {
  // An untouched draft has nothing to score: show a dash, not a low number.
  if (!d.title.trim() && !d.description.trim() && d.tags.length === 0 && !d.focusKeyword.trim()) return null;
  let score = 100;
  for (const c of checks) {
    if (c.severity === 'error') score -= READINESS_WEIGHTS.error;
    else if (c.severity === 'warning') score -= READINESS_WEIGHTS.warning;
    else if (!c.ok) score -= READINESS_WEIGHTS.infoMissing;
  }
  if (d.tags.length === 0) score -= READINESS_WEIGHTS.noTags;
  if (!d.focusKeyword.trim()) score -= READINESS_WEIGHTS.noKeyword;
  return Math.max(0, Math.min(100, score));
}

/** Short summary counts for a checklist: problems to fix and items to review. */
export function checkCounts(checks: Check[]): { errors: number; warnings: number; missing: number; ok: number } {
  return {
    errors: checks.filter((c) => c.severity === 'error').length,
    warnings: checks.filter((c) => c.severity === 'warning').length,
    missing: checks.filter((c) => c.severity === 'info' && !c.ok).length,
    ok: checks.filter((c) => c.severity === 'info' && c.ok).length,
  };
}

/** First line of an idea, used as its track title. */
export function ideaTitle(text: string): string {
  return (text.split('\n').find((l) => l.trim()) ?? '').trim();
}
