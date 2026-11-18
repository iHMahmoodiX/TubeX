// DOM readers (and click-only writers) for Studio's Tags field on the video details page.
// Selectors are Inferred for the 2026 Studio layout (Polymer components rendered in light DOM) and checked only
// against synthetic fixtures (tests/unit/tagToolsDom.test.ts). Each reader has fallbacks and returns null/[]
// when the page does not match, so the tag tools simply do not appear. Writers run only after a user click.
import { studioEditorRoot, type AnchorSpot } from '../../../platform/youtubeDomInpage';

/** The form container of the Tags field (box + help line + counter). */
const CONTAINER_SEL = ['ytcp-form-input-container#tags-container', '#tags-container', '[id="tags"] ytcp-form-input-container'];
/** The box holding the chips and the text input. */
const BAR_SEL = ['ytcp-free-text-chip-bar', 'ytcp-chip-bar', '#chip-bar', '[role="listbox"]'];
const INPUT_SEL = ['input#text-input', 'ytcp-free-text-chip-bar input', 'ytcp-chip-bar input', 'input[aria-label="Tags"]', 'input'];
export const CHIP_SEL = 'ytcp-chip, ytcp-free-text-chip, [role="option"].chip';
const CHIP_TEXT_SEL = ['#chip-text', '.chip-text', '#text', '[id="text"]'];
const CHIP_DELETE_SEL = ['#delete-icon', '#remove-button', '[aria-label^="Delete"]', '[aria-label^="Remove"]', '[aria-label^="حذف"]', '.delete-icon', 'tp-yt-iron-icon[icon*="close"]', 'ytcp-icon-button', 'button'];
/** Studio's own "remove all tags" control, when it has one (Inferred). */
const CLEAR_ALL_SEL = ['#clear-button', '[aria-label="Delete all"]', '[aria-label="Remove all"]', '[aria-label="Clear all"]'];

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);

export interface TagsField {
  container: Element;
  bar: Element | null;
  input: HTMLInputElement | null;
}

function first(root: ParentNode, sels: string[]): Element | null {
  for (const s of sels) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

/** The Tags field of the video details editor (never the upload dialog's). */
export function tagsField(doc: Document): TagsField | null {
  const root = studioEditorRoot(doc);
  if (!root) return null;
  let container = first(root, CONTAINER_SEL);
  if (!container) {
    const bar = first(root, BAR_SEL.slice(0, 2));
    container = bar?.closest('ytcp-form-input-container') ?? bar?.parentElement ?? null;
  }
  if (!container) return null;
  const bar = first(container, BAR_SEL);
  const input = first(container, INPUT_SEL) as HTMLInputElement | null;
  if (!bar && !input && !container.querySelector(CHIP_SEL)) return null;
  return { container, bar, input };
}

/** Tip line and corner actions: just above the field's box. */
export function tagTipSpot(doc: Document): AnchorSpot | null {
  const f = tagsField(doc);
  return f ? { el: f.container, append: 'before' } : null;
}

/** Legend, Tag Tools bar and recommended tags: right under the field (after its help line and counter). */
export function tagToolsSpot(doc: Document): AnchorSpot | null {
  const f = tagsField(doc);
  return f ? { el: f.container, append: 'after' } : null;
}

export interface Chip {
  el: Element;
  text: string;
  /** Element our badge host goes after (the chip's text), or null to append at the chip's end. */
  textEl: Element | null;
}

export function chipText(chip: Element): string {
  const el = first(chip, CHIP_TEXT_SEL);
  return clean((el ?? chip).textContent);
}

export function readChips(field: TagsField | null): Chip[] {
  if (!field) return [];
  const out: Chip[] = [];
  for (const el of Array.from(field.container.querySelectorAll(CHIP_SEL))) {
    if (el.parentElement?.closest(CHIP_SEL)) continue;
    const textEl = first(el, CHIP_TEXT_SEL);
    const text = clean((textEl ?? el).textContent);
    if (text) out.push({ el, text, textEl });
  }
  return out;
}

/** The chip a (double-)click landed on, from the event's composed path; null when outside the Tags field. */
export function chipFromPath(path: EventTarget[], field: TagsField | null): Element | null {
  if (!field || !path.includes(field.container)) return null;
  for (const n of path) {
    if (n instanceof Element && n.matches(CHIP_SEL)) return n;
    if (n === field.container) break;
  }
  return null;
}

function deleteButton(chip: Element): HTMLElement | null {
  for (const s of CHIP_DELETE_SEL) {
    const el = chip.querySelector<HTMLElement>(s);
    if (el && !el.closest('tubex-tag-badge')) return el;
  }
  return null;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 30));

/**
 * Removes every tag chip the way a user would (Studio's clear-all control if present, else each chip's delete
 * button, else Backspace in the empty input). Runs only after an explicit click; Studio's Save stays the user's.
 * Returns how many chips are left (0 = cleared).
 */
export async function removeAllChips(doc: Document): Promise<number> {
  let field = tagsField(doc);
  if (!field) return -1;
  const clearAll = first(field.container, CLEAR_ALL_SEL) as HTMLElement | null;
  if (clearAll && readChips(field).length) {
    clearAll.click();
    await tick();
    field = tagsField(doc);
  }
  for (let guard = 0; guard < 4 && field && readChips(field).length; guard++) {
    const chips = readChips(field).reverse();
    for (const c of chips) deleteButton(c.el)?.click();
    await tick();
    field = tagsField(doc);
  }
  if (field?.input && readChips(field).length) {
    const input = field.input;
    input.focus();
    for (let i = readChips(field).length * 2; i > 0 && readChips(field).length; i--) {
      const k = { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, composed: true } as KeyboardEventInit;
      input.dispatchEvent(new KeyboardEvent('keydown', k));
      input.dispatchEvent(new KeyboardEvent('keyup', k));
      if (i % 5 === 0) await tick();
    }
    await tick();
  }
  return field ? readChips(field).length : -1;
}

/** Moves the page to the Tags field (for "jump to tag tools" actions). */
export function scrollToTags(doc: Document): boolean {
  const f = tagsField(doc);
  if (!f) return false;
  f.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

/** The page's own writing direction (Studio may be LTR while TubeX's UI is Persian). */
export function pageDir(doc: Document): 'ltr' | 'rtl' {
  const d = doc.documentElement.getAttribute('dir') || doc.body?.getAttribute('dir');
  if (d === 'rtl' || d === 'ltr') return d;
  try {
    return getComputedStyle(doc.documentElement).direction === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}
