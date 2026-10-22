// Scheduled job handlers and periodic ticks for the reports area. Job kinds are prefixed 'reports.'.
// Daily health snapshot: for each enabled 'reports.health' tracker (opt-in from the Health report), at most
// once every 20 hours, compute the channel health score from cached reads, store a snapshot and alert when
// the score drops by 10 or more.
// Reach sync: for each channel that started collecting thumbnail impressions/CTR (Click magnet), download new
// daily YouTube Reporting API reports at most every 6 hours while the browser is open (reach.ts).
import { loadGoogleState } from '../../integrations/google/auth';
import { addAlert, all, history, put, snapshot, type Tracker } from '../../storage/stores';
import { computeHealth, healthRef, loadOwnVideos } from '../../features/reports/data';
import { reachDue, syncReach, toReachState } from '../../features/reports/reach';
import type { JobHandler, Tick } from './index';

const EVERY_MS = 20 * 3600_000;

/** True when a tracker is due (never checked, or checked more than 20 hours ago). */
export function healthDue(t: Pick<Tracker, 'lastCheckedAt' | 'enabled'>, now: number): boolean {
  return t.enabled && (!t.lastCheckedAt || now - Date.parse(t.lastCheckedAt) >= EVERY_MS);
}

export async function snapshotHealth(channelId: string, now = Date.now()): Promise<{ total: number | null; previous: number | null }> {
  const g = await loadGoogleState();
  const ch = g.channels.find((c) => c.channelId === channelId);
  if (!ch?.uploadsPlaylistId) throw new Error('channel not connected');
  const videos = await loadOwnVideos(channelId, ch.uploadsPlaylistId);
  const { health } = await computeHealth(channelId, videos, false, now);
  const prev = (await history(healthRef(channelId))).filter((s) => typeof s.data.total === 'number').pop();
  const previous = prev ? (prev.data.total as number) : null;
  await snapshot(healthRef(channelId), { total: health.total, parts: Object.fromEntries(health.parts.map((p) => [p.id, p.score])) }, new Date(now));
  if (health.total !== null && previous !== null && previous - health.total >= 10)
    await addAlert({ kind: 'reports.health', title: `${ch.title}: health ${previous} → ${health.total}`, body: 'Channel health score dropped by 10 or more. Open Reports → Health to see which part changed.', url: 'workspace.html#reports/health' });
  return { total: health.total, previous };
}

export const reportsJobs: Record<string, JobHandler> = {
  'reports.healthSnapshot': async (job) => {
    const channelId = typeof job.payload.channelId === 'string' ? job.payload.channelId : job.channelId;
    if (!channelId) throw new Error('missing channelId');
    const r = await snapshotHealth(channelId);
    return `Health score ${r.total ?? '—'}`;
  },
};

export const reportsTicks: Tick[] = [
  async (now) => {
    const trackers = (await all('trackers')).filter((t) => t.kind === 'reports.health' && healthDue(t, now.getTime()));
    for (const t of trackers) {
      const channelId = String(t.config.channelId ?? '');
      try {
        await snapshotHealth(channelId, now.getTime());
      } catch {
        /* signed out or offline: try again on a later tick */
      }
      await put('trackers', { ...t, lastCheckedAt: now.toISOString() });
    }
  },
  async (now) => {
    await reachTick(now);
  },
];

/** Syncs due reach collections one channel at a time. syncReach records its own time and error. */
export async function reachTick(now: Date): Promise<number> {
  const due = (await all('trackers'))
    .map(toReachState)
    .filter((s): s is NonNullable<typeof s> => !!s && reachDue(s, now.getTime()));
  let n = 0;
  for (const s of due) {
    try {
      n += (await syncReach(s.channelId, now)).days;
    } catch {
      /* stored as lastError and shown in Click magnet; retried after the interval */
    }
  }
  return n;
}
