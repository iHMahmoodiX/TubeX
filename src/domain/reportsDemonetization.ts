// Demonetization audit: a heuristic word-list check of titles, descriptions and tags against YouTube's
// advertiser-friendly content categories. It flags words to review; it is not YouTube's decision, which also
// depends on context, imagery and audio that a word list cannot see.
import { normalizeForSearch } from './text';

export type AdCategory = 'violence' | 'adult' | 'profanity' | 'drugs' | 'hateful' | 'sensitive' | 'firearms' | 'controversial';
export type AdSeverity = 'low' | 'medium' | 'high';
export type AdField = 'title' | 'description' | 'tags';

export const AD_CATEGORIES: AdCategory[] = ['violence', 'adult', 'profanity', 'drugs', 'hateful', 'sensitive', 'firearms', 'controversial'];

export interface AdTerm {
  term: string;
  category: AdCategory;
  severity: AdSeverity;
  /** Whole word only (no suffixes). Used for short or ambiguous words. */
  exact?: boolean;
}

const T = (category: AdCategory, severity: AdSeverity, terms: string, exact = false): AdTerm[] =>
  terms
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((term) => ({ term, category, severity, ...(exact && { exact: true }) }));

/**
 * The word list. English terms match as word starts (so "kill" also finds "killing" but not "skill");
 * Persian terms match after normalization (Arabic ي/ك, ZWNJ, diacritics) and may carry suffixes like ها/ی.
 */
