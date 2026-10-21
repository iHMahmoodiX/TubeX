// YouTube Reporting API (youtubereporting.googleapis.com v1) for the signed-in channel. Thumbnail impressions
// and their click-through rate are not query metrics of the Analytics API v2 (it answers 400 "The query is not
// supported"); YouTube publishes them as daily bulk reports ("channel reach" report type) instead. Flow:
// reportTypes.list → jobs.create (once, on the owner's click) → jobs.reports.list → download each CSV.
// Scope: yt-analytics.readonly (already requested at sign-in) covers non-monetary report types. Host access:
// optional origin https://youtubereporting.googleapis.com/*, requested on the owner's click (D-017).
// Report ids, column names and the CTR unit are Inferred from the public documentation and parsed defensively.
import { YtError, mapYtError } from '../youtube/client';
import { AuthError, forgetToken, getToken } from './auth';

export const REPORTING_BASE = 'https://youtubereporting.googleapis.com/v1';
export const REPORTING_ORIGIN = 'https://youtubereporting.googleapis.com';

export type ReportingErrorCode = 'no-report-type' | 'format' | 'bad-url' | 'permission';
export class ReportingError extends Error {
  constructor(
    public code: ReportingErrorCode,
    public detail?: string,
  ) {
    super(code);
  }
}

export interface ReportType {
  id: string;
  name?: string;
  deprecateTime?: string;
  systemManaged?: boolean;
}
export interface ReportingJob {
  id: string;
  reportTypeId: string;
  name?: string;
  createTime?: string;
  expireTime?: string;
}
export interface ReportFile {
  id: string;
  jobId?: string;
  startTime?: string;
  endTime?: string;
  createTime: string;
  downloadUrl: string;
}

type Obj = Record<string, any>;

// ------------------------------------------------------------------ pure helpers

/**
 * The channel reach report type to use: a non-deprecated `channel_reach_basic_aN` (newest version first), else
 * any other `channel_reach_*_aN` (more dimensions, aggregated the same way). Null when YouTube offers none.
 */
export function pickReachType(types: ReportType[], now = Date.now()): string | null {
  const live = types.filter((t) => typeof t.id === 'string' && !t.systemManaged && !(t.deprecateTime && Date.parse(t.deprecateTime) <= now));
  const version = (id: string) => Number(/_a(\d+)$/.exec(id)?.[1] ?? 0);
  const byVersion = (a: ReportType, b: ReportType) => version(b.id) - version(a.id);
  const basic = live.filter((t) => /^channel_reach_basic_a\d+$/.test(t.id)).sort(byVersion);
  if (basic[0]) return basic[0].id;
  const other = live.filter((t) => /^channel_reach(_[a-z]+)*_a\d+$/.test(t.id)).sort(byVersion);
  return other[0]?.id ?? null;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF line ends. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    field = '';
  };
  while (i < s.length) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      endRow();
    } else field += c;
    i++;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

/** 20261020 / 2026-10-20 → 2026-10-20; null when not a date. */
export function reportDate(v: string): string | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Per video for one day: [impressions, estimated clicks (impressions × CTR)]. */
export type ReachVideos = Record<string, [number, number]>;

export interface ParsedReach {
  /** date (YYYY-MM-DD) → per-video totals, summed over every other dimension (country, subscribed status...). */
  days: Record<string, ReachVideos>;
  /** True when the CTR column was read as a percentage (some value above 1). Inferred unit. */
  ctrPercent: boolean;
  rows: number;
}

const col = (headers: string[], exact: string, test: (h: string) => boolean) => {
  const i = headers.indexOf(exact);
  return i >= 0 ? i : headers.findIndex(test);
};

/**
 * Parses a channel reach CSV. Header names are matched exactly first, then loosely, so a renamed or added
 * column does not break it. The CTR unit is not documented clearly: a file with any value above 1 is read as
 * percent, otherwise as a share (0–1). Rows with missing or non-numeric values are skipped, never zeroed.
 */
