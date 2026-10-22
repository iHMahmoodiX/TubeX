import { useState } from 'react';
import { Button, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { AiError } from '../../integrations/ai/provider';
import { YtError, YT_BASE } from '../../integrations/youtube/client';
import { AuthError } from '../../integrations/google/auth';
import { openWorkspace } from '../../platform/navigation';
import { requestOrigin } from '../../platform/permissions';
import { ReconnectButton } from './Reconnect';
import { errorDetail, errorKey } from './useConnections';

const SETUP_CODES = new Set(['disabled', 'permission', 'no-key', 'bad-key', 'unauthorized', 'budget', 'expired', 'no-channel', 'wrong-channel']);
/** Sign-in problems fixed by one Reconnect click instead of the Settings page. */
const RECONNECT_CODES = new Set(['expired', 'wrong-channel']);

/** "Allow access" for the YouTube API host, right where the permission error appears (a click is a gesture). */
function AllowYouTube() {
  const { t } = useI18n();
  const [done, setDone] = useState<boolean | null>(null);
  return (
    <span className="row">
      <Button size="s" variant="primary" onClick={async () => setDone(await requestOrigin(YT_BASE))}>
        {t('conn.allowAccess')}
      </Button>
      {done === true && <span className="small">{t('conn.allowed')}</span>}
    </span>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const code = error instanceof AiError || error instanceof YtError || error instanceof AuthError ? error.code : '';
  const detail = errorDetail(error);
  const auth = error instanceof AuthError && RECONNECT_CODES.has(code);
  const ytPermission = error instanceof YtError && code === 'permission';
  return (
    <Notice tone={code === 'canceled' ? 'info' : 'error'}>
      <p>{t(errorKey(error))}</p>
      {detail && (
        <p className="small muted ltr mono" dir="ltr">
          {detail}
        </p>
      )}
      {(auth || ytPermission || (SETUP_CODES.has(code) && location.hash !== '#settings')) && (
        <div className="row">
          {auth && <ReconnectButton channelId={(error as AuthError).channelId} />}
          {ytPermission && <AllowYouTube />}
          {SETUP_CODES.has(code) && location.hash !== '#settings' && (
            <Button size="s" variant={auth || ytPermission ? 'ghost' : undefined} onClick={() => void openWorkspace('settings')}>
              {t('conn.openSettings')}
            </Button>
          )}
        </div>
      )}
    </Notice>
  );
}
