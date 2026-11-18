import { defineContentScript } from 'wxt/utils/define-content-script';
import { installAskStudioBridge } from '../../src/inpage/askStudioMain';

// Runs in Studio's own page context (MAIN world) for Ask Studio automation (D-030): it can see the page's
// requests to learn the Ask Studio request once, and replay it with the owner's signed-in session.
// It has no extension APIs; it talks to TubeX's isolated content script through DOM events only.
export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installAskStudioBridge();
  },
});
