import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { METHODS } from '../src/background/methods';
import { ensureTick, onAlarm } from '../src/background/scheduler';
import { isRpcRequest, serializeError, type RpcResponse } from '../src/platform/rpc';

// Background service worker: RPC for content scripts, scheduled jobs (alarms) and notifications.
// Only TubeX's own pages and content scripts may call it (sender.id is checked).
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse: (r: RpcResponse) => void) => {
    if (sender.id !== browser.runtime.id || !isRpcRequest(msg)) return false;
    const fn = METHODS[msg.method];
    if (!fn) {
      sendResponse({ ok: false, error: { kind: 'other', code: 'generic', detail: `unknown method ${msg.method}` } });
      return false;
    }
    fn(...msg.args)
      .then((value) => sendResponse({ ok: true, value }))
      .catch((e: unknown) => sendResponse({ ok: false, error: serializeError(e) }));
    return true;
  });

  browser.alarms.onAlarm.addListener((a) => void onAlarm(a.name));
  browser.runtime.onInstalled.addListener(() => void ensureTick());
  browser.runtime.onStartup.addListener(() => void ensureTick());
  void ensureTick();

  browser.notifications.onClicked.addListener((id) => {
    if (id.startsWith('url:')) {
      const url = id.slice(4);
      if (url.startsWith('https://www.youtube.com/') || url.startsWith('https://studio.youtube.com/') || url.startsWith(browser.runtime.getURL('/')))
        void browser.tabs.create({ url });
    } else {
      void browser.tabs.create({ url: browser.runtime.getURL('/workspace.html#alerts' as '/workspace.html') });
    }
    void browser.notifications.clear(id);
  });
});
