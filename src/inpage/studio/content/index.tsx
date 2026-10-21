// Studio Content list page (#2, #3): bulk & tools menu in the header, selection-toolbar actions.
// Contract: `registerStudioContentIslands` mounts this area's islands (own anchors, own CSS); `StudioContentPanel` is this area's
// page-aware panel shown inside the TubeX drawer (returns null when the current page is not its page).
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export async function registerStudioContentIslands(_ctx: ContentScriptContext): Promise<void> {}

export function StudioContentPanel() {
  return null;
}
