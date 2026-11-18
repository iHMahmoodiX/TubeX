// Shared root for every extension page: preferences, language/direction, theme, storage health, toasts.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { I18nProvider, makeI18n } from '../i18n';
import { openDb } from '../storage/db';
import { DEFAULT_PREFS, loadPrefs, onPrefsChanged, updatePrefs, type Prefs } from '../storage/prefs';
import { ToastProvider } from './toasts';
import { Button, Notice } from './ui';
import '../styles/fonts.css';
import '../styles/base.css';

interface PrefsApi {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => Promise<void>;
}
const PrefsContext = createContext<PrefsApi>({ prefs: DEFAULT_PREFS, setPrefs: async () => {} });
export const usePrefs = () => useContext(PrefsContext);

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

export function AppShell({ children, page }: { children: ReactNode; page: 'sidepanel' | 'popup' | 'workspace' }) {
  const [prefs, setPrefsState] = useState<Prefs | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const systemDark = useSystemDark();

  const checkDb = useCallback(() => {
    setDbError(null);
    openDb().catch((e: unknown) => setDbError(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
  }, []);

  useEffect(() => {
    loadPrefs()
      .then(setPrefsState)
      .catch(() => setPrefsState(DEFAULT_PREFS));
    checkDb();
    return onPrefsChanged(setPrefsState);
  }, [checkDb]);

  const lang = prefs?.uiLanguage ?? DEFAULT_PREFS.uiLanguage;
  const theme = prefs?.theme === 'system' || !prefs ? (systemDark ? 'dark' : 'light') : prefs.theme;
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'fa' ? 'rtl' : 'ltr';
    root.dataset.theme = theme;
    root.dataset.page = page;
  }, [lang, theme, page]);

  const setPrefs = useCallback(async (patch: Partial<Prefs>) => {
    setPrefsState(await updatePrefs(patch));
  }, []);

  if (!prefs) return null;
  const { t } = makeI18n(lang);
  return (
    <I18nProvider lang={lang}>
      <PrefsContext.Provider value={{ prefs, setPrefs }}>
        <ToastProvider>
          {dbError ? (
            <main className="stack" style={{ padding: 16 }}>
              <Notice tone="error">
                <strong>{t('error.db')}</strong>
                <p>{t('error.dbHelp')}</p>
                <details>
                  <summary>{t('common.details')}</summary>
                  <code className="mono ltr">{dbError}</code>
                </details>
                <div>
                  <Button onClick={checkDb}>{t('common.retry')}</Button>
                </div>
              </Notice>
            </main>
          ) : (
            children
          )}
        </ToastProvider>
      </PrefsContext.Provider>
    </I18nProvider>
  );
}
