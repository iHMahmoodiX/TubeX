// Local store of the channel reach report (thumbnail impressions and CTR per video per day), filled from the
// YouTube Reporting API. State lives in a tracker (`reports.reach:<channelId>`), one snapshot per report day
// under the same ref. Nothing leaves the computer; work stores are not part of backups (D-016, D-017).
import { hasOrigin } from '../../platform/permissions';
import { createJob, downloadReport, listJobs, listReports, listReportTypes, parseReachCsv, pickReachType, REPORTING_BASE, ReportingError, type ReachVideos } from '../../integrations/google/reporting';
import { del, history, one, put, type Snapshot, type Tracker } from '../../storage/stores';
import type { ClickRow } from '../../domain/reportsClick';

export const reachRef = (channelId: string) => `reports.reach:${channelId}`;
/** Background sync interval. Reports appear once a day, so a few checks a day are plenty. */
export const REACH_EVERY_MS = 6 * 3600_000;
/** Days kept locally. */
export const REACH_KEEP_DAYS = 400;
/** At most this many report files per sync, so a large backfill is spread over several runs. */
const MAX_FILES = 40;

export interface ReachState {
  channelId: string;
  jobId: string;
  reportTypeId: string;
  /** When YouTube created the job; reports cover days after it (plus any backfill YouTube provides). */
  jobCreatedAt: string;
  /** createTime of the newest report processed; the next sync lists reports created after it. */
  cursor?: string;
  lastSyncAt?: string;
  /** Error code of the last failed sync (shown as a sentence), cleared on success. */
  lastError?: string;
  lastErrorDetail?: string;
  enabled: boolean;
}

interface ReachDayData {
  date: string;
  createTime: string;
  reportId: string;
  v: ReachVideos;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function toReachState(t: Tracker | undefined): ReachState | null {
  if (!t || t.kind !== 'reports.reach') return null;
  const c = t.config;
  if (!isStr(c.channelId) || !isStr(c.jobId) || !isStr(c.reportTypeId)) return null;
  return {
    channelId: c.channelId,
    jobId: c.jobId,
    reportTypeId: c.reportTypeId,
    jobCreatedAt: isStr(c.jobCreatedAt) ? c.jobCreatedAt : t.createdAt,
    cursor: isStr(c.cursor) ? c.cursor : undefined,
    lastSyncAt: t.lastCheckedAt,
    lastError: isStr(c.lastError) ? c.lastError : undefined,
    lastErrorDetail: isStr(c.lastErrorDetail) ? c.lastErrorDetail : undefined,
    enabled: t.enabled,
  };
}

async function saveState(s: ReachState, createdAt?: string): Promise<void> {
  const prev = await one('trackers', reachRef(s.channelId));
  await put('trackers', {
    id: reachRef(s.channelId),
    kind: 'reports.reach',
    label: 'Thumbnail impressions and CTR (YouTube Reporting API)',
    config: { channelId: s.channelId, jobId: s.jobId, reportTypeId: s.reportTypeId, jobCreatedAt: s.jobCreatedAt, cursor: s.cursor, lastError: s.lastError, lastErrorDetail: s.lastErrorDetail },
    createdAt: prev?.createdAt ?? createdAt ?? new Date().toISOString(),
    lastCheckedAt: s.lastSyncAt,
    enabled: s.enabled,
  });
}

export async function getReachState(channelId: string): Promise<ReachState | null> {
  return toReachState(await one('trackers', reachRef(channelId)));
}

/** True when the background should sync (enabled and not synced in the last 6 hours). */
export function reachDue(s: Pick<ReachState, 'enabled' | 'lastSyncAt'>, now: number): boolean {
  return s.enabled && (!s.lastSyncAt || now - Date.parse(s.lastSyncAt) >= REACH_EVERY_MS);
}

/**
 * Starts collection for the channel: finds the reach report type, reuses an existing job for it or creates
 * one, and stores the state. Host access must already be granted (requested on the click, before this).
 */
export async function startReach(channelId: string, now = new Date()): Promise<ReachState> {
  if (!(await hasOrigin(REPORTING_BASE))) throw new ReportingError('permission');
  const typeId = pickReachType(await listReportTypes(channelId), now.getTime());
  if (!typeId) throw new ReportingError('no-report-type');
  const existing = (await listJobs(channelId)).find((j) => j.reportTypeId === typeId);
  const job = existing ?? (await createJob(channelId, typeId));
  const prev = await getReachState(channelId);
  const s: ReachState = {
    channelId,
    jobId: job.id,
    reportTypeId: typeId,
    jobCreatedAt: job.createTime ?? now.toISOString(),
    cursor: prev?.jobId === job.id ? prev.cursor : undefined,
    enabled: true,
  };
  await saveState(s, now.toISOString());
  return s;
}

/** Pauses background syncing. The YouTube job and the stored days are kept. */
export async function pauseReach(channelId: string, enabled: boolean): Promise<void> {
  const s = await getReachState(channelId);
  if (s) await saveState({ ...s, enabled });
}

const errCode = (e: unknown): string => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' ? c : 'unknown';
};
const errDetail = (e: unknown): string | undefined => {
  const d = (e as { detail?: unknown } | null)?.detail;
  return typeof d === 'string' ? d.slice(0, 300) : e instanceof Error ? e.message.slice(0, 300) : undefined;
};

