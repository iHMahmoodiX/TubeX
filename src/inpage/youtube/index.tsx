// In-page islands on www.youtube.com. Each island has a cheap URL gate and a DOM anchor with fallbacks;
// when either is missing the island is simply not there. Each one also checks its own switch in Settings.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { channelStripSpot, mastheadSpot, searchStripSpot, watchCardSpot } from '../../platform/youtubeDomInpage';
import { mountIsland } from '../mount';
import { ChannelStrip } from './ChannelStrip';
import { onChannel, onSearch, onWatch } from './hooks';
import { Masthead } from './Masthead';
import { SearchTools } from './SearchTools';
import { WatchCard } from './WatchCard';
import { registerChannelInsightIslands } from './insights';
import { registerLaunchers } from '../launch';

export async function registerYoutubeIslands(ctx: ContentScriptContext): Promise<void> {
  await Promise.all([
    mountIsland(ctx, { name: 'tubex-watch', when: onWatch, anchor: () => watchCardSpot(document), render: () => <WatchCard /> }),
    mountIsland(ctx, { name: 'tubex-search', when: onSearch, anchor: () => searchStripSpot(document), render: () => <SearchTools /> }),
    mountIsland(ctx, { name: 'tubex-channel', when: onChannel, anchor: () => channelStripSpot(document), render: () => <ChannelStrip /> }),
    mountIsland(ctx, { name: 'tubex-masthead', anchor: () => mastheadSpot(document), render: () => <Masthead /> }),
    registerChannelInsightIslands(ctx),
    registerLaunchers(ctx, 'youtube'),
  ]);
}
