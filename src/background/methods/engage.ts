// RPC methods for the engage area. Names are prefixed 'engage.'. Arguments are validated: content scripts run
// next to an untrusted page.
import { chunk, MAX_COMMENT_CHARS, MODERATION_CHUNK } from '../../domain/engageComments';
import { loadGoogleState } from '../../integrations/google/auth';
import { replyToComment, setModerationStatus } from '../../integrations/google/ownWrites';
import { list } from '../../storage/db';
import { one, put } from '../../storage/stores';

const COMMENT_ID = /^[\w.-]{6,120}$/;

async function activeChannelId(): Promise<string> {
  const s = await loadGoogleState();
  if (!s.activeChannelId) throw new Error('not signed in');
  return s.activeChannelId;
}

export const engageMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /** Posts a reply under a top-level comment on the active channel's videos (50 units). */
  'engage.replyComment': async (commentId: unknown, text: unknown) => {
    if (typeof commentId !== 'string' || !COMMENT_ID.test(commentId)) throw new Error('bad argument');
    if (typeof text !== 'string' || !text.trim() || [...text].length > MAX_COMMENT_CHARS) throw new Error('bad argument');
    return replyToComment(await activeChannelId(), commentId, text);
  },
  /** Canned responses from the local 'replies' collection. */
  'engage.listReplies': async () => (await list('replies')).items.map((r) => ({ id: r.id, name: r.name, text: r.text, profileId: r.profileId })),
  /** Sets moderation status (published | heldForReview | rejected) of comments; 50 units per 10 ids. Never bans. */
  'engage.moderate': async (ids: unknown, status: unknown) => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every((x) => typeof x === 'string' && COMMENT_ID.test(x))) throw new Error('bad argument');
    if (status !== 'published' && status !== 'heldForReview' && status !== 'rejected') throw new Error('bad argument');
    const ch = await activeChannelId();
    let done = 0;
    for (const part of chunk(ids as string[], MODERATION_CHUNK)) {
      await setModerationStatus(ch, part, status);
      done += part.length;
    }
    return { done };
  },
  /** Links a scheduled update to its revert job so the revert restores the real before-state. */
  'engage.linkRevert': async (jobId: unknown, revertJobId: unknown) => {
    if (typeof jobId !== 'string' || typeof revertJobId !== 'string' || jobId.length > 64 || revertJobId.length > 64) throw new Error('bad argument');
    const j = await one('jobs', jobId);
    if (!j || j.kind !== 'engage.update') throw new Error('bad argument');
    await put('jobs', { ...j, payload: { ...j.payload, revertJobId } });
  },
};
