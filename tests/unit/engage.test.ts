import { describe, expect, it } from 'vitest';
import { answeredByOwner, filterThreads, fillReply, isQuestion, moderationCost, placeholdersIn, spamSignals, toThread, type CommentThread } from '../../src/domain/engageComments';
import { applyMoves, longestIncreasing, moveOne, planReorder, sortItems, videosToAdd } from '../../src/domain/engagePlaylists';
import { appendNote, futureProblem, isoToLocalInput, localInputToIso, removeNote, restoreSnippet, writableStatus } from '../../src/domain/engageSchedule';
import { hexToRgba, letterboxCrop, overlayLayout, wrapText, DEFAULT_DESIGN } from '../../src/domain/engageThumbs';
import { coerceAiShort, fitSegment, hookLine, parseRetention, parseSubtitles, parseTimedLines, retentionPeaks, suggestShorts, watchUrl } from '../../src/domain/engageShorts';
import { applyProfile } from '../../src/domain/engageBulk';
import { runSequential } from '../../src/domain/engageRun';

const OWN = 'UCowncccccccccccccccccccc';

function thread(p: Partial<CommentThread> = {}): CommentThread {
  return { id: 't1', videoId: 'v1', authorName: '@ali', authorChannelId: 'UCali', text: 'سلام', publishedAt: '2026-10-01T00:00:00Z', likes: 0, replyCount: 0, replies: [], moderationStatus: 'published', canReply: true, ...p };
}

