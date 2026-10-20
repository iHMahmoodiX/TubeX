import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { checkBrand, checkCompetitor, checkRank, createBrandTracker, createRankTracker, rankHistory, syncCompetitorTrackers, tagRanks, uncachedTags } from '../../src/features/ranks/service';
import { newBase } from '../../src/domain/models';
import * as db from '../../src/storage/db';
import { loadUsage } from '../../src/storage/integrations';
import { all } from '../../src/storage/stores';

const COMP = `UC${'c'.repeat(22)}`;
const OWN = `UC${'m'.repeat(22)}`;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const hit = (id: string, channelId: string) => ({ id: { videoId: id }, snippet: { channelId, title: `T ${id}`, channelTitle: `C ${channelId}`, publishedAt: '2026-10-19T00:00:00Z' } });

let searchOrder: string[] = [];
let uploads: string[] = [];
const fetchMock = vi.fn(async (input: string | URL) => {
  const url = new URL(String(input));
  const path = url.pathname.split('/').pop();
  if (path === 'search') return json({ items: searchOrder.map((id) => hit(id, id === 'mine' ? OWN : `UC${id}`)) });
  if (path === 'videos') return json({ items: (url.searchParams.get('id') ?? '').split(',').map((id) => ({ id, snippet: { title: `T ${id}`, channelId: 'UCx', publishedAt: '2026-10-19T00:00:00Z' }, statistics: { viewCount: '10' } })) });
  if (path === 'playlistItems') return json({ items: uploads.map((id) => ({ contentDetails: { videoId: id } })) });
  if (path === 'channels') return json({ items: [{ id: COMP, snippet: { title: 'Comp' }, statistics: {}, contentDetails: { relatedPlaylists: { uploads: 'UUcomp' } } }] });
  return json({});
});

beforeEach(async () => {
  fakeBrowser.reset();
  await db.resetDbForTests();
  indexedDB.deleteDatabase(db.DB_NAME);
  await fakeBrowser.storage.local.set({ integrations: { youtube: { apiKey: 'k', region: 'IR', language: 'fa', dailyUnitCap: 8000 } }, prefs: { uiLanguage: 'en' } });
  vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rank tracking', () => {
  it('records positions, keeps history and alerts on a move of 3 or more', async () => {
    const tr = await createRankTracker({ keyword: 'python', videoId: 'mine' });
    expect((await createRankTracker({ keyword: 'Python', videoId: 'mine' })).id).toBe(tr.id);
    searchOrder = ['a', 'b', 'c', 'd', 'e', 'mine'];
    expect((await checkRank(tr.id)).position).toBe(6);
    expect(await all('alerts')).toHaveLength(0);
    searchOrder = ['mine', 'a'];
    const r = await checkRank(tr.id);
    expect(r.position).toBe(1);
    expect(r.change).toMatchObject({ delta: 5, enteredTop10: false, alert: true });
    const alerts = await all('alerts');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe('rank');
    expect(alerts[0]!.body).toContain('#6 → #1');
    // One snapshot per day: the second check of the day replaces the first.
    const h = await rankHistory(tr.id);
    expect(h).toHaveLength(1);
    expect(h[0]!.position).toBe(1);
    expect((await loadUsage()).ytUnits).toBe(202);
  });
});

describe('tag rankings', () => {
  it('finds positions per tag and reuses the 24 h cache', async () => {
    searchOrder = ['a', 'mine'];
    expect(await uncachedTags(['x', 'y'])).toEqual(['x', 'y']);
    const r = await tagRanks('mine', ['x', 'y']);
    expect(r.map((x) => x.position)).toEqual([2, 2]);
    expect(r[0]!.top?.id).toBe('a');
    const calls = fetchMock.mock.calls.length;
    expect(await uncachedTags(['x', 'y'])).toEqual([]);
    expect((await tagRanks('mine', ['x']))[0]!.fromCache).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});

describe('brand alerts', () => {
  it('lists the first results without alerts, then alerts on new videos by other channels', async () => {
    await fakeBrowser.storage.local.set({ google: { channels: [{ channelId: OWN, title: 'Me', handle: '@me' }], activeChannelId: OWN } });
    const tr = await createBrandTracker('TubeX');
    searchOrder = ['a', 'mine'];
    expect((await checkBrand(tr.id)).map((m) => m.id)).toEqual(['a']);
    expect(await all('alerts')).toHaveLength(0);
    searchOrder = ['b', 'a', 'mine'];
    expect((await checkBrand(tr.id)).map((m) => m.id)).toEqual(['b']);
    const alerts = await all('alerts');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.url).toBe('https://www.youtube.com/watch?v=b');
  });
});

describe('competitor uploads', () => {
  it('records a baseline first, then alerts per new upload', async () => {
    await db.create('watchlist', { ...newBase(), id: 'w1', channelId: COMP, title: 'Comp', handle: '@comp', notes: '', seenVideoIds: [] });
    const [tr] = await syncCompetitorTrackers();
    uploads = ['v1', 'v2'];
    expect(await checkCompetitor(tr!.id)).toEqual([]);
    uploads = ['v3', 'v1', 'v2'];
    expect((await checkCompetitor(tr!.id)).map((x) => x.id)).toEqual(['v3']);
    const alerts = await all('alerts');
    expect(alerts.map((a) => a.kind)).toEqual(['competitor']);
    await db.remove('watchlist', 'w1');
    expect(await syncCompetitorTrackers()).toEqual([]);
  });
});
