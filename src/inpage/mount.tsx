// Mounts a React island into a YouTube or Studio page inside an isolated shadow root. The anchor may appear
// and disappear as YouTube navigates; one shared, throttled MutationObserver follows every island's anchor
// (cheaper than one observer per island) and re-inserts the host if the page re-renders it away.
// Islands are read-only toward the page unless a user click asks for an action (e.g. filling a Studio form
// field, which the user still saves).
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { InpageRoot } from './InpageRoot';

type Append = 'first' | 'last' | 'before' | 'after';
/** An anchor element plus where to insert relative to it (overrides `append`). */
export interface AnchorSpot {
  el: Element;
  append: Append;
}

export interface IslandSpec {
  /** kebab-case, unique per island, e.g. 'tubex-watch'. */
  name: string;
  /** A selector, or a function returning the anchor element (or an element + insert position). */
  anchor: string | (() => Element | AnchorSpot | null | undefined);
  append?: Append;
  /** Floating panel instead of inline (uses `position: overlay`). */
  overlay?: boolean;
  /** Cheap gate checked before the anchor (e.g. the URL path); false unmounts the island. */
  when?: () => boolean;
  render: () => ReactNode;
}

interface Entry {
  spec: IslandSpec;
  ui: Awaited<ReturnType<typeof createShadowRootUi<Root>>>;
  mounted: boolean;
  spot: AnchorSpot | null;
}

const entries: Entry[] = [];
let observer: MutationObserver | null = null;
let timer: number | undefined;
let lastRun = 0;
const MIN_GAP_MS = 300;

function resolveSpot(spec: IslandSpec): AnchorSpot | null {
  if (spec.when && !spec.when()) return null;
  const a = typeof spec.anchor === 'string' ? document.querySelector(spec.anchor) : spec.anchor();
  if (!a) return null;
  if (a instanceof Element) return { el: a, append: spec.append ?? 'last' };
  return a;
}

function insert(host: Element, spot: AnchorSpot) {
  const { el, append } = spot;
  if (append === 'first') el.prepend(host);
  else if (append === 'last') el.append(host);
  else if (append === 'before') el.parentElement?.insertBefore(host, el);
  else el.parentElement?.insertBefore(host, el.nextElementSibling);
}

/** True when the host still sits where the spot wants it (loosely: same parent), so we never fight the page. */
function inPlace(host: Element, spot: AnchorSpot): boolean {
  if (!host.isConnected) return false;
  return spot.append === 'first' || spot.append === 'last' ? host.parentElement === spot.el : host.parentElement === spot.el.parentElement;
}

function check() {
  lastRun = Date.now();
  timer = undefined;
  for (const e of entries) {
    const spot = resolveSpot(e.spec);
    if (!spot) {
      if (e.mounted) {
        e.ui.remove();
        e.mounted = false;
      }
      continue;
    }
    e.spot = spot;
    if (!e.mounted) {
      e.ui.mount();
      e.mounted = true;
    } else if (!inPlace(e.ui.shadowHost, spot)) {
      insert(e.ui.shadowHost, spot); // keeps the React tree and its state
    }
  }
}

function schedule() {
  if (timer !== undefined) return;
  timer = window.setTimeout(check, Math.max(0, MIN_GAP_MS - (Date.now() - lastRun)));
}

function startWatching(ctx: ContentScriptContext) {
  if (observer) return;
  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', schedule);
  window.addEventListener('popstate', schedule);
  ctx.onInvalidated(() => {
    observer?.disconnect();
    observer = null;
    window.removeEventListener('yt-navigate-finish', schedule);
    window.removeEventListener('popstate', schedule);
    if (timer !== undefined) clearTimeout(timer);
    entries.length = 0;
  });
}

export async function mountIsland(ctx: ContentScriptContext, spec: IslandSpec): Promise<void> {
  let entry: Entry | undefined;
  const ui = await createShadowRootUi<Root>(ctx, {
    name: spec.name,
    position: spec.overlay ? 'overlay' : 'inline',
    // mountUi (called by ui.mount) reads this; the watcher has just resolved the spot.
    anchor: () => entry?.spot?.el ?? null,
    append: (anchor, root) => insert(root, { el: anchor, append: entry?.spot?.append ?? spec.append ?? 'last' }),
    isolateEvents: ['keydown', 'keyup', 'keypress'],
    onMount(container) {
      const root = createRoot(container);
      root.render(<InpageRoot>{spec.render()}</InpageRoot>);
      return root;
    },
    onRemove(root) {
      root?.unmount();
    },
  });
  entry = { spec, ui, mounted: false, spot: null };
  entries.push(entry);
  startWatching(ctx);
  schedule();
}
