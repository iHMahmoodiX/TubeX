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

// ---------------------------------------------------------------- watch page signals (Videolytics best practices)
// What the visible watch page shows about the video, for the checks no official API reports (pinned/hearted
// comments, cards, end screen) and as YouTube's own verdict on chapters and captions. Every selector is Inferred
// (2025–2026 desktop layout, not captured live); each signal has fallbacks and stays `undefined` ("can't tell")
// when nothing matches, so a missed selector shows "unknown", never a failed check.

/** undefined = not visible on the page (yet). */
export interface WatchSignals {
  /** 'shown': the player/description shows chapters; 'auto': YouTube's automatic chapters; 'none': player loaded without chapters. */
  chapters?: 'shown' | 'auto' | 'none';
  /** 'notLoaded' until the first comment thread renders; 'off' when comments are turned off. */
  pinned: 'yes' | 'no' | 'notLoaded' | 'off';
  /** true: a loaded comment shows the creator heart; false: comments loaded, none hearted (yet). */
  hearted?: boolean;
  /** true when the player has info cards; never false (absence is not proof). */
  cards?: true;
  /** true when the player has end-screen elements; never false. */
  endScreen?: true;
  /** CC button: 'on' = present and enabled (uploaded or automatic captions), 'off' = present and disabled. */
  cc?: 'on' | 'off';
}

const HIDDEN_STYLE = /(^|;)\s*display\s*:\s*none/i;

/** Present, not inside a [hidden] subtree, and not display:none (inline or computed). */
export function shown(el: Element | null | undefined): el is Element {
  if (!el || el.closest('[hidden]')) return false;
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (HIDDEN_STYLE.test(e.getAttribute('style') ?? '')) return false;
    if (e.matches('#movie_player, .html5-video-player, ytd-watch-flexy')) break;
  }
  try {
    const view = el.ownerDocument.defaultView;
    if (view && view.getComputedStyle(el).display === 'none') return false;
  } catch {
    /* computed style unavailable: rely on the checks above */
  }
  return true;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The visible watch page (YouTube keeps hidden ytd-watch-flexy copies around during SPA navigation). */
function watchRoot(doc: Document): ParentNode {
  return doc.querySelector('ytd-watch-flexy:not([hidden])') ?? doc;
}

/** The main player (not the miniplayer / channel trailer). */
export function watchPlayer(doc: Document): Element | null {
  const root = watchRoot(doc);
  return root.querySelector('#movie_player') ?? root.querySelector('.html5-video-player') ?? doc.querySelector('#movie_player');
}

/** The comments section of the watch page. */
export function commentsRoot(doc: Document): Element | null {
  const root = watchRoot(doc);
  return root.querySelector('ytd-comments#comments') ?? root.querySelector('#comments') ?? doc.querySelector('ytd-comments');
}

