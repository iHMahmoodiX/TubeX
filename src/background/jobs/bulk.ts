// Bulk find & replace on published videos as a persisted background job (kinds prefixed 'bulk.').
//
// State lives in the IndexedDB work stores, so closing the TubeX tab does not stop a run:
// - snapshots `bulk.job:<id>` (ref 'bulk.job'): the job (operation, status, phase);
// - snapshots `bulk.item:<id>:<videoId>` (ref `bulk.item:<id>`): one row per video with the exact snippet
//   before and after the write (the undo record; never capped), skip reason or error;
// - snapshots `bulk.ctl:<id>`: pause/cancel requests from the page, read before every video.
// Writes are sequential: fresh videos.list → plan → limits check → videos.update (1 + 50 units). Transient
// errors (5xx, 429, rateLimitExceeded, network) back off and retry; quotaExceeded or the local daily cap make
// the job wait for the Pacific-midnight reset and continue by itself (a 'bulk.continue' scheduler job plus the
// 15-minute tick as a safety net). Sign-in or permission problems stop the job until the owner resumes it.
import { browser } from 'wxt/browser';
import {
  compileOp,
  countItems,
  needsWork,
  nextPacificMidnight,
  planVideo,
  sameSnippet,
  UNITS_PER_VIDEO,
  type BulkItem,
  type BulkJob,
  type FrOp,
  type FrRun,
  type JobError,
  type Snip,
  type UndoState,
} from '../../domain/bulk';
import { en, type MessageKey } from '../../i18n/en';
import { fa } from '../../i18n/fa';
import { AuthError } from '../../integrations/google/auth';
import { updateVideo } from '../../integrations/google/own';
import { YtError } from '../../integrations/youtube/client';
import { serializeError } from '../../platform/rpc';
import { loadIntegrations, loadUsage } from '../../storage/integrations';
import { loadPrefs } from '../../storage/prefs';
import { addAlert, byIndex, del, newId, one, put } from '../../storage/stores';
import type { JobHandler, Tick } from './index';

export const JOB_REF = 'bulk.job';
const jobKey = (id: string) => `${JOB_REF}:${id}`;
export const itemRef = (id: string) => `bulk.item:${id}`;
const itemKey = (id: string, videoId: string) => `${itemRef(id)}:${videoId}`;
const ctlKey = (id: string) => `bulk.ctl:${id}`;
/** A running job whose heartbeat is older than this was cut off (browser closed, worker restarted). */
export const STALE_MS = 3 * 60_000;
/** Minutes after the Pacific-midnight reset before a waiting job continues. */
const RESET_SLACK_MS = 10 * 60_000;
const GAP_MS = 300;
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

