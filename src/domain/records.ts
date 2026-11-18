// Single owner of record shapes at trust boundaries (backup import, stored data read-back).
// Only known keys are copied, so unexpected keys (including __proto__) never reach storage.
// Records from older TubeX versions get defaults for fields added since 0.1.0; only data that cannot be a
// record (not an object, no usable id, no content) is refused, with a reason for the import report.
import { COLLECTIONS, EXPERIMENT_STATUSES, IDEA_STATUSES, INTENTS, PUBLISH_STATUSES, QUEUE_STATUSES } from './models';
import type { AparatPackage, BaseRecord, BlogPackage, CollectionName, Collections, Draft, Experiment, Idea, KeywordList, Lang, MetricSnap, OptimizeItem, Profile, QueueLogEntry, Reply, ResearchRef, SourceRef, Template, Variant, WatchedChannel } from './models';
import type { PageKind } from './pageContext';

const MAX_TEXT = 20_000;
const MAX_SHORT = 1_000;
const MAX_TAGS = 200;
const KINDS: PageKind[] = ['watch', 'shorts', 'search', 'channel', 'playlist', 'home', 'studio-video', 'studio', 'youtube-other', 'aparat', 'unsupported', 'unknown'];

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** Why a record was skipped (backup import report). */
export type RejectReason = 'not-object' | 'bad-id' | 'empty' | 'bad-field' | 'duplicate';
export const REJECT_REASONS: RejectReason[] = ['not-object', 'bad-id', 'empty', 'bad-field', 'duplicate'];

/** Options for records read from older or foreign data. */
export interface SanitizeOptions {
  /** Date used when a record has no valid createdAt/updatedAt (e.g. the backup's export time). */
  fallbackDate?: string;
}

class Reject extends Error {
  constructor(public reason: RejectReason) {
    super(reason);
  }
}
const reject = (reason: RejectReason): never => {
  throw new Reject(reason);
};

/**
 * Optional text field. Missing or not text → fallback; too long → cut at the limit (older versions had no
 * limits on some fields).
 */
function str(v: unknown, max: number, fallback = ''): string {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) : v;
  return fallback;
}
/** Optional short identifier/text: anything unusable is dropped instead of failing the record. */
function optStr(v: unknown, max: number): string | undefined {
  const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : v;
  return typeof s === 'string' && s !== '' && s.length <= max ? s : undefined;
}
function lang(v: unknown): Lang {
  return v === 'en' ? 'en' : 'fa';
}
/** Tag-like lists: accepts arrays (non-text items dropped) and comma/newline separated text. */
function tags(v: unknown, maxItems = MAX_TAGS): string[] {
  const list: unknown[] = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,،\n]/) : [];
  const out: string[] = [];
  for (const t of list) {
    if (out.length >= maxItems) break;
    const s = typeof t === 'string' ? t.trim() : typeof t === 'number' ? String(t) : '';
    if (s && s.length <= MAX_SHORT) out.push(s);
  }
  return out;
}
function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
/** ISO date from an ISO string or an epoch-milliseconds number. ISO strings are kept as written. */
function date(v: unknown): string | undefined {
  if (isIso(v)) return v;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 8.64e15) return new Date(v).toISOString();
  return undefined;
}

function base(r: Raw, o: SanitizeOptions): BaseRecord {
  const id = typeof r.id === 'number' && Number.isFinite(r.id) ? String(r.id) : r.id;
  if (typeof id !== 'string' || id.length < 1 || id.length > 100) return reject('bad-id');
  const fallback = date(o.fallbackDate) ?? new Date(0).toISOString();
  const updated = date(r.updatedAt);
  const created = date(r.createdAt) ?? updated ?? fallback;
  const rev = typeof r.rev === 'number' && Number.isInteger(r.rev) && r.rev >= 0 ? r.rev : 0;
  return { id, createdAt: created, updatedAt: updated ?? created, rev };
}

