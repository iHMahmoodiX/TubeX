// RPC methods for the reports area. Names are prefixed 'reports.'.
import { checkAdFriendly } from '../../domain/reportsDemonetization';
import { snapshotHealth } from '../jobs/reports';

const str = (v: unknown, max: number): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error('bad argument');
  return v;
};

export const reportsMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /** Heuristic ad-friendliness check of metadata (e.g. the Studio edit form). Pure; no network. */
  'reports.adCheck': async (input: unknown) => {
    if (typeof input !== 'object' || input === null) throw new Error('bad argument');
    const o = input as Record<string, unknown>;
    const tags = Array.isArray(o.tags) ? o.tags.slice(0, 500).map((t) => str(t, 200)) : [];
    return checkAdFriendly({ title: str(o.title ?? '', 500), description: str(o.description ?? '', 20_000), tags });
  },
  /** Computes and stores today's health snapshot for a connected channel. */
  'reports.healthSnapshot': async (channelId: unknown) => {
    const id = str(channelId, 64);
    if (!/^UC[\w-]{22}$/.test(id)) throw new Error('bad argument');
    return snapshotHealth(id);
  },
};
