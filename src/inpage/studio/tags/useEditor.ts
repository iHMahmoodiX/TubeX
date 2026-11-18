// One shared reader of Studio's title/description/tags for all tag-tool islands on the page: a single
// MutationObserver on the editor (ignoring TubeX's own hosts) plus the user's input events, debounced. No polling.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { readStudioValues, studioEditorRoot } from '../../../platform/youtubeDomInpage';
import { useHref } from '../../InpageRoot';
import type { StudioValues } from '../fields';
import { editorVideoId } from './store';

const EMPTY: StudioValues = { title: '', description: '', tags: [], found: { title: false, description: false, tags: false } };

let value: StudioValues = EMPTY;
let sig = '';
const subs = new Set<() => void>();
let observer: MutationObserver | null = null;
let observed: Element | null = null;
let timer: number | undefined;

const ours = (n: Node) => n.nodeName.startsWith('TUBEX-');

function read() {
  timer = undefined;
  const root = studioEditorRoot(document);
  if (root !== observed) attach(root);
  const next = root ? readStudioValues(root) : EMPTY;
  const s = JSON.stringify(next);
  if (s !== sig) {
    sig = s;
    value = next;
    subs.forEach((f) => f());
  }
}

function soon() {
  if (timer === undefined) timer = window.setTimeout(read, 250);
}

function attach(root: Element | null) {
  observer?.disconnect();
  observed = root;
  if (!root) return;
  observer = new MutationObserver((records) => {
    if (records.every((r) => r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(ours))) return;
    soon();
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
}

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) {
    document.addEventListener('input', soon, true);
    document.addEventListener('keyup', soon, true);
    window.addEventListener('focus', soon);
    read();
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0) {
      document.removeEventListener('input', soon, true);
      document.removeEventListener('keyup', soon, true);
      window.removeEventListener('focus', soon);
      observer?.disconnect();
      observer = null;
      observed = null;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    }
  };
}

/** Re-reads the fields soon (after TubeX itself changed them). */
export const refreshEditorValues = () => soon();

export function useEditorValues(): StudioValues {
  const v = useSyncExternalStore(subscribe, () => value, () => EMPTY);
  // A newly mounted island re-checks once (the editor may have been re-rendered since the last read).
  useEffect(() => soon(), []);
  return v;
}

/** Video id of the editor page plus the live field values. */
export function useEditor(): { videoId: string | null; values: StudioValues } {
  const href = useHref();
  const videoId = useMemo(() => editorVideoId(href), [href]);
  const values = useEditorValues();
  return { videoId, values };
}

export const onEditorPage = () => location.hostname === 'studio.youtube.com' && /^\/video\/[\w-]{11}\/edit/.test(location.pathname);