/**
 * A source link. Broken sources (missing URL, plain http, unparsable) are dropped and the record kept. A link
 * with a script-capable scheme (javascript:, data:, …) is never written by TubeX: the record was tampered
 * with, so it is refused.
 */
function source(v: unknown, at: string): SourceRef | undefined {
  if (!isObj(v)) return undefined;
  const url = httpsUrl(v.url);
  if (!url) {
    if (typeof v.url === 'string' && /^\s*[a-z][a-z0-9+.-]*:/i.test(v.url) && !/^\s*https?:/i.test(v.url)) return reject('bad-field');
    return undefined;
  }
  const videoId = optStr(v.videoId, 20);
  const title = optStr(v.title, MAX_SHORT);
  const channelName = optStr(v.channelName, MAX_SHORT);
  const searchQuery = optStr(v.searchQuery, MAX_SHORT);
  return {
    kind: KINDS.includes(v.kind as PageKind) ? (v.kind as PageKind) : 'unknown',
    url,
    capturedAt: date(v.capturedAt) ?? at,
    origin: v.origin === 'dom' ? 'dom' : 'url',
    ...(videoId && { videoId }),
    ...(title && { title }),
    ...(channelName && { channelName }),
    ...(searchQuery && { searchQuery }),
  };
}

const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;

/** Research context: every field optional, broken ones dropped; signals keep at most 20 short entries. */
export function cleanResearch(v: unknown): ResearchRef | undefined {
  if (!isObj(v)) return undefined;
  const out: ResearchRef = {};
  const topic = optStr(v.topic, MAX_SHORT);
  const keyword = optStr(v.keyword, MAX_SHORT);
  const retrievedAt = date(v.retrievedAt);
  if (topic) out.topic = topic;
  if (keyword) out.keyword = keyword;
  if (v.language === 'fa' || v.language === 'en') out.language = v.language;
  if (INTENTS.includes(v.intent as never)) out.intent = v.intent as ResearchRef['intent'];
  if (typeof v.channelId === 'string' && CHANNEL_ID.test(v.channelId)) out.channelId = v.channelId;
  if (retrievedAt) out.retrievedAt = retrievedAt;
  if (isObj(v.signals)) {
    const sig: Record<string, number | string> = {};
    for (const [k, x] of Object.entries(v.signals).slice(0, 20)) {
      if (k.length > 40 || k === '__proto__') continue;
      if (typeof x === 'number' && Number.isFinite(x)) sig[k] = x;
      else if (typeof x === 'string' && x.length <= 300) sig[k] = x;
    }
    if (Object.keys(sig).length) out.signals = sig;
  }
  return Object.keys(out).length ? out : undefined;
}

function aparat(v: unknown, at: string): AparatPackage | undefined {
  if (!isObj(v)) return undefined;
  const url = httpsUrl(v.url);
  return {
    title: str(v.title, MAX_SHORT),
    description: str(v.description, MAX_TEXT),
    tags: tags(v.tags, 50),
    category: str(v.category, 100),
    playlist: str(v.playlist, MAX_SHORT),
    coverNote: str(v.coverNote, MAX_SHORT),
    scheduleNote: str(v.scheduleNote, MAX_SHORT),
    status: PUBLISH_STATUSES.includes(v.status as never) ? (v.status as AparatPackage['status']) : 'prepared',
    ...(url && /(^|\.)aparat\.com$/.test(new URL(url).hostname) && { url }),
    statusAt: date(v.statusAt) ?? at,
  };
}

