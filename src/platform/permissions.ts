// Runtime host permissions for user-chosen services. Requested only for the exact origin, on a user click.
import { browser } from 'wxt/browser';

export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))) return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

export async function hasOrigin(url: string): Promise<boolean> {
  const pattern = originPattern(url);
  return !!pattern && browser.permissions.contains({ origins: [pattern] });
}

/** Must be called from a user gesture (button click). */
export async function requestOrigin(url: string): Promise<boolean> {
  const pattern = originPattern(url);
  if (!pattern) return false;
  // Called first, with no await before it, so the click still counts as the user gesture.
  return browser.permissions.request({ origins: [pattern] });
}