// ---- storage ----
export async function loadJob(id: string): Promise<BulkJob | undefined> {
  return (await one('snapshots', jobKey(id)))?.data as BulkJob | undefined;
}
export async function saveJob(j: BulkJob): Promise<void> {
  await put('snapshots', { id: jobKey(j.id), ref: JOB_REF, at: j.createdAt, data: j as unknown as Record<string, unknown> });
}
export async function listJobs(): Promise<BulkJob[]> {
  return (await byIndex('snapshots', 'ref', JOB_REF)).map((s) => s.data as unknown as BulkJob).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function loadItems(id: string): Promise<BulkItem[]> {
  return (await byIndex('snapshots', 'ref', itemRef(id))).map((s) => s.data as unknown as BulkItem).sort((a, b) => a.n - b.n);
}
async function saveItem(i: BulkItem): Promise<void> {
  await put('snapshots', { id: itemKey(i.jobId, i.videoId), ref: itemRef(i.jobId), at: i.at ?? new Date().toISOString(), data: i as unknown as Record<string, unknown> });
}
type Ctl = { request: 'pause' | 'cancel' };
async function loadCtl(id: string): Promise<Ctl | undefined> {
  return (await one('snapshots', ctlKey(id)))?.data as Ctl | undefined;
}
async function setCtl(id: string, request: Ctl['request'] | null): Promise<void> {
  if (request) await put('snapshots', { id: ctlKey(id), ref: 'bulk.ctl', at: new Date().toISOString(), data: { request } });
  else await del('snapshots', ctlKey(id));
}

// ---- text for notifications ----
async function tr(key: MessageKey, vars: Record<string, string | number> = {}): Promise<string> {
  const lang = (await loadPrefs()).uiLanguage;
  const tpl = (lang === 'fa' ? fa : en)[key] ?? en[key];
  const num = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { useGrouping: false });
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : typeof vars[k] === 'number' ? num.format(vars[k] as number) : String(vars[k])));
}
async function when(iso: string): Promise<string> {
  const lang = (await loadPrefs()).uiLanguage;
  return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
async function announce(job: BulkJob, body: string, failed = false): Promise<void> {
  await addAlert({ kind: failed ? 'job-failed' : 'job', title: job.label, body, url: browser.runtime.getURL('/workspace.html#bulk' as '/workspace.html') }).catch(() => undefined);
  try {
    await browser.notifications.create(`url:${browser.runtime.getURL('/workspace.html#bulk' as '/workspace.html')}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: job.label.slice(0, 120),
      message: body.slice(0, 300),
    });
  } catch {
    /* notifications may be blocked by the OS; the alert inbox has it */
  }
}

// ---- error handling ----
export type ErrorClass = 'transient' | 'quota' | 'budget' | 'stop' | 'item';

export function classify(e: unknown): ErrorClass {
  if (e instanceof AuthError) return 'stop';
  if (e instanceof YtError) {
    const d = e.detail ?? '';
    const status = Number(/^\d{3}/.exec(d)?.[0] ?? 0);
    switch (e.code) {
      case 'quota':
        return /rateLimitExceeded|userRateLimitExceeded/i.test(d) ? 'transient' : 'quota';
      case 'budget':
        return 'budget';
      case 'unreachable':
        return 'transient';
      case 'server':
        return status === 429 || status >= 500 || status === 0 ? 'transient' : 'item';
      case 'permission':
        return 'stop';
      case 'forbidden':
        return /insufficientPermissions|SCOPE_INSUFFICIENT|youtubeSignupRequired/i.test(d) ? 'stop' : 'item';
      default:
        return 'item';
    }
  }
  return 'item';
}

const toJobError = (e: unknown): JobError => serializeError(e);

export interface RunDeps {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}
export const realDeps: RunDeps = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() };

async function withBackoff<T>(fn: () => Promise<T>, deps: RunDeps): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (classify(e) !== 'transient' || attempt >= BACKOFF_MS.length) throw e;
      await deps.sleep(BACKOFF_MS[attempt]! + Math.floor(Math.random() * 500));
    }
  }
}

/** Units left today under the local cap (null = no local cap). */
async function budgetLeft(): Promise<number | null> {
  const [{ youtube }, u] = await Promise.all([loadIntegrations(), loadUsage()]);
  return youtube.dailyUnitCap > 0 ? youtube.dailyUnitCap - u.ytUnits : null;
}

// ---- one video ----
async function applyOne(job: BulkJob, item: BulkItem, run: FrRun): Promise<void> {
  let plan: ReturnType<typeof planVideo> | null = null;
  let resumed = false;
  const res = await updateVideo(
    job.channelId,
    item.videoId,
    (cur) => {
      // A write whose response was lost last time: the video already holds what we sent.
      if (item.attempt && sameSnippet(cur, item.attempt.after) && !sameSnippet(cur, item.attempt.before)) {
        resumed = true;
        return cur;
      }
      plan = planVideo(cur, run);
      return plan.status === 'change' ? plan.next : cur;
    },
    {
      withLocalizations: true,
      beforeWrite: async (before, after) => {
        item.attempt = { before, after };
        await saveItem(item);
      },
    },
  );
  const at = new Date().toISOString();
  if (res) {
    Object.assign(item, { state: 'written', before: res.before, after: res.after, count: plan!.count, at, localizations: res.localizations });
  } else if (resumed && item.attempt) {
    Object.assign(item, { state: 'written', before: item.attempt.before, after: item.attempt.after, at });
  } else {
    const p = plan as ReturnType<typeof planVideo> | null;
    const reason = p?.status === 'invalid' ? 'limit' : p?.status === 'end-missing' ? 'end-missing' : 'no-match';
    Object.assign(item, { state: 'skipped', reason, problems: p?.problems.length ? p.problems : undefined, count: p?.count, at });
  }
  delete item.attempt;
  delete item.error;
}

async function undoItem(job: BulkJob, item: BulkItem, force: boolean): Promise<UndoState> {
  const before = item.before;
  const wrote = item.after;
  if (!before || !wrote) return 'same';
  let outcome: UndoState = 'same';
  let current: Snip | undefined;
  await updateVideo(job.channelId, item.videoId, (cur) => {
    if (sameSnippet(cur, before)) {
      outcome = 'same';
      return cur;
    }
    if (force || sameSnippet(cur, wrote)) {
      outcome = 'restored';
      return before;
    }
    outcome = 'conflict';
    current = cur;
    return cur;
  });
  item.undo = outcome;
  item.undoAt = new Date().toISOString();
  if (current) item.current = current;
  else delete item.current;
  delete item.undoError;
  return outcome;
}

// ---- the run loop ----
const active = new Map<string, Promise<string>>();
export const isRunningHere = (id: string) => active.has(id);

/** Starts the loop for a job unless it already runs in this worker. Never throws. */
export function kick(id: string, deps: RunDeps = realDeps): Promise<string> {
  const cur = active.get(id);
  if (cur) return cur;
  const p = runJob(id, deps)
    .catch((e) => {
      console.warn('[TubeX] bulk job failed', e);
      return '';
    })
    .finally(() => active.delete(id));
  active.set(id, p);
  return p;
}

async function scheduleContinue(job: BulkJob, at: number): Promise<void> {
  const runAt = new Date(at).toISOString();
  const id = newId();
  await put('jobs', { id, kind: 'bulk.continue', runAt, payload: { jobId: job.id }, status: 'pending', label: job.label, channelId: job.channelId, createdAt: new Date().toISOString(), attempts: 0 });
  try {
    await browser.alarms.create(`job:${id}`, { when: at });
  } catch {
    /* the 15-minute tick still runs it */
  }
}

async function waitForReset(job: BulkJob, why: 'budget' | 'quota', e: unknown, deps: RunDeps): Promise<string> {
  const at = nextPacificMidnight(deps.now()) + RESET_SLACK_MS;
  Object.assign(job, { status: 'waiting', waitReason: why, nextRunAt: new Date(at).toISOString(), error: e ? toJobError(e) : undefined });
  await saveJob(job);
  await scheduleContinue(job, at);
  const c = countItems(await loadItems(job.id));
  const left = job.phase === 'apply' ? c.pending : c.undoPending;
  const msg = await tr('fr.n.waiting', { done: job.phase === 'apply' ? c.written : c.restored, left, time: await when(job.nextRunAt!) });
  await announce(job, msg);
  return msg;
}

async function stopJob(job: BulkJob, e: unknown): Promise<string> {
  Object.assign(job, { status: 'stopped', error: toJobError(e) });
  await saveJob(job);
  const msg = await tr(e instanceof AuthError ? 'fr.n.stoppedAuth' : 'fr.n.stopped');
  await announce(job, msg, true);
  return msg;
}

async function runJob(id: string, deps: RunDeps): Promise<string> {
  const job = await loadJob(id);
  if (!job || job.status !== 'running') return '';
  let run: FrRun | null = null;
  if (job.phase === 'apply') {
    const c = compileOp(job.op);
    if (!c.ok) return stopJob(job, new Error(`operation: ${c.error}`));
    run = c.run;
  }
  const items = await loadItems(id);
  let serverFailures = 0;
  let first = true;
  for (const item of items) {
    if (!needsWork(item, job.phase)) continue;
    const ctl = await loadCtl(id);
    if (ctl) {
      await setCtl(id, null);
      Object.assign(job, { status: ctl.request === 'pause' ? 'paused' : 'canceled', finishedAt: ctl.request === 'cancel' ? new Date(deps.now()).toISOString() : undefined });
      await saveJob(job);
      return tr(ctl.request === 'pause' ? 'fr.n.paused' : 'fr.n.canceled');
    }
    const left = await budgetLeft();
    if (left !== null && left < UNITS_PER_VIDEO) return waitForReset(job, 'budget', null, deps);
    if (!first) await deps.sleep(GAP_MS);
    first = false;
    job.heartbeatAt = new Date(deps.now()).toISOString();
    if (job.status !== 'running' || job.waitReason) Object.assign(job, { status: 'running', waitReason: undefined, nextRunAt: undefined });
    await saveJob(job);
    try {
      if (job.phase === 'apply') await withBackoff(() => applyOne(job, item, run!), deps);
      else await withBackoff(() => undoItem(job, item, item.undo === 'force'), deps);
      serverFailures = 0;
      await saveItem(item);
    } catch (e) {
      const k = classify(e);
      if (k === 'quota' || k === 'budget') return waitForReset(job, k, e, deps);
      if (k === 'stop' || (k === 'transient' && !(e instanceof YtError && e.code === 'server'))) return stopJob(job, e);
      // This video only (not found, rejected, forbidden for this video, server error after retries).
      if (job.phase === 'apply') Object.assign(item, { state: 'failed', error: toJobError(e), at: new Date(deps.now()).toISOString() });
      else Object.assign(item, { undo: 'failed', undoError: toJobError(e), undoAt: new Date(deps.now()).toISOString() });
      await saveItem(item);
      if (k === 'transient' && ++serverFailures >= 3) return stopJob(job, e);
    }
  }
  const c = countItems(await loadItems(id));
  Object.assign(job, { status: 'done', finishedAt: new Date(deps.now()).toISOString(), error: undefined, waitReason: undefined, nextRunAt: undefined });
  await saveJob(job);
  const msg =
    job.phase === 'apply'
      ? await tr('fr.n.done', { written: c.written, skipped: c.skipped, failed: c.failed })
      : await tr('fr.n.undone', { restored: c.restored, conflict: c.conflict, failed: c.undoFailed });
  await announce(job, msg, c.failed + c.undoFailed > 0);
  return msg;
}

// ---- commands (called by the RPC methods) ----
export interface StartInput {
  channelId: string;
  channelTitle?: string;
  label: string;
  op: FrOp;
  videos: { id: string; title: string }[];
  test?: boolean;
}

export async function startJob(input: StartInput, deps: RunDeps = realDeps): Promise<BulkJob> {
  const busy = (await listJobs()).find((j) => j.status === 'running' || j.status === 'waiting');
  if (busy) throw new Error('busy');
  const c = compileOp(input.op);
  if (!c.ok) throw new Error('bad argument');
  const job: BulkJob = {
    id: newId(),
    channelId: input.channelId,
    channelTitle: input.channelTitle,
    label: input.label,
    op: input.op,
    createdAt: new Date(deps.now()).toISOString(),
    status: 'running',
    phase: 'apply',
    total: input.videos.length,
    test: input.test || undefined,
  };
  let n = 0;
  for (const v of input.videos) await saveItem({ jobId: job.id, videoId: v.id, n: n++, title: v.title, state: 'pending' });
  await saveJob(job);
  void kick(job.id, deps);
  return job;
}

export type Command = 'pause' | 'resume' | 'cancel' | 'retry' | 'undo' | 'undoConflicts' | 'forget';

/** Owner actions on a job. Returns the job as it is afterwards (undefined after 'forget'). */
export async function command(id: string, cmd: Command, deps: RunDeps = realDeps): Promise<BulkJob | undefined> {
  const job = await loadJob(id);
  if (!job) throw new Error('not found');
  const live = isRunningHere(id);
  const stale = job.status === 'running' && !live;
  switch (cmd) {
    case 'pause':
    case 'cancel':
      if (job.status === 'running' && live) {
        await setCtl(id, cmd);
        return job;
      }
      if (job.status === 'running' || job.status === 'waiting' || job.status === 'stopped' || job.status === 'paused') {
        Object.assign(job, { status: cmd === 'pause' ? 'paused' : 'canceled', finishedAt: cmd === 'cancel' ? new Date(deps.now()).toISOString() : job.finishedAt });
        await saveJob(job);
      }
      return job;
    case 'resume':
      if (job.status === 'running' && live) return job;
      if (!['paused', 'stopped', 'waiting', 'running'].includes(job.status) && !stale) return job;
      await setCtl(id, null);
      Object.assign(job, { status: 'running', error: undefined, waitReason: undefined, nextRunAt: undefined });
      await saveJob(job);
      void kick(id, deps);
      return job;
    case 'retry': {
      if (job.status === 'running' || job.status === 'waiting') throw new Error('busy');
      for (const i of await loadItems(id)) {
        if (job.phase === 'apply' && i.state === 'failed') await saveItem({ ...i, state: 'pending', error: undefined });
        if (job.phase === 'undo' && i.undo === 'failed') await saveItem({ ...i, undo: 'pending', undoError: undefined });
      }
      Object.assign(job, { status: 'running', error: undefined, finishedAt: undefined });
      await saveJob(job);
      void kick(id, deps);
      return job;
    }
    case 'undo':
    case 'undoConflicts': {
      if (job.status === 'running' || job.status === 'waiting') throw new Error('busy');
      if ((await listJobs()).some((j) => j.id !== id && (j.status === 'running' || j.status === 'waiting'))) throw new Error('busy');
      let n = 0;
      for (const i of await loadItems(id)) {
        if (i.state !== 'written') continue;
        if (cmd === 'undo' && (i.undo === undefined || i.undo === 'failed')) {
          await saveItem({ ...i, undo: 'pending', undoError: undefined });
          n++;
        } else if (cmd === 'undoConflicts' && i.undo === 'conflict') {
          await saveItem({ ...i, undo: 'force' });
          n++;
        }
      }
      if (!n) return job;
      Object.assign(job, { status: 'running', phase: 'undo', error: undefined, finishedAt: undefined });
      await saveJob(job);
      void kick(id, deps);
      return job;
    }
    case 'forget':
      if (job.status === 'running' || job.status === 'waiting') throw new Error('busy');
      for (const i of await loadItems(id)) await del('snapshots', itemKey(id, i.videoId));
      await del('snapshots', ctlKey(id));
      await del('snapshots', jobKey(id));
      return undefined;
  }
}

/** Undoes one video now (also used for "overwrite anyway" on a conflict). */
export async function undoOne(id: string, videoId: string, force: boolean): Promise<BulkItem> {
  const job = await loadJob(id);
  if (!job) throw new Error('not found');
  const item = (await one('snapshots', itemKey(id, videoId)))?.data as BulkItem | undefined;
  if (!item || item.state !== 'written') throw new Error('not found');
  try {
    await undoItem(job, item, force);
  } catch (e) {
    item.undo = 'failed';
    item.undoError = toJobError(e);
    item.undoAt = new Date().toISOString();
    await saveItem(item);
    throw e;
  }
  await saveItem(item);
  return item;
}

// ---- scheduler integration ----
/** Scheduled continuation after the quota reset. Starts the loop and returns at once (no blocking). */
const continueJob: JobHandler = async (j) => {
  const id = typeof j.payload.jobId === 'string' && j.payload.jobId.length <= 64 ? j.payload.jobId : '';
  const job = id ? await loadJob(id) : undefined;
  if (!job || job.status !== 'waiting') return tr('fr.n.nothing');
  Object.assign(job, { status: 'running', waitReason: undefined, nextRunAt: undefined });
  await saveJob(job);
  void kick(id);
  const c = countItems(await loadItems(id));
  return tr('fr.n.continuing', { n: job.phase === 'apply' ? c.pending : c.undoPending });
};

/** Safety net every 15 minutes: continue waiting jobs whose time came and runs cut off by a worker restart. */
export async function recover(now = Date.now(), deps: RunDeps = realDeps): Promise<string[]> {
  const kicked: string[] = [];
  for (const job of await listJobs()) {
    if (isRunningHere(job.id)) continue;
    const due = job.status === 'waiting' && job.nextRunAt && Date.parse(job.nextRunAt) <= now;
    const stale = job.status === 'running' && (!job.heartbeatAt || now - Date.parse(job.heartbeatAt) > STALE_MS);
    if (!due && !stale) continue;
    if (due) {
      Object.assign(job, { status: 'running', waitReason: undefined, nextRunAt: undefined });
      await saveJob(job);
    }
    void kick(job.id, deps);
    kicked.push(job.id);
  }
  return kicked;
}

export const bulkJobs: Record<string, JobHandler> = { 'bulk.continue': continueJob };
export const bulkTicks: Tick[] = [async (now) => void (await recover(now.getTime()))];
