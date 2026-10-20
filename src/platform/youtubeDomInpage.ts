// DOM readers (and the few explicit-click writers) for TubeX's in-page tools on youtube.com and Studio.
// Selectors are Inferred for the 2026 layouts and checked only against synthetic fixtures (tests/fixtures/inpage-*.html);
// every reader has fallbacks and returns null/[] when the page does not match, so islands simply do not appear.
// Writers only touch Studio form fields after a user click; Studio's own Save stays the only way to save.

export type AppendMode = 'first' | 'last' | 'before' | 'after';
export interface AnchorSpot {
  el: Element;
  append: AppendMode;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/** Video id from a watch, shorts, youtu.be or embed link (relative links resolve against youtube.com). */
export function videoIdFromHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  let u: URL;
  try {
    u = new URL(href, 'https://www.youtube.com');
  } catch {
    return undefined;
  }
  const parts = u.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (u.hostname === 'youtu.be') id = parts[0];
  else if (parts[0] === 'watch') id = u.searchParams.get('v');
  else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') id = parts[1];
  else if (parts[0] === 'video' && u.hostname === 'studio.youtube.com') id = parts[1];
  return id && VIDEO_ID.test(id) ? id : undefined;
}

export function channelIdFromHref(href: string | null | undefined): string | undefined {
  const m = href?.match(/\/channel\/(UC[A-Za-z0-9_-]{22})(?:[/?#]|$)/);
  return m?.[1];
}

function firstSpot(root: ParentNode, candidates: [string, AppendMode][]): AnchorSpot | null {
  for (const [sel, append] of candidates) {
    const el = root.querySelector(sel);
    if (el) return { el, append };
  }
  return null;
}

const clean = (s: string | null | undefined, max = 300) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------- watch page

/** Where the watch card goes: below the title/owner row, above the description. */
export function watchCardSpot(doc: Document): AnchorSpot | null {
  return firstSpot(doc, [
    ['ytd-watch-flexy:not([hidden]) ytd-watch-metadata #bottom-row', 'before'],
    ['ytd-watch-flexy:not([hidden]) ytd-watch-metadata #description', 'before'],
    ['ytd-watch-flexy:not([hidden]) #above-the-fold', 'last'],
    ['ytd-watch-flexy:not([hidden]) #below', 'first'],
  ]);
}

/** The video the watch page shows, or null while the DOM still shows a previous video (SPA navigation). */
export function watchVideoId(doc: Document, url: string): string | null {
  const id = videoIdFromHref(url);
  if (!id || !/\/watch/.test(new URL(url).pathname)) return null;
  const flexy = doc.querySelector('ytd-watch-flexy');
  const domId = flexy?.getAttribute('video-id');
  if (domId && domId !== id) return null;
  return id;
}

// ---------------------------------------------------------------- search results

const RESULT_SEL = 'ytd-video-renderer, yt-lockup-view-model, ytd-rich-item-renderer, ytd-grid-video-renderer';
const RESULT_LINK = ['a#video-title[href]', 'a#video-title-link[href]', 'a#thumbnail[href]', 'a.yt-lockup-metadata-view-model-wiz__title[href]', 'a[href*="watch?v="]', 'a[href*="/shorts/"]'];
const RESULT_META = [
  '#metadata-line',
  'ytd-video-meta-block',
  'yt-content-metadata-view-model',
  '.yt-content-metadata-view-model-wiz',
  '.yt-lockup-metadata-view-model-wiz__metadata',
  '#meta',
  '#details',
];

export interface SearchResultSlot {
  videoId: string;
  /** The result renderer (for "your channel" highlighting). */
  item: Element;
  /** Badges are inserted after this element. */
  after: Element;
}

export function searchStripSpot(doc: Document): AnchorSpot | null {
  return firstSpot(doc, [
    ['ytd-search #primary ytd-section-list-renderer', 'before'],
    ['ytd-search #contents', 'first'],
    ['ytd-search', 'first'],
  ]);
}

/** Visible video results with a place for badges. Skips nested renderers, ads without a video link and duplicates. */
export function readSearchResults(root: ParentNode): SearchResultSlot[] {
  const out: SearchResultSlot[] = [];
  const seen = new Set<Element>();
  for (const item of Array.from(root.querySelectorAll(RESULT_SEL))) {
    if (item.parentElement?.closest(RESULT_SEL)) continue; // nested lockup inside a rich item
    if (item.closest('ytd-ad-slot-renderer, ytd-promoted-video-renderer, [is-ad]')) continue;
    let videoId: string | undefined;
    for (const sel of RESULT_LINK) {
      videoId = videoIdFromHref(item.querySelector(sel)?.getAttribute('href'));
      if (videoId) break;
    }
    if (!videoId) continue;
    let after: Element | null = null;
    for (const sel of RESULT_META) {
      after = item.querySelector(sel);
      if (after) break;
    }
    if (!after || seen.has(item)) continue;
    seen.add(item);
    out.push({ videoId, item, after });
  }
  return out;
}

// ---------------------------------------------------------------- channel page

export function channelStripSpot(doc: Document): AnchorSpot | null {
  return firstSpot(doc, [
    ['ytd-browse:not([hidden]) yt-page-header-renderer', 'after'],
    ['ytd-browse:not([hidden]) #page-header', 'after'],
    ['ytd-browse:not([hidden]) ytd-c4-tabbed-header-renderer', 'after'],
    ['ytd-browse:not([hidden]) #channel-header', 'after'],
  ]);
}

/** Channel reference for a channel page: id or handle from the URL, else the page's channel id metadata. */
export function readChannelRef(doc: Document, url: string): { id?: string; handle?: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const first = u.pathname.split('/').filter(Boolean)[0] ?? '';
  const fromUrl = channelIdFromHref(u.pathname);
  if (fromUrl) return { id: fromUrl };
  if (first.startsWith('@') && first.length > 1) return { handle: decodeURIComponent(first) };
  if (first !== 'c' && first !== 'user') return null;
  const meta =
    doc.querySelector('meta[itemprop="identifier"]')?.getAttribute('content') ??
    doc.querySelector('meta[itemprop="channelId"]')?.getAttribute('content') ??
    channelIdFromHref(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'));
  return meta && CHANNEL_ID.test(meta) ? { id: meta } : null;
}

// ---------------------------------------------------------------- masthead

export function mastheadSpot(doc: Document): AnchorSpot | null {
  return firstSpot(doc, [
    ['ytd-masthead #end #buttons', 'first'],
    ['ytd-masthead #buttons', 'first'],
    ['ytd-masthead #end', 'first'],
  ]);
}

// ---------------------------------------------------------------- Studio: fields

/** querySelector that also looks inside open shadow roots (Studio components), bounded in depth. */
export function queryDeep<T extends Element = Element>(root: ParentNode, sel: string, depth = 4): T | null {
  const hit = root.querySelector<T>(sel);
  if (hit || depth <= 0) return hit;
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const sr = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (sr) {
      const found = queryDeep<T>(sr, sel, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function firstDeep<T extends Element>(root: ParentNode, sels: string[]): T | null {
  for (const s of sels) {
    const el = root.querySelector<T>(s);
    if (el) return el;
  }
  for (const s of sels) {
    const el = queryDeep<T>(root, s);
    if (el) return el;
  }
  return null;
}

const TITLE_SEL = ['#title-textarea #textbox', 'ytcp-video-title #textbox', '#title-textarea [contenteditable="true"]', 'ytcp-video-title [contenteditable="true"]'];
const DESC_SEL = ['#description-textarea #textbox', 'ytcp-video-description #textbox', '#description-textarea [contenteditable="true"]', 'ytcp-video-description [contenteditable="true"]'];
const TAGS_INPUT_SEL = ['#tags-container input#text-input', '#tags-container input', 'ytcp-free-text-chip-bar input', 'ytcp-chip-bar input', 'input[aria-label="Tags"]'];
const CHIP_SEL = ['#tags-container ytcp-chip', 'ytcp-free-text-chip-bar ytcp-chip', 'ytcp-chip-bar ytcp-chip'];

export interface StudioFields {
  title: HTMLElement | null;
  description: HTMLElement | null;
  tagsInput: HTMLInputElement | null;
  /** Tags currently shown as chips. */
  tags: string[];
}

export function studioFields(root: ParentNode): StudioFields {
  let tags: string[] = [];
  for (const sel of CHIP_SEL) {
    const chips = Array.from(root.querySelectorAll(sel));
    if (chips.length) {
      tags = chips.map((c) => clean((c.querySelector('#chip-text, .chip-text, [id="text"]') ?? c).textContent, 100)).filter(Boolean);
      break;
    }
  }
  return {
    title: firstDeep<HTMLElement>(root, TITLE_SEL),
    description: firstDeep<HTMLElement>(root, DESC_SEL),
    tagsInput: firstDeep<HTMLInputElement>(root, TAGS_INPUT_SEL),
    tags,
  };
}

/** Text of a contenteditable box with line breaks (<br> and block children become newlines). */
export function editableText(el: Element | null): string {
  if (!el) return '';
  let out = '';
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 3) out += c.textContent ?? '';
      else if (c.nodeName === 'BR') out += '\n';
      else if (c.nodeType === 1) {
        const block = /^(DIV|P|LI)$/.test(c.nodeName);
        if (block && out && !out.endsWith('\n')) out += '\n';
        walk(c);
      }
    }
  };
  walk(el);
  return out.replace(/ /g, ' ');
}

export function readStudioValues(root: ParentNode): { title: string; description: string; tags: string[]; found: { title: boolean; description: boolean; tags: boolean } } {
  const f = studioFields(root);
  return {
    title: editableText(f.title).trim(),
    description: editableText(f.description),
    tags: f.tags,
    found: { title: !!f.title, description: !!f.description, tags: !!f.tagsInput || f.tags.length > 0 },
  };
}

/**
 * Replaces the text of a Studio contenteditable box like typing would: select all, insertText (fires the native
 * `beforeinput`/`input` events Studio listens to), with a textContent + `input` event fallback.
 */
export function setEditableText(el: HTMLElement, text: string): boolean {
  const doc = el.ownerDocument;
  el.focus();
  let ok = false;
  try {
    const sel = doc.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
    ok = typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (!ok || editableText(el).replace(/\s+/g, ' ').trim() !== text.replace(/\s+/g, ' ').trim()) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  return true;
}

/** Types tags into Studio's tag box (comma separated, then Enter), the way a user pastes a tag list. */
export function typeTags(input: HTMLInputElement, tags: string[]): void {
  if (!tags.length) return;
  const doc = input.ownerDocument;
  input.focus();
  const text = tags.join(',') + ',';
  let ok = false;
  try {
    ok = typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    input.value = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
  }
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  const enter = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true } as KeyboardEventInit;
  input.dispatchEvent(new KeyboardEvent('keydown', enter));
  input.dispatchEvent(new KeyboardEvent('keyup', enter));
}

// ---------------------------------------------------------------- Studio: editor, upload dialog

export function studioEditorRoot(doc: Document): Element | null {
  for (const el of Array.from(doc.querySelectorAll('ytcp-video-metadata-editor'))) if (!el.closest('ytcp-uploads-dialog')) return el;
  return null;
}

export function studioEditorSpot(doc: Document): AnchorSpot | null {
  const root = studioEditorRoot(doc);
  if (!root) return null;
  return firstSpot(root, [
    ['ytcp-video-metadata-editor-sidepanel', 'first'],
    ['#title-textarea', 'after'],
    ['ytcp-video-title', 'after'],
    ['ytcp-video-metadata-editor-basics', 'first'],
  ]) ?? { el: root, append: 'first' };
}

export function uploadDialogRoot(doc: Document): Element | null {
  const d = doc.querySelector('ytcp-uploads-dialog');
  if (!d || d.hasAttribute('hidden')) return null;
  return d;
}

/** In the upload dialog's details step only (title field present). */
export function uploadDialogSpot(doc: Document): AnchorSpot | null {
  const d = uploadDialogRoot(doc);
  if (!d) return null;
  if (!studioFields(d).title) return null;
  return firstSpot(d, [
    ['ytcp-uploads-details ytcp-video-metadata-editor', 'first'],
    ['ytcp-uploads-details', 'first'],
    ['ytcp-video-metadata-editor', 'first'],
    ['#scrollable-content', 'first'],
  ]);
}

// ---------------------------------------------------------------- Studio: comments

export interface CommentThreadSlot {
  thread: Element;
  author: string;
  /** The button goes after this element (the thread's action row). */
  after: Element;
}

const AUTHOR_SEL = ['#author-text', 'a#name', '#name', '.author-name', 'ytcp-author-comment-badge', '#author'];
const ACTIONS_SEL = ['ytcp-comment-action-buttons', '#action-buttons', '#toolbar', '#actions'];
const REPLY_BOX_SEL = ['#contenteditable-textarea', 'ytcp-commentbox [contenteditable="true"]', '#contenteditable-root', 'textarea'];
const REPLY_BTN_SEL = ['#reply-button button', '#reply-button', 'ytcp-comment-button#reply-button', 'button[aria-label="Reply"]'];

export function readCommentThreads(root: ParentNode): CommentThreadSlot[] {
  const out: CommentThreadSlot[] = [];
  for (const thread of Array.from(root.querySelectorAll('ytcp-comment-thread'))) {
    // Top-level comment only: replies inside the thread have their own ytcp-comment.
    const top = thread.querySelector('ytcp-comment') ?? thread;
    let author = '';
    for (const sel of AUTHOR_SEL) {
      author = clean(top.querySelector(sel)?.textContent, 100);
      if (author) break;
    }
    let after: Element | null = null;
    for (const sel of ACTIONS_SEL) {
      after = top.querySelector(sel);
      if (after) break;
    }
    if (!after) continue;
    out.push({ thread, author, after });
  }
  return out;
}

export function findReplyBox(thread: Element): HTMLElement | null {
  for (const sel of REPLY_BOX_SEL) {
    const el = thread.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

export function findReplyButton(thread: Element): HTMLElement | null {
  const top = thread.querySelector('ytcp-comment') ?? thread;
  for (const sel of REPLY_BTN_SEL) {
    const el = top.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/** Puts text into a reply box (contenteditable or textarea) without sending it. */
export function fillReplyBox(box: HTMLElement, text: string): void {
  if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) {
    box.focus();
    box.value = text;
    box.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    box.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return;
  }
  setEditableText(box, text);
}