export const AD_TERMS: AdTerm[] = [
  // Violence
  ...T('violence', 'high', 'murder|massacre|behead|beheading|torture|gore|gory|dismember|mass shooting|school shooting|قتل عام|سربریدن|سر بریدن|شکنجه|مثله|کشتار|تیرباران'),
  ...T('violence', 'medium', 'kill|killing|stabbing|assault|bloodbath|brutal|corpse|dead body|قتل|قاتل|چاقوکشی|ضرب و شتم|خونریزی|جسد|اعدام|کتک‌کاری|خشونت'),
  ...T('violence', 'low', 'fight|blood|bloody|attack|execution|دعوا|خون‌آلود|حمله|کتک'),
  ...T('violence', 'low', 'خون', true),
  // Adult content
  ...T('adult', 'high', 'porn|porno|pornography|xxx|nude|nudes|naked|nsfw|onlyfans|hentai|sex tape|erotic|fetish|پورن|سکس|برهنه|لخت|فیلم سوپر|شهوانی|فاحشه|روسپی'),
  ...T('adult', 'medium', 'sexy|sexual|stripper|striptease|lingerie|hookup|سکسی|جنسی|هرزه|شهوت|بدن‌نمایی|خیانت جنسی'),
  ...T('adult', 'medium', 'sex|strip', true),
  ...T('adult', 'low', 'dating|kiss|bikini|بوسه|قرار عاشقانه'),
  // Profanity
  ...T('profanity', 'high', 'fuck|fucking|motherfucker|cunt|جنده|مادرجنده|کسکش|کس‌کش|حرومزاده|حرامزاده'),
  ...T('profanity', 'high', 'کیر|کس ننه', true),
  ...T('profanity', 'medium', 'shit|bitch|asshole|bastard|پدرسوخته|بیشرف|بی‌شرف|الاغ|گوساله'),
  ...T('profanity', 'medium', 'dick|کون|گوه|گه', true),
  ...T('profanity', 'low', 'damn|crap|wtf|hell yeah|لعنتی|کثافت|خفه شو|احمق'),
  // Drugs
  ...T('drugs', 'high', 'cocaine|heroin|methamphetamine|crack cocaine|fentanyl|overdose|how to make drugs|کوکائین|هروئین|مت‌آمفتامین|متامفتامین|کراک|فنتانیل|اوردوز|تزریق مواد'),
  ...T('drugs', 'medium', 'weed|marijuana|cannabis|ecstasy|mdma|stoned|drug dealer|ماری‌جوانا|ماریجوانا|حشیش|تریاک|اکستازی|مواد مخدر|گل کشیدن'),
  ...T('drugs', 'medium', 'lsd|thc|meth', true),
  ...T('drugs', 'low', 'drunk|vodka|alcohol|vape|vaping|beer|مشروب|الکل|ودکا|آبجو|قلیان|سیگار'),
  ...T('drugs', 'low', 'مست', true),
  // Hateful content
  ...T('hateful', 'high', 'nazi|white power|white supremacy|ethnic cleansing|نازی|پاکسازی قومی|کاکاسیاه|برتری نژادی'),
  ...T('hateful', 'high', 'kkk', true),
  ...T('hateful', 'medium', 'racist|racism|hate speech|xenophobia|نژادپرست|نژادپرستی|بیگانه‌ستیزی|توهین قومی'),
  // Sensitive events
  ...T('sensitive', 'high', 'suicide|self-harm|self harm|terror attack|terrorist attack|genocide|school massacre|خودکشی|خودزنی|حمله تروریستی|نسل‌کشی|بمب‌گذاری'),
  ...T('sensitive', 'medium', 'terrorist|terrorism|death toll|hostage|war crimes|pandemic|تروریست|تروریستی|گروگان|کشته‌شدگان|قربانیان|جنایت جنگی|همه‌گیری'),
  ...T('sensitive', 'low', 'earthquake|tragedy|disaster|covid|coronavirus|زلزله|فاجعه|کرونا|کووید'),
  ...T('sensitive', 'low', 'سیل', true),
  ...T('sensitive', 'medium', 'war', true),
  ...T('sensitive', 'medium', 'جنگ', true),
  // Firearms and weapons
  ...T('firearms', 'high', 'how to make a bomb|homemade gun|3d printed gun|ghost gun|bomb making|ساخت بمب|ساخت اسلحه|اسلحه دست‌ساز|بمب دست‌ساز'),
  ...T('firearms', 'medium', 'firearm|rifle|ak-47|ak47|shotgun|pistol|handgun|glock|ammunition|ammo|grenade|explosive|اسلحه|تفنگ|کلاشینکف|کلاشنیکف|کلت|تپانچه|مهمات|فشنگ|نارنجک|مواد منفجره|سلاح'),
  ...T('firearms', 'medium', 'gun|guns|bomb', true),
  ...T('firearms', 'low', 'shooting|sniper|weapon|weapons|تیراندازی|اسنایپر|شلیک|بمب'),
  // Controversial issues
  ...T('controversial', 'medium', 'abortion|sexual abuse|child abuse|domestic violence|سقط جنین|کودک‌آزاری|آزار جنسی|خشونت خانگی|تجاوز'),
  ...T('controversial', 'high', 'rape', true),
  ...T('controversial', 'low', 'conspiracy|propaganda|توطئه|پروپاگاندا'),
];

const LETTER = /[\p{L}\p{N}]/u;

