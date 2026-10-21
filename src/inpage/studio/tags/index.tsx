// Studio video details (#4): tag tools woven into the Tags field, video switcher.
// Contract: `registerTagToolIslands` mounts this area's islands (own anchors, own CSS); `TagToolsPanel` is this area's
// page-aware panel shown inside the TubeX drawer (returns null when the current page is not its page).
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export async function registerTagToolIslands(_ctx: ContentScriptContext): Promise<void> {}

export function TagToolsPanel() {
  return null;
}
