// Versioned YouTube page adapter. Reads only; never modifies the page.
// Selectors are unverified against live YouTube from the build environment; see docs/INTEGRATIONS.md.
import type { PageContext } from '../domain/pageContext';

export const ADAPTER_VERSION = 'yt-watch-2026-10-20';

const TITLE_SELECTORS = ['ytd-watch-metadata h1 yt-formatted-string', 'ytd-watch-metadata h1', '#title h1'];
const CHANNEL_SELECTORS = ['ytd-watch-metadata ytd-channel-name a', '#owner ytd-channel-name a', 'ytd-video-owner-renderer ytd-channel-name a'];

function firstText(doc: Document, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const text = doc.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 1000);
  }
  return undefined;
}

/**
 * Enriches a watch-page context with the visible title and channel name.
 * YouTube is a single-page app: the DOM can still show the previous video after navigation,
 * so data is returned only when the player element reports the same video id as the URL.
 */
export function readWatchDom(doc: Document, ctx: PageContext): { title?: string; channelName?: string } | null {
  if (ctx.kind !== 'watch' || !ctx.videoId) return null;
  const flexy = doc.querySelector('ytd-watch-flexy');
  if (!flexy || flexy.getAttribute('video-id') !== ctx.videoId) return null;
  const title = firstText(doc, TITLE_SELECTORS);
  const channelName = firstText(doc, CHANNEL_SELECTORS);
  if (!title && !channelName) return null;
  return { title, channelName };
}