export function parseReachCsv(text: string): ParsedReach {
  const table = parseCsv(text);
  const headers = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const iDate = col(headers, 'date', (h) => h === 'day');
  const iVideo = col(headers, 'video_id', (h) => h === 'video');
  const iImpr = col(headers, 'video_thumbnail_impressions', (h) => h.includes('thumbnail_impressions') && !h.includes('ctr') && !h.includes('rate'));
  const iCtr = col(headers, 'video_thumbnail_impressions_ctr', (h) => h.includes('impressions') && (h.includes('ctr') || h.includes('click')));
  if (iDate < 0 || iVideo < 0 || iImpr < 0 || iCtr < 0) throw new ReportingError('format', `columns: ${headers.join(',').slice(0, 200)}`);
  const parsed: { date: string; video: string; impr: number; ctr: number }[] = [];
  for (const r of table.slice(1)) {
    const date = reportDate(r[iDate] ?? '');
    const video = (r[iVideo] ?? '').trim();
    const impr = Number(r[iImpr]);
    const ctrRaw = (r[iCtr] ?? '').trim();
    const ctr = Number(ctrRaw.replace(/%$/, ''));
    if (!date || !video || r[iImpr] === undefined || r[iImpr]!.trim() === '' || ctrRaw === '' || !Number.isFinite(impr) || !Number.isFinite(ctr) || impr < 0 || ctr < 0) continue;
    parsed.push({ date, video, impr, ctr });
  }
  const ctrPercent = parsed.some((p) => p.ctr > 1);
  const days: Record<string, ReachVideos> = {};
  for (const p of parsed) {
    const day = (days[p.date] ??= {});
    const cur = (day[p.video] ??= [0, 0]);
    cur[0] += p.impr;
    cur[1] += p.impr * (ctrPercent ? p.ctr / 100 : p.ctr);
  }
  return { days, ctrPercent, rows: parsed.length };
}

/** Accepts only report download URLs on the Reporting API host, so the token is never sent elsewhere. */
export function checkDownloadUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ReportingError('bad-url', url.slice(0, 120));
  }
  if (u.origin !== REPORTING_ORIGIN) throw new ReportingError('bad-url', u.origin);
  return u.toString();
}

// ------------------------------------------------------------------ network

async function call(channelId: string, url: string, init: RequestInit = {}, raw = false): Promise<unknown> {
  const token = await getToken(channelId);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    // A failed fetch here can also mean the host permission is missing or the download redirected to a host
    // TubeX may not contact (Inferred: report media is served from the Reporting API host itself).
    throw new YtError('unreachable', e instanceof Error ? e.message : String(e));
  }
  if (res.status === 401) {
    await forgetToken(channelId);
    throw new AuthError('expired');
  }
  if (!res.ok) throw mapYtError(res.status, await res.json().catch(() => null));
  if (!raw) return res.json().catch(() => ({}));
  return readText(res);
}

/** Response text; transparently gunzips a body that is still gzip-compressed (a .gz file served as-is). */
async function readText(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(buf);
}

async function pages<T>(channelId: string, path: string, key: string, params: Record<string, string> = {}, max = 20): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  let n = 0;
  do {
    const u = new URL(`${REPORTING_BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const r = (await call(channelId, u.toString())) as Obj;
    if (Array.isArray(r?.[key])) out.push(...(r[key] as T[]));
    pageToken = typeof r?.nextPageToken === 'string' && r.nextPageToken ? r.nextPageToken : undefined;
  } while (pageToken && ++n < max);
  return out;
}

export const listReportTypes = (channelId: string) => pages<ReportType>(channelId, 'reportTypes', 'reportTypes');
export const listJobs = (channelId: string) => pages<ReportingJob>(channelId, 'jobs', 'jobs');

export async function createJob(channelId: string, reportTypeId: string): Promise<ReportingJob> {
  const r = (await call(channelId, `${REPORTING_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportTypeId, name: `TubeX ${reportTypeId}` }),
  })) as Obj;
  if (typeof r?.id !== 'string') throw new ReportingError('format', 'job without id');
  return { id: r.id, reportTypeId: String(r.reportTypeId ?? reportTypeId), name: r.name, createTime: r.createTime, expireTime: r.expireTime };
}

/** Reports of a job created after `createdAfter` (RFC 3339), oldest first. Rows without a download URL are skipped. */
export async function listReports(channelId: string, jobId: string, createdAfter?: string): Promise<ReportFile[]> {
  const items = await pages<Obj>(channelId, `jobs/${encodeURIComponent(jobId)}/reports`, 'reports', createdAfter ? { createdAfter } : {});
  return items
    .filter((r) => typeof r.id === 'string' && typeof r.downloadUrl === 'string' && typeof r.createTime === 'string')
    .map((r) => ({ id: r.id, jobId: r.jobId, startTime: r.startTime, endTime: r.endTime, createTime: r.createTime, downloadUrl: r.downloadUrl }))
    .sort((a, b) => a.createTime.localeCompare(b.createTime));
}

export async function downloadReport(channelId: string, downloadUrl: string): Promise<string> {
  return (await call(channelId, checkDownloadUrl(downloadUrl), {}, true)) as string;
}
