import { describe, expect, it } from 'vitest';
import { analyzeMetadata, bucketOfCode, detectMix, dominantCounts, mergeMixes, wordBucket, words } from '../../src/domain/seoLanguage';

describe('language mix', () => {
  it('tells Persian from Arabic by letters and function words', () => {
    expect(wordBucket('پایتون')).toBe('fa');
    expect(wordBucket('یادگیری')).toBe('fa');
    expect(wordBucket('في')).toBe('ar');
    expect(wordBucket('مدينة')).toBe('ar');
    expect(wordBucket('الطبخ')).toBe('ar');
    expect(wordBucket('در')).toBe('fa');
    expect(wordBucket('مدل')).toBeNull(); // shared spelling: decided by neighbours
    expect(wordBucket('ہے')).toBe('other');
  });

  it('tells English from other Latin-script languages', () => {
    expect(wordBucket('tutorial')).toBe('en');
    expect(wordBucket('café')).toBe('latin');
    expect(wordBucket('para')).toBe('latin');
    expect(wordBucket('Привет')).toBe('other');
    expect(wordBucket('123')).toBeNull();
  });

  it('drops links, handles and numbers from words', () => {
    expect(words('see https://x.com/a @me #پایتون 2026 ۱۴۰۵ ok')).toEqual(['see', 'پایتون', 'ok']);
    expect(words('مبتدی‌ها')).toEqual(['مبتدی', 'ها']);
  });

  it('finds the dominant language and mixed text', () => {
    const fa = detectMix('آموزش کامل پایتون برای مبتدی‌ها');
    expect(fa.dominant).toBe('fa');
    expect(fa.mixed).toBe(false);
    const mix = detectMix('آموزش Python برای beginners و حرفه‌ای ها');
    expect(mix.dominant).toBe('fa');
    expect(mix.counts.en).toBe(2);
    expect(mix.mixed).toBe(true);
    const en = detectMix('How to learn Python fast');
    expect(en.dominant).toBe('en');
    expect(en.shares.en).toBe(1);
    expect(detectMix('').dominant).toBeNull();
  });

  it('gives ambiguous Arabic-script words to the stronger side', () => {
    expect(detectMix('مدل در مدل').counts.fa).toBe(3);
    expect(detectMix('مدل في مدينة').counts.ar).toBe(3);
  });

  it('maps YouTube language codes', () => {
    expect(bucketOfCode('fa')).toBe('fa');
    expect(bucketOfCode('fa-IR')).toBe('fa');
    expect(bucketOfCode('en-US')).toBe('en');
    expect(bucketOfCode('pt-BR')).toBe('latin');
    expect(bucketOfCode('ja')).toBe('other');
    expect(bucketOfCode('ar')).toBe('ar');
    expect(bucketOfCode(undefined)).toBeNull();
  });

  it('reports metadata issues against the declared language', () => {
    const ok = analyzeMetadata({ title: 'آموزش پایتون', description: 'در این ویدیو پایتون یاد می‌گیریم', tags: ['پایتون'], defaultLanguage: 'fa' });
    expect(ok.issues).toEqual([]);
    const bad = analyzeMetadata({ title: 'آموزش پایتون برای همه', description: 'یک ویدیو', tags: ['python tutorial', 'learn python', 'coding'], defaultLanguage: 'en' });
    expect(bad.issues).toContain('mismatch');
    const missing = analyzeMetadata({ title: 'Learn Python', description: '', tags: [] });
    expect(missing.issues).toEqual(['missing-default']);
    const mixed = analyzeMetadata({ title: 'آموزش Python کامل Django', description: '', tags: [], defaultLanguage: 'fa' });
    expect(mixed.issues).toContain('mixed-title');
  });

  it('merges mixes and counts dominant languages', () => {
    const m = [detectMix('آموزش پایتون'), detectMix('learn python'), detectMix('یادگیری سریع')];
    expect(dominantCounts(m)).toMatchObject({ fa: 2, en: 1 });
    expect(mergeMixes(m).dominant).toBe('fa');
  });
});
