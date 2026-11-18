// Single owner of record shapes at trust boundaries (backup import, stored data read-back).
// Only known keys are copied, so unexpected keys (including __proto__) never reach storage.
// Records from older TubeX versions get defaults for fields added since 0.1.0; only data that cannot be a
// record (not an object, no usable id, no content) is refused, with a reason for the import report.
import { COLLECTIONS, IDEA_STATUSES } from './models';
import type { BaseRecord, CollectionName, Collections, Draft, Idea, KeywordList, Lang, Profile, Reply, SourceRef, Template, WatchedChannel } from './models';
import type { PageKind } from './pageContext';

const MAX_TEXT = 20_000;
const MAX_SHORT = 1_000;
const MAX_TAGS = 200;
const KINDS: PageKind[] = ['watch', 'shorts', 'search', 'channel', 'playlist', 'home', 'studio-video', 'studio', 'youtube-other', 'unsupported', 'unknown'];

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
  return { ...b, text, notes: str(r.notes, MAX_TEXT), status, ...(profileId && { profileId }), ...(src && { source: src }) };
}

function draft(r: Raw, o: SanitizeOptions): Draft {
  const b = base(r, o);
  const src = source(r.source, b.createdAt);
  const profileId = optStr(r.profileId, 100);
  const ideaId = optStr(r.ideaId, 100);
  return {
    ...b,
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

const SANITIZERS: { [K in CollectionName]: (r: Raw, o: SanitizeOptions) => Collections[K] } = {
  profiles: profile,
  ideas: idea,
  drafts: draft,
  templates: template,
  keywordLists: keywordList,
  watchlist: watched,
  replies: reply,
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
