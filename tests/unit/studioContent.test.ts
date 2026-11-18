import { describe, expect, it } from 'vitest';
import {
  advanceQueue,
  contentTab,
  filterKids,
  kidsCounts,
  kidsOverridden,
  kidsPlan,
  kidsState,
  liveQueue,
  parseSelection,
  queuePos,
  selectionRouteId,
  startQueue,
  undoTarget,
  type KidsVideo,
} from '../../src/domain/coppa';
import { studioContent } from '../../src/i18n/parts/studioContent';
import { TOOL_GROUPS } from '../../src/inpage/studio/content/tools';

const v = (id: string, o: Partial<KidsVideo> = {}): KidsVideo => ({ id, title: `T ${id}`, publishedAt: '2026-01-01T00:00:00Z', durationSec: 600, privacy: 'public', ...o });
const A = 'aaaaaaaaaa1';
const B = 'bbbbbbbbbb2';
const C = 'cccccccccc3';

describe('made for kids rules', () => {
  it('reads the effective state without guessing', () => {
    expect(kidsState({ madeForKids: true })).toBe('yes');
    expect(kidsState({ selfDeclared: false })).toBe('no');
    expect(kidsState({ madeForKids: false, selfDeclared: true })).toBe('no');
    expect(kidsState({})).toBe('unknown');
    expect(kidsOverridden({ madeForKids: true, selfDeclared: false })).toBe(true);
    expect(kidsOverridden({ madeForKids: true })).toBe(false);
  });

  it('plans only videos whose declaration changes', () => {
    const list = [v(A, { selfDeclared: true }), v(B, { selfDeclared: false }), v(C)];
    const p = kidsPlan(list, true);
    expect(p.change.map((x) => x.id)).toEqual([B, C]);
    expect(p.same.map((x) => x.id)).toEqual([A]);
  });

  it('filters by state, kind (length) and query and counts states', () => {
    const list = [v(A, { selfDeclared: true, durationSec: 40 }), v(B, { selfDeclared: false }), v(C, { title: 'Figma Short', durationSec: 59 })];
    expect(filterKids(list, { state: 'yes', kind: 'all', query: '' }).map((x) => x.id)).toEqual([A]);
    expect(filterKids(list, { state: 'all', kind: 'shorts', query: '' }).map((x) => x.id)).toEqual([A, C]);
    expect(filterKids(list, { state: 'all', kind: 'videos', query: '' }).map((x) => x.id)).toEqual([B]);
    expect(filterKids(list, { state: 'unknown', kind: 'all', query: 'figma' }).map((x) => x.id)).toEqual([C]);
    expect(kidsCounts(list)).toEqual({ all: 3, yes: 1, no: 1, unknown: 1 });
  });

  it('undo restores only what TubeX wrote', () => {
    expect(undoTarget({ videoId: A, title: '', before: false, after: true }, true)).toBe(false);
    expect(undoTarget({ videoId: A, title: '', before: false, after: true }, false)).toBeNull();
    expect(undoTarget({ videoId: A, title: '', before: false, after: true }, undefined)).toBeNull();
  });
});

describe('workspace hand-off', () => {
  it('round-trips ids and tab through a route id and a hash', () => {
    const id = selectionRouteId({ ids: [A, B, A, 'bad'], tab: 'shorts' });
    expect(id).toBe(`ids=${A},${B}&tab=shorts`);
    expect(parseSelection(id)).toEqual({ ids: [A, B], tab: 'shorts' });
    expect(parseSelection(`#bulk/${encodeURIComponent(id)}`)).toEqual({ ids: [A, B], tab: 'shorts' });
    expect(parseSelection('publish')).toEqual({ ids: [] });
    expect(parseSelection(undefined)).toEqual({ ids: [] });
    expect(parseSelection('ids=<script>,x&tab=evil')).toEqual({ ids: [] });
  });
});