function blog(v: unknown, at: string): BlogPackage | undefined {
  if (!isObj(v)) return undefined;
  const url = httpsUrl(v.url);
  const site = httpsUrl(v.site);
  const cta = httpsUrl(v.ctaUrl);
  const w = isObj(v.wp) ? v.wp : null;
  const wpOrigin = w ? httpsUrl(w.origin) : null;
  const wp = w && wpOrigin && typeof w.postId === 'number' && Number.isInteger(w.postId) && w.postId > 0 ? { origin: new URL(wpOrigin).origin, postId: w.postId, savedAt: date(w.savedAt) ?? at } : undefined;
  return {
    site: site ?? '',
    title: str(v.title, MAX_SHORT),
    slug: str(v.slug, 200).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
    metaDescription: str(v.metaDescription, MAX_SHORT),
    focusKeyword: str(v.focusKeyword, 200),
    excerpt: str(v.excerpt, MAX_SHORT),
    category: str(v.category, 200),
    tags: tags(v.tags, 30),
    html: str(v.html, 60_000),
    ctaUrl: cta ?? '',
    status: PUBLISH_STATUSES.includes(v.status as never) ? (v.status as BlogPackage['status']) : 'prepared',
    ...(url && { url }),
    statusAt: date(v.statusAt) ?? at,
    ...(wp && { wp }),
  };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

function snap(v: unknown): MetricSnap | undefined {
  if (!isObj(v)) return undefined;
  const at = date(v.at);
  if (!at) return undefined;
  const out: MetricSnap = { at, periodDays: Math.max(1, Math.min(365, Math.round(num(v.periodDays) ?? 28))) };
  for (const k of ['views', 'impressions', 'ctr', 'avgViewPercent'] as const) {
    const n = num(v[k]);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

const QUEUE_ACTIONS = ['title', 'thumbnail', 'description', 'tags', 'note', 'status'];
function logEntries(v: unknown): QueueLogEntry[] {
  if (!Array.isArray(v)) return [];
  const out: QueueLogEntry[] = [];
  for (const e of v.slice(-200)) {
    if (!isObj(e) || !QUEUE_ACTIONS.includes(e.action as string)) continue;
    const at = date(e.at);
    if (!at) continue;
    const before = optStr(e.before, MAX_TEXT);
    const after = optStr(e.after, MAX_TEXT);
    const note = optStr(e.note, MAX_TEXT);
    out.push({ at, action: e.action as QueueLogEntry['action'], ...(before && { before }), ...(after && { after }), ...(note && { note }) });
  }
  return out;
}

/** First non-empty text among several field names (older shapes used other names for a few fields). */
function firstText(r: Raw, keys: string[], max: number): string {
  // The main field holding something that is not text (e.g. a number or object) is broken data, not old data.
  const main = r[keys[0]!];
  if (main !== undefined && main !== null && typeof main !== 'string') return reject('bad-field');
  for (const k of keys) {
    const s = str(r[k], max);
    if (s.trim()) return s;
  }
  return '';
}
const firstLine = (s: string, max = 80) => (s.trim().split('\n')[0] ?? '').slice(0, max);

function profile(r: Raw, o: SanitizeOptions): Profile {
  const b = base(r, o);
  const name = firstText(r, ['name', 'title', 'handle'], MAX_SHORT);
  if (!name.trim()) return reject('empty');
  return { ...b, name, handle: str(r.handle, MAX_SHORT), notes: str(r.notes, MAX_TEXT), contentLanguage: lang(r.contentLanguage ?? r.language), connection: 'unconnected' };
}

function idea(r: Raw, o: SanitizeOptions): Idea {
  const b = base(r, o);
  const text = firstText(r, ['text', 'title'], MAX_TEXT);
  if (!text.trim()) return reject('empty');
  const src = source(r.source, b.createdAt);
  const profileId = optStr(r.profileId, 100);
  const status = IDEA_STATUSES.includes(r.status as Idea['status']) ? (r.status as Idea['status']) : 'inbox';
  const rs = cleanResearch(r.research);
  return { ...b, text, notes: str(r.notes, MAX_TEXT), status, ...(profileId && { profileId }), ...(src && { source: src }), ...(rs && { research: rs }) };
}

function draft(r: Raw, o: SanitizeOptions): Draft {
  const b = base(r, o);
  const src = source(r.source, b.createdAt);
  const profileId = optStr(r.profileId, 100);
  const ideaId = optStr(r.ideaId, 100);
  const rs = cleanResearch(r.research);
  const ap = isObj(r.platforms) ? aparat(r.platforms.aparat, b.updatedAt) : undefined;
  const bl = isObj(r.platforms) ? blog(r.platforms.blog, b.updatedAt) : undefined;
  return {
    ...b,
    ...(rs && { research: rs }),
    ...((ap || bl) && { platforms: { ...(ap && { aparat: ap }), ...(bl && { blog: bl }) } }),
    title: str(r.title, MAX_SHORT),
    description: str(r.description, MAX_TEXT),
    focusKeyword: str(r.focusKeyword, MAX_SHORT),
    tags: tags(r.tags),
    language: lang(r.language),
    ...(profileId && { profileId }),
    ...(ideaId && { ideaId }),
    ...(src && { source: src }),
  };
}

function template(r: Raw, o: SanitizeOptions): Template {
  const b = base(r, o);
  const description = str(r.description, MAX_TEXT);
  const t = tags(r.tags);
  const name = firstText(r, ['name', 'title'], MAX_SHORT) || firstLine(description) || t[0] || '';
  if (!name.trim()) return reject('empty');
  const profileId = optStr(r.profileId, 100);
  return { ...b, name, description, tags: t, ...(profileId && { profileId }) };
}

function keywordList(r: Raw, o: SanitizeOptions): KeywordList {
  const b = base(r, o);
  const raw: unknown[] = Array.isArray(r.keywords) ? r.keywords.slice(0, 2000) : [];
  const keywords: KeywordList['keywords'] = [];
  for (const k of raw) {
    // Plain strings and {text, note, addedAt} objects; empty or broken entries are dropped.
    const text = typeof k === 'string' ? k.slice(0, MAX_SHORT) : isObj(k) ? str(k.text, MAX_SHORT) : '';
    if (!text.trim()) continue;
    keywords.push({ text, note: isObj(k) ? str(k.note, MAX_TEXT) : '', addedAt: (isObj(k) && date(k.addedAt)) || b.createdAt });
  }
  const name = firstText(r, ['name', 'title'], MAX_SHORT) || keywords[0]?.text || '';
  if (!name.trim()) return reject('empty');
  const profileId = optStr(r.profileId, 100);
  return { ...b, name, keywords, ...(profileId && { profileId }) };
}

function watched(r: Raw, o: SanitizeOptions): WatchedChannel {
  const b = base(r, o);
  // The channel id is the record's identity: without a valid one there is nothing to watch.
  if (typeof r.channelId !== 'string' || !/^UC[A-Za-z0-9_-]{22}$/.test(r.channelId)) return reject('bad-field');
  const lastCheckedAt = date(r.lastCheckedAt);
  return {
    ...b,
    channelId: r.channelId,
    title: str(r.title, MAX_SHORT),
    handle: str(r.handle, MAX_SHORT),
    notes: str(r.notes, MAX_TEXT),
    seenVideoIds: tags(r.seenVideoIds, 5000).filter((id) => /^[\w-]{6,20}$/.test(id)),
    ...(lastCheckedAt && { lastCheckedAt }),
  };
}

function reply(r: Raw, o: SanitizeOptions): Reply {
  const b = base(r, o);
  const text = firstText(r, ['text', 'body'], MAX_TEXT);
  if (!text.trim()) return reject('empty');
  const name = firstText(r, ['name', 'title'], MAX_SHORT) || firstLine(text, 40);
  const profileId = optStr(r.profileId, 100);
  return { ...b, name, text, ...(profileId && { profileId }) };
}

function optimize(r: Raw, o: SanitizeOptions): OptimizeItem {
  const b = base(r, o);
  if (typeof r.channelId !== 'string' || !CHANNEL_ID.test(r.channelId) || typeof r.videoId !== 'string' || !VIDEO_ID.test(r.videoId)) return reject('bad-field');
  // The id ties the item to one channel and one video; anything else is a foreign record.
  if (b.id !== `${r.channelId}:${r.videoId}`) return reject('bad-id');
  const snoozeUntil = date(r.snoozeUntil);
  const baseline = snap(r.baseline);
  const draftId = optStr(r.draftId, 100);
  return {
    ...b,
    channelId: r.channelId,
    videoId: r.videoId,
    title: str(r.title, MAX_SHORT),
    status: QUEUE_STATUSES.includes(r.status as never) ? (r.status as OptimizeItem['status']) : 'open',
    log: logEntries(r.log),
    ...(snoozeUntil && { snoozeUntil }),
    ...(baseline && { baseline }),
    ...(draftId && { draftId }),
  };
}

const MAX_THUMB = 400_000;
function variants(v: unknown): Variant[] {
  if (!Array.isArray(v)) return [];
  const out: Variant[] = [];
  for (const x of v.slice(0, 3)) {
    if (!isObj(x)) continue;
    const id = optStr(x.id, 40);
    if (!id) continue;
    const thumb = typeof x.thumb === 'string' && x.thumb.length <= MAX_THUMB && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x.thumb) ? x.thumb : undefined;
    out.push({ id, title: str(x.title, MAX_SHORT), thumbNote: str(x.thumbNote, MAX_SHORT), rationale: str(x.rationale, MAX_TEXT), ...(thumb && { thumb }) });
  }
  return out;
}

function experiment(r: Raw, o: SanitizeOptions): Experiment {
  const b = base(r, o);
  if (typeof r.channelId !== 'string' || !CHANNEL_ID.test(r.channelId) || typeof r.videoId !== 'string' || !VIDEO_ID.test(r.videoId)) return reject('bad-field');
  const vs = variants(r.variants);
  const ids = new Set(vs.map((x) => x.id));
  const results = (Array.isArray(r.results) ? r.results : [])
    .filter(isObj)
    .filter((x) => typeof x.variantId === 'string' && ids.has(x.variantId))
    .slice(0, 3)
    .map((x) => {
      const share = num(x.share);
      return { variantId: x.variantId as string, note: str(x.note, MAX_SHORT), ...(share !== undefined && share <= 100 && { share }) };
    });
  const startedAt = date(r.startedAt);
  const endedAt = date(r.endedAt);
  const winnerId = typeof r.winnerId === 'string' && ids.has(r.winnerId) ? r.winnerId : undefined;
  return {
    ...b,
    channelId: r.channelId,
    videoId: r.videoId,
    videoTitle: str(r.videoTitle, MAX_SHORT),
    hypothesis: str(r.hypothesis, MAX_TEXT),
    status: EXPERIMENT_STATUSES.includes(r.status as never) ? (r.status as Experiment['status']) : 'draft',
    variants: vs,
    results,
    decision: str(r.decision, MAX_TEXT),
    ...(startedAt && { startedAt }),
    ...(endedAt && { endedAt }),
    ...(winnerId && { winnerId }),
  };
}

const SANITIZERS: { [K in CollectionName]: (r: Raw, o: SanitizeOptions) => Collections[K] } = {
  profiles: profile,
  ideas: idea,
  drafts: draft,
  templates: template,
  keywordLists: keywordList,
  watchlist: watched,
  replies: reply,
  optimize,
  experiments: experiment,
};

/** Cleans one record and says why when it cannot be used. */
export function checkRecord<K extends CollectionName>(
  name: K,
  raw: unknown,
  o: SanitizeOptions = {},
): { ok: true; record: Collections[K] } | { ok: false; reason: RejectReason } {
  if (!isObj(raw)) return { ok: false, reason: 'not-object' };
  try {
    return { ok: true, record: SANITIZERS[name](raw, o) as Collections[K] };
  } catch (e) {
    return { ok: false, reason: e instanceof Reject ? e.reason : 'bad-field' };
  }
}

export function sanitizeRecord<K extends CollectionName>(name: K, raw: unknown, o: SanitizeOptions = {}): Collections[K] | null {
  const r = checkRecord(name, raw, o);
  return r.ok ? r.record : null;
}

export function isCollectionName(v: string): v is CollectionName {
  return (COLLECTIONS as string[]).includes(v);
}