/** Normalized text plus, for each normalized character, the index of the original character it came from. */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let i = 0;
  let space = false;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      if (!space && norm.length) {
        norm += ' ';
        map.push(i);
      }
      space = true;
    } else {
      const n = normalizeForSearch(ch);
      for (const c of n) {
        norm += c;
        map.push(i);
      }
      if (n) space = false;
    }
    i += ch.length;
  }
  if (norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export interface AdMatch {
  field: AdField;
  term: string;
  category: AdCategory;
  severity: AdSeverity;
  /** Range in the original field text (UTF-16 offsets, end exclusive). For tags: in the tags joined with ", ". */
  start: number;
  end: number;
  /** The original text that matched. */
  text: string;
}

interface Prepared extends AdTerm {
  norm: string;
}
let prepared: Prepared[] | null = null;
function terms(): Prepared[] {
  prepared ??= AD_TERMS.map((t) => ({ ...t, norm: normalizeForSearch(t.term) })).filter((t) => t.norm);
  return prepared;
}

/** Matches in one text. Overlapping matches keep the longer (then more severe) term. */
export function matchText(text: string, field: AdField, list: AdTerm[] | null = null): AdMatch[] {
  if (!text.trim()) return [];
  const { norm, map } = normalizeWithMap(text);
  const source = list ? list.map((t) => ({ ...t, norm: normalizeForSearch(t.term) })) : terms();
  const found: (AdMatch & { len: number })[] = [];
  for (const t of source) {
    let from = 0;
    for (;;) {
      const at = norm.indexOf(t.norm, from);
      if (at < 0) break;
      from = at + 1;
      const before = at > 0 ? norm[at - 1]! : ' ';
      const endAt = at + t.norm.length;
      const after = endAt < norm.length ? norm[endAt]! : ' ';
      if (LETTER.test(before)) continue;
      if (t.exact && LETTER.test(after)) continue;
      // Without `exact`, allow suffixes (killing, اسلحه‌ها) but extend the highlight to the end of the word.
      let wordEnd = endAt;
      if (!t.exact) while (wordEnd < norm.length && LETTER.test(norm[wordEnd]!)) wordEnd++;
      const start = map[at]!;
      const lastOrig = map[wordEnd - 1]!;
      let end = lastOrig + (text.codePointAt(lastOrig)! > 0xffff ? 2 : 1);
      while (end < text.length && /\p{M}/u.test(text[end]!)) end++;
      found.push({ field, term: t.term, category: t.category, severity: t.severity, start, end, text: text.slice(start, end), len: t.norm.length });
    }
  }
  const rank: Record<AdSeverity, number> = { high: 3, medium: 2, low: 1 };
  found.sort((a, b) => b.len - a.len || rank[b.severity] - rank[a.severity] || a.start - b.start);
  const kept: AdMatch[] = [];
  for (const f of found) {
    if (kept.some((k) => f.start < k.end && k.start < f.end)) continue;
    const { len: _len, ...m } = f;
    void _len;
    kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export interface AdInput {
  title: string;
  description: string;
  tags: string[];
}

export const tagsText = (tags: string[]): string => tags.join(', ');

export type AdRisk = 'none' | 'low' | 'medium' | 'high';

export interface AdReport {
  matches: AdMatch[];
  risk: AdRisk;
  /** Weighted points: severity (high 6, medium 3, low 1) × field (title 3, tags 1.5, description 1). */
  points: number;
  categories: AdCategory[];
}

const SEV_POINTS: Record<AdSeverity, number> = { high: 6, medium: 3, low: 1 };
const FIELD_FACTOR: Record<AdField, number> = { title: 3, tags: 1.5, description: 1 };

/**
 * Checks a video's metadata. Risk: high when a high-severity term is in the title or points ≥ 12;
 * medium when points ≥ 5 or any high-severity term; low when anything matched; otherwise none.
 */
export function checkAdFriendly(v: AdInput): AdReport {
  const matches = [...matchText(v.title, 'title'), ...matchText(v.description, 'description'), ...matchText(tagsText(v.tags), 'tags')];
  const points = matches.reduce((n, m) => n + SEV_POINTS[m.severity] * FIELD_FACTOR[m.field], 0);
  const highInTitle = matches.some((m) => m.field === 'title' && m.severity === 'high');
  const anyHigh = matches.some((m) => m.severity === 'high');
  const risk: AdRisk = highInTitle || points >= 12 ? 'high' : points >= 5 || anyHigh ? 'medium' : matches.length ? 'low' : 'none';
  return { matches, risk, points: Math.round(points * 10) / 10, categories: [...new Set(matches.map((m) => m.category))] };
}

/** Splits text into plain and matched segments for highlighting. */
export function segments(text: string, matches: AdMatch[]): { text: string; match?: AdMatch }[] {
  const out: { text: string; match?: AdMatch }[] = [];
  let pos = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < pos) continue;
    if (m.start > pos) out.push({ text: text.slice(pos, m.start) });
    out.push({ text: text.slice(m.start, m.end), match: m });
    pos = m.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}