function chapterSignal(doc: Document, player: Element | null): WatchSignals['chapters'] {
  const root = watchRoot(doc);
  // Engagement panels exist (hidden) as soon as the watch page data has chapters.
  if (root.querySelector('[target-id="engagement-panel-macro-markers-description-chapters"]') || doc.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"]')) return 'shown';
  // Chapter cards in the expanded description.
  if (root.querySelector('ytd-video-description-chapters-section-renderer, #description ytd-macro-markers-list-item-renderer, ytd-structured-description-content-renderer ytd-macro-markers-list-item-renderer')) return 'shown';
  if (root.querySelector('[target-id="engagement-panel-macro-markers-auto-chapters"]') || doc.querySelector('[target-id="engagement-panel-macro-markers-auto-chapters"]')) return 'auto';
  if (!player) return undefined;
  // Progress bar split into chapter segments (one container when there are no chapters).
  const segments = player.querySelectorAll('.ytp-chapters-container .ytp-chapter-hover-container, .ytp-progress-bar .ytp-chapter-hover-container').length;
  if (segments >= 2) return 'shown';
  // Chapter title next to the time ("Intro >").
  const title = player.querySelector('.ytp-chapter-container');
  if (shown(title) && text(title!.querySelector('.ytp-chapter-title-content') ?? title)) return 'shown';
  return segments === 1 ? 'none' : undefined;
}

/** The top-level comment of a thread (not its replies). */
function topComment(thread: Element): Element {
  return thread.querySelector(':scope > #comment, :scope > ytd-comment-view-model, :scope > ytd-comment-renderer') ?? thread;
}

function pinnedSignal(comments: Element | null): WatchSignals['pinned'] {
  if (!comments) return 'notLoaded';
  const first = comments.querySelector('ytd-comment-thread-renderer');
  if (!first) {
    // "Comments are turned off." is a message renderer in place of the threads.
    if (comments.querySelector('#contents ytd-message-renderer, ytd-message-renderer') && !comments.querySelector('ytd-comments-header-renderer')) return 'off';
    return 'notLoaded';
  }
  const top = topComment(first);
  const badge = top.querySelector('ytd-pinned-comment-badge-renderer') ?? top.querySelector('#pinned-comment-badge > *');
  return shown(badge) && (badge.tagName.toLowerCase() === 'ytd-pinned-comment-badge-renderer' || text(badge) !== '') ? 'yes' : 'no';
}

/** One creator-heart element: hearted when it says so, or when it renders without the "unhearted" (creator's own) button. */
function isHearted(el: Element): boolean {
  const attr = el.getAttribute('is-hearted');
  if (attr !== null) return attr !== 'false';
  // The creator's own view has both states in the template and hides one of them.
  const hearted = el.querySelector('#hearted');
  const unhearted = el.querySelector('#unhearted');
  if (hearted || unhearted) return shown(hearted) && !shown(unhearted);
  const pressed = el.querySelector('[aria-pressed]');
  if (pressed) return pressed.getAttribute('aria-pressed') === 'true';
  // Viewers only get the renderer (the creator's avatar with a heart) on hearted comments.
  return el.tagName.toLowerCase() === 'ytd-creator-heart-renderer' && el.children.length > 0 && shown(el);
}

function heartedSignal(comments: Element | null): boolean | undefined {
  if (!comments || !comments.querySelector('ytd-comment-thread-renderer')) return undefined;
  for (const el of comments.querySelectorAll('ytd-creator-heart-renderer, creator-heart-view-model')) if (isHearted(el)) return true;
  return false;
}

function cardsSignal(player: Element | null): true | undefined {
  if (!player) return undefined;
  if (player.querySelector('.iv-drawer .iv-card, .ytp-cards-drawer .iv-card, .iv-card')) return true;
  const teaser = player.querySelector('.ytp-cards-teaser .ytp-cards-teaser-text, .ytp-cards-teaser-text');
  if (text(teaser)) return true;
  return shown(player.querySelector('.ytp-cards-button')) ? true : undefined;
}

function endScreenSignal(player: Element | null): true | undefined {
  if (!player) return undefined;
  // Creator end-screen elements are added (hidden) when the video loads; .ytp-endscreen-content is YouTube's own grid, not the creator's.
  return player.querySelector('.ytp-ce-element, .ytp-ce-video, .ytp-ce-channel, .ytp-ce-playlist, .ytp-ce-website, .ytp-ce-merchandise') ? true : undefined;
}

function ccSignal(player: Element | null): WatchSignals['cc'] {
  const btn = player?.querySelector('.ytp-subtitles-button');
  if (!btn) return undefined;
  if (btn.getAttribute('aria-disabled') === 'true' || btn.hasAttribute('disabled') || btn.classList.contains('ytp-button-disabled')) return 'off';
  // A hidden button may simply not be set up yet: can't tell.
  return shown(btn) ? 'on' : undefined;
}

/**
 * Reads the watch page for `videoId`. When the page still shows another video (SPA navigation in progress), every
 * signal is "can't tell" so the previous video's comments are never credited to this one.
 */
export function readWatchSignals(doc: Document, videoId: string): WatchSignals {
  const flexy = doc.querySelector('ytd-watch-flexy:not([hidden])');
  const pageId = flexy?.getAttribute('video-id');
  if (pageId && pageId !== videoId) return { pinned: 'notLoaded' };
  const player = watchPlayer(doc);
  const comments = commentsRoot(doc);
  return {
    chapters: chapterSignal(doc, player),
    pinned: pinnedSignal(comments),
    hearted: heartedSignal(comments),
    cards: cardsSignal(player),
    endScreen: endScreenSignal(player),
    cc: ccSignal(player),
  };
}

/** Elements worth observing for signal changes (comments load on scroll; the player builds its UI after load). */
export function signalTargets(doc: Document): { comments: Element | null; player: Element | null; panels: Element | null; flexy: Element | null } {
  const flexy = doc.querySelector('ytd-watch-flexy:not([hidden])');
  return { comments: commentsRoot(doc), player: watchPlayer(doc), panels: flexy?.querySelector('#panels') ?? null, flexy };
}
