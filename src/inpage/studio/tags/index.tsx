// Studio video details (#4): tag tools woven into the Tags field, video switcher.
// Contract: `registerTagToolIslands` mounts this area's islands (own anchors, own CSS); `TagToolsPanel` is this area's
// page-aware panel shown inside the TubeX drawer (returns null when the current page is not its page).
//
// Islands (all behind the 'studioTags' switch, only on studio.youtube.com/video/<id>/edit):
// - tubex-tag-tip: tip line + copy-all / clear-all right above the Tags box;
// - tubex-tag-tools: rank legend, rank badges inside the chips, double-click research, Tag Tools bar and
//   Recommended tags, right under the field;
// - tubex-tag-pop: the keyword popover (fixed, on body);
// - tubex-video-switcher: the uploads strip docked to the page's end edge (fixed, on body).
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { studioEditorRoot } from '../../../platform/youtubeDomInpage';
import { mountIsland } from '../../mount';
import { tagTipSpot, tagToolsSpot } from './dom';
import { KeywordPop } from './KeywordPop';
import { TagTip } from './TagTip';
import { TagTools } from './TagTools';
import { onEditorPage } from './useEditor';
import { VideoSwitcher } from './VideoSwitcher';
import './tags.css';

export { TagToolsPanel } from './Panel';

export async function registerTagToolIslands(ctx: ContentScriptContext): Promise<void> {
  await Promise.all([
    mountIsland(ctx, { name: 'tubex-tag-tip', when: onEditorPage, anchor: () => tagTipSpot(document), render: () => <TagTip /> }),
    mountIsland(ctx, { name: 'tubex-tag-tools', when: onEditorPage, anchor: () => tagToolsSpot(document), render: () => <TagTools /> }),
    mountIsland(ctx, { name: 'tubex-tag-pop', when: onEditorPage, anchor: () => (studioEditorRoot(document) ? document.body : null), render: () => <KeywordPop /> }),
    mountIsland(ctx, { name: 'tubex-video-switcher', when: onEditorPage, anchor: () => (studioEditorRoot(document) ? document.body : null), render: () => <VideoSwitcher /> }),
  ]);
}
