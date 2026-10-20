// Resolves the active tab's page context for extension pages (side panel, popup).
import { browser } from 'wxt/browser';
import { cleanTabTitle, parsePageUrl, type PageContext } from '../domain/pageContext';
import { loadPrefs } from '../storage/prefs';
import { PAGE_CONTEXT_REQUEST, isPageContextResponse } from './messages';

const DOM_TIMEOUT_MS = 800;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}

export async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function getActivePageContext(): Promise<PageContext> {
  const tab = await getActiveTab();
  // Without host access to a tab, Chrome hides its URL: that page is outside TubeX's scope.
  if (tab && !tab.url) return { kind: 'unsupported', origin: 'url' };
  const ctx = parsePageUrl(tab?.url);
  if (ctx.kind === 'unknown' || ctx.kind === 'unsupported') return ctx;
  ctx.title = cleanTabTitle(tab?.title);
  if (ctx.kind !== 'watch' || tab?.id === undefined) return ctx;
  if (!(await loadPrefs()).pageAdapterEnabled) return ctx;
  try {
    const res = await withTimeout(browser.tabs.sendMessage(tab.id, { type: PAGE_CONTEXT_REQUEST }), DOM_TIMEOUT_MS);
    // Accept DOM data only if it describes the same video the tab URL points to.
    if (isPageContextResponse(res) && parsePageUrl(res.url).videoId === ctx.videoId && (res.title || res.channelName)) {
      return { ...ctx, title: res.title ?? ctx.title, channelName: res.channelName, origin: 'dom' };
    }
  } catch {
    // No content script in this tab (e.g. opened before install). URL-only context is still correct.
  }
  return ctx;
}

/** Calls `cb` when the active tab, its URL or its title changes. */
export function onActivePageChanged(cb: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(cb, 250);
  };
  const onUpdated = (_id: number, info: { url?: string; title?: string; status?: string }, tab: { active?: boolean }) => {
    if (tab.active && (info.url || info.title || info.status === 'complete')) fire();
  };
  browser.tabs.onActivated.addListener(fire);
  browser.tabs.onUpdated.addListener(onUpdated);
  browser.windows?.onFocusChanged?.addListener(fire);
  return () => {
    clearTimeout(timer);
    browser.tabs.onActivated.removeListener(fire);
    browser.tabs.onUpdated.removeListener(onUpdated);
    browser.windows?.onFocusChanged?.removeListener(fire);
  };
}
