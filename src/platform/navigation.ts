import { browser } from 'wxt/browser';

export type WorkspaceRoute =
  | 'mychannel'
  | 'ideas'
  | 'drafts'
  | 'templates'
  | 'research'
  | 'ranks'
  | 'competitors'
  | 'reports'
  | 'bulk'
  | 'playlists'
  | 'schedule'
  | 'thumbs'
  | 'kids'
  | 'shorts'
  | 'comments'
  | 'alerts'
  | 'channels'
  | 'settings';

/** Opens the full-page workspace at a section in a new tab. */
export async function openWorkspace(route: WorkspaceRoute = 'ideas', id?: string): Promise<void> {
  const base = browser.runtime.getURL('/workspace.html');
  const hash = id ? `#${route}/${encodeURIComponent(id)}` : `#${route}`;
  await browser.tabs.create({ url: base + hash });
}