/**
 * Downloads reports created since the last sync and stores one snapshot per day. A regenerated or backfilled
 * report for a day replaces the stored one only when it is newer. Stops at the first failed file and keeps
 * the cursor before it, so nothing is skipped. Returns how many days were written.
 */
export async function syncReach(channelId: string, now = new Date()): Promise<{ days: number; files: number; more: boolean }> {
  const s = await getReachState(channelId);
  if (!s) throw new Error('not started');
  let cursor = s.cursor;
  let days = 0;
  let files = 0;
  try {
    if (!(await hasOrigin(REPORTING_BASE))) throw new ReportingError('permission');
    const reports = await listReports(channelId, s.jobId, cursor);
    for (const r of reports.slice(0, MAX_FILES)) {
      const parsed = parseReachCsv(await downloadReport(channelId, r.downloadUrl));
      const dates = Object.keys(parsed.days);
      // An empty report still covers its day (no impressions that day); take the day from startTime.
      if (!dates.length && r.startTime && /^\d{4}-\d{2}-\d{2}/.test(r.startTime)) dates.push(r.startTime.slice(0, 10));
      for (const date of dates) if (await storeDay(channelId, { date, createTime: r.createTime, reportId: r.id, v: parsed.days[date] ?? {} })) days++;
      cursor = r.createTime;
      files++;
    }
    await prune(channelId, now);
    await saveState({ ...s, cursor, lastSyncAt: now.toISOString(), lastError: undefined, lastErrorDetail: undefined });
    return { days, files, more: reports.length > MAX_FILES };
  } catch (e) {
    await saveState({ ...s, cursor, lastSyncAt: now.toISOString(), lastError: errCode(e), lastErrorDetail: errDetail(e) });
    throw e;
  }
}

async function storeDay(channelId: string, d: ReachDayData): Promise<boolean> {
  const ref = reachRef(channelId);
  const prev = await one('snapshots', `${ref}:${d.date}`);
  if (prev && typeof prev.data.createTime === 'string' && prev.data.createTime > d.createTime) return false;
  await put('snapshots', { id: `${ref}:${d.date}`, ref, at: `${d.date}T00:00:00.000Z`, data: { ...d } });
  return true;
}

async function prune(channelId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - REACH_KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
  for (const s of await history(reachRef(channelId))) if (dayOf(s) && dayOf(s)! < cutoff) await del('snapshots', s.id);
}

const dayOf = (s: Snapshot): string | null => (typeof s.data.date === 'string' ? s.data.date : null);

export interface ReachRows {
  rows: ClickRow[];
  /** Days with stored data inside the range. */
  days: number;
  first: string | null;
  last: string | null;
  impressions: number | null;
  /** Channel CTR over the range as a share, or null without impressions. */
  ctr: number | null;
}

/** Pure aggregation of stored days within [startDate, endDate] (inclusive). */
export function aggregateReach(snaps: Pick<Snapshot, 'data'>[], range: { startDate: string; endDate: string }): ReachRows {
  const per = new Map<string, [number, number]>();
  const dates: string[] = [];
  for (const s of snaps) {
    const date = typeof s.data.date === 'string' ? s.data.date : null;
    if (!date || date < range.startDate || date > range.endDate) continue;
    dates.push(date);
    const v = (s.data.v ?? {}) as Record<string, unknown>;
    for (const [id, pair] of Object.entries(v)) {
      if (!Array.isArray(pair) || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) continue;
      const cur = per.get(id) ?? [0, 0];
      cur[0] += pair[0] as number;
      cur[1] += pair[1] as number;
      per.set(id, cur);
    }
  }
  dates.sort();
  let ti = 0;
  let tc = 0;
  const rows: ClickRow[] = [];
  for (const [videoId, [impr, clicks]] of per) {
    ti += impr;
    tc += clicks;
    if (impr > 0) rows.push({ videoId, impressions: impr, ctr: clicks / impr });
  }
  rows.sort((a, b) => b.impressions - a.impressions);
  return { rows, days: dates.length, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, impressions: dates.length ? ti : null, ctr: ti > 0 ? tc / ti : null };
}

export async function loadReach(channelId: string, range: { startDate: string; endDate: string }): Promise<ReachRows> {
  return aggregateReach(await history(reachRef(channelId)), range);
}
