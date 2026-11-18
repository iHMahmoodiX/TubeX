import type { Check } from '../../domain/metadata';
import { Icon } from '../../components/icons';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';

export function Checks({ checks }: { checks: Check[] }) {
  const { t } = useI18n();
  const problems = checks.filter((c) => c.severity !== 'info');
  const info = checks.filter((c) => c.severity === 'info');
  return (
    <div className="stack-s">
      <ul className="checks">
        {problems.length === 0 && (
          <li className="sev-ok">
            <span className="check-mark" aria-hidden="true">
              <Icon name="check" style={{ width: 11, height: 11 }} />
            </span>
            <span className="small">{t('checks.allGood')}</span>
          </li>
        )}
        {problems.map((c) => (
          <li key={c.id} className={`sev-${c.severity}`}>
            <span className="check-mark" aria-hidden="true">
              {c.severity === 'error' ? '×' : '!'}
            </span>
            <span className="small">
              <span className="sr-only">{t(c.severity === 'error' ? 'checks.error' : 'checks.warning')}: </span>
              {t(`checks.${c.id}` as MessageKey, c.values)}
            </span>
          </li>
        ))}
        {info.map((c) => (
          <li key={c.id} className={c.ok ? 'sev-ok' : 'sev-missing'}>
            <span className="check-mark" aria-hidden="true">
              {c.ok ? <Icon name="check" style={{ width: 11, height: 11 }} /> : '○'}
            </span>
            <span className="small">
              <span className="sr-only">{t(c.ok ? 'checks.ok' : 'checks.missing')}: </span>
              {t(`checks.${c.id}` as MessageKey)}
            </span>
          </li>
        ))}
      </ul>
      {info.length === 0 && <p className="xsmall faint">{t('core.draft.addKeyword')}</p>}
      <p className="xsmall faint">{t('checks.disclaimer')}</p>
    </div>
  );
}