describe('Studio content tabs', () => {
  const base = 'https://studio.youtube.com/channel/UCWHEjv-OmN2J6mkAJ051OJg';
  it('maps Studio URLs to tabs', () => {
    expect(contentTab(`${base}/videos/upload?filter=%5B%5D`)).toBe('videos');
    expect(contentTab(`${base}/videos/short?filter=%5B%5D&sort=x`)).toBe('shorts');
    expect(contentTab(`${base}/videos/live`)).toBe('live');
    expect(contentTab(`${base}/videos/posts`)).toBe('posts');
    expect(contentTab(`${base}/videos`)).toBe('videos');
    expect(contentTab(`${base}/playlists`)).toBe('playlists');
    expect(contentTab(`${base}/podcasts`)).toBe('podcasts');
    expect(contentTab(`${base}/courses`)).toBe('other');
    expect(contentTab(`${base}/analytics`)).toBeNull();
    expect(contentTab('https://studio.youtube.com/video/aaaaaaaaaa1/edit')).toBeNull();
    expect(contentTab(`https://www.youtube.com/channel/UCx/videos`)).toBeNull();
    expect(contentTab('not a url')).toBeNull();
  });
});

describe('related-video queue', () => {
  const items = [
    { id: A, title: 'a' },
    { id: B, title: 'b' },
    { id: A, title: 'dup' },
    { id: C, title: 'target itself' },
  ];
  it('starts without duplicates or the target, and walks to the end', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    const q = startQueue('add', items, { id: C, title: 'Target' }, now);
    expect(q.items.map((x) => x.id)).toEqual([A, B]);
    expect(liveQueue(q, now.getTime() + 1000)).toBe(q);
    expect(liveQueue(q, now.getTime() + 2 * 86_400_000)).toBeNull();
    expect(queuePos(q, B)).toBe(1);
    const s1 = advanceQueue(q, A);
    expect(s1.next?.id).toBe(B);
    const s2 = advanceQueue(s1.queue, B);
    expect(s2.next).toBeNull();
    expect(s2.queue.index).toBe(2);
    expect(s2.queue.done).toEqual([A, B]);
  });
  it('rejects malformed queues', () => {
    expect(liveQueue(null)).toBeNull();
    expect(liveQueue({ mode: 'add', items: [{ id: A, title: '' }], index: 0, done: [], startedAt: new Date().toISOString() })).toBeNull();
    expect(liveQueue(startQueue('clear', [], undefined))).toBeNull();
    expect(startQueue('clear', items, { id: B, title: 'ignored' }).target).toBeUndefined();
  });
});

describe('tool groups', () => {
  it('keeps TubeBuddy grouping; cards and end screens are disabled with a reason', () => {
    expect(TOOL_GROUPS.map((g) => g.id)).toEqual(['bulk', 'cards', 'endscreens', 'misc']);
    for (const g of TOOL_GROUPS.filter((x) => x.id === 'cards' || x.id === 'endscreens')) {
      expect(g.items).toHaveLength(3);
      for (const it of g.items) expect(it.action).toEqual({ kind: 'off', reason: 'sc.noApi' });
    }
    const misc = TOOL_GROUPS.find((g) => g.id === 'misc')!.items.map((i) => i.id);
    expect(misc).toEqual(['related', 'coppa', 'demonetization', 'backup', 'schedule', 'clickmagnet']);
  });
  it('has Persian text for every key and the settings labels', () => {
    expect(Object.keys(studioContent.fa).sort()).toEqual(Object.keys(studioContent.en).sort());
    expect(studioContent.en['inpage.feature.studioContent']).toBeTruthy();
    expect(studioContent.en['inpage.feature.studioContent.desc']).toBeTruthy();
    for (const g of TOOL_GROUPS) {
      expect(studioContent.en[g.label as keyof typeof studioContent.en]).toBeTruthy();
      for (const it of g.items) expect(studioContent.en[it.label as keyof typeof studioContent.en]).toBeTruthy();
    }
  });
});
