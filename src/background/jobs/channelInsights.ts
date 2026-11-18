// Scheduled jobs and ticks for Channel Insights. Kinds prefixed 'ci.'.
// One daily snapshot (subscribers, views, videos) of every niche channel and of channels visited in the last
// SEEN_KEEP_DAYS days, so 30-day growth becomes real over time. Channels that already have today's snapshot (from the
// niche leaderboard or a visit) are skipped. Cost: 1 unit per 50 channels (channels.list), checked against the
// spendable budget (a reserve is kept for the owner's own actions, as in jobs/seo.ts). At most once every 6 hours.
import { spendable } from '../../domain/seo';
import { nicheChannels, nicheRef } from '../../features/ranks/service';
import { loadGoogleState } from '../../integrations/google/auth';
import { getChannels } from '../../integrations/youtube/seoApi';
import { loadIntegrations, loadUsage } from '../../storage/integrations';
import { dayKey, one, put, snapshot } from '../../storage/stores';
import { ciRef, CI_SETTINGS, seenChannels, snapshotData } from '../methods/channelInsights';
import type { JobHandler, Tick } from './index';

const EVERY = 6 * 3600_000 - 10 * 60_000;
export const MAX_CHANNELS_PER_TICK = 100;

/** Channels that still need today's snapshot. */
export async function dueChannels(now: Date): Promise<string[]> {
  const ids = new Set<string>();
  for (const c of await nicheChannels()) ids.add(c.channelId);
  for (const c of await seenChannels(now.getTime())) ids.add(c.channelId);
  const day = dayKey(now);
  const out: string[] = [];
  for (const cid of ids) {
    const [a, b] = await Promise.all([one('snapshots', `${nicheRef(cid)}:${day}`), one('snapshots', `${ciRef(cid)}:${day}`)]);
    if (!a && !b) out.push(cid);
  }
  return out.slice(0, MAX_CHANNELS_PER_TICK);
}

/** Takes the due snapshots; returns how many were written. */
export async function snapshotDue(now: Date): Promise<number> {
  const due = await dueChannels(now);
  if (!due.length) return 0;
  const [{ youtube }, usage] = await Promise.all([loadIntegrations(), loadUsage()]);
  if (spendable(usage.ytUnits, youtube.dailyUnitCap) < Math.ceil(due.length / 50)) return 0;
  const meta = await getChannels(due, true);
  let n = 0;
  for (const cid of due) {
    const m = meta[cid];
    if (!m) continue;
    await snapshot(ciRef(cid), snapshotData(m), now);
    n++;
  }
  return n;
}

async function canRead(): Promise<boolean> {
  const { youtube } = await loadIntegrations();
  if (youtube.apiKey) return true;
  return (await loadGoogleState()).channels.length > 0;
}

export const channelInsightsJobs: Record<string, JobHandler> = {
  /** One-off "snapshot now" for the niche and visited channels. */
  'ci.snapshot': async () => `${await snapshotDue(new Date())}`,
};

export const channelInsightsTicks: Tick[] = [
  async (now) => {
    try {
      const s = await one('trackers', CI_SETTINGS);
      if (s && !s.enabled) return;
      if (s?.lastCheckedAt && now.getTime() - Date.parse(s.lastCheckedAt) < EVERY) return;
      if (!(await canRead())) return;
      await snapshotDue(now);
      await put('trackers', { id: CI_SETTINGS, kind: 'ci-settings', label: 'channel insights snapshots', config: {}, createdAt: s?.createdAt ?? now.toISOString(), enabled: s?.enabled ?? true, lastCheckedAt: now.toISOString() });
    } catch (e) {
      console.warn('[TubeX] channel insights tick failed', e);
    }
  },
];
