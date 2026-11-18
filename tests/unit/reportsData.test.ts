import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { computeHealth, toRVideo } from '../../src/features/reports/data';
import { reachRef } from '../../src/features/reports/reach';
import { put } from '../../src/storage/stores';
import { healthDue } from '../../src/background/jobs/reports';
import * as db from '../../src/storage/db';

const CH = 'UCabcdefghijklmnopqrstuv';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('reports data', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
    await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps caption and language fields from the videos resource', () => {
    const v = toRVideo({ id: 'v1', snippet: { title: 'a', defaultLanguage: 'fa', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT5M', caption: 'false' }, status: { privacyStatus: 'public' } });
    expect(v).toMatchObject({ id: 'v1', caption: false, defaultLanguage: 'fa', defaultAudioLanguage: undefined, privacy: 'public', durationSec: 300, live: 'none' });
    expect(toRVideo({ id: 'v2', contentDetails: {} }).caption).toBeNull();
  });

  it('never asks the Analytics API for impressions or CTR (400 "query not supported")', async () => {
    const fetchMock = vi.fn(async (_url: string) => json({ columnHeaders: [{ name: 'views' }], rows: [[1]] }));
    vi.stubGlobal('fetch', fetchMock);
    const h = await computeHealth(CH, [], false, Date.parse('2026-10-20T12:00:00Z'));
    const metrics = fetchMock.mock.calls.map((c) => new URL(c[0]).searchParams.get('metrics') ?? '');
    expect(metrics.some((m) => /Thumbnail|Impression/i.test(m))).toBe(false);
    // No stored reach days: CTR is left out (null), not zero.
    expect(h.ctrDays).toBe(0);
    expect(h.health.parts.find((p) => p.id === 'ctr')!.score).toBeNull();
  });

  it('computes health from Analytics with CTR when available', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      const m = u.searchParams.get('metrics') ?? '';
      if (m === 'views') return json({ columnHeaders: [{ name: 'views' }], rows: [[1000]] });
      return json({
        columnHeaders: ['views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'subscribersGained', 'subscribersLost', 'likes', 'comments', 'shares'].map((name) => ({ name })),
        rows: [[1200, 3600, 180, 40, 12, 3, 30, 6, 0]],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    // 10 stored reach days at 5% CTR (YouTube Reporting API data kept locally).
    for (let d = 1; d <= 10; d++) {
      const date = `2026-10-${String(d + 5).padStart(2, '0')}`;
      await put('snapshots', { id: `${reachRef(CH)}:${date}`, ref: reachRef(CH), at: `${date}T00:00:00.000Z`, data: { date, createTime: '2026-10-19T00:00:00Z', reportId: 'r', v: { aaaaaaaaaaa: [1000, 50] } } });
    }
    const h = await computeHealth(CH, [], false, Date.parse('2026-10-20T12:00:00Z'));
    const s = Object.fromEntries(h.health.parts.map((p) => [p.id, p.score]));
    expect(s).toMatchObject({ trend: 70, engagement: 60, watch: 80, subscribers: 100, metadata: null, ctr: 50 });
    expect(h.ctrDays).toBe(10);
    // Analytics requests are made with the OAuth token and the 28-day ranges.
    const urls = fetchMock.mock.calls.map((c) => new URL(c[0] as string));
    expect(urls.some((u) => u.searchParams.get('startDate') === '2026-09-23' && u.searchParams.get('endDate') === '2026-10-20')).toBe(true);
    expect(urls.some((u) => u.searchParams.get('startDate') === '2026-08-26' && u.searchParams.get('endDate') === '2026-09-22')).toBe(true);
  });

  it('runs the daily snapshot at most every 20 hours', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(healthDue({ enabled: true }, now)).toBe(true);
    expect(healthDue({ enabled: true, lastCheckedAt: '2026-10-20T00:00:00Z' }, now)).toBe(false);
    expect(healthDue({ enabled: true, lastCheckedAt: '2026-10-19T12:00:00Z' }, now)).toBe(true);
    expect(healthDue({ enabled: false }, now)).toBe(false);
  });
});
