// Single owner of record shapes at trust boundaries (backup import, stored data read-back).
// Only known keys are copied, so unexpected keys (including __proto__) never reach storage.
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

function str(v: unknown, max: number, fallback = ''): string | null {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'string' || v.length > max) return null;
  return v;
}
function optStr(v: unknown, max: number): string | undefined | null {
  if (v === undefined || v === null || v === '') return undefined;
  return typeof v === 'string' && v.length <= max ? v : null;
}
function lang(v: unknown): Lang {
  return v === 'en' ? 'en' : 'fa';
}
function tags(v: unknown): string[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_TAGS) return null;
  if (!v.every((t) => typeof t === 'string' && t.length <= MAX_SHORT)) return null;
  return v as string[];
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

function base(r: Raw): BaseRecord | null {
  if (typeof r.id !== 'string' || r.id.length < 1 || r.id.length > 100) return null;
  if (!isIso(r.createdAt) || !isIso(r.updatedAt)) return null;
  const rev = typeof r.rev === 'number' && Number.isInteger(r.rev) && r.rev >= 0 ? r.rev : 0;
  return { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, rev };
}

function source(v: unknown): SourceRef | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (!isObj(v)) return null;
  const url = httpsUrl(v.url);
  if (!url || !KINDS.includes(v.kind as PageKind) || !isIso(v.capturedAt)) return null;
  const videoId = optStr(v.videoId, 20);
  const title = optStr(v.title, MAX_SHORT);
  const channelName = optStr(v.channelName, MAX_SHORT);
  const searchQuery = optStr(v.searchQuery, MAX_SHORT);
  if (videoId === null || title === null || channelName === null || searchQuery === null) return null;
  return {
    kind: v.kind as PageKind,
    url,
    capturedAt: v.capturedAt,
    origin: v.origin === 'dom' ? 'dom' : 'url',
    ...(videoId && { videoId }),
    ...(title && { title }),
    ...(channelName && { channelName }),
    ...(searchQuery && { searchQuery }),
  };
}

function profile(r: Raw): Profile | null {
  const b = base(r);
  const name = str(r.name, MAX_SHORT);
  const handle = str(r.handle, MAX_SHORT);
  const notes = str(r.notes, MAX_TEXT);
  if (!b || !name?.trim() || handle === null || notes === null) return null;
  return { ...b, name, handle, notes, contentLanguage: lang(r.contentLanguage), connection: 'unconnected' };
}

function idea(r: Raw): Idea | null {
  const b = base(r);
  const text = str(r.text, MAX_TEXT);
  const notes = str(r.notes, MAX_TEXT);
  const src = source(r.source);
  const profileId = optStr(r.profileId, 100);
  if (!b || !text?.trim() || notes === null || src === null || profileId === null) return null;
  const status = IDEA_STATUSES.includes(r.status as Idea['status']) ? (r.status as Idea['status']) : 'inbox';
  return { ...b, text, notes, status, ...(profileId && { profileId }), ...(src && { source: src }) };
}

function draft(r: Raw): Draft | null {
  const b = base(r);
  const title = str(r.title, MAX_SHORT);
  const description = str(r.description, MAX_TEXT);
  const focusKeyword = str(r.focusKeyword, MAX_SHORT);
  const t = tags(r.tags);
  const src = source(r.source);
  const profileId = optStr(r.profileId, 100);
  const ideaId = optStr(r.ideaId, 100);
  if (!b || title === null || description === null || focusKeyword === null || !t || src === null || profileId === null || ideaId === null)
    return null;
  return {
    ...b,
    title,
    description,
    focusKeyword,
    tags: t,
    language: lang(r.language),
    ...(profileId && { profileId }),
    ...(ideaId && { ideaId }),
    ...(src && { source: src }),
  };
}

function template(r: Raw): Template | null {
  const b = base(r);
  const name = str(r.name, MAX_SHORT);
  const description = str(r.description, MAX_TEXT);
  const t = tags(r.tags);
  const profileId = optStr(r.profileId, 100);
  if (!b || !name?.trim() || description === null || !t || profileId === null) return null;
  return { ...b, name, description, tags: t, ...(profileId && { profileId }) };
}

function keywordList(r: Raw): KeywordList | null {
  const b = base(r);
  const name = str(r.name, MAX_SHORT);
  const profileId = optStr(r.profileId, 100);
  if (!b || !name?.trim() || profileId === null) return null;
  const raw = r.keywords === undefined ? [] : r.keywords;
  if (!Array.isArray(raw) || raw.length > 2000) return null;
  const keywords: KeywordList['keywords'] = [];
  for (const k of raw) {
    if (!isObj(k)) return null;
    const text = str(k.text, MAX_SHORT);
    const note = str(k.note, MAX_TEXT);
    if (!text?.trim() || note === null) return null;
    keywords.push({ text, note, addedAt: isIso(k.addedAt) ? k.addedAt : b.createdAt });
  }
  return { ...b, name, keywords, ...(profileId && { profileId }) };
}

function watched(r: Raw): WatchedChannel | null {
  const b = base(r);
  const channelId = typeof r.channelId === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(r.channelId) ? r.channelId : null;
  const title = str(r.title, MAX_SHORT);
  const handle = str(r.handle, MAX_SHORT);
  const notes = str(r.notes, MAX_TEXT);
  const seen = tags(r.seenVideoIds);
  if (!b || !channelId || title === null || handle === null || notes === null || !seen) return null;
  return { ...b, channelId, title, handle, notes, seenVideoIds: seen, ...(isIso(r.lastCheckedAt) && { lastCheckedAt: r.lastCheckedAt }) };
}

function reply(r: Raw): Reply | null {
  const b = base(r);
  const name = str(r.name, MAX_SHORT);
  const text = str(r.text, MAX_TEXT);
  const profileId = optStr(r.profileId, 100);
  if (!b || !name?.trim() || text === null || profileId === null) return null;
  return { ...b, name, text, ...(profileId && { profileId }) };
}

const SANITIZERS: { [K in CollectionName]: (r: Raw) => Collections[K] | null } = {
  profiles: profile,
  ideas: idea,
  drafts: draft,
  templates: template,
  keywordLists: keywordList,
  watchlist: watched,
  replies: reply,
};

export function sanitizeRecord<K extends CollectionName>(name: K, raw: unknown): Collections[K] | null {
  if (!isObj(raw)) return null;
  return SANITIZERS[name](raw) as Collections[K] | null;
}

export function isCollectionName(v: string): v is CollectionName {
  return (COLLECTIONS as string[]).includes(v);
}
