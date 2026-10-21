import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { checkDownloadUrl, parseCsv, parseReachCsv, pickReachType, reportDate, ReportingError } from '../../src/integrations/google/reporting';
import { aggregateReach, getReachState, loadReach, reachDue, reachRef, startReach, syncReach } from '../../src/features/reports/reach';
import { reachTick } from '../../src/background/jobs/reports';
import { reportsMethods } from '../../src/background/methods/reports';
import { errorKind, reasonKey } from '../../src/features/reports/errors';
import { YtError } from '../../src/integrations/youtube/client';
import { AuthError } from '../../src/integrations/google/auth';
import { history } from '../../src/storage/stores';
import * as db from '../../src/storage/db';

const CH = 'UCabcdefghijklmnopqrstuv';
const V1 = 'aaaaaaaaaaa';
const V2 = 'bbbbbbbbbbb';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const MEDIA = 'https://youtubereporting.googleapis.com/v1/media/CHANNEL/';

const csv = (rows: (string | number)[][]) =>
  ['date,channel_id,video_id,live_or_on_demand,subscribed_status,country_code,video_thumbnail_impressions,video_thumbnail_impressions_ctr', ...rows.map((r) => r.join(','))].join('\n');

describe('reporting CSV', () => {
  it('parses quoted fields, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""",2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['x, "y"', '2'],
    ]);
  });

  it('reads dates in both forms', () => {
    expect(reportDate('20261019')).toBe('2026-10-19');
    expect(reportDate('2026-10-19')).toBe('2026-10-19');
    expect(reportDate('yesterday')).toBeNull();
  });

  it('sums impressions and estimated clicks per video and day over every other dimension', () => {
    const r = parseReachCsv(
      csv([
        ['20261019', CH, V1, 'on_demand', 'subscribed', 'IR', 1000, 0.05],
        ['20261019', CH, V1, 'on_demand', 'not_subscribed', 'US', 1000, 0.03],
        ['20261019', CH, V2, 'on_demand', 'subscribed', 'IR', 200, 0.1],
        ['20261020', CH, V1, 'on_demand', 'subscribed', 'IR', 500, 0.02],
      ]),
    );
    expect(r.ctrPercent).toBe(false);
    expect(r.days['2026-10-19']![V1]![0]).toBe(2000);
    expect(r.days['2026-10-19']![V1]![1]).toBeCloseTo(80);
    expect(r.days['2026-10-19']![V2]).toEqual([200, 20]);
    expect(r.days['2026-10-20']![V1]![1]).toBeCloseTo(10);
  });

  it('reads CTR as percent when a value is above 1, and skips rows with missing values instead of zeroing them', () => {
    const r = parseReachCsv(
      csv([
        ['20261019', CH, V1, 'on_demand', 'subscribed', 'IR', 1000, 5.5],
        ['20261019', CH, V2, 'on_demand', 'subscribed', 'IR', '', 4],
        ['20261019', CH, V2, 'on_demand', 'subscribed', 'IR', 300, ''],
      ]),
    );
    expect(r.ctrPercent).toBe(true);
    expect(r.days['2026-10-19']![V1]![1]).toBeCloseTo(55);
    expect(r.days['2026-10-19']![V2]).toBeUndefined();
    expect(r.rows).toBe(1);
  });

  it('accepts reordered or renamed columns and rejects a file without the needed ones', () => {
    const r = parseReachCsv(`video_id,Video_Thumbnail_Impressions_CTR,date,video_thumbnail_impressions\n${V1},0.1,2026-10-19,100`);
    expect(r.days['2026-10-19']![V1]).toEqual([100, 10]);
    expect(() => parseReachCsv('date,video_id,views\n20261019,x,1')).toThrow(ReportingError);
  });
});

