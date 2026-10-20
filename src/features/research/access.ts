import { useGoogle, useIntegrations } from '../connections/useConnections';

/** Whether public YouTube reads can run: an API key, or a signed-in channel whose token is used instead. */
export function usePublicAccess(): { loaded: boolean; ok: boolean; signedIn: boolean } {
  const { youtube, loaded } = useIntegrations();
  const g = useGoogle();
  const signedIn = g.channels.length > 0;
  return { loaded: loaded && g.loaded, ok: !!youtube.apiKey || signedIn, signedIn };
}
