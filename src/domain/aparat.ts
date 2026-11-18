// Aparat package (A1, #17): the same finished video prepared for Aparat from a YouTube draft, checked against
// Aparat's own rules, then handed to Aparat's native upload page. TubeX never uploads, logs in or calls an Aparat
// endpoint (see docs/APARAT_FEASIBILITY.md). Rules carry their source so unverified limits are only warnings.
import type { AparatPackage, Draft } from './models';

/** Aparat's own upload page; the owner signs in and publishes there. Re-check in the live test matrix. */
export const APARAT_UPLOAD_URL = 'https://www.aparat.com/upload';
export const APARAT_HOME = 'https://www.aparat.com/';

/**
 * 'help' = Aparat's upload guidance (help center, recorded in docs/NEXT.md and the how-to guides in
 * docs/APARAT_FEASIBILITY.md; the help center blocks automated reads, so the owner re-checks it live).
 * 'inferred' = a cautious default, not a published Aparat limit: shown as a warning only.
 */
export type RuleSource = 'help' | 'inferred';
export const APARAT_RULES = {
  titleRequired: { source: 'help' as RuleSource },
  categoryRequired: { source: 'help' as RuleSource },
  minTags: { value: 3, source: 'help' as RuleSource },
  maxTags: { value: 5, source: 'help' as RuleSource },
  tagChars: { value: 23, source: 'help' as RuleSource },
  titleChars: { value: 100, source: 'inferred' as RuleSource },
  descriptionChars: { value: 2000, source: 'help' as RuleSource },
  cover: { value: '1920×1080 (16:9)', source: 'help' as RuleSource },
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

/** A fresh package from the YouTube draft: YouTube-only lines (YouTube links) dropped, Aparat's tag rules applied (5 tags, each ≤ 23 characters), description cut at a line within 2000 characters. */
export function aparatFromDraft(d: Pick<Draft, 'title' | 'description' | 'tags'>, at = new Date().toISOString()): AparatPackage {
  const description = d.description
    .split('\n')
    .filter((line) => !YT_LINK.test(line) || ((YT_LINK.lastIndex = 0), false))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const desc = fitLines(description, APARAT_RULES.descriptionChars.value);
  YT_LINK.lastIndex = 0;
  return {
    title: d.title.trim(),
    description: desc,
    tags: pickTags(d.tags),
    category: '',
    playlist: '',
    coverNote: '',
    scheduleNote: '',
    status: 'prepared',
    statusAt: at,
  };
}

/** Unique tags that fit Aparat: at most 5, each at most 23 characters, in the YouTube order (most important first). */
export function pickTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.replace(/^#/, '').replace(/\s+/g, ' ').trim();
    if (!t || [...t].length > APARAT_RULES.tagChars.value || out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
    if (out.length === APARAT_RULES.maxTags.value) break;
  }
  return out;
}

/** Text within `max` characters, cut at the last whole line (or word) that fits. */
export function fitLines(text: string, max: number): string {
  if ([...text].length <= max) return text;
  const cut = [...text].slice(0, max).join('');
  const nl = cut.lastIndexOf('\n');
  const sp = cut.lastIndexOf(' ');
  return cut.slice(0, nl > max * 0.6 ? nl : sp > max * 0.6 ? sp : max).trimEnd();
}

/** AI instructions for an Aparat-specific rewrite (Persian Aparat search, Aparat's limits). */
export const APARAT_AI_TASK = 'aparat-optimize-v2';
/** The owner-editable part of the Aparat prompt (Settings → Aparat → prompt templates). */
export const APARAT_DEFAULT_PROMPT = `اطلاعات این ویدیوی یوتیوب را برای آپارات بازنویسی کن تا در جستجو و پیشنهادهای آپارات بهتر دیده شود.

- مخاطب آپارات به فارسی و با کلمه‌های روزمره جستجو می‌کند و گاهی نام محصولات را انگلیسی می‌نویسد؛ برای او بنویس، نه برای یوتیوب.
- عنوان: فارسی، عبارت اصلی جستجو نزدیک ابتدای آن، دقیق و صادقانه (بدون کلیک‌بیت، بدون حروف بزرگ و ایموجی)، حداکثر ۹۰ کاراکتر.
- توضیحات: فارسی، حداکثر ۱۸۰۰ کاراکتر. دو خط اول بگوید بیننده چه چیزی می‌گیرد و عبارت اصلی را داشته باشد. بعد پاراگراف‌های کوتاه یا فهرستی از مطالب ویدیو.
- زمان‌بندی فصل‌ها را دقیقاً همان‌طور نگه دار. بخش‌های مخصوص یوتیوب را حذف کن: لینک‌های یوتیوب، «سابسکرایب کنید/زنگوله را بزنید/لایک کنید»، هشتگ‌های یوتیوب و لینک ویدیوهای دیگر یوتیوب.
- لینک سایت و دوره‌های خودم را نگه دار. در پایان یک خط برای دنبال کردن کانال در آپارات بنویس.
- برچسب‌ها: دقیقاً ۵ عبارتی که مردم در آپارات جستجو می‌کنند (اگر فارسی‌زبان‌ها اصطلاح انگلیسی را جستجو می‌کنند همان خوب است)، هرکدام حداکثر ۲۳ کاراکتر، بدون # و بدون تکرار.
- دسته: نام یکی از دسته‌های آپارات به فارسی که بهترین تطابق را دارد (مثل آموزشی، علم و تکنولوژی، سرگرمی، ورزشی).`;

/** Fixed output contract and Aparat's hard limits; always appended, whatever the prompt says. */
export const APARAT_OUTPUT_FORMAT =
  'Hard limits that always apply: at most 5 tags, each at most 23 characters; description at most 2000 characters. ' +
  'Return {"title": string, "description": string, "tags": string[], "category": string, "why": string} where why is one short Persian sentence on the main change. Write title, description and tags in Persian unless the instructions above say otherwise.';

export const APARAT_AI_INSTRUCTIONS = `${APARAT_DEFAULT_PROMPT}\n\n${APARAT_OUTPUT_FORMAT}`;

export interface AparatAiResult {
  title: string;
  description: string;
  tags: string[];
  category: string;
  why: string;
}

/** Validates and fits a model answer to Aparat's rules; never trusts the model's lengths. */
export function parseAparatAi(o: Record<string, unknown>): AparatAiResult | null {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const title = s(o.title);
  if (!title) return null;
  const description = fitLines(s(o.description).replace(YT_LINK, '').replace(/\n{3,}/g, '\n\n').trim(), APARAT_RULES.descriptionChars.value);
  YT_LINK.lastIndex = 0;
  return {
    title: [...title].slice(0, 100).join(''),
    description,
    tags: pickTags(Array.isArray(o.tags) ? o.tags.filter((x): x is string => typeof x === 'string') : []),
    category: s(o.category).slice(0, 60),
    why: s(o.why).slice(0, 300),
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
  if (p.tags.length > R.maxTags.value) out.push({ id: 'tags-many', severity: 'error', source: R.maxTags.source, values: { n: p.tags.length, max: R.maxTags.value } });
  const long = p.tags.filter((t) => [...t].length > R.tagChars.value);
  if (long.length) out.push({ id: 'tag-long', severity: 'error', source: R.tagChars.source, values: { tags: long.join('، '), max: R.tagChars.value } });
  if ([...p.description].length > R.descriptionChars.value) out.push({ id: 'description-long', severity: 'error', source: R.descriptionChars.source, values: { n: [...p.description].length, max: R.descriptionChars.value } });
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
