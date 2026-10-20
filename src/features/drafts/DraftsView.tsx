import { useMemo, useState } from 'react';
import { matchesQuery } from '../../domain/text';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { Button, Empty, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { createDraft } from '../ideas/ideaActions';
import { DraftEditor } from './DraftEditor';

export function DraftsView({ draftId, onSelect }: { draftId?: string; onSelect: (id?: string) => void }) {
  const { t, formatDate } = useI18n();
  const { prefs } = usePrefs();
  const { items, corrupt, loading } = useCollection('drafts');
  const profiles = useCollection('profiles').items;
  const [query, setQuery] = useState('');
  const visible = useMemo(() => items.filter((d) => matchesQuery(`${d.title} ${d.description} ${d.tags.join(' ')}`, query)), [items, query]);

  const newDraft = async () => {
    const d = await createDraft({ profileId: prefs.activeProfileId, language: prefs.uiLanguage });
    onSelect(d.id);
  };

  return (
    <div className="split">
      <section className="stack" aria-labelledby="drafts-h">
        <div className="row-between">
          <h1 id="drafts-h">{t('nav.drafts')}</h1>
          <Button variant="primary" onClick={() => void newDraft()}>
            {t('draft.new')}
          </Button>
        </div>
        {corrupt > 0 && <Notice tone="warning">{t('settings.corrupt', { n: corrupt })}</Notice>}
        <Field label={t('common.search')}>
          {({ id }) => <input id={id} type="search" className="input" dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </Field>
        {loading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <Empty>{t('draft.empty')}</Empty>
        ) : (
          <ul className="list">
            {visible.map((d) => (
              <li key={d.id} className="list-item" data-active={d.id === draftId}>
                <button type="button" className="item-button" aria-current={d.id === draftId ? 'true' : undefined} onClick={() => onSelect(d.id)}>
                  <span className="truncate" dir="auto" style={{ display: 'block', fontWeight: 600 }}>
                    {d.title.trim() || t('draft.untitled')}
                  </span>
                  <span className="small muted">
                    {profiles.find((p) => p.id === d.profileId)?.name ?? t('draft.noChannel')} · {formatDate(d.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t('draft.heading')}>
        {draftId ? <DraftEditor key={draftId} draftId={draftId} onDeleted={() => onSelect(undefined)} /> : null}
      </section>
    </div>
  );
}
