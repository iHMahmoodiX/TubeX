// In-page launchers (#6): floating edge tab and top-bar buttons on YouTube and Studio, the TubeX drawer that
// shows the page-aware panels of each area, and the watch-page Videolytics panel (#7).
// Performance: one overlay island holds both the edge tab and the drawer; the drawer's content mounts on first
// open; anchors follow the shared MutationObserver in mount.tsx (no polling of our own).
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { mountIsland } from '../mount';
import { Masthead } from '../youtube/Masthead';
import { onWatch } from '../youtube/hooks';
import { Videolytics } from '../youtube/Videolytics';
import { studioMastheadSpot, videolyticsSpot } from './dom';
import { Launcher } from './Launcher';
import './launch.css';

export async function registerLaunchers(ctx: ContentScriptContext, site: 'youtube' | 'studio'): Promise<void> {
  const body = () => document.body;
  if (site === 'youtube') {
    await Promise.all([
      mountIsland(ctx, { name: 'tubex-launcher', overlay: true, anchor: body, render: () => <Launcher site="youtube" /> }),
      mountIsland(ctx, { name: 'tubex-videolytics', when: onWatch, anchor: () => videolyticsSpot(document), render: () => <Videolytics /> }),
    ]);
    return;
  }
  await Promise.all([
    mountIsland(ctx, { name: 'tubex-launcher', overlay: true, anchor: body, render: () => <Launcher site="studio" /> }),
    mountIsland(ctx, { name: 'tubex-studio-masthead', anchor: () => studioMastheadSpot(document), render: () => <Masthead site="studio" /> }),
  ]);
}
