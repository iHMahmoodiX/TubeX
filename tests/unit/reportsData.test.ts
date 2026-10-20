import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { computeHealth, toRVideo, tryCtr } from '../../src/features/reports/data';
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

  it('treats rejected CTR metrics as unavailable, not zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: 'Unknown identifier (videoThumbnailImpressions)', errors: [{ reason: 'badRequest' }] } }, 400)));
    const r = await tryCtr(CH, { startDate: '2026-01-01', endDate: '2026-01-28' });
    expect(r.ctr).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('computes health from Analytics with CTR when available', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      const m = u.searchParams.get('metrics') ?? '';
      if (m.startsWith('videoThumbnail')) return json({ columnHeaders: [{ name: 'videoThumbnailImpressions' }, { name: 'videoThumbnailImpressionsClickRate' }], rows: [[10000, 5]] });
      if (m === 'views') return json({ columnHeaders: [{ name: 'views' }], rows: [[1000]] });
      return json({
        columnHeaders: ['views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'subscribersGained', 'subscribersLost', 'likes', 'comments', 'shares'].map((name) => ({ name })),
        rows: [[1200, 3600, 180, 40, 12, 3, 30, 6, 0]],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const h = await computeHealth(CH, [], false, Date.parse('2026-10-20T12:00:00Z'));
    const s = Object.fromEntries(h.health.parts.map((p) => [p.id, p.score]));
    expect(s).toMatchObject({ trend: 70, engagement: 60, watch: 80, subscribers: 100, metadata: null, ctr: 50 });
    expect(h.ctrError).toBeUndefined();
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
