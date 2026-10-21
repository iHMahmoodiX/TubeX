// DOM anchors for the launchers and Videolytics. Selectors are Inferred for the 2026 YouTube/Studio layouts and
// checked only against synthetic fixtures (tests/unit/launchers.test.ts). Each reader has fallbacks and returns
// null when nothing matches, so the island simply does not appear. Read-only: nothing here changes the page.
import type { AnchorSpot } from '../mount';

type Append = AnchorSpot['append'];

function firstSpot(root: ParentNode, candidates: [string, Append][]): AnchorSpot | null {
  for (const [sel, append] of candidates) {
    const el = root.querySelector(sel);
    if (el) return { el, append };
  }
  return null;
}

/** Videolytics: top of the watch page's right column, above the recommendations. */
export function videolyticsSpot(doc: Document): AnchorSpot | null {
  return firstSpot(doc, [
    ['ytd-watch-flexy:not([hidden]) #secondary-inner', 'first'],
    ['ytd-watch-flexy:not([hidden]) #secondary', 'first'],
    ['ytd-watch-flexy:not([hidden]) #related', 'before'],
    ['ytd-watch-flexy:not([hidden]) ytd-watch-next-secondary-results-renderer', 'before'],
  ]);
}

/** Studio top bar: just before the help button (so the order is TubeX, help, notifications), with fallbacks. */
export function studioMastheadSpot(doc: Document): AnchorSpot | null {
  return firstSpot(doc, [
    ['ytcp-header #help-button', 'before'],
    ['ytcp-header ytcp-help-button', 'before'],
    ['ytcp-header ytcp-icon-button[aria-label="Help"]', 'before'],
    ['ytcp-header #right-section', 'first'],
    ['ytcp-header .right-section', 'first'],
    ['ytcp-header #end', 'first'],
    ['#header #right-section', 'first'],
  ]);
}

/** The page's own writing direction (YouTube stays LTR even with a Persian UI; RTL layouts set dir="rtl"). */
export function pageDir(doc: Document): 'ltr' | 'rtl' {
  const attr = (doc.documentElement.getAttribute('dir') || doc.body?.getAttribute('dir') || '').toLowerCase();
  if (attr === 'rtl' || attr === 'ltr') return attr;
  try {
    return getComputedStyle(doc.documentElement).direction === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

/** True while the page shows a video in fullscreen (the edge tab steps aside). */
export function inFullscreen(doc: Document): boolean {
  return !!doc.fullscreenElement || doc.querySelector('ytd-watch-flexy[fullscreen]') !== null;
}
