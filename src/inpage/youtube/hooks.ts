// URL-derived page facts for youtube.com islands. Data comes from the API by id, so the URL is the source
// of truth; the DOM is only used to place islands.
import { parsePageUrl } from '../../domain/pageContext';
import { useHref } from '../InpageRoot';

export function useWatchVideoId(): string | null {
  const ctx = parsePageUrl(useHref());
  return ctx.kind === 'watch' && ctx.videoId ? ctx.videoId : null;
}

export function useSearchQuery(): string | null {
  const ctx = parsePageUrl(useHref());
  return ctx.kind === 'search' && ctx.searchQuery ? ctx.searchQuery : null;
}

export const onWatch = () => location.pathname === '/watch';
export const onSearch = () => location.pathname === '/results';
export const onChannel = () => /^\/(@[^/]+|channel\/UC[\w-]{22}|c\/[^/]+|user\/[^/]+)(\/|$)/.test(location.pathname);
