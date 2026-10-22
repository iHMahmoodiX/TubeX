import { useCallback, useEffect } from 'react';
import type { GoogleChannel } from '../../integrations/google/auth';
import { useGoogle } from '../connections/useConnections';
import { useAsync } from '../research/shared';
import { loadOwnVideos, type RVideo } from './data';

/** The active Google channel. */
export function useChannel() {
  const g = useGoogle();
  const active: GoogleChannel | undefined = g.channels.find((c) => c.channelId === g.activeChannelId);
  return { g, active };
}

/** Every upload of the active channel, loaded once per channel (cached reads). */
export function useOwnVideos(active: GoogleChannel | undefined) {
  const channelId = active?.channelId;
  const playlist = active?.uploadsPlaylistId;
  const load = useCallback((fresh: boolean) => (channelId && playlist ? loadOwnVideos(channelId, playlist, fresh) : Promise.resolve([] as RVideo[])), [channelId, playlist]);
  const state = useAsync(load);
  const { run } = state;
  useEffect(() => {
    if (channelId) void run(false);
  }, [channelId, run]);
  return state;
}
