// Root for every in-page island: language from TubeX prefs, theme from YouTube's own dark/light mode.
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '../components/toasts';
import { I18nProvider } from '../i18n';
import { DEFAULT_PREFS, loadPrefs, onPrefsChanged, type Prefs } from '../storage/prefs';

function ytDark(): boolean {
  if (document.documentElement.hasAttribute('dark')) return true;
  // Studio and older layouts: judge by the page background.
  const m = getComputedStyle(document.body ?? document.documentElement).backgroundColor.match(/\d+/g);
  if (!m || m.length < 3) return false;
  const [r, g, b] = m.map(Number) as [number, number, number];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

function useYtTheme(): 'dark' | 'light' {
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

/** Current page URL, updated on YouTube's SPA navigations. */
export function useHref(): string {
  const [href, setHref] = useState(location.href);
  useEffect(() => {
    const on = () => setHref(location.href);
    window.addEventListener('yt-navigate-finish', on);
    window.addEventListener('popstate', on);
    const id = window.setInterval(on, 1000); // Studio has no navigate event; cheap fallback.
    return () => {
      window.removeEventListener('yt-navigate-finish', on);
      window.removeEventListener('popstate', on);
      clearInterval(id);
    };
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
