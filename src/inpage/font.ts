// Fonts declared inside a shadow root are ignored by Chromium, so the in-page islands' font face is declared
// once on the host page's document. The file is a web-accessible extension resource (wxt.config.ts).
import { browser } from 'wxt/browser';

export function injectInpageFont(): void {
  if (document.getElementById('tubex-font')) return;
  const style = document.createElement('style');
  style.id = 'tubex-font';
  const url = browser.runtime.getURL('/fonts/estedad-fd.woff2');
  style.textContent = `@font-face{font-family:'TubeX Estedad';src:url('${url}') format('woff2');font-weight:100 900;font-style:normal;font-display:swap}`;
  (document.head ?? document.documentElement).append(style);
}
