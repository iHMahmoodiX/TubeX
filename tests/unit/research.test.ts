import { describe, expect, it } from 'vitest';
import { chapterProblems, extractChapters, normalizeChapters } from '../../src/domain/chapters';
import { sortTags } from '../../src/domain/metadata';
import { commonTags, csvCell, embedCode, median, newUploads, nextMilestone, positionsOf, summarizeSample, titleWords, toCsv, viewsPerDay } from '../../src/domain/research';
import { parseChannelInput } from '../../src/features/competitors/watchActions';

const now = Date.parse('2026-10-20T00:00:00Z');
const v = (id: string, over = {}) => ({ id, title: '', channelId: 'A', publishedAt: '2026-10-10T00:00:00Z', tags: [], ...over });

describe('research helpers', () => {
  it('counts tags once per video and keeps only repeated ones', () => {
    const tags = commonTags([v('1', { tags: ['Python', 'python', 'کد'] }), v('2', { tags: ['PYTHON'] }), v('3', { tags: ['کد'] })]);
    expect(tags).toEqual([
      { term: 'Python', count: 2 },
      { term: 'کد', count: 2 },
    ]);
  });

  it('finds repeated title words without stop words', () => {
    expect(titleWords([v('1', { title: 'آموزش پایتون از صفر' }), v('2', { title: 'پایتون برای مبتدی‌ها' })])).toEqual([{ term: 'پایتون', count: 2 }]);
  });

  it('summarizes a sample', () => {
    const s = summarizeSample([v('1', { views: 100 }), v('2', { views: 300, channelId: 'B', publishedAt: '2025-01-01T00:00:00Z' })], now);
    expect(s).toMatchObject({ count: 2, medianViews: 200, channels: 2, recentShare: 0.5 });
    expect(median([])).toBeUndefined();
    expect(viewsPerDay({ views: 1000, publishedAt: '2026-10-10T00:00:00Z' }, now)).toBe(100);
    expect(viewsPerDay({ views: undefined, publishedAt: '' }, now)).toBeUndefined();
    expect(positionsOf([v('1'), v('2', { channelId: 'B' }), v('3')], 'A')).toEqual([1, 3]);
  });

  it('writes formula-safe CSV with a BOM', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5')).toBe("'-5");
    expect(toCsv([['a', 'b,c']])).toBe('﻿a,"b,c"\r\n');
  });

  it('marks new uploads after the first check only', () => {
    expect(newUploads(['a', 'b'], [], true)).toEqual([]);
    expect(newUploads(['c', 'a', 'b'], ['a', 'b'], false)).toEqual(['c']);
  });

  it('computes the next subscriber milestone', () => {
    expect([0, 150, 999, 1000, 4200, 9999, 10000, 260000].map(nextMilestone)).toEqual([100, 500, 1000, 5000, 5000, 10000, 50000, 500000]);
  });

  it('builds embed code with loop and privacy options', () => {
    const code = embedCode({ videoId: 'dQw4w9WgXcQ', start: 30, loop: true, autoplay: true, privacy: true });
    expect(code).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30&autoplay=1&mute=1&loop=1&playlist=dQw4w9WgXcQ');
  });

  it('parses channel input forms', () => {
    expect(parseChannelInput('https://www.youtube.com/@Some.Channel/videos')).toEqual({ handle: '@Some.Channel' });
    expect(parseChannelInput('UCabcdefghijklmnopqrstuv')).toEqual({ id: 'UCabcdefghijklmnopqrstuv' });
    expect(parseChannelInput('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')).toEqual({ id: 'UCabcdefghijklmnopqrstuv' });
    expect(parseChannelInput('mychannel')).toEqual({ handle: '@mychannel' });
    expect(parseChannelInput('a b')).toBeNull();
  });

  it('sorts tags keyword-first, specific before broad', () => {
    expect(sortTags(['کد', 'آموزش پایتون مقدماتی', 'پایتون', 'برنامه نویسی'], 'پایتون')).toEqual(['پایتون', 'آموزش پایتون مقدماتی', 'برنامه نویسی', 'کد']);
  });
});

describe('chapters', () => {
  it('normalizes AI chapters to YouTube rules', () => {
    const r = normalizeChapters([
      { time: '0:05', title: 'شروع' },
      { time: '0:08', title: 'too close' },
      { time: '1:30', title: 'بخش دوم' },
      { time: '1:02:03', title: 'پایان' },
    ]);
    expect(r.chapters.map((c) => c.time)).toEqual(['0:00', '1:30', '1:02:03']);
    expect(r.valid).toBe(true);
  });

  it('finds problems with chapters written in a description', () => {
    expect(chapterProblems('بدون فصل')).toEqual([]);
    expect(chapterProblems('0:00 شروع\n1:00 وسط\n2:00 پایان')).toEqual([]);
    expect(chapterProblems('0:10 شروع\n0:15 وسط')).toEqual(['not-at-zero', 'too-few', 'too-short']);
    expect(extractChapters('intro\n00:00 - Intro\n1:20:05 End')).toHaveLength(2);
  });
});
