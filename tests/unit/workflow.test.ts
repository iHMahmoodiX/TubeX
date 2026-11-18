import { describe, expect, it } from 'vitest';
import { draftSeed, draftSteps, inferIntent, researchFromKeyword, researchFromVideo, scriptLang } from '../../src/domain/workflow';
import { cleanResearch } from '../../src/domain/records';
import type { Draft } from '../../src/domain/models';

const draft = (p: Partial<Draft> = {}): Draft =>
  ({ id: 'd', createdAt: '', updatedAt: '', title: '', description: '', tags: [], focusKeyword: '', language: 'fa', status: 'draft', ...p }) as Draft;

describe('workflow', () => {
  it('infers intent from Persian and English wording', () => {
    expect(inferIntent('آموزش فیگما')).toBe('learn');
    expect(inferIntent('iphone 17 vs pixel 10')).toBe('compare');
    expect(inferIntent('رفع ارور ۴۰۴')).toBe('fix');
    expect(inferIntent('قیمت لپ تاپ')).toBe('buy');
    expect(inferIntent('سفر به شمال')).toBeUndefined();
  });

  it('detects script language', () => {
    expect(scriptLang('سلام')).toBe('fa');
    expect(scriptLang('hello')).toBe('en');
  });

  it('builds a keyword research record with dated rounded signals', () => {
    const r = researchFromKeyword({ keyword: ' آموزش فیگما ', score: 61.4, sampleSize: 20, medianViews: 1234.6, retrievedAt: '2026-11-18T10:00:00Z', channelId: 'UC1' });
    expect(r).toEqual({ keyword: 'آموزش فیگما', topic: 'آموزش فیگما', language: 'fa', retrievedAt: '2026-11-18T10:00:00Z', intent: 'learn', channelId: 'UC1', signals: { keywordScore: 61, sampleSize: 20, medianViews: 1235 } });
  });

  it('builds a video research record without inventing missing numbers', () => {
    const r = researchFromVideo({ title: 'Figma tutorial', retrievedAt: '2026-11-18' });
    expect(r.signals).toBeUndefined();
    const r2 = researchFromVideo({ title: 'Figma tutorial', views: 900, publishedAt: '2026-10-01T00:00:00Z', channelTitle: 'X', retrievedAt: '2026-11-18' });
    expect(r2.signals).toEqual({ views: 900, publishedAt: '2026-10-01', channel: 'X' });
    expect(cleanResearch(r2)).toEqual(r2);
  });

  it('seeds a draft from an idea without inventing a keyword', () => {
    expect(draftSeed({ text: 'hello world' }, 'fa')).toEqual({ focusKeyword: '', language: 'en' });
    const research = researchFromKeyword({ keyword: 'figma', retrievedAt: 'x' });
    expect(draftSeed({ text: 'متن', research }, 'fa')).toEqual({ focusKeyword: 'figma', language: 'en', research });
  });

  it('points at the next step and never skips to publish with errors', () => {
    expect(draftSteps(draft()).next).toBe('keyword');
    expect(draftSteps(draft({ focusKeyword: 'k' })).next).toBe('text');
    expect(draftSteps(draft({ focusKeyword: 'k', title: 't', description: 'd' })).next).toBe('tags');
    const s = draftSteps(draft({ research: { keyword: 'k' }, focusKeyword: 'k', title: 't', description: 'd', tags: ['a'] }));
    expect(s.steps.find((x) => x.id === 'research')?.done).toBe(true);
    expect(['checks', 'publish']).toContain(s.next);
  });
});
