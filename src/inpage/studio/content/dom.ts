// DOM readers for the Studio Content list page and the Shorts editor's related-video control. Studio's markup
// is not a public contract and could not be checked live from the build environment: every lookup has several
// fallbacks (ids, custom element names, roles, aria labels, visible text) and returns null instead of guessing.
// Reading is passive; the only writes are clicks/typing in `fillRelated`/`clearRelated`, which run on a user click.
import type { AnchorSpot } from '../../mount';

// ---------------------------------------------------------------- helpers

const DIGITS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
/** First integer in a text, accepting Persian/Arabic digits and thousands separators. */
export function firstInt(text: string | null | undefined): number | undefined {
  const s = (text ?? '').replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] ?? d);
  const m = s.match(/\d[\d,.٬،\s]*/);
  if (!m) return undefined;
  const n = Number(m[0].replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

const clean = (s: string | null | undefined, max = 300) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** True unless the element (or an ancestor) is hidden by attribute or inline style. Layout is not consulted. */
export function shown(el: Element | null): boolean {
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true') return false;
    const st = (e as HTMLElement).style;
    if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
  }
  return !!el;
}

function first(root: ParentNode, sels: string[], ok: (el: Element) => boolean = () => true): Element | null {
  for (const s of sels) {
    for (const el of Array.from(root.querySelectorAll(s))) if (ok(el)) return el;
  }
  return null;
}

const inDialog = (el: Element) => !!el.closest('ytcp-uploads-dialog, tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]');

// ---------------------------------------------------------------- content tabs row

const TABLIST_SEL = [
  'ytcp-content-section tp-yt-paper-tabs',
  '#tabs-container tp-yt-paper-tabs',
  'ytcp-navigation-tabs',
  'tp-yt-paper-tabs#tabs',
  '#main tp-yt-paper-tabs',
  'tp-yt-paper-tabs',
  '#main [role="tablist"]',
  '[role="tablist"]',
];
const TAB_SEL = 'tp-yt-paper-tab, [role="tab"], ytcp-ve tp-yt-paper-tab';

/** The Content page's tab strip (Videos, Shorts, Live, ...): a tab list with at least two tabs, outside dialogs and our own UI. */
export function contentTabList(doc: Document): Element | null {
  return first(doc, TABLIST_SEL, (el) => !inDialog(el) && !el.closest('[data-tubex]') && el.querySelectorAll(TAB_SEL).length >= 2 && shown(el));
}

/** Where the tools button goes: right after the tab strip (same row when Studio lays the row out as flex). */
export function toolsSpot(doc: Document): AnchorSpot | null {
  const tabs = contentTabList(doc);
  return tabs ? { el: tabs, append: 'after' } : null;
}

// ---------------------------------------------------------------- selection bar and rows

const BAR_SEL = ['ytcp-bulk-actions', '#bulk-actions-toolbar', 'ytcp-video-list-bulk-actions', '#bulk-actions', '.bulk-actions', 'ytcp-video-section-content [role="toolbar"]', '#main [role="toolbar"]'];
const MORE_SEL = ['#more-actions', 'ytcp-select#more-actions', '[aria-label="More actions"]', '[aria-label*="More actions"]', '[aria-label*="اقدامات بیشتر"]'];
const CLOSE_SEL = ['#close-button', 'ytcp-icon-button#close', '[aria-label="Close"]', '[aria-label*="Deselect"]', '[aria-label*="Close"]', '[aria-label="بستن"]'];
const COUNT_SEL = ['#selection-count', '.selection-count', '#count', '[id*="selected-count"]', '[class*="selection-count"]'];

/** Studio's selection toolbar, only while it is shown. */
export function selectionBar(doc: Document): Element | null {
  return first(doc, BAR_SEL, (el) => !el.closest('[data-tubex]') && shown(el));
}

/** "N selected" as Studio shows it (may include rows on other pages after "select all"). */
export function selectionCount(bar: Element): number | undefined {
  const c = first(bar, COUNT_SEL);
  return firstInt(clean(c ? c.textContent : bar.textContent, 80));
}

/** Our dropdown goes right after Studio's "More actions", else before the close button, else at the bar's end. */
export function selectionSpot(doc: Document): AnchorSpot | null {
  const bar = selectionBar(doc);
  if (!bar) return null;
  const more = first(bar, MORE_SEL);
  if (more) return { el: topChild(bar, more), append: 'after' };
  const close = first(bar, CLOSE_SEL);
  if (close) return { el: topChild(bar, close), append: 'before' };
  return { el: bar, append: 'last' };
}

