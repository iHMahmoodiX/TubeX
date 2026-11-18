import { useMemo, useState } from 'react';
import { readiness } from '../../domain/coreScore';
import { checkDraft } from '../../domain/metadata';
import { matchesQuery } from '../../domain/text';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { Button, Empty, Notice, PageHeader, Score, SearchInput, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ArtTile, Cover } from '../core/CoreUi';
import { createDraft } from '../ideas/ideaActions';
import { DraftEditor } from './DraftEditor';

export function DraftsView({ draftId, onSelect }: { draftId?: string; onSelect: (id?: string) => void }) {
  const { t, formatDate } = useI18n();
  const { prefs } = usePrefs();
  const { items, corrupt, loading } = useCollection('drafts');
  const profiles = useCollection('profiles').items;
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () => items.filter((d) => matchesQuery(`${d.title} ${d.description} ${d.tags.join(' ')}`, query)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [items, query],
  );

  const newDraft = async () => {
    const d = await createDraft({ profileId: prefs.activeProfileId, language: prefs.uiLanguage });
    onSelect(d.id);
  };

  if (draftId)
    return (
      <section aria-label={t('draft.heading')}>
        <DraftEditor key={draftId} draftId={draftId} onDeleted={() => onSelect(undefined)} onBack={() => onSelect(undefined)} />
      </section>
    );

  return (
    <section className="stack-l" aria-labelledby="drafts-h">
      <PageHeader
        kicker={t('shell.group.create')}
        title={t('nav.drafts')}
        desc={
          <>
            {t('core.drafts.desc')} <span className="faint">· {t('core.drafts.count', { n: items.length })}</span>
          </>
        }
        art={<Cover icon="edit" />}
        actions={
          <>
            <Button variant="primary" onClick={() => void newDraft()}>
              <Icon name="plus" />
              {t('draft.new')}
            </Button>
            <div className="grow" style={{ maxWidth: 360, minWidth: 200 }}>
              <SearchInput label={t('core.drafts.search')} placeholder={t('core.drafts.search')} value={query} onChange={setQuery} />
            </div>
          </>
        }
      />
      {corrupt > 0 && <Notice tone="warning">{t('settings.corrupt', { n: corrupt })}</Notice>}
      {loading ? (
        <Skeleton lines={5} />
      ) : items.length === 0 ? (
        <Empty icon="edit" title={t('core.drafts.emptyTitle')} action={<Button variant="primary" onClick={() => void newDraft()}>{t('draft.new')}</Button>}>
          {t('draft.empty')}
        </Empty>
      ) : visible.length === 0 ? (
        <Empty icon="search" title={t('core.noMatch')} action={<Button onClick={() => setQuery('')}>{t('core.clearFilters')}</Button>} />
      ) : (
        <div>
          <div className="track-head" aria-hidden="true">
            <span className="track-n">#</span>
            <span>{t('draft.title')}</span>
            <span className="core-hide-s">{t('core.draft.readiness')}</span>
          </div>
          <ul className="tracks" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="drafts-list">
            {visible.map((d, n) => (
              <li key={d.id} className="track core-track">
                <span className="track-n">
                  <span className="num">{n + 1}</span>
                </span>
                <div className="track-main">
                  <button type="button" className="core-track-btn" onClick={() => onSelect(d.id)}>
                    <ArtTile videoId={d.source?.videoId} icon="edit" />
                    <span className="stack-s grow" style={{ gap: 0 }}>
                      <span className="track-title truncate">
                        <bdi>{d.title.trim() || t('draft.untitled')}</bdi>
                      </span>
                      <span className="track-sub truncate">
                        {profiles.find((p) => p.id === d.profileId)?.name ?? t('draft.noChannel')} · {t(`lang.${d.language}`)} ·{' '}
                        {t('core.drafts.tagsN', { n: d.tags.length })}
                      </span>
                    </span>
                  </button>
                </div>
                <div className="core-track-end">
                  <span className="core-date">{formatDate(d.updatedAt)}</span>
                  <Score value={readiness(d, checkDraft(d))} label={t('core.draft.readiness')} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
