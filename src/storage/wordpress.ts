// WordPress sites the owner connected with an Application Password (D-028). Kept in chrome.storage.local under its own
// key, never in backups or exports, never logged. Anyone with access to this browser profile can read it, like the AI
// keys; an Application Password can be revoked any time in WordPress (Users → Profile → Application Passwords).
import { browser } from 'wxt/browser';

export interface WpSite {
  /** https origin, e.g. https://example.com */
  origin: string;
  user: string;
  appPassword: string;
  /** Display name WordPress returned for the user at the last test. */
  displayName?: string;
  /** REST access style that worked: pretty /wp-json or ?rest_route=. */
  restStyle: 'pretty' | 'query';
  addedAt: string;
}

const KEY = 'wordpress';

export function originOf(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

function coerce(raw: unknown): WpSite[] {
  const list = Array.isArray((raw as { sites?: unknown })?.sites) ? (raw as { sites: unknown[] }).sites : [];
  const out: WpSite[] = [];
  for (const x of list) {
    if (typeof x !== 'object' || x === null) continue;
    const r = x as Record<string, unknown>;
    const origin = typeof r.origin === 'string' ? originOf(r.origin) : null;
    const user = typeof r.user === 'string' ? r.user.trim().slice(0, 200) : '';
    const appPassword = typeof r.appPassword === 'string' ? r.appPassword.trim().slice(0, 200) : '';
    if (!origin || !user || !appPassword || out.some((s) => s.origin === origin)) continue;
    out.push({
      origin,
      user,
      appPassword,
      ...(typeof r.displayName === 'string' && { displayName: r.displayName.slice(0, 200) }),
      restStyle: r.restStyle === 'query' ? 'query' : 'pretty',
      addedAt: typeof r.addedAt === 'string' ? r.addedAt : new Date().toISOString(),
    });
  }
  return out;
}

export async function loadWpSites(): Promise<WpSite[]> {
  return coerce((await browser.storage.local.get(KEY))[KEY]);
}

export async function saveWpSite(site: WpSite): Promise<WpSite[]> {
  const sites = [...(await loadWpSites()).filter((s) => s.origin !== site.origin), site];
  await browser.storage.local.set({ [KEY]: { sites } });
  return coerce({ sites });
}

export async function removeWpSite(origin: string): Promise<WpSite[]> {
  const sites = (await loadWpSites()).filter((s) => s.origin !== origin);
  await browser.storage.local.set({ [KEY]: { sites } });
  return sites;
}

export function onWpSitesChanged(cb: (s: WpSite[]) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(coerce(changes[KEY].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
