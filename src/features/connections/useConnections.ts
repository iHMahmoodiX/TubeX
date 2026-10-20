import { useEffect, useState } from 'react';
import { AiError } from '../../integrations/ai/provider';
import { YtError } from '../../integrations/youtube/client';
import { AuthError, loadGoogleState, onGoogleStateChanged, type GoogleState } from '../../integrations/google/auth';
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
