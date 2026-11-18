// Scheduled work in the background service worker. Jobs live in IndexedDB ('jobs'); each pending job has a
// chrome.alarms alarm, and a 15-minute tick re-checks everything in case an alarm was lost (browser closed,
// worker restarted). Jobs only run while the browser is open; the UI says so where jobs are created.
import { browser } from 'wxt/browser';
import { addAlert, all, newId, one, put, type Job } from '../storage/stores';
import { serializeError } from '../platform/rpc';
import { JOB_HANDLERS, TICKS } from './jobs';
import { AUTH_ALARM, renewDue } from '../integrations/google/auth';

export const TICK = 'tubex-tick';
const PREFIX = 'job:';

export async function scheduleJob(input: Omit<Job, 'id' | 'status' | 'createdAt'>): Promise<Job> {
  if (!JOB_HANDLERS[input.kind]) throw new Error(`unknown job kind ${input.kind}`);
  const runAt = new Date(input.runAt);
  if (Number.isNaN(runAt.getTime())) throw new Error('bad runAt');
  const job: Job = { ...input, runAt: runAt.toISOString(), id: newId(), status: 'pending', createdAt: new Date().toISOString(), attempts: 0 };
  await put('jobs', job);
  await browser.alarms.create(PREFIX + job.id, { when: Math.max(Date.now() + 1000, runAt.getTime()) });
  return job;
}

export async function cancelJob(id: string): Promise<void> {
  const j = await one('jobs', id);
  if (j && (j.status === 'pending' || j.status === 'failed')) await put('jobs', { ...j, status: 'canceled', finishedAt: new Date().toISOString() });
  await browser.alarms.clear(PREFIX + id);
}

export async function notify(title: string, message: string, url?: string): Promise<void> {
  try {
    await browser.notifications.create(url ? `url:${url}` : `n:${newId()}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: title.slice(0, 120),
      message: message.slice(0, 300),
    });
  } catch {
    /* notifications may be blocked by the OS; the in-app alert inbox still has it */
  }
}

let running = false;
export async function runDue(now = Date.now()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = (await all('jobs')).filter((j) => j.status === 'pending' && Date.parse(j.runAt) <= now).sort((a, b) => a.runAt.localeCompare(b.runAt));
    for (const job of due) await runJob(job);
  } finally {
    running = false;
  }
}

async function runJob(job: Job): Promise<void> {
  const handler = JOB_HANDLERS[job.kind];
  await put('jobs', { ...job, status: 'running', attempts: (job.attempts ?? 0) + 1 });
  try {
    const result = handler ? await handler(job) : 'no handler';
    const finishedAt = new Date().toISOString();
    if (job.everyMinutes && job.everyMinutes >= 15) {
      const next = new Date(Date.now() + job.everyMinutes * 60_000).toISOString();
      await put('jobs', { ...job, status: 'pending', runAt: next, result, finishedAt });
      await browser.alarms.create(PREFIX + job.id, { when: Date.parse(next) });
    } else {
      await put('jobs', { ...job, status: 'done', result, finishedAt });
      await addAlert({ kind: 'job', title: job.label, body: result });
      await notify(job.label, result);
    }
  } catch (e) {
    const err = serializeError(e);
    const text = `${err.kind}:${err.code}${err.detail ? ` — ${err.detail}` : ''}`;
    // Network or expired sign-in: retry on the next tick, up to 3 attempts.
    const retry = (err.code === 'unreachable' || err.code === 'expired') && (job.attempts ?? 0) < 2;
    await put('jobs', { ...job, status: retry ? 'pending' : 'failed', result: text, finishedAt: new Date().toISOString(), attempts: (job.attempts ?? 0) + 1 });
    if (!retry) {
      await addAlert({ kind: 'job-failed', title: job.label, body: text });
      await notify(job.label, text);
    }
  }
}

export async function onAlarm(name: string): Promise<void> {
  if (name === AUTH_ALARM) {
    await renewDue();
    return;
  }
  if (name === TICK) {
    // Safety net for Google sign-in renewal (the one-shot auth alarm can be lost when the browser closes).
    await renewDue().catch(() => undefined);
    await runDue();
    for (const tick of TICKS) await tick(new Date()).catch((e) => console.warn('[TubeX] tick failed', e));
    return;
  }
  if (name.startsWith(PREFIX)) await runDue();
}

const AUTH_BOOT = 'authBootDone';

export async function ensureTick(): Promise<void> {
  if (!(await browser.alarms.get(TICK))) await browser.alarms.create(TICK, { periodInMinutes: 15, delayInMinutes: 1 });
  // First worker start of a browser session (session storage is empty after a restart): renew every
  // connected channel's Google sign-in silently, so tools never start with an expired token.
  try {
    if (!(await browser.storage.session.get(AUTH_BOOT))[AUTH_BOOT]) {
      await browser.storage.session.set({ [AUTH_BOOT]: true });
      void renewDue().catch(() => undefined);
    }
  } catch {
    /* session storage unavailable: the tick renews */
  }
}