describe('reporting helpers', () => {
  it('picks the newest non-deprecated basic channel reach report type', () => {
    const now = Date.parse('2026-10-21T00:00:00Z');
    expect(
      pickReachType(
        [{ id: 'channel_basic_a2' }, { id: 'channel_reach_combined_a1' }, { id: 'channel_reach_basic_a1', deprecateTime: '2026-01-01T00:00:00Z' }, { id: 'channel_reach_basic_a2' }],
        now,
      ),
    ).toBe('channel_reach_basic_a2');
    expect(pickReachType([{ id: 'channel_basic_a2' }, { id: 'channel_reach_combined_a1' }], now)).toBe('channel_reach_combined_a1');
    expect(pickReachType([{ id: 'channel_basic_a2' }], now)).toBeNull();
  });

  it('sends the token only to the Reporting API host', () => {
    expect(checkDownloadUrl(`${MEDIA}r1?alt=media`)).toContain('youtubereporting.googleapis.com');
    expect(() => checkDownloadUrl('https://evil.example/r1')).toThrow(ReportingError);
    expect(() => checkDownloadUrl('http://youtubereporting.googleapis.com/x')).toThrow(ReportingError);
  });

  it('aggregates stored days within the range only', () => {
    const snaps = [
      { data: { date: '2026-10-01', v: { [V1]: [100, 10] } } },
      { data: { date: '2026-10-10', v: { [V1]: [300, 3], [V2]: [0, 0] } } },
      { data: { date: '2026-09-01', v: { [V1]: [9999, 9999] } } },
    ];
    const r = aggregateReach(snaps, { startDate: '2026-10-01', endDate: '2026-10-20' });
    expect(r.days).toBe(2);
    expect(r.first).toBe('2026-10-01');
    expect(r.rows).toEqual([{ videoId: V1, impressions: 400, ctr: 13 / 400 }]);
    expect(r.ctr).toBeCloseTo(13 / 400);
    expect(aggregateReach([], { startDate: '2026-10-01', endDate: '2026-10-20' })).toMatchObject({ days: 0, impressions: null, ctr: null });
  });

  it('maps errors to a human reason', () => {
    expect(reasonKey(errorKind(new YtError('bad-request', '400 badRequest The query is not supported.')))).toBe('reports.err.unsupported');
    expect(reasonKey(errorKind(new AuthError('expired')))).toBe('reports.err.signin');
    expect(reasonKey(errorKind(new ReportingError('no-report-type')))).toBe('reports.err.reporting.no-report-type');
    expect(reasonKey(errorKind(new Error('x')))).toBe('reports.err.generic');
  });

  it('syncs at most every 6 hours', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    expect(reachDue({ enabled: true }, now)).toBe(true);
    expect(reachDue({ enabled: true, lastSyncAt: '2026-10-21T08:00:00Z' }, now)).toBe(false);
    expect(reachDue({ enabled: true, lastSyncAt: '2026-10-21T05:00:00Z' }, now)).toBe(true);
    expect(reachDue({ enabled: false }, now)).toBe(false);
  });
});

