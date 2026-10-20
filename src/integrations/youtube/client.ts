// YouTube Data API v3 client for public data, using the owner's own API key. Read-only by design:
// only the GET resources listed in COST are reachable. Quota costs are documented as Inferred in
// docs/INTEGRATIONS.md; the local counter is an estimate, the Google Cloud console is the truth.
import { addUsage, loadIntegrations, loadUsage } from '../../storage/integrations';
import { cacheGet, cacheSet, hashKey } from '../../storage/cache';
import { hasOrigin } from '../../platform/permissions';

export const YT_BASE = 'https://www.googleapis.com/youtube/v3';
export const COST = { search: 100, videos: 1, channels: 1, playlistItems: 1, videoCategories: 1, commentThreads: 1 } as const;
export type YtResource = keyof typeof COST;

export type YtErrorCode = 'no-key' | 'permission' | 'budget' | 'quota' | 'bad-key' | 'forbidden' | 'not-found' | 'bad-request' | 'unreachable' | 'server';

export class YtError extends Error {
  constructor(
    public code: YtErrorCode,
    public detail?: string,
  ) {
    super(code);
  }
}

export interface YtResult<T> {
  data: T;
  fromCache: boolean;
  fetchedAt: string;
}

/** Maps a Google API error body to a TubeX error code. */
export function mapYtError(status: number, body: unknown): YtError {
  const err = (body as { error?: { message?: string; errors?: { reason?: string }[] } } | null)?.error;
  const reason = err?.errors?.[0]?.reason ?? '';
  const detail = `${status} ${reason} ${err?.message ?? ''}`.trim().slice(0, 300);
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(reason)) return new YtError('quota', detail);
  if (/keyInvalid|keyExpired/i.test(reason) || (status === 400 && /API key/i.test(err?.message ?? ''))) return new YtError('bad-key', detail);
  if (status === 403) return new YtError('forbidden', detail);
  if (status === 404) return new YtError('not-found', detail);
  if (status === 400) return new YtError('bad-request', detail);
  return new YtError('server', detail);
}

export async function ytGet<T>(
  resource: YtResource,
  params: Record<string, string | number | undefined>,
  ttlMs: number,
  opts: { fresh?: boolean; fetcher?: typeof fetch } = {},
): Promise<YtResult<T>> {
  const { youtube } = await loadIntegrations();
  if (!youtube.apiKey) throw new YtError('no-key');
  if (!(await hasOrigin(YT_BASE))) throw new YtError('permission');

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') clean[k] = String(v);
  // The key is not part of the cache key: results are public data and stay valid if the key changes.
  const key = await hashKey(['yt', resource, Object.entries(clean).sort()]);
  if (!opts.fresh) {
    const hit = await cacheGet<T>(key);
    if (hit) return { data: hit.value, fromCache: true, fetchedAt: hit.storedAt };
  }

  const cost = COST[resource];
  const usage = await loadUsage();
  if (youtube.dailyUnitCap > 0 && usage.ytUnits + cost > youtube.dailyUnitCap) throw new YtError('budget');

  const url = new URL(`${YT_BASE}/${resource}`);
  for (const [k, v] of Object.entries(clean)) url.searchParams.set(k, v);
  url.searchParams.set('key', youtube.apiKey);

  await addUsage({ ytUnits: cost });
  let res: Response;
  try {
    res = await (opts.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new YtError('unreachable', e instanceof Error ? e.message : String(e));
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw mapYtError(res.status, body);
  await cacheSet(key, body, ttlMs);
  return { data: body as T, fromCache: false, fetchedAt: new Date().toISOString() };
}
