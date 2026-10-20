import { defineContentScript } from 'wxt/utils/define-content-script';
import { registerStudioIslands } from '../../src/inpage/studio';
import '../../src/inpage/inpage.css';

// In-page tools in YouTube Studio (shadow roots). Form fields are only filled on an explicit click,
// and Studio's own Save button stays the only way a change is saved from these tools.
export default defineContentScript({
  matches: ['https://studio.youtube.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    // Islands follow Settings → In-page tools live (each checks its own switch), so they register even when off.
    await registerStudioIslands(ctx);
  },
});