describe('reach job and report flow', () => {
  let allowed = true;
  beforeEach(async () => {
    fakeBrowser.reset();
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
    await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
    allowed = true;
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation((async () => allowed) as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A fake Reporting API. `reports` is what jobs.reports.list returns; `files` maps report id → CSV. */
  function api(opts: { jobs?: unknown[]; reports?: Record<string, unknown>[]; files?: Record<string, string | number> }) {
    const calls: { method: string; url: URL; auth: string | null; body?: string }[] = [];
    const fn = vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const headers = new Headers(init.headers);
      calls.push({ method: init.method ?? 'GET', url, auth: headers.get('Authorization'), body: init.body as string | undefined });
      const p = url.pathname;
      if (p === '/v1/reportTypes') return json({ reportTypes: [{ id: 'channel_basic_a2' }, { id: 'channel_reach_basic_a1', name: 'Reach' }] });
      if (p === '/v1/jobs' && init.method === 'POST') return json({ id: 'job-new', reportTypeId: JSON.parse(String(init.body)).reportTypeId, createTime: '2026-10-21T08:00:00Z' });
      if (p === '/v1/jobs') return json({ jobs: opts.jobs ?? [] });
      if (/^\/v1\/jobs\/[^/]+\/reports$/.test(p)) {
        const after = url.searchParams.get('createdAfter');
        return json({ reports: (opts.reports ?? []).filter((r) => !after || String(r.createTime) > after) });
      }
      if (p.startsWith('/v1/media/')) {
        const id = p.split('/').pop()!;
        const f = opts.files?.[id];
        if (typeof f === 'number') return json({ error: { message: 'boom', errors: [{ reason: 'backendError' }] } }, f);
        return new Response(f ?? '', { status: 200, headers: { 'Content-Type': 'text/csv' } });
      }
      return json({ error: { message: 'unexpected' } }, 404);
    });
    vi.stubGlobal('fetch', fn);
    return calls;
  }
  const rep = (id: string, createTime: string, startTime = '2026-10-19T07:00:00Z') => ({ id, jobId: 'job-new', createTime, startTime, endTime: startTime, downloadUrl: `${MEDIA}${id}?alt=media` });

  it('creates a job for the reach report type with the OAuth token', async () => {
    const calls = api({});
    const s = await startReach(CH, new Date('2026-10-21T08:00:00Z'));
    expect(s).toMatchObject({ jobId: 'job-new', reportTypeId: 'channel_reach_basic_a1', jobCreatedAt: '2026-10-21T08:00:00Z', enabled: true });
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url.toString()).toBe('https://youtubereporting.googleapis.com/v1/jobs');
    expect(JSON.parse(post.body!)).toMatchObject({ reportTypeId: 'channel_reach_basic_a1' });
    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true);
    expect((await getReachState(CH))?.jobId).toBe('job-new');
  });

  it('reuses an existing job instead of creating a second one', async () => {
    const calls = api({ jobs: [{ id: 'job-old', reportTypeId: 'channel_reach_basic_a1', createTime: '2026-10-01T00:00:00Z' }] });
    const s = await startReach(CH);
    expect(s.jobId).toBe('job-old');
    expect(s.jobCreatedAt).toBe('2026-10-01T00:00:00Z');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('refuses to start without host access, and says when YouTube offers no reach report', async () => {
    allowed = false;
    api({});
    await expect(startReach(CH)).rejects.toMatchObject({ code: 'permission' });
    allowed = true;
    vi.stubGlobal('fetch', vi.fn(async () => json({ reportTypes: [{ id: 'channel_basic_a2' }] })));
    await expect(startReach(CH)).rejects.toMatchObject({ code: 'no-report-type' });
  });

  it('downloads new reports, stores one snapshot per day, keeps the newest version and advances the cursor', async () => {
    const files = {
      r1: csv([['20261019', CH, V1, 'on_demand', 'subscribed', 'IR', 1000, 0.05]]),
      r2: csv([['20261020', CH, V1, 'on_demand', 'subscribed', 'IR', 500, 0.1]]),
      // A regenerated report for 19 October (newer createTime) replaces r1's numbers.
      r3: csv([['20261019', CH, V1, 'on_demand', 'subscribed', 'IR', 2000, 0.05]]),
    };
    let calls = api({ reports: [rep('r2', '2026-10-21T02:00:00Z'), rep('r1', '2026-10-20T02:00:00Z'), rep('r3', '2026-10-21T03:00:00Z')], files });
    await startReach(CH);
    const r = await syncReach(CH, new Date('2026-10-21T12:00:00Z'));
    expect(r).toMatchObject({ files: 3, days: 3, more: false });
    const media = calls.filter((c) => c.url.pathname.startsWith('/v1/media/')).map((c) => c.url.pathname.split('/').pop());
    expect(media).toEqual(['r1', 'r2', 'r3']);
    const snaps = await history(reachRef(CH));
    expect(snaps.map((s) => s.id)).toEqual([`${reachRef(CH)}:2026-10-19`, `${reachRef(CH)}:2026-10-20`]);
    const agg = await loadReach(CH, { startDate: '2026-10-01', endDate: '2026-10-21' });
    expect(agg.rows).toEqual([{ videoId: V1, impressions: 2500, ctr: (100 + 50) / 2500 }]);
    const st = await getReachState(CH);
    expect(st).toMatchObject({ cursor: '2026-10-21T03:00:00Z', lastSyncAt: '2026-10-21T12:00:00.000Z', lastError: undefined });

    // Next sync lists only reports created after the cursor.
    calls = api({ reports: [rep('r1', '2026-10-20T02:00:00Z')], files });
    const again = await syncReach(CH);
    expect(again.files).toBe(0);
    expect(calls.find((c) => c.url.pathname.endsWith('/reports'))!.url.searchParams.get('createdAfter')).toBe('2026-10-21T03:00:00Z');
  });

  it('stores an empty report as a covered day and stops at a failed download without skipping it', async () => {
    api({
      reports: [rep('e1', '2026-10-20T02:00:00Z', '2026-10-18T07:00:00Z'), rep('bad', '2026-10-21T02:00:00Z'), rep('r9', '2026-10-21T05:00:00Z')],
      files: { e1: csv([]), bad: 500, r9: csv([['20261020', CH, V2, 'x', 'y', 'IR', 10, 0.5]]) },
    });
    await startReach(CH);
    await expect(syncReach(CH)).rejects.toBeInstanceOf(YtError);
    const st = await getReachState(CH);
    expect(st?.cursor).toBe('2026-10-20T02:00:00Z');
    expect(st?.lastError).toBe('server');
    const snaps = await history(reachRef(CH));
    expect(snaps.map((s) => s.data.date)).toEqual(['2026-10-18']);
    const agg = await loadReach(CH, { startDate: '2026-10-01', endDate: '2026-10-21' });
    expect(agg).toMatchObject({ days: 1, rows: [], impressions: 0, ctr: null });
  });

  it('refuses download URLs on other hosts', async () => {
    api({ reports: [{ ...rep('r1', '2026-10-20T02:00:00Z'), downloadUrl: 'https://example.com/r1' }] });
    await startReach(CH);
    await expect(syncReach(CH)).rejects.toMatchObject({ code: 'bad-url' });
  });

  it('background tick syncs due channels and skips recently synced ones', async () => {
    const calls = api({ reports: [rep('r1', '2026-10-20T02:00:00Z')], files: { r1: csv([['20261019', CH, V1, 'x', 'y', 'IR', 100, 0.1]]) } });
    await startReach(CH);
    expect(await reachTick(new Date('2026-10-21T12:00:00Z'))).toBe(1);
    const n = calls.length;
    expect(await reachTick(new Date('2026-10-21T13:00:00Z'))).toBe(0);
    expect(calls.length).toBe(n);
  });

  it('RPC returns a video’s stored impressions/CTR and validates arguments', async () => {
    api({ reports: [rep('r1', '2026-10-20T02:00:00Z')], files: { r1: csv([[new Date().toISOString().slice(0, 10).replaceAll('-', ''), CH, V1, 'x', 'y', 'IR', 400, 0.05]]) } });
    await startReach(CH);
    await syncReach(CH);
    await expect(reportsMethods['reports.reachVideo']!(CH, V1, 28)).resolves.toMatchObject({ started: true, days: 1, impressions: 400, ctr: 0.05 });
    await expect(reportsMethods['reports.reachVideo']!(CH, V2, 28)).resolves.toMatchObject({ impressions: null, ctr: null });
    await expect(reportsMethods['reports.reachVideo']!('nope', V1, 28)).rejects.toThrow('bad argument');
    await expect(reportsMethods['reports.reachVideo']!(CH, '<script>', 28)).rejects.toThrow('bad argument');
  });
});
