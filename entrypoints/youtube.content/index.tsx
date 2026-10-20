import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { parsePageUrl } from '../../src/domain/pageContext';
import { registerYoutubeIslands } from '../../src/inpage/youtube';
import { isPageContextRequest, type PageContextResponse } from '../../src/platform/messages';
import { ADAPTER_VERSION, readWatchDom } from '../../src/platform/youtubeDom';
import { loadPrefs } from '../../src/storage/prefs';
import '../../src/inpage/inpage.css';

// 1) Read-only page-context responder for TubeX's own pages. 2) In-page tools (islands) in shadow roots.
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    // Chrome's onMessage does not accept a returned Promise; respond via sendResponse and return true.
    browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse: (r: PageContextResponse) => void) => {
      if (sender.id !== browser.runtime.id || !isPageContextRequest(msg)) return false;
      void (async () => {
        const url = location.href;
        const base: PageContextResponse = { url, adapterVersion: ADAPTER_VERSION };
        if (!(await loadPrefs()).pageAdapterEnabled) return sendResponse(base);
        sendResponse({ ...base, ...readWatchDom(document, parsePageUrl(url)) });
      })();
      return true;
    });
    if ((await loadPrefs()).inpage?.all === false) return;
    await registerYoutubeIslands(ctx);
  },
});
