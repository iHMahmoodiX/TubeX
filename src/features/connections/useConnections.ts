import { useEffect, useState } from 'react';
import { AiError } from '../../integrations/ai/provider';
import { YtError } from '../../integrations/youtube/client';
import { AuthError, loadAuthStatus, loadGoogleState, loadSignInServer, onAuthStatusChanged, onGoogleStateChanged, onSignInServerChanged, type ChannelAuth, type GoogleState } from '../../integrations/google/auth';
import { onRefreshChanged, refreshChannelIds } from '../../integrations/google/refreshStore';
import type { MessageKey } from '../../i18n/en';
import { DEFAULT_INTEGRATIONS, loadIntegrations, loadUsage, onIntegrationsChanged, onUsageChanged, rollUsage, type Integrations, type Usage } from '../../storage/integrations';

export function useIntegrations(): Integrations & { loaded: boolean } {
  const [state, setState] = useState<Integrations & { loaded: boolean }>({ ...DEFAULT_INTEGRATIONS, loaded: false });
  useEffect(() => {
    void loadIntegrations().then((i) => setState({ ...i, loaded: true }));
    return onIntegrationsChanged((i) => setState({ ...i, loaded: true }));
  }, []);
  return state;
}

export function useUsage(): Usage {
  const [u, setU] = useState<Usage>(() => rollUsage(null));
  useEffect(() => {
    void loadUsage().then(setU);
    return onUsageChanged(setU);
  }, []);
  return u;
}

/** Message key for an error thrown by the AI or YouTube clients. */
export function errorKey(e: unknown): MessageKey {
  if (e instanceof AiError) return `ai.error.${e.code}` as MessageKey;
  if (e instanceof YtError) return `yt.error.${e.code}` as MessageKey;
  if (e instanceof AuthError) return `auth.error.${e.code}` as MessageKey;
  return 'error.generic';
}

export function errorDetail(e: unknown): string | undefined {
  return e instanceof AiError || e instanceof YtError || e instanceof AuthError ? e.detail : undefined;
}

export function useGoogle(): GoogleState & { loaded: boolean } {
  const [s, setS] = useState<GoogleState & { loaded: boolean }>({ channels: [], loaded: false });
  useEffect(() => {
    void loadGoogleState().then((g) => setS({ ...g, loaded: true }));
    return onGoogleStateChanged((g) => setS({ ...g, loaded: true }));
  }, []);
  return s;
}

/** Channels whose silent sign-in renewal failed in this browser session (they need one Reconnect click). */
export function useAuthStatus(): Record<string, ChannelAuth> {
  const [s, setS] = useState<Record<string, ChannelAuth>>({});
  useEffect(() => {
    void loadAuthStatus()
      .then(setS)
      .catch(() => undefined);
    return onAuthStatusChanged(setS);
  }, []);
  return s;
}

/** The saved sign-in server URL ('' when persistent sign-in is off), D-020. */
export function useSignInServer(): { url: string; loaded: boolean } {
  const [s, setS] = useState({ url: '', loaded: false });
  useEffect(() => {
    void loadSignInServer()
      .then((url) => setS({ url, loaded: true }))
      .catch(() => setS({ url: '', loaded: true }));
    return onSignInServerChanged((url) => setS({ url, loaded: true }));
  }, []);
  return s;
}

/** Channels with a stored (encrypted) refresh token: they stay signed in after a browser restart. */
export function useRefreshIds(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    void refreshChannelIds()
      .then(setIds)
      .catch(() => undefined);
    return onRefreshChanged(setIds);
  }, []);
  return ids;
}
