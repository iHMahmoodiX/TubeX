// "Upload profiles": choose a TubeX template and insert its description block and/or tags into Studio's
// fields on click. Studio's Save stays the only way to save; the island says so after every fill.
import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui';
import type { Template } from '../../domain/models';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { InError, useAsync, useStored } from '../common';
import { addTags, insertDescription, replaceField } from './fields';

export function ProfilePicker({ getRoot }: { getRoot: () => ParentNode | null }) {
  const { t } = useI18n();
  const templates = useAsync('templates', () => rpc<Template[]>('templates.list'));
  const [chosen, setChosen] = useStored<string>('studio.template', '');
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const list = (templates.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const tpl = list.find((x) => x.id === chosen) ?? list[0];

  const withRoot = (fn: (root: ParentNode) => void) => {
    const root = getRoot();
    if (!root) return setNote({ tone: 'warn', text: t('inpage.studio.noEditor') });
    fn(root);
  };

  if (templates.error !== undefined) return <InError error={templates.error} onRetry={templates.reload} />;
  if (templates.loading && !templates.data) return <span className="skel tx-skel-line" aria-busy="true" />;
  if (!list.length)
    return (
      <div className="tx-empty">
        <Icon name="file" />
        <p>{t('inpage.profile.none')}</p>
        <Button size="s" onClick={() => void rpc('ui.openWorkspace', 'templates')}>
          {t('inpage.profile.create')}
        </Button>
      </div>
    );

  return (
    <div className="stack-s">
      <label className="small bold" htmlFor="tx-profile">
        {t('inpage.profile.pick')}
      </label>
      <select id="tx-profile" className="select tx-select" value={tpl?.id ?? ''} onChange={(e) => setChosen(e.target.value)}>
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name || t('inpage.profile.unnamed')}
          </option>
        ))}
      </select>
      {tpl && (
        <p className="xsmall muted">
          {t('inpage.profile.summary', { chars: [...tpl.description].length, n: tpl.tags.length })}
        </p>
      )}
      <div className="row">
        <Button
          size="s"
          variant="primary"
          disabled={!tpl?.description.trim()}
          onClick={() =>
            withRoot((root) => {
              const r = insertDescription(root, tpl!.description);
              if (!r.ok) return setNote({ tone: 'warn', text: t('inpage.studio.noDescription') });
              if (!r.changed) return setNote({ tone: 'ok', text: t('inpage.profile.already') });
              setUndo(r.previous ?? '');
              setNote({ tone: 'ok', text: t('inpage.studio.reviewSave') });
            })
          }
        >
          <Icon name="file" />
          {t('inpage.profile.insert')}
        </Button>
        <Button
          size="s"
          disabled={!tpl?.tags.length}
          onClick={() =>
            withRoot((root) => {
              const r = addTags(root, tpl!.tags);
              if (!r.ok) return setNote({ tone: 'warn', text: t('inpage.studio.noTags') });
              setUndo(null);
              setNote({
                tone: r.overLimit.length ? 'warn' : 'ok',
                text: [t('inpage.studio.tagsAdded', { n: r.added.length }), r.overLimit.length ? t('inpage.studio.tagsOver', { n: r.overLimit.length }) : '', t('inpage.studio.reviewSave')].filter(Boolean).join(' '),
              });
            })
          }
        >
          <Icon name="tag" />
          {t('inpage.profile.tags')}
        </Button>
      </div>
      {note && (
        <div className={`tx-note ${note.tone === 'warn' ? 'tx-note-warn' : ''}`} role="status">
          <Icon name={note.tone === 'warn' ? 'alert' : 'info'} />
          <span className="grow">{note.text}</span>
          {undo !== null && note.tone === 'ok' && (
            <Button
              size="s"
              variant="ghost"
              onClick={() =>
                withRoot((root) => {
                  replaceField(root, 'description', undo);
                  setUndo(null);
                  setNote({ tone: 'ok', text: t('inpage.studio.undone') });
                })
              }
            >
              {t('common.undo')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
