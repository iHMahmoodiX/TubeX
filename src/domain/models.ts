import type { PageKind } from './pageContext';

export type Lang = 'fa' | 'en';

export interface BaseRecord {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Incremented on every save; used to detect edits from another TubeX window. */
  rev: number;
}

/** A source link captured from a page. Descriptive fields are what the page showed at capture time. */
export interface SourceRef {
  kind: PageKind;
  url: string;
  videoId?: string;
  title?: string;
  channelName?: string;
  searchQuery?: string;
  capturedAt: string;
  origin: 'url' | 'dom';
}

/** A local channel profile. Not proof of channel ownership: connection is verified in M2. */
export interface Profile extends BaseRecord {
  name: string;
  handle: string;
  contentLanguage: Lang;
  notes: string;
  connection: 'unconnected';
}

export type IdeaStatus = 'inbox' | 'planned' | 'used' | 'dropped';
export const IDEA_STATUSES: IdeaStatus[] = ['inbox', 'planned', 'used', 'dropped'];

export interface Idea extends BaseRecord {
  text: string;
  notes: string;
  status: IdeaStatus;
  profileId?: string;
  source?: SourceRef;
}

export interface Draft extends BaseRecord {
  profileId?: string;
  ideaId?: string;
  source?: SourceRef;
  language: Lang;
  focusKeyword: string;
  title: string;
  description: string;
  tags: string[];
}

export interface Template extends BaseRecord {
  name: string;
  profileId?: string;
  description: string;
  tags: string[];
}

/** A saved keyword with optional notes, grouped into named lists. */
export interface KeywordList extends BaseRecord {
  name: string;
  profileId?: string;
  keywords: { text: string; note: string; addedAt: string }[];
}

/** A public channel the owner follows (competitor, peer or inspiration). */
export interface WatchedChannel extends BaseRecord {
  channelId: string;
  title: string;
  handle: string;
  notes: string;
  /** Video ids seen at the last refresh; used to mark new uploads. */
  seenVideoIds: string[];
  lastCheckedAt?: string;
}

/** A saved comment reply (canned response). */
export interface Reply extends BaseRecord {
  name: string;
  text: string;
  profileId?: string;
}

export interface Collections {
  profiles: Profile;
  ideas: Idea;
  drafts: Draft;
  templates: Template;
  keywordLists: KeywordList;
  watchlist: WatchedChannel;
  replies: Reply;
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ['profiles', 'ideas', 'drafts', 'templates', 'keywordLists', 'watchlist', 'replies'];

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function newBase(): BaseRecord {
  const t = nowIso();
  return { id: newId(), createdAt: t, updatedAt: t, rev: 0 };
}
