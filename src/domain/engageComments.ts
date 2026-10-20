// Comment inbox rules: normalizing commentThreads, filters, spam heuristics, canned-reply placeholders and
// bulk moderation plans. Pure functions, no browser APIs.
import { normalizeForSearch } from './text';

export type ModerationStatus = 'published' | 'heldForReview' | 'likelySpam' | 'rejected';

export interface CommentReply {
  id: string;
  authorName: string;
  authorChannelId: string;
  authorAvatar?: string;
  text: string;
  publishedAt: string;
  likes: number;
}

export interface CommentThread {
  /** Thread id; also the id of the top-level comment (used as parentId and for moderation). */
  id: string;
  videoId: string;
  authorName: string;
  authorChannelId: string;
  authorAvatar?: string;
  text: string;
  publishedAt: string;
  likes: number;
  /** Total replies YouTube reports; `replies` holds at most the few YouTube returns with the thread. */
  replyCount: number;
  replies: CommentReply[];
  moderationStatus: string;
  canReply: boolean;
}

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {});
const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const https = (v: unknown): string | undefined => (typeof v === 'string' && v.startsWith('https://') ? v : undefined);

function toReply(item: unknown): CommentReply {
  const it = o(item);
  const sn = o(it.snippet);
  return {
    id: s(it.id),
    authorName: s(sn.authorDisplayName),
    authorChannelId: s(o(sn.authorChannelId).value),
    authorAvatar: https(sn.authorProfileImageUrl),
    text: s(sn.textOriginal) || s(sn.textDisplay),
    publishedAt: s(sn.publishedAt),
    likes: n(sn.likeCount),
  };
}

/** Normalizes one commentThreads item (part=snippet,replies). */
export function toThread(item: unknown): CommentThread {
  const it = o(item);
  const sn = o(it.snippet);
  const top = o(sn.topLevelComment);
  const tsn = o(top.snippet);
  const replies = Array.isArray(o(it.replies).comments) ? (o(it.replies).comments as unknown[]).map(toReply) : [];
  replies.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  return {
    id: s(it.id) || s(top.id),
    videoId: s(sn.videoId) || s(tsn.videoId),
    authorName: s(tsn.authorDisplayName),
    authorChannelId: s(o(tsn.authorChannelId).value),
    authorAvatar: https(tsn.authorProfileImageUrl),
    text: s(tsn.textOriginal) || s(tsn.textDisplay),
    publishedAt: s(tsn.publishedAt),
    likes: n(tsn.likeCount),
    replyCount: n(sn.totalReplyCount),
    replies,
    moderationStatus: s(tsn.moderationStatus) || 'published',
    canReply: sn.canReply !== false,
  };
}

/**
 * Whether the owner already replied. `null` when unknown: YouTube returns only a few replies with a thread,
 * so a thread with more replies than were returned may hold an owner reply TubeX has not seen.
 */
export function answeredByOwner(t: CommentThread, ownChannelId: string): boolean | null {
  if (t.replies.some((r) => r.authorChannelId === ownChannelId)) return true;
  if (t.replyCount > t.replies.length) return null;
  return false;
}

export function isQuestion(text: string): boolean {
  return /[?؟]/.test(text);
}

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|me|ly|xyz|ru|ir|link|info|top|site|click|shop)\b|t\.me\/|wa\.me\/|bit\.ly)/giu;

/** Reasons a comment looks like spam (links, contact handles, repeated characters). Heuristic, never automatic. */
export function spamSignals(text: string): ('links' | 'contact' | 'repeat')[] {
  const out: ('links' | 'contact' | 'repeat')[] = [];
  if ((text.match(LINK) ?? []).length > 0) out.push('links');
  if (/(whatsapp|telegram|تلگرام|واتساپ|\+\d[\d\s-]{8,})/iu.test(text)) out.push('contact');
  if (/(.)\1{7,}/u.test(text)) out.push('repeat');
  return out;
}

export interface CommentFilter {
  unanswered?: boolean;
  questions?: boolean;
  spam?: boolean;
  query?: string;
  author?: string;
  videoId?: string;
}

export function matchesFilter(t: CommentThread, f: CommentFilter, ownChannelId: string): boolean {
  if (t.authorChannelId && t.authorChannelId === ownChannelId) {
    // The owner's own top-level comments are never "unanswered" and never spam candidates.
    if (f.unanswered || f.spam) return false;
  }
  if (f.unanswered && answeredByOwner(t, ownChannelId) !== false) return false;
  if (f.questions && !isQuestion(t.text)) return false;
  if (f.spam && !spamSignals(t.text).length) return false;
  if (f.videoId && t.videoId !== f.videoId) return false;
  if (f.author?.trim() && !normalizeForSearch(t.authorName).includes(normalizeForSearch(f.author.trim()))) return false;
  if (f.query?.trim()) {
    const q = normalizeForSearch(f.query.trim());
    if (!normalizeForSearch(`${t.text}\n${t.authorName}`).includes(q)) return false;
  }
  return true;
}

export function filterThreads(threads: CommentThread[], f: CommentFilter, ownChannelId: string): CommentThread[] {
  return threads.filter((t) => matchesFilter(t, f, ownChannelId));
}

/** Fills {name} (author, without a leading @) and {video} (video title) in a canned reply. */
export function fillReply(template: string, vars: { name?: string; video?: string }): string {
  const name = (vars.name ?? '').replace(/^@/, '').trim();
  const video = (vars.video ?? '').trim();
  return template.replace(/\{(name|video)\}/g, (_, k: string) => (k === 'name' ? name : video)).replace(/[ \t]{2,}/g, ' ');
}

/** Placeholders a canned reply uses, so the UI can say what will be filled. */
export function placeholdersIn(template: string): ('name' | 'video')[] {
  const out = new Set<'name' | 'video'>();
  for (const m of template.matchAll(/\{(name|video)\}/g)) out.add(m[1] as 'name' | 'video');
  return [...out];
}

export const COMMENT_WRITE_COST = 50; // comments.insert / comments.delete / comments.setModerationStatus (Inferred)
/** Comment ids per comments.setModerationStatus request (the API takes a comma-separated list). */
export const MODERATION_CHUNK = 10;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Units for moderating `count` comments: one request per chunk. */
export function moderationCost(count: number): number {
  return Math.ceil(count / MODERATION_CHUNK) * COMMENT_WRITE_COST;
}

export const MAX_COMMENT_CHARS = 10_000;
