// Text helpers for mixed Persian/English content.
// Normalization is for matching only; saved user text is never rewritten.

const ARABIC_TO_PERSIAN: Record<string, string> = {
  'ي': 'ی', // ي -> ی
  'ى': 'ی', // ى -> ی
  'ك': 'ک', // ك -> ک
  'ة': 'ه', // ة -> ه
  'ۀ': 'ه', // ۀ -> ه
  'أ': 'ا', // أ -> ا
  'إ': 'ا', // إ -> ا
  'ٱ': 'ا', // ٱ -> ا
};

const DIACRITICS = /[ً-ٰٟـ]/g; // harakat, superscript alef, tatweel
const INVISIBLES = /[​-‏‪-‮⁦-⁩﻿]/g; // ZWSP, ZWNJ, ZWJ, bidi marks

/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII digits. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    return String((code >= 0x06f0 ? code - 0x06f0 : code - 0x0660));
  });
}

/** Search key: NFKC, Arabic letter variants folded, digits unified, ZWNJ/diacritics removed, lower-cased, whitespace collapsed. */
export function normalizeForSearch(input: string): string {
  let s = input.normalize('NFKC');
  s = s.replace(/[يىكةۀأإٱ]/g, (c) => ARABIC_TO_PERSIAN[c] ?? c);
  s = s.replace(DIACRITICS, '');
  s = s.replace(INVISIBLES, '');
  s = toAsciiDigits(s);
  return s.toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
}

/** True when every whitespace-separated term of `query` appears in `haystack` (both normalized). */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const h = normalizeForSearch(haystack);
  return q.split(' ').every((term) => h.includes(term));
}

/** User-perceived length in code points (surrogate pairs count once). */
export function charCount(input: string): number {
  return Array.from(input).length;
}

export function utf8Bytes(input: string): number {
  return new TextEncoder().encode(input).length;
}

/** Heuristic: true when the first strong directional character is RTL. */
export function isRtlText(input: string): boolean {
  const m = input.match(/[A-Za-zÀ-ɏ֐-ࣿיִ-﷿ﹰ-﻿]/);
  return !!m && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]);
}
