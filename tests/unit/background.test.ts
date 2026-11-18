import { beforeEach, describe, expect, it } from 'vitest';
import { JOB_HANDLERS } from '../../src/background/jobs';
import { cancelJob, runDue, scheduleJob } from '../../src/background/scheduler';
import { AuthError } from '../../src/integrations/google/auth';
import { YtError } from '../../src/integrations/youtube/client';
import { deserializeError, isRpcRequest, RPC, serializeError } from '../../src/platform/rpc';
import { openDb, resetDbForTests } from '../../src/storage/db';
import { all, history, one, snapshot } from '../../src/storage/stores';

beforeEach(async () => {
  await resetDbForTests();
  indexedDB.deleteDatabase('tubex');
  await openDb();
});

describe('rpc envelope', () => {
  it('accepts only well-formed requests', () => {
    expect(isRpcRequest({ type: RPC, method: 'yt.videos', args: [] })).toBe(true);
    expect(isRpcRequest({ type: RPC, method: 'x', args: 'nope' })).toBe(false);
    expect(isRpcRequest({ type: 'other', method: 'x', args: [] })).toBe(false);
    expect(isRpcRequest(null)).toBe(false);
  });
  it('keeps error class and code across the boundary', () => {
    const yt = deserializeError(serializeError(new YtError('quota', 'd')));
    expect(yt).toBeInstanceOf(YtError);
    expect((yt as YtError).code).toBe('quota');
    const auth = deserializeError(serializeError(new AuthError('expired')));
    expect(auth).toBeInstanceOf(AuthError);
    expect(serializeError(new Error('boom'))).toEqual({ kind: 'other', code: 'generic', detail: 'boom' });
  });
});

describe('scheduler', () => {
  it('runs due jobs once, records the result and raises an alert', async () => {
    let runs = 0;
    JOB_HANDLERS['test.ok'] = async () => {
      runs++;
      return 'updated 1 video';
    };
    const job = await scheduleJob({ kind: 'test.ok', runAt: new Date(Date.now() - 1000).toISOString(), payload: {}, label: 'Update' });
    await runDue();
    await runDue();
    expect(runs).toBe(1);
    expect((await one('jobs', job.id))?.status).toBe('done');
    expect((await all('alerts')).map((a) => a.body)).toEqual(['updated 1 video']);
  });

  it('does not run future or canceled jobs', async () => {
    JOB_HANDLERS['test.never'] = async () => {
      throw new Error('should not run');
    };
    await scheduleJob({ kind: 'test.never', runAt: new Date(Date.now() + 3600_000).toISOString(), payload: {}, label: 'Later' });
    const c = await scheduleJob({ kind: 'test.never', runAt: new Date(Date.now() - 1000).toISOString(), payload: {}, label: 'Canceled' });
    await cancelJob(c.id);
    await runDue();
    expect((await all('jobs')).map((j) => j.status).sort()).toEqual(['canceled', 'pending']);
  });

  it('marks failures, retries transient errors and reschedules recurring jobs', async () => {
    JOB_HANDLERS['test.fail'] = async () => {
      throw new YtError('quota');
    };
    JOB_HANDLERS['test.flaky'] = async () => {
      throw new YtError('unreachable');
    };
    JOB_HANDLERS['test.every'] = async () => 'checked';
    const past = new Date(Date.now() - 1000).toISOString();
    const f = await scheduleJob({ kind: 'test.fail', runAt: past, payload: {}, label: 'Fail' });
    const fl = await scheduleJob({ kind: 'test.flaky', runAt: past, payload: {}, label: 'Flaky' });
    const ev = await scheduleJob({ kind: 'test.every', runAt: past, payload: {}, label: 'Every', everyMinutes: 60 });
    await runDue();
    expect((await one('jobs', f.id))?.status).toBe('failed');
    expect((await one('jobs', fl.id))?.status).toBe('pending');
    const every = await one('jobs', ev.id);
    expect(every?.status).toBe('pending');
    expect(Date.parse(every!.runAt)).toBeGreaterThan(Date.now() + 50 * 60_000);
  });

  it('rejects unknown kinds and bad dates', async () => {
    await expect(scheduleJob({ kind: 'nope', runAt: new Date().toISOString(), payload: {}, label: 'x' })).rejects.toThrow();
    JOB_HANDLERS['test.ok2'] = async () => '';
    await expect(scheduleJob({ kind: 'test.ok2', runAt: 'not a date', payload: {}, label: 'x' })).rejects.toThrow();
  });
});

describe('snapshots', () => {
  it('keeps one snapshot per ref per day, sorted by time', async () => {
    await snapshot('rank:a', { position: 5 }, new Date('2026-10-01T10:00:00Z'));
    await snapshot('rank:a', { position: 4 }, new Date('2026-10-01T20:00:00Z'));
    await snapshot('rank:a', { position: 3 }, new Date('2026-10-02T10:00:00Z'));
    await snapshot('rank:b', { position: 9 }, new Date('2026-10-02T10:00:00Z'));
    expect((await history('rank:a')).map((s) => s.data.position)).toEqual([4, 3]);
  });
});
