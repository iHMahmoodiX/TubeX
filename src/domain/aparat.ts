// Aparat package (A1, #17): the same finished video prepared for Aparat from a YouTube draft, checked against
// Aparat's own rules, then handed to Aparat's native upload page. TubeX never uploads, logs in or calls an Aparat
// endpoint (see docs/APARAT_FEASIBILITY.md). Rules carry their source so unverified limits are only warnings.
import type { AparatPackage, Draft } from './models';

/** Aparat's own upload page; the owner signs in and publishes there. Re-check in the live test matrix. */
export const APARAT_UPLOAD_URL = 'https://www.aparat.com/upload';
export const APARAT_HOME = 'https://www.aparat.com/';

/**
 * 'help' = Aparat's upload form as described by public how-to guides (Aparat's help center blocks automated reads).
 * 'inferred' = a cautious default, not a published Aparat limit: shown as a warning only.
 */
export type RuleSource = 'help' | 'inferred';
export const APARAT_RULES = {
  titleRequired: { source: 'help' as RuleSource },
  categoryRequired: { source: 'help' as RuleSource },
  minTags: { value: 3, source: 'help' as RuleSource },
  maxTags: { value: 10, source: 'inferred' as RuleSource },
  tagChars: { value: 30, source: 'inferred' as RuleSource },
  titleChars: { value: 100, source: 'inferred' as RuleSource },
  descriptionChars: { value: 2000, source: 'inferred' as RuleSource },
  subtitleFormat: { value: 'SRT', source: 'help' as RuleSource },
} as const;

export type AparatIssueId = 'title-missing' | 'title-long' | 'category-missing' | 'tags-few' | 'tags-many' | 'tag-long' | 'description-long' | 'youtube-links' | 'url-not-aparat';
export interface AparatIssue {
  id: AparatIssueId;
  severity: 'error' | 'warning';
  source: RuleSource;
  values?: Record<string, string | number>;
}

const YT_LINK = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S*/gi;
const isAparatUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)aparat\.com$/.test(x.hostname);
  } catch {
    return false;
  }
};

/** A fresh package from the YouTube draft. YouTube-only lines (subscribe/YouTube links) are dropped, nothing else. */
export function aparatFromDraft(d: Pick<Draft, 'title' | 'description' | 'tags'>, at = new Date().toISOString()): AparatPackage {
  const description = d.description
    .split('\n')
    .filter((line) => !YT_LINK.test(line) || ((YT_LINK.lastIndex = 0), false))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  YT_LINK.lastIndex = 0;
  return {
    title: d.title.trim(),
    description,
    tags: [...new Set(d.tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean))].slice(0, APARAT_RULES.maxTags.value),
    category: '',
    playlist: '',
    coverNote: '',
    scheduleNote: '',
    status: 'prepared',
    statusAt: at,
  };
}

export function checkAparat(p: AparatPackage): AparatIssue[] {
  const out: AparatIssue[] = [];
  const R = APARAT_RULES;
  const title = p.title.trim();
  if (!title) out.push({ id: 'title-missing', severity: 'error', source: R.titleRequired.source });
  else if ([...title].length > R.titleChars.value) out.push({ id: 'title-long', severity: 'warning', source: R.titleChars.source, values: { n: [...title].length, max: R.titleChars.value } });
  if (!p.category.trim()) out.push({ id: 'category-missing', severity: 'error', source: R.categoryRequired.source });
  if (p.tags.length < R.minTags.value) out.push({ id: 'tags-few', severity: 'error', source: R.minTags.source, values: { n: p.tags.length, min: R.minTags.value } });
  if (p.tags.length > R.maxTags.value) out.push({ id: 'tags-many', severity: 'warning', source: R.maxTags.source, values: { n: p.tags.length, max: R.maxTags.value } });
  const long = p.tags.filter((t) => [...t].length > R.tagChars.value);
  if (long.length) out.push({ id: 'tag-long', severity: 'warning', source: R.tagChars.source, values: { tags: long.join('، '), max: R.tagChars.value } });
  if ([...p.description].length > R.descriptionChars.value) out.push({ id: 'description-long', severity: 'warning', source: R.descriptionChars.source, values: { n: [...p.description].length, max: R.descriptionChars.value } });
  if (/(?:youtube\.com|youtu\.be)\//i.test(p.description)) out.push({ id: 'youtube-links', severity: 'warning', source: 'inferred' });
  if (p.url && !isAparatUrl(p.url)) out.push({ id: 'url-not-aparat', severity: 'error', source: 'inferred' });
  return out;
}

/** Splits typed tags: commas (Latin or Persian), new lines or #. */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,،\n#]+/).map((t) => t.trim()).filter(Boolean))];
}

/** Plain-text package for copy or download, with Persian labels the owner pastes field by field. */
export function aparatPackageText(p: AparatPackage, labels: { title: string; description: string; tags: string; category: string; playlist: string; cover: string; schedule: string }): string {
  const rows: [string, string][] = [
    [labels.title, p.title],
    [labels.category, p.category],
    [labels.tags, p.tags.join('، ')],
    [labels.playlist, p.playlist],
    [labels.cover, p.coverNote],
    [labels.schedule, p.scheduleNote],
    [labels.description, p.description],
  ];
  return rows
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k}:\n${v}`)
    .join('\n\n');
}

export { isAparatUrl };