describe('comment inbox', () => {
  it('normalizes a commentThreads item with replies in time order', () => {
    const t = toThread({
      id: 'Ug1',
      snippet: {
        videoId: 'v9',
        totalReplyCount: 2,
        canReply: true,
        topLevelComment: { id: 'Ug1', snippet: { authorDisplayName: '@sara', authorChannelId: { value: 'UCs' }, authorProfileImageUrl: 'javascript:x', textOriginal: 'چطور؟', likeCount: 3, publishedAt: '2026-10-02T00:00:00Z' } },
      },
      replies: { comments: [{ id: 'r2', snippet: { authorChannelId: { value: OWN }, textOriginal: 'b', publishedAt: '2026-10-04T00:00:00Z' } }, { id: 'r1', snippet: { textOriginal: 'a', publishedAt: '2026-10-03T00:00:00Z' } }] },
    });
    expect(t).toMatchObject({ id: 'Ug1', videoId: 'v9', authorName: '@sara', likes: 3, replyCount: 2, moderationStatus: 'published' });
    expect(t.authorAvatar).toBeUndefined();
    expect(t.replies.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(answeredByOwner(t, OWN)).toBe(true);
  });

  it('says "unknown" when not every reply was returned', () => {
    expect(answeredByOwner(thread({ replyCount: 0 }), OWN)).toBe(false);
    expect(answeredByOwner(thread({ replyCount: 7, replies: [] }), OWN)).toBeNull();
  });

  it('filters by unanswered, questions, spam, keyword, author and video', () => {
    const list = [
      thread({ id: 'a', text: 'این چطوری کار می‌کنه؟' }),
      thread({ id: 'b', text: 'Great video', replyCount: 1, replies: [{ id: 'r', authorName: 'me', authorChannelId: OWN, text: 'thanks', publishedAt: '', likes: 0 }] }),
      thread({ id: 'c', text: 'Free money at bit.ly/xyz', authorName: '@spammer', videoId: 'v2' }),
      thread({ id: 'd', text: 'my own note', authorChannelId: OWN }),
    ];
    expect(filterThreads(list, { unanswered: true }, OWN).map((t) => t.id)).toEqual(['a', 'c']);
    expect(filterThreads(list, { questions: true }, OWN).map((t) => t.id)).toEqual(['a']);
    expect(filterThreads(list, { spam: true }, OWN).map((t) => t.id)).toEqual(['c']);
    expect(filterThreads(list, { query: 'GREAT' }, OWN).map((t) => t.id)).toEqual(['b']);
    expect(filterThreads(list, { author: 'spam' }, OWN).map((t) => t.id)).toEqual(['c']);
    expect(filterThreads(list, { videoId: 'v2' }, OWN).map((t) => t.id)).toEqual(['c']);
  });

  it('detects questions in Persian and English, and spam signals', () => {
    expect(isQuestion('کی؟')).toBe(true);
    expect(isQuestion('why?')).toBe(true);
    expect(isQuestion('ممنون')).toBe(false);
    expect(spamSignals('join t.me/abc')).toContain('links');
    expect(spamSignals('واتساپ بدید')).toContain('contact');
    expect(spamSignals('wowwwwwwwwww')).toContain('repeat');
    expect(spamSignals('عالی بود')).toEqual([]);
  });

  it('fills canned-reply placeholders', () => {
    expect(fillReply('ممنون {name} از دیدن «{video}»', { name: '@ali', video: 'آموزش فیگما' })).toBe('ممنون ali از دیدن «آموزش فیگما»');
    expect(fillReply('Hi {name}!', {})).toBe('Hi !');
    expect(placeholdersIn('{video} {name} {name}')).toEqual(['video', 'name']);
  });

  it('counts one moderation request per 10 comments', () => {
    expect(moderationCost(1)).toBe(50);
    expect(moderationCost(10)).toBe(50);
    expect(moderationCost(11)).toBe(100);
  });
});

describe('playlist planning', () => {
  it('finds a longest increasing run', () => {
    expect([...longestIncreasing([3, 0, 1, 2])].sort()).toEqual([1, 2, 3]);
    expect(longestIncreasing([]).size).toBe(0);
  });

  it('plans the fewest moves and they produce the target', () => {
    const cases: [string[], string[]][] = [
      [['D', 'A', 'B', 'C'], ['A', 'B', 'C', 'D']],
      [['B', 'C', 'D', 'A'], ['A', 'B', 'C', 'D']],
      [['E', 'D', 'C', 'B', 'A'], ['A', 'B', 'C', 'D', 'E']],
      [['A', 'C', 'B', 'E', 'D', 'F'], ['F', 'E', 'D', 'C', 'B', 'A']],
      [['A', 'B', 'C'], ['A', 'B', 'C']],
    ];
    for (const [cur, target] of cases) {
      const moves = planReorder(cur, target);
      expect(applyMoves(cur, moves)).toEqual(target);
      expect(moves.length).toBe(cur.length - longestIncreasing(cur.map((x) => target.indexOf(x))).size);
    }
    expect(planReorder(['D', 'A', 'B', 'C'], ['A', 'B', 'C', 'D'])).toEqual([{ id: 'D', to: 3 }]);
    expect(() => planReorder(['A'], ['B'])).toThrow();
  });

  it('sorts by date, views and title, keeping unknown values last and ties stable', () => {
    const items = [
      { id: '1', title: 'ب', publishedAt: '2026-01-02', views: 5 },
      { id: '2', title: 'آ', publishedAt: undefined, views: undefined },
      { id: '3', title: 'الف', publishedAt: '2026-01-01', views: 50 },
      { id: '4', title: 'پ', publishedAt: '2026-01-03', views: 5 },
    ];
    expect(sortItems(items, 'date', 'asc').map((x) => x.id)).toEqual(['3', '1', '4', '2']);
    expect(sortItems(items, 'views', 'desc').map((x) => x.id)).toEqual(['3', '1', '4', '2']);
    expect(sortItems(items, 'title', 'asc').map((x) => x.id)).toEqual(['2', '3', '1', '4']);
  });

  it('moves one item and skips videos already in the playlist', () => {
    expect(moveOne(['a', 'b', 'c'], 'c', 'top')).toEqual({ id: 'c', to: 0 });
    expect(moveOne(['a', 'b', 'c'], 'a', 'up')).toBeNull();
    expect(moveOne(['a', 'b', 'c'], 'a', 'down')).toEqual({ id: 'a', to: 1 });
    expect(videosToAdd(['v1'], ['v1', 'v2', 'v2', 'v3'])).toEqual(['v2', 'v3']);
  });
});

describe('scheduling', () => {
  const live = { uploadStatus: 'processed', privacyStatus: 'unlisted', license: 'youtube', embeddable: true, publicStatsViewable: false, selfDeclaredMadeForKids: false, madeForKids: false };

  it('sends every writable status field and forces private for publishAt', () => {
    expect(writableStatus(live, { publishAt: '2026-12-01T10:00:00.000Z' })).toEqual({
      privacyStatus: 'private',
      publishAt: '2026-12-01T10:00:00.000Z',
      license: 'youtube',
      embeddable: true,
      publicStatsViewable: false,
      selfDeclaredMadeForKids: false,
    });
    expect(writableStatus({ ...live, privacyStatus: 'private', publishAt: 'x' }, { publishAt: null })).not.toHaveProperty('publishAt');
    expect(writableStatus({ ...live, privacyStatus: 'private', publishAt: 'x' }, { privacyStatus: 'unlisted' })).not.toHaveProperty('publishAt');
    expect(writableStatus({ ...live, containsSyntheticMedia: true }, {})).toHaveProperty('containsSyntheticMedia', true);
  });

  it('converts datetime-local values and rejects past times', () => {
    const iso = localInputToIso('2030-05-06T07:08')!;
    expect(isoToLocalInput(iso)).toBe('2030-05-06T07:08');
    expect(localInputToIso('nope')).toBeNull();
    expect(futureProblem(null)).toBe('missing');
    expect(futureProblem(new Date(Date.now() - 1000).toISOString())).toBe('past');
    expect(futureProblem(new Date(Date.now() + 3600_000).toISOString())).toBeNull();
  });

  it('adds and removes a sunset note once', () => {
    const note = 'این ویدیو دیگر به‌روز نمی‌شود.';
    const d = appendNote('توضیح', note);
    expect(d).toBe(`${note}\n\nتوضیح`);
    expect(appendNote(d, note)).toBe(d);
    expect(removeNote(d, note)).toBe('توضیح');
    expect(removeNote(appendNote('x', note, 'end'), note)).toBe('x');
  });

  it('restores only the fields still holding what TubeX wrote', () => {
    const before = { title: 'old', description: 'od', tags: ['a'] };
    const wrote = { title: 'new', description: 'nd', tags: ['b'] };
    expect(restoreSnippet({ ...wrote, title: 'manual' }, before, wrote)).toEqual({ title: 'manual', description: 'od', tags: ['a'] });
  });
});

describe('thumbnail overlays', () => {
  const measure = (t: string, size: number) => t.length * size * 0.5;

  it('wraps text and cuts extra lines', () => {
    expect(wrapText('a b c d', 2 * 10 * 0.5 + 1, 10, measure)).toEqual(['a', 'b', 'c…']);
    expect(wrapText('hello', 1000, 10, measure)).toEqual(['hello']);
  });

  it('places the banner and keeps corners off it', () => {
    const l = overlayLayout({ ...DEFAULT_DESIGN, text: 'آموزش کامل', badge: 'جدید', badgeCorner: 'br', position: 'bottom' }, measure, { width: 200, height: 100 });
    expect(l.banner!.y + l.banner!.h).toBe(720);
    expect(l.badge!.y + l.badge!.h).toBeLessThanOrEqual(l.banner!.y);
    expect(l.logo!.x).toBe(36);
    expect(overlayLayout(DEFAULT_DESIGN, measure)).toEqual({});
  });

  it('crops the letterboxed hq frame and converts colours', () => {
    expect(letterboxCrop(480, 360)).toEqual({ x: 0, y: 45, w: 480, h: 270 });
    expect(letterboxCrop(1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(hexToRgba('#1ed760', 0.5)).toBe('rgba(30, 215, 96, 0.5)');
  });
});

describe('suggested shorts', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ ratio: (i + 1) / 100, watch: 1 - i / 200 + (i >= 40 && i < 45 ? 0.3 : 0), relative: i >= 40 && i < 45 ? 0.9 : 0.4 }));

  it('parses retention rows', () => {
    const r = parseRetention(['elapsedVideoTimeRatio', 'audienceWatchRatio', 'relativeRetentionPerformance'], [[0.02, 0.9, 0.5], [0.01, 1, null as unknown as number]]);
    expect(r).toEqual([
      { ratio: 0.01, watch: 1, relative: null },
      { ratio: 0.02, watch: 0.9, relative: 0.5 },
    ]);
  });

  it('finds the retention peak window', () => {
    const peaks = retentionPeaks(points, 600);
    expect(peaks[0]!.start).toBeGreaterThanOrEqual(220);
    expect(peaks[0]!.start).toBeLessThanOrEqual(270);
    expect(peaks[0]!.end - peaks[0]!.start).toBe(30);
  });

  it('suggests non-overlapping 15–60 s segments from retention, chapters and transcript', () => {
    const cues = parseSubtitles('1\n00:04:00,000 --> 00:04:05,500\nچرا این ترفند کار می‌کند؟ بیایید ببینیم.\n\n2\n00:08:00,000 --> 00:08:03,000\nنکتهٔ دوم');
    const out = suggestShorts({ duration: 600, videoTitle: 'v', chapters: [{ seconds: 0, title: 'مقدمه' }, { seconds: 240, title: 'ترفند اصلی' }, { seconds: 420, title: 'جمع‌بندی' }], retention: points, cues });
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(6);
    for (const s of out) {
      expect(s.end - s.start).toBeGreaterThanOrEqual(15);
      expect(s.end - s.start).toBeLessThanOrEqual(60);
    }
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(out[i]!.end <= out[j]!.start || out[j]!.end <= out[i]!.start).toBe(true);
    const top = out[0]!;
    expect(top.signals).toContain('retention');
    expect(top.signals).toContain('chapter');
    expect(top.title).toBe('ترفند اصلی');
    expect(top.hook).toBe('چرا این ترفند کار می‌کند؟');
  });

  it('returns nothing without signals and for short videos', () => {
    expect(suggestShorts({ duration: 600, videoTitle: 'v', chapters: [], retention: [], cues: [] })).toEqual([]);
    expect(suggestShorts({ duration: 20, videoTitle: 'v', chapters: [{ seconds: 0, title: 'x' }], retention: [], cues: [] })).toEqual([]);
  });

  it('fits segments, parses timed lines, hooks and AI output', () => {
    expect(fitSegment(590, 640, 600)).toEqual({ start: 550, end: 600 });
    expect(fitSegment(10, 12, 600)).toEqual({ start: 10, end: 25 });
    expect(parseTimedLines('0:05 hi\nno time\n1:00 bye')).toEqual([
      { start: 5, end: 60, text: 'hi' },
      { start: 60, end: 65, text: 'bye' },
    ]);
    expect(hookLine('One two. Three')).toBe('One two.');
    expect(coerceAiShort({ start: 100, end: 300, title: 'T', hook: 'h' }, 600)).toMatchObject({ start: 100, end: 160, title: 'T' });
    expect(coerceAiShort({ start: 700, end: 720, title: 'T' }, 600)).toBeNull();
    expect(watchUrl('abc', 61.7)).toBe('https://www.youtube.com/watch?v=abc&t=61s');
  });
});

