// One-click "Reconnect <channel>" for a Google sign-in that could not be renewed silently. Opens Google's
// window pre-selected for the channel's account (login_hint); no permission or setup steps again.
import { useState } from 'react';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { reconnect, signIn, type GoogleChannel } from '../../integrations/google/auth';
import { errorKey, useAuthStatus, useGoogle } from './useConnections';

/** Reconnects one channel (or, without a known channel, starts a normal sign-in). */
export function ReconnectButton({ channelId, size = 's', primary = true }: { channelId?: string; size?: 's'; primary?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const g = useGoogle();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ch = g.channels.find((c) => c.channelId === (channelId ?? g.activeChannelId));
  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const got: GoogleChannel = ch ? await reconnect(ch.channelId) : await signIn();
      toast(t('auth.reconnected', { name: got.title }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="stack-s" style={{ gap: 4 }}>
      <span>
        <Button size={size} variant={primary ? 'primary' : undefined} disabled={busy} onClick={() => void run()} data-testid="google-reconnect">
          <Icon name="refresh" />
          {busy ? t('auth.signingIn') : ch ? t('auth.reconnect', { name: ch.title || ch.handle || ch.channelId }) : t('auth.signIn')}
        </Button>
      </span>
      {!!error && <span className="xsmall">{t(errorKey(error))}</span>}
    </span>
  );
}

/**
 * Banner for top bars and pages: one Reconnect button per channel whose sign-in needs confirming.
 * Renders nothing when every connected channel renews on its own.
 */
export function ReconnectBanner() {
  const { t } = useI18n();
  const g = useGoogle();
  const status = useAuthStatus();
  const need = g.channels.filter((c) => status[c.channelId]?.reconnect);
  if (!need.length) return null;
  return (
    <div data-testid="reconnect-banner">
      <Notice tone="warning">
        <p>{need.length === 1 ? t('auth.reconnectBanner', { name: need[0]!.title }) : t('auth.reconnectBannerMany', { n: need.length })}</p>
        <div className="row">
          {need.map((c) => (
            <ReconnectButton key={c.channelId} channelId={c.channelId} />
          ))}
        </div>
      </Notice>
    </div>
  );
}
