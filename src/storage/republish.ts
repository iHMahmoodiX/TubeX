// Aparat/blog settings and prompt templates (chrome.storage.local, key "republish"). Included in settings backups.
import { browser } from 'wxt/browser';
import { coerceRepublish, type RepublishSettings } from '../domain/republish';

const KEY = 'republish';

export async function loadRepublish(): Promise<RepublishSettings> {
  return coerceRepublish((await browser.storage.local.get(KEY))[KEY]);
}

export async function saveRepublish(next: RepublishSettings): Promise<RepublishSettings> {
  const clean = coerceRepublish(next);
  await browser.storage.local.set({ [KEY]: clean });
  return clean;
}

export async function updateRepublish(fn: (cur: RepublishSettings) => RepublishSettings): Promise<RepublishSettings> {
  return saveRepublish(fn(await loadRepublish()));
}

export function onRepublishChanged(cb: (s: RepublishSettings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(coerceRepublish(changes[KEY].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
