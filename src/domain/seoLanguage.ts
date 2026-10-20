// Script and language mix of metadata, by heuristics on letters and a few function words. It tells Persian
// from Arabic by letters that only one of them uses (Persian: پ چ ژ گ ک ی; Arabic: ي ك ة and common
// function words), and English from other Latin-script languages by accented letters and stop words.
// The result is a description of the text, not a language identification service.

export type LangBucket = 'fa' | 'ar' | 'en' | 'latin' | 'other';
export const BUCKETS: LangBucket[] = ['fa', 'ar', 'en', 'latin', 'other'];

export interface LangMix {
  /** Words per bucket. */
  counts: Record<LangBucket, number>;
  total: number;
  /** Share per bucket (0..1). */
  shares: Record<LangBucket, number>;
  /** Bucket with the most words; null for text without words. */
  dominant: LangBucket | null;
  /** True when a second language holds at least 20% of the words (and at least 2 words). */
  mixed: boolean;
}

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const FA_ONLY = /[پچژگکیۀ]/; // U+067E U+0686 U+0698 U+06AF U+06A9 U+06CC U+06C0
const AR_ONLY = /[يكةى]/; // Arabic yeh and kaf, teh marbuta, alef maksura
const URDU = /[ٹڈڑںےھ]/;
const AR_WORDS = new Set(['في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'التي', 'الذي', 'كيف', 'ماذا', 'لماذا', 'هل', 'أن', 'إن', 'لا', 'ما', 'هو', 'هي']);
const FA_WORDS = new Set(['و', 'در', 'به', 'از', 'که', 'را', 'با', 'این', 'آن', 'برای', 'است', 'تا', 'یا', 'هم', 'چرا', 'چطور', 'آموزش']);
const LATIN = /[A-Za-zÀ-ɏ]/;
const LATIN_ACCENTED = /[À-ɏ]/;
const OTHER_LATIN_WORDS = new Set(
  (
    'de la el los las del que y en un una por con para es se no lo al como más pero ' + // es
    'der die das und ist nicht mit für auf ein eine zu von den im dem sie es ' + // de
    'le les des et est pour pas dans une sur avec qui au du ce ' + // fr
    'il di che per non con una sono della ' + // it
    'o os um uma com não para em do da na no ' + // pt
    've bir ile için bu da çok nasıl ne ' + // tr
    'het een van en ik je dat niet ' // nl
  ).split(' '),
);

const EMPTY = (): Record<LangBucket, number> => ({ fa: 0, ar: 0, en: 0, latin: 0, other: 0 });

/** Bucket for one word, or null for words without letters (numbers, emoji, punctuation). */
export function wordBucket(word: string): LangBucket | null {
  const w = word.normalize('NFC');
  if (ARABIC_SCRIPT.test(w)) {
    if (URDU.test(w)) return 'other';
    if (FA_ONLY.test(w)) return 'fa';
    if (AR_ONLY.test(w) || AR_WORDS.has(w)) return 'ar';
    if (/^ال/.test(w) && w.length > 3) return 'ar';
    return FA_WORDS.has(w) ? 'fa' : null; // ambiguous Arabic-script word: decided by its neighbours
  }
  if (LATIN.test(w)) {
    if (LATIN_ACCENTED.test(w)) return 'latin';
    if (OTHER_LATIN_WORDS.has(w.toLowerCase())) return 'latin';
    return 'en';
  }
  return /\p{L}/u.test(w) ? 'other' : null;
}

/** Splits into words; URLs, @handles and #hashtag marks are dropped, hashtag words are kept. */
export function words(text: string): string[] {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.-]+/g, ' ')
    .replace(/#/g, ' ')
    .split(/[\s‌‏‎|,.!?:;"'()[\]{}«»؟،…\-–—/_*+=<>~`^&%$0-9۰-۹٠-٩]+/u)
    .filter(Boolean);
}

/**
 * Language/script mix of a text. Arabic-script words without a telling letter are given to whichever of
 * Persian or Arabic is more frequent in the same text (Persian when tied, since the owner writes Persian).
 */
export function detectMix(text: string | string[]): LangMix {
  const list = Array.isArray(text) ? text.flatMap(words) : words(text);
  const counts = EMPTY();
  let ambiguous = 0;
  for (const w of list) {
    const b = wordBucket(w);
    if (b) counts[b]++;
    else if (ARABIC_SCRIPT.test(w)) ambiguous++;
  }
  if (ambiguous) counts[counts.ar > counts.fa ? 'ar' : 'fa'] += ambiguous;
  return summarize(counts);
}

export function summarize(counts: Record<LangBucket, number>): LangMix {
  const total = BUCKETS.reduce((a, b) => a + counts[b], 0);
  const shares = EMPTY();
  for (const b of BUCKETS) shares[b] = total ? counts[b] / total : 0;
  const ranked = [...BUCKETS].sort((a, b) => counts[b] - counts[a]);
  const dominant = total ? ranked[0]! : null;
  const second = ranked[1]!;
  const mixed = total > 0 && counts[second] >= 2 && shares[second] >= 0.2;
  return { counts, total, shares, dominant, mixed };
}

/** Adds several mixes together (e.g. the titles of a whole sample). */
export function mergeMixes(mixes: LangMix[]): LangMix {
  const counts = EMPTY();
  for (const m of mixes) for (const b of BUCKETS) counts[b] += m.counts[b];
  return summarize(counts);
}

const LATIN_CODES = new Set(['es', 'fr', 'de', 'it', 'pt', 'nl', 'tr', 'id', 'ms', 'pl', 'sv', 'da', 'no', 'nb', 'fi', 'cs', 'ro', 'hu', 'vi', 'az', 'uz', 'tl', 'sw', 'ca', 'hr', 'sk', 'sl', 'et', 'lv', 'lt']);

/** Bucket of a YouTube language code (BCP-47 like 'fa', 'en-US', 'pt-BR'); null when absent. */
export function bucketOfCode(code: string | undefined): LangBucket | null {
  if (!code) return null;
  const base = code.toLowerCase().split(/[-_]/)[0] ?? '';
  if (base === 'fa' || base === 'prs' || base === 'tg') return base === 'tg' ? 'other' : 'fa';
  if (base === 'ar') return 'ar';
  if (base === 'en') return 'en';
  if (LATIN_CODES.has(base)) return 'latin';
  return base === 'zxx' ? null : 'other';
}

export type LangIssue = 'missing-default' | 'mismatch' | 'mixed-title' | 'mixed-description' | 'mixed-tags';

export interface MetaLanguage {
  title: LangMix;
  description: LangMix;
  tags: LangMix;
  overall: LangMix;
  declared: LangBucket | null;
  issues: LangIssue[];
}

/** Language report for one video's metadata compared with its declared default language. */
export function analyzeMetadata(m: { title: string; description: string; tags: string[]; defaultLanguage?: string }): MetaLanguage {
  const title = detectMix(m.title);
  const description = detectMix(m.description);
  const tags = detectMix(m.tags);
  // The title counts double: it is what viewers and search see first.
  const overall = mergeMixes([title, title, description, tags]);
  const declared = bucketOfCode(m.defaultLanguage);
  const issues: LangIssue[] = [];
  if (!m.defaultLanguage) issues.push('missing-default');
  else if (declared && overall.dominant && declared !== overall.dominant) issues.push('mismatch');
  if (title.mixed) issues.push('mixed-title');
  if (description.mixed) issues.push('mixed-description');
  if (tags.mixed) issues.push('mixed-tags');
  return { title, description, tags, overall, declared, issues };
}

/** How many videos have each dominant title language. */
export function dominantCounts(mixes: LangMix[]): Record<LangBucket, number> {
  const out = EMPTY();
  for (const m of mixes) if (m.dominant) out[m.dominant]++;
  return out;
}
