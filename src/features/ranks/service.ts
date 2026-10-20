// Tracker work shared by the Rankings / Competitors pages (manual "Check now") and the background ticks:
// keyword rank checks, tag rankings, brand mentions, competitor uploads and niche leaderboard snapshots.
// No React here. Notifications are passed in by the background (pages only add in-app alerts).
import { countSince, findPosition, freshUploads, meanOfFirst, newMentions, rankChange, type RankChange } from '../../domain/seo';
import { translate } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { loadGoogleState } from '../../integrations/google/auth';
import { channelUploads, getVideos } from '../../integrations/youtube/api';
import { getChannels, isSearchCached, searchTop, type SearchHit } from '../../integrations/youtube/seoApi';
import { list } from '../../storage/db';
import { loadPrefs } from '../../storage/prefs';
import { addAlert, all, del, history, newId, one, put, snapshot, type Tracker } from '../../storage/stores';

export type Notify = (title: string, message: string, url?: string) => Promise<void>;

async function tr(key: MessageKey, vars?: Record<string, string | number>): Promise<string> {
  const p = await loadPrefs();
  return translate(p.uiLanguage, key, vars);
}

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const searchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

// ---------------------------------------------------------------- rank tracking

export interface RankPoint {
  position: number | null;
  checkedAt: string;
}
export interface RankConfig {
  keyword: string;
  videoId?: string;
  channelId?: string;
  /** Shown in the list: the video's title or the channel's name. */
  targetTitle?: string;
  last?: RankPoint;
  prev?: RankPoint;
}
export interface RankItem {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  views?: number;
}
export interface RankSnapshot {
  position: number | null;
  top: string[];
  items: RankItem[];
  checkedAt: string;
  region?: string;
  language?: string;
}

export const rankConfig = (t: Tracker): RankConfig => t.config as unknown as RankConfig;

export async function createRankTracker(input: { keyword: string; videoId?: string; channelId?: string; targetTitle?: string }): Promise<Tracker> {
  const keyword = input.keyword.trim().slice(0, 200);
  if (!keyword) throw new Error('empty keyword');
  if (!input.videoId && !input.channelId) throw new Error('no target');
  const existing = (await all('trackers')).find((t) => {
    if (t.kind !== 'rank') return false;
    const c = rankConfig(t);
    return c.keyword.toLowerCase() === keyword.toLowerCase() && (c.videoId ?? '') === (input.videoId ?? '') && (c.channelId ?? '') === (input.channelId ?? '');
  });
  if (existing) return existing;
  const config: RankConfig = { keyword, videoId: input.videoId, channelId: input.channelId, targetTitle: input.targetTitle };
  return put('trackers', { id: newId(), kind: 'rank', label: keyword, config: config as unknown as Record<string, unknown>, createdAt: new Date().toISOString(), enabled: true });
}

/** search.list (100 units) + videos.list (1 unit). Records a daily snapshot and alerts on big moves. */
export async function checkRank(trackerId: string, notify?: Notify): Promise<{ position: number | null; change: RankChange }> {
  const t = await one('trackers', trackerId);
  if (!t || t.kind !== 'rank') throw new Error('tracker not found');
  const c = rankConfig(t);
  const res = await searchTop(c.keyword, { max: 50, fresh: true });
  const stats = res.items.length ? (await getVideos(res.items.map((x) => x.id))).data : [];
  const views = new Map(stats.map((v) => [v.id, v.views]));
  const items: RankItem[] = res.items.map((x) => ({ id: x.id, title: x.title, channelId: x.channelId, channelTitle: x.channelTitle, views: views.get(x.id) }));
  const position = findPosition(items, { videoId: c.videoId, channelId: c.videoId ? undefined : c.channelId });
  const checkedAt = new Date().toISOString();
  const change = rankChange(c.last?.position, position);
  await snapshot(`rank:${t.id}`, { position, top: items.map((x) => x.id), items, checkedAt, region: res.region, language: res.language } satisfies RankSnapshot as unknown as Record<string, unknown>);
  const next: RankConfig = { ...c, prev: c.last, last: { position, checkedAt } };
  // Re-read so a toggle made while the request ran is kept.
  const latest = (await one('trackers', t.id)) ?? t;
  await put('trackers', { ...latest, lastCheckedAt: checkedAt, config: next as unknown as Record<string, unknown> });
  if (change.alert) {
    const pos = (p: number | null | undefined) => (p === null || p === undefined ? '—' : `#${p}`);
    const title = await tr('seo.alert.rankTitle', { k: c.keyword });
    const key: MessageKey = change.enteredTop10 ? 'seo.alert.rankTop10In' : change.leftTop10 && position !== null ? 'seo.alert.rankTop10Out' : position === null ? 'seo.alert.rankLost' : 'seo.alert.rankMoved';
    const body = await tr(key, { from: pos(c.last?.position), to: pos(position), target: c.targetTitle ?? c.videoId ?? c.channelId ?? '' });
    await addAlert({ kind: 'rank', title, body, url: searchUrl(c.keyword) });
    await notify?.(title, body, searchUrl(c.keyword));
  }
  return { position, change };
}

