// RPC methods for the reports area. Names are prefixed 'reports.'.
import { checkAdFriendly } from '../../domain/reportsDemonetization';
import { snapshotHealth } from '../jobs/reports';
import { getReachState, loadReach, syncReach } from '../../features/reports/reach';

const str = (v: unknown, max: number): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error('bad argument');
  return v;
};

export const reportsMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /** Heuristic ad-friendliness check of metadata (e.g. the Studio edit form). Pure; no network. */
  'reports.adCheck': async (input: unknown) => {
    if (typeof input !== 'object' || input === null) throw new Error('bad argument');
    const o = input as Record<string, unknown>;
    const tags = Array.isArray(o.tags) ? o.tags.slice(0, 500).map((t) => str(t, 200)) : [];
    return checkAdFriendly({ title: str(o.title ?? '', 500), description: str(o.description ?? '', 20_000), tags });
  },
  /** Computes and stores today's health snapshot for a connected channel. */
  'reports.healthSnapshot': async (channelId: unknown) => {
    const id = str(channelId, 64);
    if (!/^UC[\w-]{22}$/.test(id)) throw new Error('bad argument');
    return snapshotHealth(id);
  },
  /**
   * Locally stored thumbnail impressions/CTR (YouTube Reporting API) of one video over the last `days` days.
   * No network. `ctr` is null without impressions; `started` says whether collection was ever started.
   */
  'reports.reachVideo': async (channelId: unknown, videoId: unknown, days: unknown) => {
    const ch = channelArg(channelId);
    const vid = str(videoId, 20);
    if (!/^[\w-]{11}$/.test(vid)) throw new Error('bad argument');
    const n = typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 400 ? days : 28;
    const end = new Date();
    const start = new Date(end.getTime() - (n - 1) * 86400_000);
    const r = await loadReach(ch, { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) });
    const row = r.rows.find((x) => x.videoId === vid);
    return { started: !!(await getReachState(ch)), days: r.days, impressions: row?.impressions ?? null, ctr: row?.ctr ?? null };
  },
  /** Downloads new daily reach reports now (collection must have been started from Click magnet). */
  'reports.reachSync': async (channelId: unknown) => {
    const ch = channelArg(channelId);
    if (!(await getReachState(ch))) throw new Error('not started');
    return syncReach(ch);
  },
};

function channelArg(v: unknown): string {
  const id = str(v, 64);
  if (!/^UC[\w-]{22}$/.test(id)) throw new Error('bad argument');
  return id;
}
