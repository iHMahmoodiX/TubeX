// Root for every in-page island: language from TubeX prefs, theme from YouTube's own dark/light mode.
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '../components/toasts';
import { I18nProvider } from '../i18n';
import { DEFAULT_PREFS, loadPrefs, onPrefsChanged, type Prefs } from '../storage/prefs';

function ytDark(): boolean {
  if (document.documentElement.hasAttribute('dark')) return true;
  // youtube.com marks dark mode with html[dark]; no attribute there means light.
  if (location.hostname === 'www.youtube.com') return false;
  // Studio and older layouts: judge by the first non-transparent page background (body, then html).
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (!m || m.length < 3 || (m.length >= 4 && Number(m[3]) === 0)) continue;
    const [r, g, b] = m.map(Number) as [number, number, number];
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  }
  return false;
}

/** YouTube's (or Studio's) current theme, updated live. */
export function useYtTheme(): 'dark' | 'light' {
  const [dark, setDark] = useState(ytDark);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(ytDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['dark', 'data-theme'] });
    return () => mo.disconnect();
  }, []);
  return dark ? 'dark' : 'light';
}

export function InpageRoot({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const theme = useYtTheme();
  useEffect(() => {
    void loadPrefs().then(setPrefs);
    return onPrefsChanged(setPrefs);
  }, []);
  const lang = prefs.uiLanguage;
  return (
    <div className="tx-root" lang={lang} dir={lang === 'fa' ? 'rtl' : 'ltr'} data-theme={theme}>
      <I18nProvider lang={lang}>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </div>
  );
}

// One shared URL watcher for every island (YouTube fires yt-navigate-finish; Studio has no event, so a 1 s check).
const hrefSubs = new Set<(h: string) => void>();
let hrefTimer: number | undefined;
let lastHref = typeof location !== 'undefined' ? location.href : '';
function emitHref() {
  if (location.href === lastHref) return;
  lastHref = location.href;
  hrefSubs.forEach((cb) => cb(lastHref));
}
function subscribeHref(cb: (h: string) => void): () => void {
  hrefSubs.add(cb);
  if (hrefSubs.size === 1) {
    window.addEventListener('yt-navigate-finish', emitHref);
    window.addEventListener('popstate', emitHref);
    hrefTimer = window.setInterval(emitHref, 1000);
  }
  return () => {
    hrefSubs.delete(cb);
    if (hrefSubs.size === 0) {
      window.removeEventListener('yt-navigate-finish', emitHref);
      window.removeEventListener('popstate', emitHref);
      clearInterval(hrefTimer);
    }
  };
}

/** Current page URL, updated on YouTube's SPA navigations. */
export function useHref(): string {
  const [href, setHref] = useState(location.href);
  useEffect(() => {
    setHref(location.href);
    return subscribeHref(setHref);
  }, []);
  return href;
}

/** True when TubeX's in-page tools are switched on (Settings → In-page tools). */
export function useInpageEnabled(feature: string): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const read = (p: Prefs) => setOn(p.inpage?.[feature] !== false && p.inpage?.all !== false);
    void loadPrefs().then(read);
    return onPrefsChanged(read);
  }, [feature]);
  return on;
}
