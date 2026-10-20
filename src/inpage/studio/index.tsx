// In-page islands on studio.youtube.com: the video editor assistant, the upload dialog profile picker and
// canned replies on comment threads. Fields are filled only on a click; Studio's Save stays the user's.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { studioEditorSpot, uploadDialogSpot } from '../../platform/youtubeDomInpage';
import { mountIsland } from '../mount';
import { StudioComments } from './StudioComments';
import { onStudioEditor, StudioEditor } from './StudioEditor';
import { StudioUpload } from './StudioUpload';

export async function registerStudioIslands(ctx: ContentScriptContext): Promise<void> {
  await Promise.all([
    mountIsland(ctx, { name: 'tubex-studio-editor', when: onStudioEditor, anchor: () => studioEditorSpot(document), render: () => <StudioEditor /> }),
    mountIsland(ctx, { name: 'tubex-studio-upload', anchor: () => uploadDialogSpot(document), render: () => <StudioUpload /> }),
    mountIsland(ctx, { name: 'tubex-studio-comments', anchor: () => (document.querySelector('ytcp-comment-thread') ? document.body : null), render: () => <StudioComments /> }),
  ]);
}
