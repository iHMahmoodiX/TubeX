// Human error notices for Reports: one sentence saying what is unavailable, one saying why and what to do,
// and the raw API message folded behind "Details".
import { Button, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { AiError } from '../../integrations/ai/provider';
import { AuthError } from '../../integrations/google/auth';
import { ReportingError } from '../../integrations/google/reporting';
import { YtError } from '../../integrations/youtube/client';
import { openWorkspace } from '../../platform/navigation';

export type ReportWhat = 'videos' | 'videoPerf' | 'health' | 'retention' | 'besttime' | 'click' | 'reach' | 'opportunities' | 'search' | 'competitors' | 'ai';

const SETTINGS = new Set(['auth:expired', 'auth:no-channel', 'auth:permission', 'auth:denied', 'yt:permission', 'yt:budget', 'yt:no-key', 'yt:bad-key']);

/** Stable "family:code" for an error ('yt:bad-request', 'auth:expired', 'reporting:format', 'other'). */
export function errorKind(e: unknown): string {
  if (e instanceof AuthError) return `auth:${e.code}`;
  if (e instanceof YtError) return `yt:${e.code}`;
  if (e instanceof ReportingError) return `reporting:${e.code}`;
  if (e instanceof AiError) return `ai:${e.code}`;
  return 'other';
}

/** Message key for the reason + action sentence. */
export function reasonKey(kind: string): MessageKey {
  const [fam, code] = kind.split(':');
  if (fam === 'auth') return code === 'network' ? 'reports.err.offline' : 'reports.err.signin';
  if (fam === 'reporting') return `reports.err.reporting.${code}` as MessageKey;
  if (fam === 'ai') return `ai.error.${code}` as MessageKey;
  if (fam === 'yt')
    switch (code) {
      case 'permission':
        return 'reports.err.permission';
      case 'budget':
      case 'quota':
        return 'reports.err.quota';
      case 'forbidden':
        return 'reports.err.forbidden';
      case 'bad-request':
        return 'reports.err.unsupported';
      case 'not-found':
        return 'reports.err.notFound';
      case 'unreachable':
        return 'reports.err.offline';
      case 'no-key':
      case 'bad-key':
        return 'reports.err.key';
      default:
        return 'reports.err.server';
    }
  return 'reports.err.generic';
}

/** Raw text for the Details fold, if any. */
export function rawDetail(e: unknown): string | undefined {
  const d = (e as { detail?: unknown } | null)?.detail;
  if (typeof d === 'string' && d) return d;
  if (e instanceof Error && e.message) return e.message;
  return typeof e === 'string' ? e : undefined;
}

export function ReportError({ error, what, tone = 'error' }: { error: unknown; what: ReportWhat; tone?: 'error' | 'warning' }) {
  const { t } = useI18n();
  if (!error) return null;
  const kind = errorKind(error);
  const detail = rawDetail(error);
  return <ReportErrorText what={what} reason={reasonKey(kind)} detail={detail} settings={SETTINGS.has(kind)} tone={kind === 'auth:canceled' ? 'warning' : tone} t={t} />;
}

/** Same notice from a stored error code (e.g. the background sync's last error). */
export function StoredError({ code, detail, what }: { code: string; detail?: string; what: ReportWhat }) {
  const { t } = useI18n();
  const kind = code.includes(':') ? code : guessKind(code);
  return <ReportErrorText what={what} reason={reasonKey(kind)} detail={detail} settings={SETTINGS.has(kind)} tone="warning" t={t} />;
}

/** Codes stored without a family: reporting codes first, then auth, then YouTube API codes. */
function guessKind(code: string): string {
  if (['no-report-type', 'format', 'bad-url'].includes(code)) return `reporting:${code}`;
  if (code === 'permission') return 'reporting:permission';
  if (['expired', 'no-channel', 'canceled', 'denied', 'state-mismatch', 'network'].includes(code)) return `auth:${code}`;
  if (['budget', 'quota', 'forbidden', 'not-found', 'bad-request', 'unreachable', 'server'].includes(code)) return `yt:${code}`;
  return 'other';
}

function ReportErrorText({ what, reason, detail, settings, tone, t }: { what: ReportWhat; reason: MessageKey; detail?: string; settings: boolean; tone: 'error' | 'warning'; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <Notice tone={tone}>
      <p>
        <b>{t(`reports.err.what.${what}` as MessageKey)}</b> {t(reason)}
      </p>
      {detail && (
        <details className="rp-err-details">
          <summary className="xsmall muted">{t('reports.err.details')}</summary>
          <p className="xsmall muted mono ltr" dir="ltr">
            {detail}
          </p>
        </details>
      )}
      {settings && location.hash !== '#settings' && (
        <div>
          <Button size="s" onClick={() => void openWorkspace('settings')}>
            {t('conn.openSettings')}
          </Button>
        </div>
      )}
    </Notice>
  );
}