export async function rankHistory(trackerId: string): Promise<RankSnapshot[]> {
  return (await history(`rank:${trackerId}`)).map((s) => s.data as unknown as RankSnapshot);
}

export async function deleteTracker(id: string, snapshotRef?: string): Promise<void> {
  await del('trackers', id);
  if (snapshotRef) for (const s of await history(snapshotRef)) await del('snapshots', s.id);
}

// ---------------------------------------------------------------- tag rankings

export interface TagRank {
  tag: string;
  position: number | null;
  top: SearchHit | null;
  fromCache: boolean;
  checkedAt: string;
}

/** Search position of a video for each tag (100 units per tag unless cached for 24 h). Sequential; stops on the first error. */
export async function tagRanks(videoId: string, tags: string[], onProgress?: (done: number, r: TagRank) => void, signal?: AbortSignal): Promise<TagRank[]> {
  const out: TagRank[] = [];
  for (const tag of tags) {
    if (signal?.aborted) break;
    const res = await searchTop(tag, { max: 50 });
    const position = findPosition(res.items, { videoId });
    const r: TagRank = { tag, position, top: res.items.find((x) => x.id !== videoId) ?? null, fromCache: res.fromCache, checkedAt: res.fetchedAt };
    out.push(r);
    onProgress?.(out.length, r);
  }
  return out;
}

/** Which of these tags would cost units now (not in the 24 h cache). */
export async function uncachedTags(tags: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const tag of tags) if (!(await isSearchCached(tag, { max: 50 }))) out.push(tag);
  return out;
}

// ---------------------------------------------------------------- brand alerts

export interface Mention {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail?: string;
  foundAt: string;
}
export interface BrandConfig {
  term: string;
  seen: string[];
  mentions: Mention[];
  /** Results of the first check are listed but not alerted. */
  baseline?: boolean;
}
export const brandConfig = (t: Tracker): BrandConfig => ({ seen: [], mentions: [], ...(t.config as Partial<BrandConfig>), term: String(t.config.term ?? t.label) });

