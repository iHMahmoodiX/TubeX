// Opportunity Finder: concrete next steps backed by the channel's own Analytics and watched competitors'
// recent uploads. Each opportunity carries its evidence and an explicit 0–100 score (formulas below).
import { daysSince, titleWords } from './research';
import { clamp } from './reports';
import { matchesQuery, normalizeForSearch } from './text';

export type OpportunityKind = 'search-gap' | 'refresh-packaging' | 'update-old' | 'competitor-topic';

export interface Opportunity {
  kind: OpportunityKind;
  /** Stable id for React keys and dismissals. */
  key: string;
  score: number;
  /** Search term or topic word (search-gap, competitor-topic). */
  term?: string;
  videoId?: string;
  title?: string;
  evidence: Record<string, number | string>;
}

export interface OwnVideoLite {
  id: string;
  title: string;
  tags?: string[];
  publishedAt: string;
}

/** True when one of the titles covers every word of the term (normalized, any order). */
export function covered(term: string, titles: string[]): boolean {
  return titles.some((t) => matchesQuery(t, term));
}

/** Search terms that bring views but have no video with all the term's words in its title. Score = 50 + 50 × views ÷ top term views. */
export function searchGaps(terms: { term: string; views: number }[], own: OwnVideoLite[], limit = 10): Opportunity[] {
  const titles = own.map((v) => v.title);
  const top = Math.max(1, ...terms.map((t) => t.views));
  return terms
    .filter((t) => normalizeForSearch(t.term).length >= 3 && t.views > 0 && !covered(t.term, titles))
    .slice(0, limit)
    .map((t) => ({ kind: 'search-gap' as const, key: `gap:${normalizeForSearch(t.term)}`, term: t.term, score: Math.round(50 + (50 * t.views) / top), evidence: { views: t.views } }));
}

export interface VideoPerf {
  videoId: string;
  views: number;
  avgViewPercent: number | null;
}

/**
 * Videos with above-average retention but below-average views: viewers who click stay, so the title and
 * thumbnail are the likely bottleneck. Score = 50 × (retention ÷ mean retention) + 50 × (1 − views ÷ mean views), clamped.
 */
export function refreshPackaging(perf: VideoPerf[], own: OwnVideoLite[], limit = 8): Opportunity[] {
  const withRet = perf.filter((p) => p.avgViewPercent !== null && p.views > 0);
  if (withRet.length < 3) return [];
  const meanViews = withRet.reduce((n, p) => n + p.views, 0) / withRet.length;
  const meanRet = withRet.reduce((n, p) => n + p.avgViewPercent!, 0) / withRet.length;
  const byId = new Map(own.map((v) => [v.id, v]));
  return withRet
    .filter((p) => p.avgViewPercent! > meanRet && p.views < meanViews && byId.has(p.videoId))
    .map((p) => ({
      kind: 'refresh-packaging' as const,
      key: `refresh:${p.videoId}`,
      videoId: p.videoId,
      title: byId.get(p.videoId)!.title,
      score: Math.round(clamp(50 * (p.avgViewPercent! / meanRet) + 50 * (1 - p.views / meanViews))),
      evidence: { views: p.views, meanViews: Math.round(meanViews), retention: p.avgViewPercent!, meanRetention: Math.round(meanRet * 10) / 10 },
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Videos older than `minAgeDays` that still gain views: worth updating description links, end screens and
 * playlists. Score = 30 + 70 × recent views ÷ top recent views among old videos.
 */
export function updateOld(recent: { videoId: string; views: number }[], own: OwnVideoLite[], now = Date.now(), minAgeDays = 180, limit = 8): Opportunity[] {
  const byId = new Map(own.map((v) => [v.id, v]));
  const old = recent.filter((r) => r.views > 0 && byId.has(r.videoId) && daysSince(byId.get(r.videoId)!.publishedAt, now) >= minAgeDays);
  const top = Math.max(1, ...old.map((r) => r.views));
  return old
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
    .map((r) => {
      const v = byId.get(r.videoId)!;
      return {
        kind: 'update-old' as const,
        key: `old:${r.videoId}`,
        videoId: r.videoId,
        title: v.title,
        score: Math.round(30 + (70 * r.views) / top),
        evidence: { views: r.views, ageDays: Math.round(daysSince(v.publishedAt, now)) },
      };
    });
}

/**
 * Words used in the titles of at least two competitor uploads that none of your titles or tags use.
 * Score = 30 + 15 × number of competitor videos using it, at most 90.
 */
export function competitorTopics(competitor: { title: string; channelTitle: string }[], own: OwnVideoLite[], limit = 10): Opportunity[] {
  const mine = new Set(own.flatMap((v) => [...titleWords([{ title: v.title }], 1, 200).map((f) => normalizeForSearch(f.term)), ...(v.tags ?? []).map(normalizeForSearch)]));
  const mineText = own.map((v) => normalizeForSearch(`${v.title} ${(v.tags ?? []).join(' ')}`)).join(' \n ');
  return titleWords(competitor, 2, 60)
    .filter((f) => normalizeForSearch(f.term).length >= 3 && !mine.has(normalizeForSearch(f.term)) && !mineText.includes(normalizeForSearch(f.term)))
    .slice(0, limit)
    .map((f) => {
      const users = competitor.filter((c) => normalizeForSearch(c.title).includes(normalizeForSearch(f.term)));
      return {
        kind: 'competitor-topic' as const,
        key: `topic:${normalizeForSearch(f.term)}`,
        term: f.term,
        score: Math.min(90, 30 + 15 * f.count),
        evidence: { videos: f.count, channels: new Set(users.map((u) => u.channelTitle)).size, example: users[0]?.title ?? '' },
      };
    });
}

export function rankOpportunities(lists: Opportunity[][]): Opportunity[] {
  return lists.flat().sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

