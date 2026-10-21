// RPC methods for Studio Content page tools: bulk & tools menu, selection actions, related video for Shorts, COPPA (made for kids). Arguments from content scripts are validated.
import { browser } from 'wxt/browser';
import { KIDS_MAX_BATCH, selectionRouteId, VIDEO_ID, CONTENT_TABS, type ContentTab } from '../../domain/coppa';
import { loadGoogleState } from '../../integrations/google/auth';
import { applyKidsBatch, listKidsBatches, listKidsVideos, readKids, undoKidsBatch } from '../../integrations/google/kidsWrites';
import type { WorkspaceRoute } from '../../platform/navigation';
import { serializeError } from '../../platform/rpc';

const ROUTES: readonly WorkspaceRoute[] = ['bulk', 'thumbs', 'kids', 'schedule', 'reports', 'settings', 'shorts', 'mychannel'];
const SUB = /^[a-z]{1,20}$/;

function ids(v: unknown, max = KIDS_MAX_BATCH): string[] {
  if (!Array.isArray(v) || v.length > max || !v.every((x) => typeof x === 'string' && VIDEO_ID.test(x))) throw new Error('bad argument');
  return [...new Set(v as string[])];
}

async function active() {
  const s = await loadGoogleState();
  const ch = s.channels.find((c) => c.channelId === s.activeChannelId);
  if (!ch) throw new Error('not signed in');
  return ch;
}

const ser = <T extends { error?: unknown }>(r: T) => (r.error === undefined ? r : { ...r, error: serializeError(r.error) });

export const studioContentMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /**
   * Opens the workspace at a route, carrying the selected rows and the Content tab as the route id
   * (`ids=...&tab=...`), or a sub-tab (e.g. reports/clickmagnet). No 200-character cap: up to 500 ids.
   */
  'studioContent.open': async (route: unknown, opts?: unknown) => {
    if (typeof route !== 'string' || !(ROUTES as readonly string[]).includes(route)) throw new Error('bad argument');
    const o = (typeof opts === 'object' && opts !== null ? opts : {}) as { ids?: unknown; tab?: unknown; sub?: unknown };
    let id = '';
    if (typeof o.sub === 'string' && SUB.test(o.sub)) id = o.sub;
    else {
      const list = o.ids === undefined ? [] : ids(o.ids, 500);
      const tab = typeof o.tab === 'string' && (CONTENT_TABS as readonly string[]).includes(o.tab) ? (o.tab as ContentTab) : undefined;
      id = selectionRouteId({ ids: list, tab });
    }
    const hash = id ? `${route}/${encodeURIComponent(id)}` : route;
    await browser.tabs.create({ url: browser.runtime.getURL(`/workspace.html#${hash}` as '/workspace.html') });
  },

  /** Own uploads with kids status, for the related-video target search and the COPPA list (~2 units per 50, cached). */
  'studioContent.myVideos': async (fresh?: unknown) => {
    const ch = await active();
    if (!ch.uploadsPlaylistId) return [];
    return listKidsVideos(ch.channelId, ch.uploadsPlaylistId, 500, fresh === true);
  },

  /** Live kids status of the given own videos (1 unit per 50, never cached): the preview before a write. */
  'studioContent.kidsStatus': async (videoIds: unknown) => {
    const list = ids(videoIds);
    return readKids((await active()).channelId, list);
  },

  /** Sets "made for kids" (selfDeclaredMadeForKids) on each video; 51 units per changed video. Records undo. */
  'studioContent.kidsApply': async (videoIds: unknown, value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('bad argument');
    const list = ids(videoIds);
    const r = await applyKidsBatch((await active()).channelId, list, value);
    return { ...r, results: r.results.map(ser) };
  },

  'studioContent.kidsUndo': async (batchId: unknown) => {
    if (typeof batchId !== 'string' || !/^[\w-]{8,64}$/.test(batchId)) throw new Error('bad argument');
    const r = await undoKidsBatch((await active()).channelId, batchId);
    return { ...r, results: r.results.map(ser) };
  },

  'studioContent.kidsBatches': async () => listKidsBatches((await active()).channelId),
};
