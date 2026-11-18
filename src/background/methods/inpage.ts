// RPC methods for the in-page tools (youtube.com and Studio islands). Names are prefixed 'inpage.'.
// Arguments come from content scripts running next to an untrusted page, so each is validated.
import { dedupeTags, LIMITS, tagsCharCount } from '../../domain/metadata';
import { nowIso } from '../../domain/models';
import { getChannel, channelUploads, type ChannelInfo, type VideoInfo } from '../../integrations/youtube/api';
import { get, list, save } from '../../storage/db';
import { all } from '../../storage/stores';

const str = (v: unknown, max = 200): string => {
  if (typeof v !== 'string' || !v || v.length > max) throw new Error('bad argument');
  return v;
};
const strs = (v: unknown, n = 100): string[] => {
  if (!Array.isArray(v) || v.length > n) throw new Error('bad argument');
  return v.map((x) => str(x, 100));
};

export const inpageMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /** Number of unread alerts (masthead badge). */
  'inpage.unreadAlerts': async () => (await all('alerts')).filter((a) => !a.read).length,

  /** Saved canned replies (fallback when engage.listReplies is not available). */
  'inpage.replies': async () => (await list('replies')).items.map((r) => ({ id: r.id, name: r.name, text: r.text })),

  /** Adds tags to a TubeX draft, keeping the 500-character limit. Returns what was added and skipped. */
  'inpage.addTagsToDraft': async (draftId: unknown, tags: unknown) => {
    const d = await get('drafts', str(draftId, 64));
    if (!d) throw new Error('draft not found');
    const before = d.tags;
    const merged = dedupeTags([...before, ...strs(tags)]);
    const kept: string[] = [...before];
    const skipped: string[] = [];
    for (const t of merged.slice(before.length)) {
      if (tagsCharCount([...kept, t]) > LIMITS.tagsChars) skipped.push(t);
      else kept.push(t);
    }
    const added = kept.length - before.length;
    if (added > 0) {
      const r = await save('drafts', { ...d, tags: kept, updatedAt: nowIso() });
      if (!r.ok) throw new Error('draft changed elsewhere; try again');
    }
    return { added, skipped, title: d.title };
  },

  /** Channel details plus its latest uploads (up to 10) for the channel page strip. 3 units when not cached. */
  'inpage.channelOverview': async (ref: unknown) => {
    const r = (typeof ref === 'object' && ref !== null ? ref : {}) as { id?: unknown; handle?: unknown };
    if (!r.id && !r.handle) throw new Error('bad argument');
    const channel: ChannelInfo | null = (await getChannel({ id: r.id ? str(r.id, 64) : undefined, handle: r.handle ? str(r.handle, 120) : undefined })).data;
    if (!channel) return { channel: null, recent: [] };
    const recent: VideoInfo[] = channel.uploadsPlaylistId ? (await channelUploads(channel.uploadsPlaylistId, 10)).data : [];
    return { channel, recent };
  },
};
