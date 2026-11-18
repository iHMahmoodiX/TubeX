// RPC for Ask Studio automation (D-030). Names are prefixed 'askStudio.'. Called from TubeX pages:
// finds or opens a Studio tab, asks the content script there, and keeps a local history of answers.
import { browser } from 'wxt/browser';
import { studioUrlFor, type AskMode } from '../../domain/askStudio';
import { ASK_MSG, ASK_PING, type AskReply, type AskRequestMsg } from '../../inpage/askStudio';
import { addAskHistory, loadAskSettings } from '../../storage/askStudio';

const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ready(tabId: number, ms = 40_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = (await browser.tabs.sendMessage(tabId, { type: ASK_PING }).catch(() => null)) as { ok?: boolean } | null;
    if (r?.ok) return true;
    await sleep(700);
  }
  return false;
}

async function openTab(url: string): Promise<number> {
  const tab = await browser.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error('ask:no-tab');
  return tab.id;
}

/** A ready Studio tab: the one already on the target page, any Studio tab (direct mode), or a new background tab. */
async function studioTab(url: string, anyTab: boolean): Promise<{ id: number; opened: boolean }> {
  const tabs = await browser.tabs.query({ url: 'https://studio.youtube.com/*' }).catch(() => []);
  const exact = tabs.find((t) => t.url?.startsWith(url.replace(/\/analytics.*$/, '')));
  const pick = exact ?? (anyTab ? tabs[0] : undefined);
  if (pick?.id !== undefined && (await ready(pick.id, 3000))) return { id: pick.id, opened: false };
  const id = await openTab(url);
  if (!(await ready(id))) {
    await browser.tabs.remove(id).catch(() => undefined);
    throw new Error('ask:no-studio');
  }
  return { id, opened: true };
}

async function send(tabId: number, msg: AskRequestMsg): Promise<AskReply> {
  return ((await browser.tabs.sendMessage(tabId, msg).catch((e: unknown) => ({ ok: false, code: 'timeout', detail: String(e) }))) ?? { ok: false, code: 'timeout' }) as AskReply;
}

export const askStudioMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /** Asks Ask Studio. Returns { answer, mode, learned }. Direct mode falls back to the page once when it has not learned yet or fails. */
  'askStudio.ask': async (question: unknown, ctxRaw: unknown, title: unknown) => {
    if (typeof question !== 'string' || !question.trim() || question.length > 4000) throw new Error('bad argument');
    const c = (ctxRaw ?? {}) as Record<string, unknown>;
    const ctx = {
      videoId: typeof c.videoId === 'string' && VIDEO_ID.test(c.videoId) ? c.videoId : undefined,
      channelId: typeof c.channelId === 'string' && CHANNEL_ID.test(c.channelId) ? c.channelId : undefined,
    };
    const s = await loadAskSettings();
    if (s.mode === 'copy') throw new Error('ask:off');
    const url = studioUrlFor(ctx);
    let mode: Exclude<AskMode, 'copy'> = s.mode;
    if (mode === 'direct' && !s.learned) mode = 'page';
    let tab = await studioTab(url, mode === 'direct');
    try {
      let r = await send(tab.id, { type: ASK_MSG, question, mode, ...ctx });
      if (!r.ok && mode === 'direct' && r.code !== 'signed-out') {
        // Studio changed its request, or nothing learned yet: ask on the page once (which learns again).
        if (!tab.opened) tab = await studioTab(url, false);
        mode = 'page';
        r = await send(tab.id, { type: ASK_MSG, question, mode, ...ctx });
      }
      if (!r.ok) throw new Error(`ask:${r.code}${r.detail ? `:${r.detail}` : ''}`);
      await addAskHistory({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), question, answer: r.answer.slice(0, 20000), mode, ...(ctx.videoId && { videoId: ctx.videoId }), ...(typeof title === 'string' && title && { videoTitle: title.slice(0, 200) }) });
      return { answer: r.answer, mode, learned: !!r.learned };
    } finally {
      if (tab.opened) await browser.tabs.remove(tab.id).catch(() => undefined);
    }
  },
};
