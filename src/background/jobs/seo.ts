// Scheduled job handlers and periodic ticks for the seo area. Job kinds are prefixed 'seo.'.
// Ticks run every 15 minutes while the browser is open; each one is throttled per tracker and skips work
// when the remaining daily YouTube unit budget is low (a reserve is kept for the owner's own actions).
import { browser } from 'wxt/browser';
import { isDue, RANK_CHECK_COST, SEARCH_COST, spendable } from '../../domain/seo';
import {
  checkBrand,
  checkCompetitor,
  checkRank,
  competitorAlertsOn,
  NICHE_SETTINGS,
  nicheCost,
  nicheChannels,
  syncCompetitorTrackers,
  takeNicheSnapshots,
  type Notify,
} from '../../features/ranks/service';
import { loadGoogleState } from '../../integrations/google/auth';
import { loadIntegrations, loadUsage } from '../../storage/integrations';
import { all, newId, one } from '../../storage/stores';
import type { JobHandler, Tick } from './index';

const HOUR = 3600_000;
// A tick fires every 15 minutes, so "daily" allows a little slack to avoid drifting a tick later every day.
const DAILY = 24 * HOUR - 20 * 60_000;
const BRAND_EVERY = 12 * HOUR - 20 * 60_000;
const UPLOADS_EVERY = 3 * HOUR - 10 * 60_000;
const MAX_SEARCHES_PER_TICK = 6;

const notify: Notify = async (title, message, url) => {
  try {
    await browser.notifications.create(url ? `url:${url}` : `n:${newId()}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: title.slice(0, 120),
      message: message.slice(0, 300),
    });
  } catch {
    /* blocked by the OS: the in-app alert inbox still has it */
  }
};

async function budget(): Promise<number> {
  const [{ youtube }, usage] = await Promise.all([loadIntegrations(), loadUsage()]);
  return spendable(usage.ytUnits, youtube.dailyUnitCap);
}

/** Public reads need an API key or a signed-in channel. */
async function canRead(): Promise<boolean> {
  const { youtube } = await loadIntegrations();
  if (youtube.apiKey) return true;
  return (await loadGoogleState()).channels.length > 0;
}

async function rankTick(now: Date): Promise<void> {
  const due = (await all('trackers')).filter((t) => t.kind === 'rank' && t.enabled && isDue(t.lastCheckedAt, DAILY, now.getTime()));
  let searches = 0;
  for (const t of due.sort((a, b) => (a.lastCheckedAt ?? '').localeCompare(b.lastCheckedAt ?? ''))) {
    if (searches >= MAX_SEARCHES_PER_TICK || (await budget()) < RANK_CHECK_COST) return;
    searches++;
    await checkRank(t.id, notify).catch((e) => console.warn('[TubeX] rank check failed', t.label, e));
  }
}

async function brandTick(now: Date): Promise<void> {
  const due = (await all('trackers')).filter((t) => t.kind === 'brand' && t.enabled && isDue(t.lastCheckedAt, BRAND_EVERY, now.getTime()));
  let searches = 0;
  for (const t of due) {
    if (searches >= MAX_SEARCHES_PER_TICK || (await budget()) < SEARCH_COST) return;
    searches++;
    await checkBrand(t.id, notify).catch((e) => console.warn('[TubeX] brand check failed', t.label, e));
  }
}

async function competitorTick(now: Date): Promise<void> {
  if (!(await competitorAlertsOn())) return;
  const trackers = await syncCompetitorTrackers();
  for (const t of trackers.filter((x) => x.enabled && isDue(x.lastCheckedAt, UPLOADS_EVERY, now.getTime()))) {
    if ((await budget()) < 5) return;
    await checkCompetitor(t.id, notify).catch((e) => console.warn('[TubeX] upload check failed', t.label, e));
  }
}

async function nicheTick(now: Date): Promise<void> {
  const s = await one('trackers', NICHE_SETTINGS);
  if (s && !s.enabled) return;
  if (!isDue(s?.lastCheckedAt, DAILY, now.getTime())) return;
  const n = (await nicheChannels()).length;
  if (!n || (await budget()) < nicheCost(n)) return;
  await takeNicheSnapshots();
}

export const seoJobs: Record<string, JobHandler> = {
  /** Runs every enabled rank tracker now (used to schedule a one-off check from Rankings). */
  'seo.rankCheckAll': async () => {
    const ts = (await all('trackers')).filter((t) => t.kind === 'rank' && t.enabled);
    let ok = 0;
    for (const t of ts) {
      if ((await budget()) < RANK_CHECK_COST) break;
      await checkRank(t.id, notify).then(() => ok++);
    }
    return `${ok}/${ts.length}`;
  },
};

export const seoTicks: Tick[] = [
  async (now) => {
    if (!(await canRead())) return;
    // Cheap work first, so a low budget still leaves room for upload alerts.
    for (const part of [competitorTick, nicheTick, rankTick, brandTick]) await part(now).catch((e) => console.warn('[TubeX] seo tick failed', e));
  },
];
