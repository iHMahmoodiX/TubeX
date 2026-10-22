// Data access for the channel page (#5): typed, cached calls to the 'ci.' background methods.
import type { Growth, SnapPoint } from '../../../domain/channelInsights';
import type { ChannelInfo, VideoInfo } from '../../../integrations/youtube/api';
import { rpc } from '../../../platform/rpc';
import { cachedRpc, forgetRpc } from '../../common';

const MIN = 60_000;

export type ChannelRef = { id?: string; handle?: string };

export interface ChannelData {
  channel: ChannelInfo | null;
  keywords: string[];
  fetchedAt: string;
}

export interface GrowthData {
  self: Growth;
  trackingSince?: string;
  you?: { channelId: string; title: string; thumbnail?: string; growth?: Growth };
  members: { channelId: string; title: string; thumbnail?: string; growth: Growth; points: number }[];
}

export interface NicheChannel {
  channelId: string;
  title: string;
  mine: boolean;
  thumbnail?: string;
  latest?: SnapPoint;
  since?: string;
}

export interface OwnDaily {
  startDate: string;
  endDate: string;
  rows: { day: string; views: number }[];
}

export const loadChannel = (ref: ChannelRef) => cachedRpc<ChannelData>(30 * MIN, 'ci.channel', ref);
export const loadUploads = (channelId: string, max: number) => cachedRpc<VideoInfo[]>(30 * MIN, 'ci.uploads', channelId, max);
export const loadHistory = (channelId: string) => cachedRpc<SnapPoint[]>(5 * MIN, 'ci.history', channelId);
export const loadGrowth = (channelId: string) => cachedRpc<GrowthData>(5 * MIN, 'ci.growth', channelId);
export const loadNiche = () => cachedRpc<NicheChannel[]>(5 * MIN, 'ci.niche.list');
export const loadOwnDaily = (channelId: string) => cachedRpc<OwnDaily>(60 * MIN, 'ci.ownDaily', channelId);

/** Forgets cached niche-dependent results after the niche changed. */
export function nicheChanged() {
  forgetRpc('ci.niche.list');
  forgetRpc('ci.growth');
  forgetRpc('ci.history');
}

export async function addToNiche(channelId: string): Promise<boolean> {
  const r = await rpc<{ existed: boolean }>('ci.niche.add', channelId);
  nicheChanged();
  return r.existed;
}
export async function removeFromNiche(channelId: string): Promise<boolean> {
  const r = await rpc<{ removed: boolean }>('ci.niche.remove', channelId);
  nicheChanged();
  return r.removed;
}
export async function undoRemove(channelId: string): Promise<boolean> {
  const r = await rpc<{ restored: boolean }>('ci.niche.undoRemove', channelId);
  nicheChanged();
  return r.restored;
}
