// Before → after diff of one field: changed lines with the changed words marked, unchanged lines folded
// into a "N unchanged lines" button that expands in place.
import { useMemo, useState } from 'react';
import { diffText, type DiffRow, type DiffSeg } from '../../domain/bulk';
import { useI18n } from '../../i18n';
import { useFormat } from '../research/shared';

function Segs({ segs }: { segs: DiffSeg[] }) {
  return (
    <>
      {segs.map((s, i) => (s.changed ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

function Gap({ rows }: { rows: Extract<DiffRow, { kind: 'gap' }>['rows'] }) {
  const { t } = useI18n();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <>
        {rows.map((r, i) => (
          <div key={i} className="fr-line" dir="auto">
            {r.text || ' '}
          </div>
        ))}
      </>
    );
  return (
    <button type="button" className="fr-gap" onClick={() => setOpen(true)} aria-expanded={false}>
      {t('fr.diff.gap', { n: f.int(rows.length) })}
    </button>
  );
}

export function FieldDiff({ label, before, after }: { label: string; before: string; after: string }) {
  const { t } = useI18n();
  const rows = useMemo(() => diffText(before, after), [before, after]);
  return (
    <div className="fr-diff" role="group" aria-label={label}>
      <span className="fr-diff-label">{label}</span>
      {rows.map((r, i) =>
        r.kind === 'gap' ? (
          <Gap key={i} rows={r.rows} />
        ) : r.kind === 'same' ? (
          <div key={i} className="fr-line" dir="auto">
            {r.text || ' '}
          </div>
        ) : (
          <div key={i} className={`fr-line fr-${r.kind}`} dir="auto">
            <span className="fr-sign" aria-label={t(r.kind === 'del' ? 'fr.diff.removed' : 'fr.diff.added')}>
              {r.kind === 'del' ? '−' : '+'}
            </span>
            {r.text ? <Segs segs={r.segs} /> : <span className="faint">{t('engage.diff.empty')}</span>}
          </div>
        ),
      )}
    </div>
  );
}

/** Tags as a chip list: removed ones struck through, added ones marked. */
export function TagsDiff({ label, before, after }: { label: string; before: string[]; after: string[] }) {
  const removed = before.filter((x) => !after.includes(x));
  const added = after.filter((x) => !before.includes(x));
  const kept = after.filter((x) => before.includes(x));
  return (
    <div className="fr-diff" role="group" aria-label={label}>
      <span className="fr-diff-label">{label}</span>
      <div className="fr-tags">
        {removed.map((x) => (
          <del key={`d${x}`} dir="auto">
            {x}
          </del>
        ))}
        {added.map((x) => (
          <ins key={`a${x}`} dir="auto">
            {x}
          </ins>
        ))}
        {kept.length > 0 && <span className="faint xsmall">+{kept.length}</span>}
      </div>
    </div>
  );
}

export function SnippetDiff({ before, after }: { before: { title?: string; description: string; tags: string[] }; after: { title?: string; description: string; tags: string[] } }) {
  const { t } = useI18n();
  return (
    <div className="stack-s">
      {(before.title ?? '') !== (after.title ?? '') && <FieldDiff label={t('draft.title')} before={before.title ?? ''} after={after.title ?? ''} />}
      {before.description !== after.description && <FieldDiff label={t('draft.description')} before={before.description} after={after.description} />}
      {before.tags.join('\n') !== after.tags.join('\n') && <TagsDiff label={t('draft.tags')} before={before.tags} after={after.tags} />}
    </div>
  );
}
