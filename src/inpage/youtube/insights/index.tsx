// YouTube channel page (#5): Channelytics section and Channel Insights.
// Contract: `registerChannelInsightIslands` mounts this area's islands (own anchors, own CSS); `ChannelInsightsPanel` is this area's
// page-aware panel shown inside the TubeX drawer (returns null when the current page is not its page).
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export async function registerChannelInsightIslands(_ctx: ContentScriptContext): Promise<void> {}

export function ChannelInsightsPanel() {
  return null;
}
