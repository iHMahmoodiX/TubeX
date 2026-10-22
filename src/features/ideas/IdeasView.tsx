import { useEffect, useMemo, useState } from 'react';
import { ideaTitle } from '../../domain/coreScore';
import { IDEA_STATUSES, type Idea, type IdeaStatus, type SourceRef } from '../../domain/models';
import type { PageKind } from '../../domain/pageContext';
import { matchesQuery } from '../../domain/text';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { Icon, type IconName } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, Empty, Field, IconButton, Notice, PageHeader, SearchInput, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { put, remove, save } from '../../storage/db';
import { ArtTile, Cover, Segmented, StatusPill } from '../core/CoreUi';
import { captureIdea, createDraft } from './ideaActions';

function ideaHaystack(i: Idea): string {
  return [i.text, i.notes, i.source?.title, i.source?.channelName, i.source?.searchQuery].filter(Boolean).join(' ');
}

export function kindIcon(kind?: PageKind): IconName {
  if (kind === 'watch' || kind === 'shorts' || kind === 'studio-video') return 'video';
  if (kind === 'search') return 'search';
  if (kind === 'channel') return 'users';
  if (kind === 'playlist') return 'playlist';
  return 'bulb';
}

export function sourceName(s: SourceRef | undefined): string | undefined {
  return s ? (s.title ?? s.searchQuery ?? s.channelName) : undefined;
}

/** Starts a draft from an idea and marks the idea as planned. */
export function useStartDraft() {
  const { prefs } = usePrefs();
  return async (idea: Idea) => {
    const d = await createDraft({ profileId: idea.profileId ?? prefs.activeProfileId, language: prefs.uiLanguage, idea });
    if (idea.status === 'inbox') void save('ideas', { ...idea, status: 'planned' });
    return d.id;
  };
}

