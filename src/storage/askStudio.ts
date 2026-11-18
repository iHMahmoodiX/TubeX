// Ask Studio settings (mode, presets, learned request) and answer history, in chrome.storage.local.
import { browser } from 'wxt/browser';
import { coerceAskSettings, type AskHistoryItem, type AskSettings } from '../domain/askStudio';

const KEY = 'askStudio';
const HISTORY = 'askStudioHistory';
const MAX_HISTORY = 100;

export async function loadAskSettings(): Promise<AskSettings> {
  return coerceAskSettings((await browser.storage.local.get(KEY))[KEY]);
}

export async function saveAskSettings(next: AskSettings): Promise<AskSettings> {
  const clean = coerceAskSettings(next);
  await browser.storage.local.set({ [KEY]: clean });
  return clean;
}

export async function updateAskSettings(fn: (cur: AskSettings) => AskSettings): Promise<AskSettings> {
  return saveAskSettings(fn(await loadAskSettings()));
}

export function onAskSettingsChanged(cb: (s: AskSettings) => void): () => void {
  const l = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(coerceAskSettings(changes[KEY].newValue));
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}

function coerceHistory(raw: unknown): AskHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is AskHistoryItem => typeof x === 'object' && x !== null && typeof (x as AskHistoryItem).id === 'string' && typeof (x as AskHistoryItem).answer === 'string')
    .slice(0, MAX_HISTORY);
}

export async function loadAskHistory(): Promise<AskHistoryItem[]> {
  return coerceHistory((await browser.storage.local.get(HISTORY))[HISTORY]);
}

export async function addAskHistory(item: AskHistoryItem): Promise<void> {
  const cur = await loadAskHistory();
  await browser.storage.local.set({ [HISTORY]: [item, ...cur.filter((x) => x.id !== item.id)].slice(0, MAX_HISTORY) });
}

export async function clearAskHistory(): Promise<void> {
  await browser.storage.local.remove(HISTORY);
}

export function onAskHistoryChanged(cb: (h: AskHistoryItem[]) => void): () => void {
  const l = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[HISTORY]) cb(coerceHistory(changes[HISTORY].newValue));
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}
