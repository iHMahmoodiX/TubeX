import { Button, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { AiError } from '../../integrations/ai/provider';
import { YtError } from '../../integrations/youtube/client';
import { openWorkspace } from '../../platform/navigation';
import { errorDetail, errorKey } from './useConnections';

const SETUP_CODES = new Set(['disabled', 'permission', 'no-key', 'bad-key', 'unauthorized', 'budget']);

export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const code = error instanceof AiError || error instanceof YtError ? error.code : '';
  const detail = errorDetail(error);
  return (
    <Notice tone={code === 'canceled' ? 'info' : 'error'}>
      <p>{t(errorKey(error))}</p>
      {detail && (
        <p className="small muted ltr mono" dir="ltr">
          {detail}
        </p>
      )}
      {SETUP_CODES.has(code) && location.hash !== '#settings' && (
        <div>
          <Button size="s" onClick={() => void openWorkspace('settings')}>
            {t('conn.openSettings')}
          </Button>
        </div>
      )}
    </Notice>
  );
}