/** The ancestor of `el` that is a direct child of `container` (so we sit next to Studio's controls, not inside them). */
function topChild(container: Element, el: Element): Element {
  let e = el;
  while (e.parentElement && e.parentElement !== container) e = e.parentElement;
  return e.parentElement === container ? e : el;
}

const ROW_SEL = ['ytcp-video-row', 'ytcp-shorts-row', '#row-container', '[role="row"]'];
const CHECK_SEL = '#row-checkbox, ytcp-checkbox-lit, [role="checkbox"], input[type="checkbox"]';
const TITLE_SEL = ['#video-title', 'a#video-title', '.video-title', '[id*="title"] a', 'h3'];

export interface RowRef {
  id: string;
  title: string;
}

export function videoIdFromStudioHref(href: string | null | undefined): string | undefined {
  return href?.match(/\/video\/([\w-]{11})(?:[/?#]|$)/)?.[1] ?? href?.match(/[?&]v=([\w-]{11})/)?.[1] ?? href?.match(/youtu\.be\/([\w-]{11})/)?.[1] ?? href?.match(/\/shorts\/([\w-]{11})/)?.[1];
}

function checked(box: Element | null): boolean {
  if (!box) return false;
  if (box.getAttribute('aria-checked') === 'true' || box.hasAttribute('checked')) return true;
  const inner = box.querySelector('[aria-checked="true"]');
  if (inner) return true;
  return box instanceof HTMLInputElement ? box.checked : false;
}

/** Video rows of the list (header row excluded). */
export function contentRows(doc: Document): Element[] {
  for (const s of ROW_SEL) {
    const rows = Array.from(doc.querySelectorAll(s)).filter((r) => !inDialog(r) && !!r.querySelector('a[href*="/video/"]'));
    if (rows.length) return rows;
  }
  return [];
}

export function readRow(row: Element): RowRef | null {
  const a = Array.from(row.querySelectorAll<HTMLAnchorElement>('a[href]')).find((x) => videoIdFromStudioHref(x.getAttribute('href')));
  const id = videoIdFromStudioHref(a?.getAttribute('href'));
  if (!id) return null;
  const t = first(row, TITLE_SEL);
  const title = clean(t?.textContent) || clean(a?.getAttribute('aria-label')) || clean(row.querySelector('img[alt]')?.getAttribute('alt')) || id;
  return { id, title };
}

/** The rows whose checkbox is ticked, in page order. */
export function readSelectedRows(doc: Document): RowRef[] {
  const out: RowRef[] = [];
  const seen = new Set<string>();
  for (const row of contentRows(doc)) {
    if (!checked(row.querySelector(CHECK_SEL))) continue;
    const r = readRow(row);
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Shorts editor: related video

const RELATED_SEL = [
  'ytcp-shorts-related-video',
  'ytcp-related-video-picker',
  'ytcp-shorts-content-links',
  '#related-video',
  '#related-video-picker',
  '[id*="related-video"]',
  '[class*="related-video"]',
  '[aria-label*="Related video"]',
  '[aria-label*="ویدیوی مرتبط"]',
];
const RELATED_TEXT = /^(related video|ویدیوی مرتبط|ویدئوی مرتبط)\b/i;
const TRIGGER_SEL = ['ytcp-dropdown-trigger', '#trigger', '[role="button"]', 'button', '[role="combobox"]', 'ytcp-select'];
const CLEAR_SEL = ['#clear-button', '#remove-button', '[aria-label*="Remove"]', '[aria-label*="Clear"]', '[aria-label*="Delete"]', '[aria-label*="حذف"]', '[aria-label*="پاک"]', 'ytcp-icon-button[icon*="close"]', '[icon="close"]', '[icon*="delete"]'];

/** Studio's "Related video" control on a Short's edit page (by id/element name, else by its visible label). */
export function relatedField(root: ParentNode, byText = true): Element | null {
  const direct = first(root, RELATED_SEL, (el) => !el.closest('[data-tubex]') && !el.closest('tubex-studio-related'));
  if (direct || !byText) return direct;
  // Visible-label fallback, limited to the editor (cheap enough for a click, too costly for the page observer).
  const scope = root.querySelector('ytcp-video-metadata-editor') ?? root;
  for (const el of Array.from(scope.querySelectorAll('h3, h2, .label, [class*="label"], [class*="title"], ytcp-form-input-container, div, span'))) {
    if (el.children.length > 3) continue;
    if (!RELATED_TEXT.test(clean(el.textContent, 60))) continue;
    // The labelled block: climb to the first ancestor that also holds a control.
    let box: Element | null = el;
    for (let i = 0; i < 4 && box; i++, box = box.parentElement) if (first(box, TRIGGER_SEL, (x) => x !== el)) return box;
  }
  return null;
}

/** The text Studio shows as the current related video, or '' when none/unknown. */
export function relatedCurrent(field: Element): string {
  const v = first(field, ['#selected-video-title', '.selected-video', '[id*="selected"]', '#video-title', '.video-title']);
  return clean(v?.textContent, 200);
}

export function relatedSpot(doc: Document): AnchorSpot | null {
  const f = relatedField(doc, false);
  return f ? { el: f, append: 'after' } : null;
}

function openDialog(doc: Document, exclude: Set<Element>): Element | null {
  const all = Array.from(doc.querySelectorAll('tp-yt-paper-dialog, ytcp-dialog, [role="dialog"], ytcp-video-pick-dialog')).filter((d) => shown(d) && !d.closest('[data-tubex]') && !d.closest('ytcp-uploads-dialog'));
  const fresh = all.filter((d) => !exclude.has(d));
  return fresh.at(-1) ?? all.at(-1) ?? null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls a few times (bounded, not a loop that runs forever) for something Studio renders after a click. */
async function soon<T>(fn: () => T | null, tries = 12, gap = 250): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await wait(gap);
  }
  return null;
}

function typeInto(input: HTMLInputElement, text: string) {
  input.focus();
  let ok = false;
  try {
    input.select?.();
    ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (!ok || input.value !== text) {
    input.value = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
  }
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

/** Finds the option for `title` (or `videoId`) among a dialog's items. */
export function findOption(dialog: Element, title: string, videoId: string): HTMLElement | null {
  const want = clean(title).toLowerCase();
  const items = Array.from(dialog.querySelectorAll<HTMLElement>('[role="option"], [role="listitem"], ytcp-entity-card, ytcp-video-pick-dialog-video, .video-row, li, [role="button"]'));
  const byId = items.find((x) => x.querySelector(`a[href*="${videoId}"], img[src*="/${videoId}/"]`) || x.getAttribute('data-video-id') === videoId);
  if (byId) return byId;
  const hits = items.filter((x) => clean(x.textContent).toLowerCase().includes(want));
  // The innermost match (an option, not the whole list).
  return hits.find((x) => !hits.some((y) => y !== x && x.contains(y))) ?? null;
}

export type RelatedResult = 'filled' | 'picker-open' | 'cleared' | 'no-field' | 'no-clear';

/**
 * Explicit-click helper: opens Studio's related-video picker, searches for the target and clicks it when it is
 * found exactly. When Studio's picker does not match what we expect, it stays open for the user ('picker-open').
 * Never presses Save.
 */
export async function fillRelated(doc: Document, target: { id: string; title: string }): Promise<RelatedResult> {
  const field = relatedField(doc);
  if (!field) return 'no-field';
  field.scrollIntoView?.({ block: 'center' });
  const before = new Set(Array.from(doc.querySelectorAll('tp-yt-paper-dialog, ytcp-dialog, [role="dialog"], ytcp-video-pick-dialog')).filter(shown));
  const trigger = first(field, TRIGGER_SEL) as HTMLElement | null;
  (trigger ?? (field as HTMLElement)).click();
  const dialog = await soon(() => openDialog(doc, before), 8);
  if (!dialog) return 'picker-open';
  const input = first(dialog, ['input[type="search"]', 'input#search-input', 'input[aria-label*="Search"]', 'input[placeholder*="Search"]', 'input[type="text"]', 'input']) as HTMLInputElement | null;
  if (input) typeInto(input, target.title.slice(0, 100));
  const opt = await soon(() => findOption(dialog, target.title, target.id), 12);
  if (!opt) return 'picker-open';
  opt.click();
  return 'filled';
}

/** Explicit-click helper: presses the related-video control's own remove button. Never presses Save. */
export function clearRelated(doc: Document): RelatedResult {
  const field = relatedField(doc);
  if (!field) return 'no-field';
  field.scrollIntoView?.({ block: 'center' });
  const btn = first(field, CLEAR_SEL) as HTMLElement | null;
  if (!btn) return 'no-clear';
  btn.click();
  return 'cleared';
}
