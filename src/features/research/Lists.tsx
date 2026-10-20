// Saved keyword lists, and the "save keyword" control used by the explorer.
import { useEffect, useState } from 'react';
import { toCsv } from '../../domain/research';
import { newBase } from '../../domain/models';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, IconButton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { downloadText, fileSlug } from '../../platform/files';
import { create, remove, save } from '../../storage/db';
import { addKeyword } from '../competitors/watchActions';
import { SectionHead } from './parts';

export function SaveKeyword({ term, onSaved }: { term: string; onSaved?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const lists = useCollection('keywordLists').items;
  const [listId, setListId] = useState('');
  useEffect(() => {
    if (!listId && lists[0]) setListId(lists[0].id);
  }, [lists, listId]);
  const go = async () => {
    let id = listId;
    if (!id) {
      id = (await create('keywordLists', { ...newBase(), name: t('research.defaultList'), keywords: [] })).id;
      setListId(id);
    }
    const r = await addKeyword(id, term);
    toast(t(r === 'exists' ? 'research.keywordExists' : 'research.keywordSaved', { k: term }));
    onSaved?.();
  };
  return (
    <div className="row-nowrap">
      {lists.length > 1 && (
        <select className="select" style={{ width: 'auto', minHeight: 28, paddingBlock: 2 }} aria-label={t('research.list')} value={listId} onChange={(e) => setListId(e.target.value)}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      <Button size="s" variant="primary" disabled={!term.trim()} onClick={() => void go()}>
        <Icon name="plus" />
        {t('research.saveKeyword')}
      </Button>
    </div>
  );
}

export function KeywordLists({ onExplore }: { onExplore: (term: string) => void }) {
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const lists = useCollection('keywordLists');
  const [name, setName] = useState('');
  return (
    <div className="stack-l">
      <form
        className="seo-searchbar"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await create('keywordLists', { ...newBase(), name: name.trim(), keywords: [] });
          setName('');
        }}
      >
        <div className="search-wrap">
          <Icon name="list" />
          <input className="input" dir="auto" aria-label={t('research.newList')} placeholder={t('research.newList')} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          {t('common.new')}
        </button>
      </form>
      {lists.items.length === 0 && !lists.loading && (
        <Empty icon="list" title={t('seo.lists.emptyTitle')}>
          {t('research.noLists')}
        </Empty>
      )}
      {lists.items.map((l) => (
        <section key={l.id} className="seo-section" aria-label={l.name}>
          <SectionHead
            title={l.name}
            sub={t('seo.lists.count', { n: l.keywords.length })}
            actions={
              <>
                <Button
                  size="s"
                  variant="ghost"
                  disabled={!l.keywords.length}
                  onClick={() =>
                    downloadText(`tubex-keywords-${fileSlug(l.name, 'list')}.csv`, toCsv([['keyword', 'note', 'added_at'], ...l.keywords.map((k) => [k.text, k.note, k.addedAt])]), 'text/csv;charset=utf-8')
                  }
                >
                  {t('research.exportCsv')}
                </Button>
                <ConfirmButton size="s" label={t('common.delete')} question={t('research.deleteList', { name: l.name })} confirmLabel={t('common.delete')} onConfirm={() => void remove('keywordLists', l.id)} />
              </>
            }
          />
          {l.keywords.length ? (
            <ol className="seo-tracks">
              {l.keywords.map((k, i) => (
                <li key={k.text} className="seo-track" style={{ minHeight: 44 }}>
                  <span className="track-n">{i + 1}</span>
                  <div className="seo-track-text">
                    <button type="button" className="item-button seo-track-title truncate" dir="auto" onClick={() => onExplore(k.text)}>
                      {k.text}
                    </button>
                    <span className="seo-track-sub">{formatDate(k.addedAt)}</span>
                  </div>
                  <div className="row-nowrap">
                    <Button size="s" variant="ghost" onClick={() => onExplore(k.text)}>
                      {t('research.run')}
                    </Button>
                    <IconButton
                      icon="x"
                      label={t('research.removeKeyword', { k: k.text })}
                      onClick={async () => {
                        const r = await save('keywordLists', { ...l, keywords: l.keywords.filter((x) => x !== k) });
                        if (!r.ok) toast(t('draft.conflict'));
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small muted">{t('research.emptyList')}</p>
          )}
        </section>
      ))}
    </div>
  );
}
