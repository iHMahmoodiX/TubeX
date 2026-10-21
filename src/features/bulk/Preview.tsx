// Step 2: per-item preview with a real diff, include/exclude per item, totals, and the items that will be
// skipped (with the reason) because the result would break a YouTube limit.
import { useState } from 'react';
import type { BulkField, LimitProblem, PlanStatus } from '../../domain/bulk';
import { Icon } from '../../components/icons';
import { Button, Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { useFormat } from '../research/shared';
import { SnippetDiff } from './Diff';

export interface PreviewRow {
  key: string;
  kind: 'video' | 'draft' | 'template';
  id: string;
  title: string;
  thumbnail?: string;
  privacy?: string;
  before: { title?: string; description: string; tags: string[] };
  next: { title?: string; description: string; tags: string[] };
  count: number;
  fields: BulkField[];
  status: PlanStatus;
  problems: LimitProblem[];
  localizations?: string[];
  /** Local items only: a YouTube limit is broken but the draft is saved anyway (warning). */
  warn?: boolean;
}

export function problemText(p: LimitProblem, t: (k: MessageKey, v?: Record<string, string | number>) => string, int: (n: number) => string): string {
  switch (p.code) {
    case 'title-empty':
      return t('fr.prob.title-empty');
    case 'angle':
      return t('fr.prob.angle', { field: t(`draft.${p.field}` as MessageKey) });
    default:
      return t(`fr.prob.${p.code}` as MessageKey, { value: int(p.value), max: int(p.max) });
  }
}

const PAGE = 25;

function Row({ r, on, toggle }: { r: PreviewRow; on: boolean; toggle: (on: boolean) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const [open, setOpen] = useState(true);
  const bodyId = `fr-row-${r.key}`;
  return (
    <li className="fr-row" data-off={!on}>
      <div className="fr-row-head">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} aria-label={t('fr.include', { title: r.title || t('draft.untitled') })} />
        {r.kind === 'video' ? (
          <Thumb videoId={r.id} src={r.thumbnail} width={72} />
        ) : (
          <span className="thumb fr-thumb-icon" style={{ width: 72 }}>
            <Icon name={r.kind === 'draft' ? 'edit' : 'file'} />
          </span>
        )}
        <span className="stack-s grow" style={{ gap: 2, minWidth: 0 }}>
          <span className="truncate bold">
            <bdi>{r.title || t('draft.untitled')}</bdi>
          </span>
          <span className="row" style={{ gap: 6 }}>
            {r.count > 0 && <span className="badge badge-accent">{t('bulk.matches', { n: f.int(r.count) })}</span>}
            {r.fields.map((fl) => (
              <span key={fl} className="badge">
                {t(`draft.${fl}` as MessageKey)}
              </span>
            ))}
            {r.privacy && <span className={`xsmall engage-privacy engage-privacy-${r.privacy}`}>{t(`mc.privacy.${r.privacy}` as MessageKey)}</span>}
            {r.kind === 'draft' && <span className="badge">{t('bulk.kind.draft')}</span>}
            {r.kind === 'template' && <span className="badge">{t('bulk.kind.template')}</span>}
          </span>
        </span>
        <button type="button" className="icon-btn fr-expand" aria-expanded={open} aria-controls={bodyId} aria-label={open ? t('fr.collapse') : t('fr.expand')} onClick={() => setOpen(!open)}>
          <Icon name="chevron" />
        </button>
      </div>
      {open && (
        <div id={bodyId} className="fr-row-body">
          <SnippetDiff before={r.before} after={r.next} />
          {r.localizations && r.localizations.length > 0 && (
            <p className="xsmall muted">
              <Icon name="translate" /> {t('fr.localized', { langs: r.localizations.join('، ') })}
            </p>
          )}
          {r.warn && <p className="xsmall fr-warn">{t('bulk.overLimit')}</p>}
        </div>
      )}
    </li>
  );
}

export function PreviewList({ rows, excluded, setExcluded }: { rows: PreviewRow[]; excluded: Set<string>; setExcluded: (s: Set<string>) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const [shown, setShown] = useState(PAGE);
  return (
    <div className="stack-s">
      <div className="row">
        <Button size="s" variant="ghost" onClick={() => setExcluded(new Set())} disabled={excluded.size === 0}>
          {t('fr.selectAll')}
        </Button>
        <Button size="s" variant="ghost" onClick={() => setExcluded(new Set(rows.map((r) => r.key)))} disabled={excluded.size === rows.length}>
          {t('fr.selectNone')}
        </Button>
      </div>
      <ul className="fr-rows" aria-label={t('fr.previewList')}>
        {rows.slice(0, shown).map((r) => (
          <Row
            key={r.key}
            r={r}
            on={!excluded.has(r.key)}
            toggle={(on) => {
              const n = new Set(excluded);
              if (on) n.delete(r.key);
              else n.add(r.key);
              setExcluded(n);
            }}
          />
        ))}
      </ul>
      {rows.length > shown && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button size="s" onClick={() => setShown((n) => n + PAGE)}>
            {t('engage.picker.more', { n: f.int(rows.length - shown) })}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Items that match but will not be written, each with the reason. */
export function SkippedList({ rows }: { rows: PreviewRow[] }) {
  const { t } = useI18n();
  const f = useFormat();
  if (!rows.length) return null;
  return (
    <details className="fr-skipped">
      <summary>
        <Icon name="alert" /> {t('fr.skippedTitle', { n: f.int(rows.length) })}
      </summary>
      <ul className="fr-rows">
        {rows.map((r) => (
          <li key={r.key} className="fr-row">
            <div className="fr-row-head">
              {r.kind === 'video' ? <Thumb videoId={r.id} src={r.thumbnail} width={56} /> : <Icon name="file" />}
              <span className="stack-s grow" style={{ gap: 2, minWidth: 0 }}>
                <span className="truncate bold">
                  <bdi>{r.title || t('draft.untitled')}</bdi>
                </span>
                {r.status === 'end-missing' ? (
                  <span className="small fr-warn">{t('fr.prob.end-missing')}</span>
                ) : (
                  r.problems.map((p, i) => (
                    <span key={i} className="small fr-warn">
                      {problemText(p, t, f.int)}
                    </span>
                  ))
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
