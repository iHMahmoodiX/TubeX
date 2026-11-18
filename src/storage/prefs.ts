// Small UI preferences in chrome.storage.local. Never put credentials or large records here.
import { browser } from 'wxt/browser';
import type { Lang } from '../domain/models';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Prefs {
  uiLanguage: Lang;
  theme: ThemePref;
  activeProfileId?: string;
  lastDraftId?: string;
  /** Kill switch for reading YouTube page DOM. URL-based detection keeps working when off. */
  pageAdapterEnabled: boolean;
  /** In-page tools on YouTube/Studio. `all: false` turns every island off; per-feature keys override. */
  inpage?: Record<string, boolean>;
}

export const DEFAULT_PREFS: Prefs = { uiLanguage: 'fa', theme: 'dark', pageAdapterEnabled: true };
const KEY = 'prefs';

export function coercePrefs(raw: unknown): Prefs {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    uiLanguage: r.uiLanguage === 'en' ? 'en' : 'fa',
    theme: r.theme === 'light' || r.theme === 'system' ? r.theme : 'dark',
    activeProfileId: typeof r.activeProfileId === 'string' ? r.activeProfileId : undefined,
    lastDraftId: typeof r.lastDraftId === 'string' ? r.lastDraftId : undefined,
    pageAdapterEnabled: r.pageAdapterEnabled !== false,
    inpage:
      typeof r.inpage === 'object' && r.inpage !== null
        ? Object.fromEntries(Object.entries(r.inpage as Record<string, unknown>).filter(([k, v]) => k.length < 40 && typeof v === 'boolean') as [string, boolean][])
        : undefined,
  };
}

export async function loadPrefs(): Promise<Prefs> {
  const got = await browser.storage.local.get(KEY);
  return coercePrefs(got[KEY]);
}

export async function updatePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await loadPrefs()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function onPrefsChanged(cb: (p: Prefs) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(coercePrefs(changes[KEY].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
