import { describe, expect, it } from 'vitest';
import { askStudioPrompt, coachEvidence, numbersIn, validateCoach } from '../../src/domain/coach';
import type { QueueEntry } from '../../src/domain/optimizeQueue';

const entry: QueueEntry = {
  videoId: 'abcdefghijk',
  title: 'آموزش فیگما',
  publishedAt: '2026-01-01T00:00:00Z',
  signals: [{ kind: 'low-ctr', evidence: { impressions: 20000, ctr: 2, medianCtr: 5 } }],
  views28: 1200,
  snap: { at: '2026-11-18T00:00:00Z', periodDays: 28, views: 1200, impressions: 20000, ctr: 2 },
  thinData: false,
};
const ev = coachEvidence(entry, { ctr: 5, avgViewPercent: null, views: 900 }, Date.parse('2026-11-18T00:00:00Z'));

describe('coach', () => {
  it('sends only dated own-channel numbers; unknown stays out', () => {
    expect(ev).toMatchObject({ views: 1200, impressions: 20000, ctrPercent: 2, channelMedianCtrPercent: 5, channelMedianViews: 900, ageDays: 321 });
    expect(ev).not.toHaveProperty('avgViewPercent');
    expect(ev).not.toHaveProperty('channelMedianAvgViewPercent');
    expect(String(ev.period)).toContain('2026-11-18');
    expect(JSON.stringify(ev)).not.toContain('abcdefghijk');
  });
  it('reads Latin, Persian and grouped numbers', () => {
    expect(numbersIn('CTR ۲٫۵ و 20,000 بار و ٣')).toEqual(['2', '5', '20000', '3']);
  });
  it('drops suggestions with invented numbers, missing text or unknown keys; keeps at most 3', () => {
    const r = validateCoach(
      {
        suggestions: [
          { title: 'Name the result in the first 3 words', why: 'CTR is 2% vs 5% median on 20,000 impressions', nextStep: 'Rewrite the title in Studio', effort: 'low', confidence: 'medium', uses: ['ctrPercent', 'bogus'] },
          { title: 'Will reach 50,000 views', why: 'trust me', nextStep: 'x' },
          { title: '', nextStep: 'x' },
          'junk',
          { title: 'Thumbnail with one face', why: 'impressions are high', nextStep: 'Test it', effort: 'weird' },
        ],
      },
      ev,
    );
    expect(r.suggestions.map((x) => x.title)).toEqual(['Name the result in the first 3 words', 'Thumbnail with one face']);
    expect(r.suggestions[0]!.uses).toEqual(['ctrPercent']);
    expect(r.suggestions[1]).toMatchObject({ effort: 'medium', confidence: 'low' });
    expect(r.dropped).toBe(3);
    expect(validateCoach({}, ev)).toEqual({ suggestions: [], dropped: 0 });
  });
  it('builds an Ask Studio prompt from the same evidence in the UI language', () => {
    expect(askStudioPrompt(ev, 'fa')).toContain('- ctrPercent: 2');
    expect(askStudioPrompt(ev, 'en')).toMatch(/^I want improvement ideas/);
  });
});
