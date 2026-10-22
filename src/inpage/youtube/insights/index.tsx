// YouTube channel page (#5): Channelytics section and Channel Insights.
// Contract: `registerChannelInsightIslands` mounts this area's islands (own anchors, own CSS); `ChannelInsightsPanel` is this area's
// page-aware panel shown inside the TubeX drawer (returns null when the current page is not its page).
//
// This area needs no island of its own: Channelytics and the inline "Open insights" entry live in the channel strip
// (ChannelStrip.tsx, switch 'channel'), and the drawer renders ChannelInsightsPanel (switch 'channelInsights').
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { readChannelRef } from '../../../platform/youtubeDomInpage';
import { useHref, useInpageEnabled } from '../../InpageRoot';
import { ChannelInsights } from './Insights';
import './insights.css';

export async function registerChannelInsightIslands(_ctx: ContentScriptContext): Promise<void> {}

/** Channel Insights for the channel page being viewed, inside the TubeX drawer. Null on other pages or when switched off. */
export function ChannelInsightsPanel() {
  const on = useInpageEnabled('channelInsights');
  const href = useHref();
  if (!on || !/^https:\/\/www\.youtube\.com\//.test(href)) return null;
  const ref = readChannelRef(document, href);
  if (!ref) return null;
  const key = ref.id ?? ref.handle ?? '';
  return <ChannelInsights key={key} channelRef={ref} variant="drawer" />;
}

export { ChannelInsights } from './Insights';
export { Channelytics } from './Channelytics';
