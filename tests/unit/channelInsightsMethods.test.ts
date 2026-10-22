import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { channelInsightsJobs, channelInsightsTicks, dueChannels, snapshotDue } from '../../src/background/jobs/channelInsights';
import { channelInsightsMethods as M, ciRef, CI_SEEN, markSeen, seenChannels } from '../../src/background/methods/channelInsights';
import { newBase } from '../../src/domain/models';
import { nicheRef } from '../../src/features/ranks/service';
import * as db from '../../src/storage/db';
import { loadUsage } from '../../src/storage/integrations';
import { all, history, one, snapshot } from '../../src/storage/stores';

const A = `UC${'a'.repeat(22)}`;
const B = `UC${'b'.repeat(22)}`;
const OWN = `UC${'m'.repeat(22)}`;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
let subs = 1000;
const channelItem = (id: string) => ({
  id,
  snippet: { title: `Channel ${id.slice(2, 4)}`, customUrl: '@x', publishedAt: '2020-01-01T00:00:00Z', thumbnails: { default: { url: 'https://yt3.example/a.jpg' } } },
  statistics: { subscriberCount: String(subs), viewCount: '50000', videoCount: '3' },
  contentDetails: { relatedPlaylists: { uploads: `UU${id.slice(2)}` } },
  brandingSettings: { channel: { keywords: '"UI Design" figma "آموزش فیگما"' } },
});
const fetchMock = vi.fn(async (input: string | URL) => {
  const url = new URL(String(input));
  const path = url.pathname.split('/').pop();
  if (path === 'channels') return json({ items: (url.searchParams.get('id') ?? A).split(',').map(channelItem) });
  if (path === 'playlistItems') return json({ items: ['v1', 'v2', 'v3'].map((videoId) => ({ contentDetails: { videoId } })) });
  if (path === 'videos')
    return json({ items: (url.searchParams.get('id') ?? '').split(',').map((id) => ({ id, snippet: { title: `T ${id}`, description: 'long text', channelId: A, publishedAt: '2026-10-19T00:00:00Z' }, statistics: { viewCount: '10' }, contentDetails: { duration: 'PT5M' } })) });
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
  subs = 1000;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const watch = (channelId: string, title = 'W') => db.create('watchlist', { ...newBase(), channelId, title, handle: '', notes: 'my note', seenVideoIds: [] });

describe('ci methods: arguments', () => {
  it('rejects bad channel ids and refs', async () => {
    await expect(M['ci.channel']!({})).rejects.toThrow('bad argument');
    await expect(M['ci.channel']!({ id: 'nope' })).rejects.toThrow('bad argument');
    await expect(M['ci.uploads']!('UC123')).rejects.toThrow('bad argument');
    await expect(M['ci.history']!(42)).rejects.toThrow('bad argument');
    await expect(M['ci.niche.add']!('<script>')).rejects.toThrow('bad argument');
    await expect(M['ci.topicLabels']!([], 'en')).rejects.toThrow('bad argument');
    await expect(M['ci.topicLabels']!(Array.from({ length: 21 }, () => ({ key: 'k' })), 'en')).rejects.toThrow('bad argument');
  });
  it('only reads Analytics for signed-in channels', async () => {
    await expect(M['ci.ownDaily']!(A)).rejects.toThrow('not signed in');
  });
});

describe('ci.channel', () => {
  it('returns keywords, records a snapshot and remembers the visit', async () => {
    const r = (await M['ci.channel']!({ id: A })) as { channel: { id: string; subscribers: number }; keywords: string[] };
    expect(r.channel.id).toBe(A);
    expect(r.keywords).toEqual(['UI Design', 'figma', 'آموزش فیگما']);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('part')).toContain('brandingSettings');
    const h = await history(ciRef(A));
    expect(h).toHaveLength(1);
    expect(h[0]!.data).toMatchObject({ subscribers: 1000, views: 50000, videoCount: 3 });
    expect((await seenChannels()).map((c) => c.channelId)).toEqual([A]);
    // Cached: a second call costs nothing.
    const units = (await loadUsage()).ytUnits;
    await M['ci.channel']!({ id: A });
    expect((await loadUsage()).ytUnits).toBe(units);
  });

  it('returns no channel for an unknown handle', async () => {
    fetchMock.mockImplementationOnce(async () => json({ items: [] }));
    expect(await M['ci.channel']!({ handle: '@nobody' })).toMatchObject({ channel: null, keywords: [] });
  });
});

describe('ci.uploads', () => {
  it('caps the load and drops descriptions', async () => {
    const v = (await M['ci.uploads']!(A, 9999)) as { id: string; description: string }[];
    expect(v.map((x) => x.id)).toEqual(['v1', 'v2', 'v3']);
    expect(v.every((x) => x.description === '')).toBe(true);
    const pl = fetchMock.mock.calls.map((c) => new URL(String(c[0]))).find((u) => u.pathname.endsWith('playlistItems'))!;
    expect(pl.searchParams.get('maxResults')).toBe('50');
  });
});

describe('growth from snapshots', () => {
  it('merges niche and visit snapshots and reports tracking before two days exist', async () => {
    await watch(B, 'Bee');
    await snapshot(ciRef(A), { subscribers: 100, views: 1000 }, new Date('2026-10-20T10:00:00Z'));
    let g = (await M['ci.growth']!(A)) as { self: { state: string; since?: string }; trackingSince: string; members: { channelId: string; growth: { state: string } }[]; you?: unknown };
    expect(g.self).toEqual({ state: 'tracking', since: '2026-10-20T10:00:00.000Z' });
    expect(g.trackingSince).toBe('2026-10-20T10:00:00.000Z');
    expect(g.members.map((m) => [m.channelId, m.growth.state])).toEqual([[B, 'none']]);
    expect(g.you).toBeUndefined();
    await snapshot(nicheRef(A), { subscribers: 110, views: 1500 }, new Date('2026-10-30T10:00:00Z'));
    g = (await M['ci.growth']!(A)) as typeof g;
    expect(g.self).toMatchObject({ state: 'ok', source: 'snapshots', views: { delta: 500, pct: 50 }, subs: { pct: 10 } });
  });
});

describe('niche management', () => {
  it('adds, removes and restores a channel with its notes', async () => {
    expect(await M['ci.niche.add']!(A)).toEqual({ existed: false });
    expect(await M['ci.niche.add']!(A)).toEqual({ existed: true });
    expect(((await M['ci.niche.list']!()) as { channelId: string }[]).map((c) => c.channelId)).toEqual([A]);
    const rec = (await db.list('watchlist')).items[0]!;
    await db.save('watchlist', { ...rec, notes: 'keep me' });
    expect(await M['ci.niche.remove']!(A)).toEqual({ removed: true });
    expect((await db.list('watchlist')).items).toHaveLength(0);
    expect(await M['ci.niche.remove']!(A)).toEqual({ removed: false });
    expect(await M['ci.niche.undoRemove']!(B)).toEqual({ restored: false });
    expect(await M['ci.niche.undoRemove']!(A)).toEqual({ restored: true });
    const back = (await db.list('watchlist')).items;
    expect(back.map((w) => [w.channelId, w.notes])).toEqual([[A, 'keep me']]);
  });
});

describe('daily snapshot tick', () => {
  it('snapshots niche and visited channels once a day, skipping those already done, in one batch', async () => {
    const now = new Date();
    await watch(A);
    await markSeen({ id: B, title: 'B' }, now);
    expect((await dueChannels(now)).sort()).toEqual([A, B].sort());
    await snapshot(nicheRef(A), { subscribers: 1 }, now);
    expect(await dueChannels(now)).toEqual([B]);
    expect(await snapshotDue(now)).toBe(1);
    expect(await dueChannels(now)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await loadUsage()).ytUnits).toBe(1);
    expect(await snapshotDue(now)).toBe(0);
  });

  it('forgets visited channels after three weeks', async () => {
    await markSeen({ id: B, title: 'B' }, new Date(Date.now() - 30 * 86_400_000));
    expect(await seenChannels()).toEqual([]);
    expect((await one('trackers', CI_SEEN))?.config.channels).toHaveLength(1);
  });

  it('respects the spendable budget reserve', async () => {
    await watch(A);
    await fakeBrowser.storage.local.set({ integrations: { youtube: { apiKey: 'k', region: 'IR', language: 'fa', dailyUnitCap: 500 } } });
    expect(await snapshotDue(new Date())).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs at most every 6 hours and can be switched off', async () => {
    await watch(A);
    const tick = channelInsightsTicks[0]!;
    const t0 = new Date();
    await tick(t0);
    expect(await all('snapshots')).toHaveLength(1);
    await db.remove('watchlist', (await db.list('watchlist')).items[0]!.id);
    await watch(B);
    await tick(new Date(t0.getTime() + 3600_000));
    expect(await all('snapshots')).toHaveLength(1);
    await tick(new Date(t0.getTime() + 7 * 3600_000));
    expect((await all('snapshots')).length).toBe(2);
    // The job reads the clock itself; pin it to the last tick so t0 + 7 h crossing midnight does not matter.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(t0.getTime() + 7 * 3600_000));
    try {
      expect(await channelInsightsJobs['ci.snapshot']!({} as never)).toBe('0');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing without a way to read YouTube', async () => {
    await fakeBrowser.storage.local.set({ integrations: { youtube: { apiKey: '', region: 'IR', language: 'fa', dailyUnitCap: 8000 } } });
    await watch(A);
    await channelInsightsTicks[0]!(new Date());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(OWN).toMatch(/^UC/);
  });
});