/** One idea as a track row: art (source thumbnail), title, source, status, date and a green start-draft button. */
export function IdeaTrack({
  idea,
  index,
  selected,
  onSelect,
  onStartDraft,
  compact,
}: {
  idea: Idea;
  index: number;
  selected?: boolean;
  onSelect?: () => void;
  onStartDraft: (draftId: string) => void;
  compact?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const start = useStartDraft();
  const src = idea.source;
  const sub = src ? `${t(`ctx.kind.${src.kind}`)}${src.channelName ? ` · ${src.channelName}` : ''}` : t('core.ideas.noSource');
  const body = (
    <>
      <ArtTile videoId={src?.videoId} icon={kindIcon(src?.kind)} width={compact ? 64 : 72} />
      <span className="stack-s grow" style={{ gap: 0 }}>
        <span className="track-title truncate">
          <bdi>{ideaTitle(idea.text)}</bdi>
        </span>
        <span className="track-sub truncate">
          <bdi>{sub}</bdi>
        </span>
      </span>
    </>
  );
  return (
    <li className="track core-track" data-selected={selected ? 'true' : undefined} onClick={(e) => e.target === e.currentTarget && onSelect?.()}>
      <span className="track-n">
        <span className="num">{index + 1}</span>
      </span>
      <div className="track-main">
        {onSelect ? (
          <button type="button" className="core-track-btn" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
            {body}
          </button>
        ) : (
          <span className="core-track-btn" style={{ cursor: 'default' }}>
            {body}
          </span>
        )}
      </div>
      <div className="core-track-end">
        {!compact && <StatusPill status={idea.status} />}
        {!compact && <span className="core-date">{formatDate(idea.createdAt)}</span>}
        {compact && src && (
          <a className="icon-btn" href={src.url} target="_blank" rel="noreferrer noopener" aria-label={t('ideas.openSource')} title={src.url}>
            <Icon name="external" />
          </a>
        )}
        <button
          type="button"
          className="core-play core-row-act"
          aria-label={t('ideas.startDraft')}
          title={t('ideas.startDraft')}
          onClick={async () => onStartDraft(await start(idea))}
        >
          <Icon name="play" />
        </button>
      </div>
    </li>
  );
}

function IdeaDetail({ idea, onStartDraft, onClose }: { idea: Idea; onStartDraft: (id: string) => void; onClose: () => void }) {
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const start = useStartDraft();
  const profiles = useCollection('profiles').items;
  const [text, setText] = useState(idea.text);
  const [notes, setNotes] = useState(idea.notes);
  const src = idea.source;

  const patch = async (p: Partial<Idea>) => {
    const res = await save('ideas', { ...idea, ...p });
    if (!res.ok) toast(t('core.ideas.changedElsewhere'));
  };
  const del = async () => {
    const removed = await remove('ideas', idea.id);
    onClose();
    if (removed) toast(t('ideas.deleted'), { label: t('common.undo'), run: () => void put('ideas', removed) });
  };

  return (
    <aside className="card core-detail" aria-labelledby="idea-detail-h" data-testid="idea-detail">
      <div className="row-between">
        <span className="page-kicker">{t('core.ideas.detail')}</span>
        <IconButton icon="x" label={t('common.close')} onClick={onClose} />
      </div>
      {src?.videoId ? (
        <img className="core-detail-art" src={`https://i.ytimg.com/vi/${src.videoId}/hqdefault.jpg`} alt="" referrerPolicy="no-referrer" />
      ) : (
        <div className="core-detail-art" aria-hidden="true">
          <Icon name={kindIcon(src?.kind)} />
        </div>
      )}
      <h2 id="idea-detail-h" className="sr-only">
        {ideaTitle(idea.text)}
      </h2>
      <Field label={t('ideas.text')}>
        {({ id }) => (
          <textarea
            id={id}
            className="textarea core-title-input"
            style={{ fontSize: 18 }}
            rows={3}
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text.trim() && text !== idea.text && void patch({ text: text.trim() })}
          />
        )}
      </Field>
      <div className="row">
        <Button variant="primary" onClick={async () => onStartDraft(await start(idea))}>
          <Icon name="play" />
          {t('ideas.startDraft')}
        </Button>
        <Button variant="ghost" className="btn-danger" onClick={() => void del()}>
          <Icon name="trash" />
          {t('common.delete')}
        </Button>
      </div>
      <Segmented label={t('ideas.filterStatus')} value={idea.status} onChange={(s) => void patch({ status: s })} items={IDEA_STATUSES.map((s) => ({ id: s, label: t(`status.${s}`) }))} />
      <Field label={t('common.notes')} help={t('core.ideas.notesHelp')}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            rows={4}
            dir="auto"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== idea.notes && void patch({ notes })}
          />
        )}
      </Field>
      <dl className="core-meta">
        {src && (
          <>
            <dt>{t('ideas.source')}</dt>
            <dd>
              <a href={src.url} target="_blank" rel="noreferrer noopener" title={src.url}>
                <bdi>{sourceName(src) ?? t('ideas.openSource')}</bdi>
              </a>
              <span className="faint"> · {t(`ctx.kind.${src.kind}`)}</span>
            </dd>
          </>
        )}
        {src?.channelName && (
          <>
            <dt>{t('ctx.kind.channel')}</dt>
            <dd>
              <bdi>{src.channelName}</bdi>
            </dd>
          </>
        )}
        <dt>{t('core.created')}</dt>
        <dd>{formatDate(idea.createdAt)}</dd>
        <dt>{t('core.edited')}</dt>
        <dd>{formatDate(idea.updatedAt)}</dd>
      </dl>
      {profiles.length > 0 && (
        <Field label={t('draft.channel')}>
          {({ id }) => (
            <select id={id} className="select" value={idea.profileId ?? ''} onChange={(e) => void patch({ profileId: e.target.value || undefined })}>
              <option value="">{t('draft.noChannel')}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
    </aside>
  );
}

function QuickCapture({ profileId }: { profileId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [text, setText] = useState('');
  const submit = async () => {
    const idea = await captureIdea({ text, ctx: null, link: false, profileId });
    if (!idea) return;
    setText('');
    toast(t('capture.saved'), { label: t('common.undo'), run: () => void remove('ideas', idea.id) });
  };
  return (
    <form
      className="core-capture grow"
      style={{ maxWidth: 720 }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Icon name="plus" />
      <input aria-label={t('capture.label')} dir="auto" placeholder={t('core.ideas.capturePlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
        {t('capture.save')}
      </button>
    </form>
  );
}

export function IdeasView({ onOpenDraft }: { onOpenDraft: (id: string) => void }) {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const { items, corrupt, loading } = useCollection('ideas');
  const profiles = useCollection('profiles').items;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<IdeaStatus | 'all'>('all');
  const [channel, setChannel] = useState<string>('all');
  const [selected, setSelected] = useState<string | undefined>();

  const inChannel = useMemo(
    () => items.filter((i) => (channel === 'all' || i.profileId === channel || (channel === 'none' && !i.profileId)) && matchesQuery(ideaHaystack(i), query)),
    [items, channel, query],
  );
  const visible = useMemo(() => inChannel.filter((i) => status === 'all' || i.status === status), [inChannel, status]);
  const counts = useMemo(() => Object.fromEntries(IDEA_STATUSES.map((s) => [s, inChannel.filter((i) => i.status === s).length])) as Record<IdeaStatus, number>, [inChannel]);
  const current = items.find((i) => i.id === selected);
  useEffect(() => {
    if (selected && !loading && !current) setSelected(undefined);
  }, [selected, loading, current]);

  return (
    <section className="stack-l" aria-labelledby="ideas-h">
      <PageHeader
        kicker={t('shell.group.create')}
        title={t('ideas.heading')}
        desc={
          <>
            {t('core.ideas.desc')} <span className="faint">· {t('ideas.count', { n: items.length })}</span>
          </>
        }
        art={<Cover icon="bulb" />}
        actions={<QuickCapture profileId={channel !== 'all' && channel !== 'none' ? channel : prefs.activeProfileId} />}
      />
      {corrupt > 0 && <Notice tone="warning">{t('settings.corrupt', { n: corrupt })}</Notice>}
      <div className="core-toolbar">
        <SearchInput label={t('ideas.searchLabel')} placeholder={t('ideas.searchLabel')} value={query} onChange={setQuery} />
        <Segmented
          label={t('ideas.filterStatus')}
          value={status}
          onChange={setStatus}
          items={[{ id: 'all' as const, label: t('ideas.allStatuses'), count: inChannel.length }, ...IDEA_STATUSES.map((s) => ({ id: s, label: t(`status.${s}`), count: counts[s] }))]}
        />
        {profiles.length > 0 && (
          <select className="select core-select-pill" aria-label={t('draft.channel')} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">{t('core.allChannels')}</option>
            <option value="none">{t('draft.noChannel')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {loading ? (
        <Skeleton lines={5} />
      ) : items.length === 0 ? (
        <Empty icon="bulb" title={t('core.ideas.emptyTitle')}>
          {t('ideas.empty')}
        </Empty>
      ) : (
        <div className="core-split" data-detail={current ? 'true' : undefined}>
          {visible.length === 0 ? (
            <Empty
              icon="search"
              title={t('ideas.noMatch')}
              action={
                <Button
                  onClick={() => {
                    setQuery('');
                    setStatus('all');
                    setChannel('all');
                  }}
                >
                  {t('core.clearFilters')}
                </Button>
              }
            />
          ) : (
            <div>
              <div className="track-head" aria-hidden="true">
                <span className="track-n">#</span>
                <span>{t('ideas.text')}</span>
                <span className="core-hide-s">{t('ideas.filterStatus')}</span>
              </div>
              <ul className="tracks" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="ideas-list">
                {visible.map((i, n) => (
                  <IdeaTrack key={i.id} idea={i} index={n} selected={i.id === selected} onSelect={() => setSelected(i.id === selected ? undefined : i.id)} onStartDraft={onOpenDraft} />
                ))}
              </ul>
            </div>
          )}
          {current && <IdeaDetail key={current.id} idea={current} onStartDraft={onOpenDraft} onClose={() => setSelected(undefined)} />}
        </div>
      )}
    </section>
  );
}
