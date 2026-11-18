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

/** What the viewer wants from a topic (rough search intent, chosen by the owner or inferred from words). */
export type Intent = 'learn' | 'compare' | 'buy' | 'fix' | 'news' | 'entertain';
export const INTENTS: Intent[] = ['learn', 'compare', 'buy', 'fix', 'news', 'entertain'];

/**
 * Research context carried from Research/YouTube pages into an Idea and on to its Draft (#14). Signals are
 * public numbers as seen at `retrievedAt` (sampled, not live) and are shown with that date.
 */
export interface ResearchRef {
  topic?: string;
  keyword?: string;
  language?: Lang;
  intent?: Intent;
  /** Connected Google channel the idea is for (never mixed with another channel's queue). */
  channelId?: string;
  retrievedAt?: string;
  signals?: Record<string, number | string>;
}

export interface Idea extends BaseRecord {
  text: string;
  notes: string;
  status: IdeaStatus;
  profileId?: string;
  source?: SourceRef;
  research?: ResearchRef;
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
  research?: ResearchRef;
  /** Optional per-platform packages; YouTube stays the draft's own fields (A1, #17). */
  platforms?: { aparat?: AparatPackage };
}

export type PublishStatus = 'prepared' | 'uploaded' | 'published' | 'manual-check';
export const PUBLISH_STATUSES: PublishStatus[] = ['prepared', 'uploaded', 'published', 'manual-check'];

/** Aparat metadata prepared from a draft. Never uploaded by TubeX: the owner publishes in Aparat's own page. */
export interface AparatPackage {
  title: string;
  description: string;
  tags: string[];
  category: string;
  playlist: string;
  /** Cover/thumbnail notes (the image itself stays a local file the owner uploads). */
  coverNote: string;
  scheduleNote: string;
  status: PublishStatus;
  /** Aparat video page, entered by the owner after publishing. */
  url?: string;
  statusAt: string;
}

// ---------------------------------------------------------------- Optimize queue (#10)

export type QueueStatus = 'open' | 'doing' | 'done' | 'snoozed' | 'dismissed';
export const QUEUE_STATUSES: QueueStatus[] = ['open', 'doing', 'done', 'snoozed', 'dismissed'];

/** Own-channel numbers at one moment, each optional (unknown stays unknown, never 0). */
export interface MetricSnap {
  at: string;
  /** Period the numbers cover, e.g. last 28 days ending at `at`. */
  periodDays: number;
  views?: number;
  impressions?: number;
  /** Impressions click-through rate in percent. */
  ctr?: number;
  avgViewPercent?: number;
}

export type QueueAction = 'title' | 'thumbnail' | 'description' | 'tags' | 'note' | 'status';
export interface QueueLogEntry {
  at: string;
  action: QueueAction;
  before?: string;
  after?: string;
  note?: string;
}

/** One existing video in the Improve queue. id = `${channelId}:${videoId}` so channels never mix. */
export interface OptimizeItem extends BaseRecord {
  channelId: string;
  videoId: string;
  title: string;
  status: QueueStatus;
  snoozeUntil?: string;
  /** Measured numbers when work started (the "before" of the observation log). */
  baseline?: MetricSnap;
  log: QueueLogEntry[];
  draftId?: string;
}

// ---------------------------------------------------------------- A/B test assistant (#12, #13)

export interface Variant {
  id: string;
  title: string;
  /** Small JPEG/PNG data URL (TubeX keeps it under ~300 KB). */
  thumb?: string;
  thumbNote: string;
  rationale: string;
}

export type ExperimentStatus = 'draft' | 'running' | 'finished' | 'abandoned';
export const EXPERIMENT_STATUSES: ExperimentStatus[] = ['draft', 'running', 'finished', 'abandoned'];

export interface Experiment extends BaseRecord {
  channelId: string;
  videoId: string;
  videoTitle: string;
  hypothesis: string;
  status: ExperimentStatus;
  startedAt?: string;
  endedAt?: string;
  variants: Variant[];
  /** Results copied by the owner from Studio's Test & Compare (watch-time share in percent). */
  results: { variantId: string; share?: number; note: string }[];
  winnerId?: string;
  decision: string;
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
  optimize: OptimizeItem;
  experiments: Experiment;
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ['profiles', 'ideas', 'drafts', 'templates', 'keywordLists', 'watchlist', 'replies', 'optimize', 'experiments'];

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