export async function createBrandTracker(term: string): Promise<Tracker> {
  const clean = term.trim().slice(0, 120);
  if (!clean) throw new Error('empty term');
  const existing = (await all('trackers')).find((t) => t.kind === 'brand' && brandConfig(t).term.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const config: BrandConfig = { term: clean, seen: [], mentions: [] };
  return put('trackers', { id: newId(), kind: 'brand', label: clean, config: config as unknown as Record<string, unknown>, createdAt: new Date().toISOString(), enabled: true });
}

/** search.list order=date since the last check (100 units). New videos by other channels become alerts. */
export async function checkBrand(trackerId: string, notify?: Notify): Promise<Mention[]> {
  const t = await one('trackers', trackerId);
  if (!t || t.kind !== 'brand') throw new Error('tracker not found');
  const c = brandConfig(t);
  const first = !t.lastCheckedAt;
  // A little overlap with the previous window; the seen list removes duplicates.
  const since = first ? Date.now() - 7 * 86_400_000 : Date.parse(t.lastCheckedAt!) - 3600_000;
  const res = await searchTop(c.term, { max: 25, order: 'date', publishedAfter: new Date(since).toISOString(), fresh: true });
  const own = (await loadGoogleState()).channels.map((x) => x.channelId);
  const fresh = newMentions(res.items, own, c.seen);
  const foundAt = new Date().toISOString();
  const mentions: Mention[] = fresh.map((x) => ({ id: x.id, title: x.title, channelId: x.channelId, channelTitle: x.channelTitle, publishedAt: x.publishedAt, thumbnail: x.thumbnail, foundAt }));
  const next: BrandConfig = { ...c, seen: [...fresh.map((x) => x.id), ...c.seen].slice(0, 300), mentions: [...mentions, ...c.mentions].slice(0, 100), baseline: first ? true : c.baseline };
  const latest = (await one('trackers', t.id)) ?? t;
  await put('trackers', { ...latest, lastCheckedAt: foundAt, config: next as unknown as Record<string, unknown> });
  if (!first)
    for (const m of mentions) {
      const title = await tr('seo.alert.brandTitle', { term: c.term });
      const body = `${m.title} — ${m.channelTitle}`;
      await addAlert({ kind: 'brand', title, body, url: watchUrl(m.id) });
      await notify?.(title, body, watchUrl(m.id));
    }
  return mentions;
}

// ---------------------------------------------------------------- competitor uploads

export const COMPETITOR_SETTINGS = 'competitor:settings';
export const competitorTrackerId = (channelId: string) => `competitor:${channelId}`;

export interface UnseenUpload {
  id: string;
  title: string;
  publishedAt: string;
}
export interface CompetitorConfig {
  channelId: string;
  title: string;
  uploadsPlaylistId?: string;
  /** Upload ids known at the last check; absent before the first check. */
  seen?: string[];
  unseen: UnseenUpload[];
}
export const competitorConfig = (t: Tracker): CompetitorConfig => ({ unseen: [], ...(t.config as Partial<CompetitorConfig>), channelId: String(t.config.channelId ?? ''), title: String(t.config.title ?? t.label) });

/** Global switch for competitor upload alerts (on by default). */
export async function competitorAlertsOn(): Promise<boolean> {
  const s = await one('trackers', COMPETITOR_SETTINGS);
  return s ? s.enabled : true;
}
export async function setCompetitorAlerts(on: boolean): Promise<void> {
  const s = await one('trackers', COMPETITOR_SETTINGS);
  await put('trackers', { id: COMPETITOR_SETTINGS, kind: 'competitor-settings', label: 'competitor alerts', config: {}, createdAt: s?.createdAt ?? new Date().toISOString(), enabled: on });
}

/** Creates a tracker for every watched channel and removes trackers of channels no longer watched. */
export async function syncCompetitorTrackers(): Promise<Tracker[]> {
  const watched = (await list('watchlist')).items;
  const trackers = (await all('trackers')).filter((t) => t.kind === 'competitor');
  const ids = new Set(watched.map((w) => competitorTrackerId(w.channelId)));
  for (const t of trackers) if (!ids.has(t.id)) await del('trackers', t.id);
  const out: Tracker[] = [];
  for (const w of watched) {
    const id = competitorTrackerId(w.channelId);
    const t = trackers.find((x) => x.id === id);
    if (t) out.push(t);
    else {
      const config: CompetitorConfig = { channelId: w.channelId, title: w.title, unseen: [] };
      out.push(await put('trackers', { id, kind: 'competitor', label: w.title, config: config as unknown as Record<string, unknown>, createdAt: new Date().toISOString(), enabled: true }));
    }
  }
  return out;
}

/** Uploads playlist (1 unit) and, when something is new, its videos (1 unit). The first check records a baseline. */
export async function checkCompetitor(trackerId: string, notify?: Notify): Promise<UnseenUpload[]> {
  const t = await one('trackers', trackerId);
  if (!t || t.kind !== 'competitor') throw new Error('tracker not found');
  let c = competitorConfig(t);
  if (!c.uploadsPlaylistId) {
    const ch = (await getChannels([c.channelId]))[c.channelId];
    if (!ch?.uploadsPlaylistId) throw new Error('channel not found');
    c = { ...c, uploadsPlaylistId: ch.uploadsPlaylistId };
  }
  const uploads = (await channelUploads(c.uploadsPlaylistId!, 10, true)).data;
  const ids = uploads.map((v) => v.id);
  const freshIds = freshUploads(ids, c.seen);
  const fresh: UnseenUpload[] = uploads.filter((v) => freshIds.includes(v.id)).map((v) => ({ id: v.id, title: v.title, publishedAt: v.publishedAt }));
  const next: CompetitorConfig = { ...c, seen: [...new Set([...ids, ...(c.seen ?? [])])].slice(0, 100), unseen: [...fresh, ...c.unseen].slice(0, 30) };
  const latest = (await one('trackers', t.id)) ?? t;
  await put('trackers', { ...latest, lastCheckedAt: new Date().toISOString(), config: next as unknown as Record<string, unknown> });
  for (const v of fresh) {
    const title = await tr('seo.alert.uploadTitle', { name: c.title });
    await addAlert({ kind: 'competitor', title, body: v.title, url: watchUrl(v.id) });
    await notify?.(title, v.title, watchUrl(v.id));
  }
  return fresh;
}

export async function clearUnseen(trackerId: string): Promise<void> {
  const t = await one('trackers', trackerId);
  if (t) await put('trackers', { ...t, config: { ...t.config, unseen: [] } });
}

// ---------------------------------------------------------------- niche leaderboard

export const NICHE_SETTINGS = 'niche:settings';
export const nicheRef = (channelId: string) => `niche:${channelId}`;

export interface NicheSnapshot {
  title: string;
  thumbnail?: string;
  subscribers?: number;
  views?: number;
  videoCount?: number;
  uploads30?: number;
  avgViews10?: number;
}

/** Leaderboard channels: every watched channel plus the signed-in channels. */
export async function nicheChannels(): Promise<{ channelId: string; title: string; mine: boolean }[]> {
  const g = await loadGoogleState();
  const watched = (await list('watchlist')).items;
  const out = g.channels.map((c) => ({ channelId: c.channelId, title: c.title, mine: true }));
  for (const w of watched) if (!out.some((x) => x.channelId === w.channelId)) out.push({ channelId: w.channelId, title: w.title, mine: false });
  return out;
}

/** Units one leaderboard snapshot costs: 1 per 50 channels plus about 2 per channel. */
export const nicheCost = (n: number) => Math.ceil(n / 50) + 2 * n;

/** One snapshot per channel per day: public counts, uploads in the last 30 days, average views of the last 10 uploads. */
export async function takeNicheSnapshots(): Promise<number> {
  const chans = await nicheChannels();
  if (!chans.length) return 0;
  const meta = await getChannels(chans.map((c) => c.channelId), true);
  let n = 0;
  for (const c of chans) {
    const m = meta[c.channelId];
    if (!m) continue;
    const uploads = m.uploadsPlaylistId ? (await channelUploads(m.uploadsPlaylistId, 50, true)).data : [];
    const sorted = [...uploads].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const data: NicheSnapshot = {
      title: m.title,
      thumbnail: m.thumbnail,
      subscribers: m.subscribers,
      views: m.views,
      videoCount: m.videoCount,
      uploads30: m.uploadsPlaylistId ? countSince(sorted.map((v) => v.publishedAt), 30) : undefined,
      avgViews10: meanOfFirst(sorted.map((v) => v.views), 10),
    };
    await snapshot(nicheRef(c.channelId), data as unknown as Record<string, unknown>);
    n++;
  }
  const s = await one('trackers', NICHE_SETTINGS);
  await put('trackers', { id: NICHE_SETTINGS, kind: 'niche', label: 'niche leaderboard', config: {}, createdAt: s?.createdAt ?? new Date().toISOString(), enabled: s?.enabled ?? true, lastCheckedAt: new Date().toISOString() });
  return n;
}
