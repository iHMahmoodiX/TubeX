import { useMemo, useState } from 'react';
import { IDEA_STATUSES, type Idea, type IdeaStatus } from '../../domain/models';
import { matchesQuery } from '../../domain/text';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Button, Empty, Field, Notice } from '../../components/ui';
import { usePrefs } from '../../components/AppShell';
import { useI18n } from '../../i18n';
import { put, remove, save } from '../../storage/db';
import { createDraft } from './ideaActions';

function ideaHaystack(i: Idea): string {
  return [i.text, i.notes, i.source?.title, i.source?.channelName, i.source?.searchQuery].filter(Boolean).join(' ');
}

export function IdeaRow({ idea, onStartDraft, compact }: { idea: Idea; onStartDraft: (draftId: string) => void; compact?: boolean }) {
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const { prefs } = usePrefs();
  const [notes, setNotes] = useState<string | null>(null);

  const setStatus = async (status: IdeaStatus) => {
    const res = await save('ideas', { ...idea, status });
    if (!res.ok) toast(t('error.generic'));
  };
  const del = async () => {
    const removed = await remove('ideas', idea.id);
    if (removed) toast(t('ideas.deleted'), { label: t('common.undo'), run: () => void put('ideas', removed) });
  };
  const startDraft = async () => {
    const d = await createDraft({ profileId: idea.profileId ?? prefs.activeProfileId, language: prefs.uiLanguage, idea });
    onStartDraft(d.id);
  };

  return (
    <li className="list-item">
      <p dir="auto" style={{ whiteSpace: 'pre-wrap', fontWeight: 550 }}>
        {idea.text}
      </p>
      {idea.source && (
        <p className="small muted truncate">
          {t(`ctx.kind.${idea.source.kind}`)} ·{' '}
          <a href={idea.source.url} target="_blank" rel="noreferrer noopener" title={idea.source.url}>
            <bdi>{idea.source.channelName ?? idea.source.title ?? idea.source.searchQuery ?? t('ideas.openSource')}</bdi>
          </a>
        </p>
      )}
      {!compact && idea.notes && notes === null && (
        <p className="small" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
          {idea.notes}
        </p>
      )}
      {notes !== null && (
        <form
          className="stack-s"
          onSubmit={async (e) => {
            e.preventDefault();
            await save('ideas', { ...idea, notes });
            setNotes(null);
          }}
        >
          <Field label={t('common.notes')}>
            {({ id }) => <textarea id={id} className="textarea" dir="auto" autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
          <div className="row">
            <button type="submit" className="btn btn-primary btn-s">
              {t('common.save')}
            </button>
            <Button size="s" onClick={() => setNotes(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
      <div className="row-between">
        <span className="small muted">{formatDate(idea.createdAt)}</span>
        <div className="row">
          {!compact && (
            <select
              className="select"
              style={{ width: 'auto', minHeight: 28, paddingBlock: 2 }}
              aria-label={t('ideas.filterStatus')}
              value={idea.status}
              onChange={(e) => void setStatus(e.target.value as IdeaStatus)}
            >
              {IDEA_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          )}
          <Button size="s" variant="primary" onClick={() => void startDraft()}>
            {t('ideas.startDraft')}
          </Button>
          {!compact && notes === null && (
            <Button size="s" variant="ghost" onClick={() => setNotes(idea.notes)}>
              {t('common.notes')}
            </Button>
          )}
          <Button size="s" variant="ghost" className="btn-danger" onClick={() => void del()}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </li>
  );
}

export function IdeasView({ onOpenDraft }: { onOpenDraft: (id: string) => void }) {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const { items, corrupt, loading } = useCollection('ideas');
  const profiles = useCollection('profiles').items;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<IdeaStatus | 'all'>('all');
  const [channel, setChannel] = useState<string>(prefs.activeProfileId ?? 'all');

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (status === 'all' || i.status === status) &&
          (channel === 'all' || i.profileId === channel || (channel === 'none' && !i.profileId)) &&
          matchesQuery(ideaHaystack(i), query),
      ),
    [items, status, channel, query],
  );

  return (
    <section className="stack" aria-labelledby="ideas-h">
      <div className="row-between">
        <h1 id="ideas-h">{t('ideas.heading')}</h1>
        <span className="small muted">{t('ideas.count', { n: visible.length })}</span>
      </div>
      {corrupt > 0 && <Notice tone="warning">{t('settings.corrupt', { n: corrupt })}</Notice>}
      <div className="row">
        <div className="grow" style={{ minWidth: 200 }}>
          <Field label={t('ideas.searchLabel')}>
            {({ id }) => <input id={id} type="search" className="input" dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('ideas.filterStatus')}>
          {({ id }) => (
            <select id={id} className="select" value={status} onChange={(e) => setStatus(e.target.value as IdeaStatus | 'all')}>
              <option value="all">{t('ideas.allStatuses')}</option>
              {IDEA_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('draft.channel')}>
          {({ id }) => (
            <select id={id} className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">{t('ideas.allStatuses')}</option>
              <option value="none">{t('draft.noChannel')}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {loading ? (
        <p className="muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <Empty>{t('ideas.empty')}</Empty>
      ) : visible.length === 0 ? (
        <Empty>{t('ideas.noMatch')}</Empty>
      ) : (
        <ul className="list">
          {visible.map((i) => (
            <IdeaRow key={i.id} idea={i} onStartDraft={onOpenDraft} />
          ))}
        </ul>
      )}
    </section>
  );
}