describe('default upload profile', () => {
  const rec = { title: 't', description: 'متن', tags: ['a'] };
  it('appends once or replaces each field', () => {
    const op = { description: 'لینک‌ها', tags: ['b', 'a'], descriptionMode: 'append' as const, tagsMode: 'append' as const };
    const next = applyProfile(rec, op);
    expect(next).toEqual({ title: 't', description: 'متن\n\nلینک‌ها', tags: ['a', 'b'] });
    expect(applyProfile(next, op)).toBe(next);
    expect(applyProfile(rec, { ...op, descriptionMode: 'replace', tagsMode: 'keep' })).toEqual({ title: 't', description: 'لینک‌ها', tags: ['a'] });
  });
});

describe('sequential runner', () => {
  it('runs in order, keeps going on ordinary errors and stops on fatal ones', async () => {
    const seen: number[] = [];
    const p = await runSequential([1, 2, 3, 4], async (n) => {
      seen.push(n);
      if (n === 2) throw new Error('soft');
      if (n === 3) throw new Error('fatal');
    }, { isFatal: (e) => (e as Error).message === 'fatal' });
    expect(seen).toEqual([1, 2, 3]);
    expect(p.ok).toEqual([1]);
    expect(p.failed.map((f) => f.item)).toEqual([2, 3]);
    expect(p.stopped).toBeInstanceOf(Error);
    const abort = { aborted: true };
    expect((await runSequential([1], async () => {}, { isFatal: () => false, signal: abort })).aborted).toBe(true);
  });
});
