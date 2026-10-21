// In-page launchers (#6): floating edge tab and top-bar buttons on YouTube and Studio, the TubeX drawer that
// shows the page-aware panels of each area, and the watch-page Videolytics panel (#7).
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export async function registerLaunchers(_ctx: ContentScriptContext, _site: 'youtube' | 'studio'): Promise<void> {}
