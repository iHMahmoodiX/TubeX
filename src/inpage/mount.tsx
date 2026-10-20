// Mounts a React island into a YouTube or Studio page inside an isolated shadow root. The anchor may appear
// and disappear as YouTube navigates; autoMount follows it. Islands are read-only toward the page unless
// a user click asks for an action (e.g. filling a Studio form field, which the user still saves).
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { InpageRoot } from './InpageRoot';

export interface IslandSpec {
  /** kebab-case, unique per island, e.g. 'tubex-watch'. */
  name: string;
  anchor: string | (() => Element | null | undefined);
  append?: 'first' | 'last' | 'before' | 'after';
  /** Floating panel instead of inline (uses `position: overlay`). */
  overlay?: boolean;
  render: () => ReactNode;
}

export async function mountIsland(ctx: ContentScriptContext, spec: IslandSpec): Promise<void> {
  const ui = await createShadowRootUi<Root>(ctx, {
    name: spec.name,
    position: 'inline',
    anchor: spec.anchor,
    append: spec.append ?? 'last',
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
  ui.autoMount();
}
