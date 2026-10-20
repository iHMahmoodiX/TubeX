import type { Check } from '../../domain/metadata';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';

export function Checks({ checks }: { checks: Check[] }) {
  const { t } = useI18n();
  const problems = checks.filter((c) => c.severity !== 'info');
  const info = checks.filter((c) => c.severity === 'info');
  return (
    <div className="stack-s">
      <p className="small muted">{t('checks.disclaimer')}</p>
      {problems.length === 0 && <p className="small">✓ {t('checks.allGood')}</p>}
      <ul className="checks">
        {problems.map((c) => (
          <li key={c.id} className={`sev-${c.severity}`}>
            <span className="check-mark" aria-hidden="true">
              {c.severity === 'error' ? '×' : '!'}
            </span>
            <span>
              <span className="sr-only">{t(c.severity === 'error' ? 'checks.error' : 'checks.warning')}: </span>
              {t(`checks.${c.id}` as MessageKey, c.values)}
            </span>
          </li>
        ))}
        {info.map((c) => (
          <li key={c.id} className={c.ok ? 'sev-ok' : 'sev-missing'}>
            <span className="check-mark" aria-hidden="true">
              {c.ok ? '✓' : '○'}
            </span>
            <span>
              <span className="sr-only">{t(c.ok ? 'checks.ok' : 'checks.missing')}: </span>
              {t(`checks.${c.id}` as MessageKey)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
