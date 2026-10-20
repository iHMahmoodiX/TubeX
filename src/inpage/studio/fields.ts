// Live reading of Studio's title/description/tags fields and click-only writing helpers for islands.
import { useEffect, useRef, useState } from 'react';
import { insertBlock, tagsToAdd } from '../../domain/inpage';
import { readStudioValues, setEditableText, studioFields, typeTags } from '../../platform/youtubeDomInpage';

export interface StudioValues {
  title: string;
  description: string;
  tags: string[];
  found: { title: boolean; description: boolean; tags: boolean };
}

const EMPTY: StudioValues = { title: '', description: '', tags: [], found: { title: false, description: false, tags: false } };

/**
 * Values of Studio's fields, following the user's typing: an `input` listener (debounced 300 ms) plus a 1.5 s
 * check for changes Studio makes itself (chips, autosave restores). Stops when the island unmounts.
 */
export function useStudioValues(getRoot: () => ParentNode | null): StudioValues {
  const [v, setV] = useState<StudioValues>(EMPTY);
  const last = useRef('');
  const rootRef = useRef(getRoot);
  rootRef.current = getRoot;
  useEffect(() => {
    let timer: number | undefined;
    const read = () => {
      timer = undefined;
      const root = rootRef.current();
      const next = root ? readStudioValues(root) : EMPTY;
      const sig = JSON.stringify(next);
      if (sig !== last.current) {
        last.current = sig;
        setV(next);
      }
    };
    const soon = () => {
      if (timer === undefined) timer = window.setTimeout(read, 300);
    };
    read();
    document.addEventListener('input', soon, true);
    document.addEventListener('keyup', soon, true);
    const poll = window.setInterval(read, 1500);
    return () => {
      document.removeEventListener('input', soon, true);
      document.removeEventListener('keyup', soon, true);
      clearInterval(poll);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);
  return v;
}

export type FillResult = { ok: true; changed: boolean; previous?: string } | { ok: false; reason: 'no-field' };

/** Appends a block to Studio's description field (explicit click only). Returns the previous text for undo. */
export function insertDescription(root: ParentNode, block: string): FillResult {
  const f = studioFields(root);
  if (!f.description) return { ok: false, reason: 'no-field' };
  const current = readStudioValues(root).description;
  const next = insertBlock(current, block);
  if (!next.changed) return { ok: true, changed: false };
  setEditableText(f.description, next.text);
  return { ok: true, changed: true, previous: current };
}

export function replaceField(root: ParentNode, field: 'title' | 'description', text: string): FillResult {
  const f = studioFields(root);
  const el = field === 'title' ? f.title : f.description;
  if (!el) return { ok: false, reason: 'no-field' };
  const v = readStudioValues(root);
  const previous = field === 'title' ? v.title : v.description;
  setEditableText(el, text);
  return { ok: true, changed: previous !== text, previous };
}

export type TagFill = { ok: true; added: string[]; duplicate: string[]; overLimit: string[] } | { ok: false; reason: 'no-field' };

/** Types new tags into Studio's tag box, skipping duplicates and anything over the 500-character limit. */
export function addTags(root: ParentNode, tags: string[]): TagFill {
  const f = studioFields(root);
  if (!f.tagsInput) return { ok: false, reason: 'no-field' };
  const plan = tagsToAdd(f.tags, tags);
  typeTags(f.tagsInput, plan.add);
  return { ok: true, added: plan.add, duplicate: plan.duplicate, overLimit: plan.overLimit };
}
