// Playlists of the signed-in channel: a cover grid, and each playlist as a track list with add, remove,
// reorder, bulk sort, copy, edit and delete. Every write shows its unit cost; reversible ones get undo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyMoves, moveOne, planReorder, sortItems, videosToAdd, PLAYLIST_WRITE_COST, type Move, type SortDir, type SortKey } from '../../domain/engagePlaylists';
import { runSequential, type RunProgress } from '../../domain/engageRun';
import type { Privacy } from '../../domain/engageSchedule';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, Card, ConfirmButton, Empty, Field, IconButton, Notice, PageHeader, Skeleton, Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import {
  createPlaylist,
  deletePlaylist,
  deletePlaylistItem,
  insertPlaylistItem,
  listMyPlaylists,
  listPlaylistItems,
  movePlaylistItem,
  updatePlaylist,
  videoViews,
  type Playlist,
  type PlaylistEntry,
  type PlaylistInput,
} from '../../integrations/google/ownWrites';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useAsync, useFormat } from '../research/shared';
import { Cost, DiffLines, isFatal, RunStatus, SignInEmpty, useOwnChannel, useOwnUploads, VideoPicker } from '../bulk/engageKit';

const PRIVACIES: Privacy[] = ['public', 'unlisted', 'private'];

function PrivacySeg({ value, onChange }: { value: Privacy; onChange: (p: Privacy) => void }) {
  const { t } = useI18n();
  return (
    <div className="engage-seg" role="group" aria-label={t('mc.privacy')}>
      {PRIVACIES.map((p) => (
        <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)}>
          {t(`mc.privacy.${p}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}

function PlaylistForm({ initial, submitLabel, cost, onSubmit, onCancel, busy }: { initial: PlaylistInput; submitLabel: string; cost: number; onSubmit: (p: PlaylistInput) => void; onCancel: () => void; busy?: boolean }) {
  const { t } = useI18n();
  const [p, setP] = useState(initial);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.title.trim()) onSubmit({ ...p, title: p.title.trim() });
      }}
    >
      <Field label={t('engage.pl.title')} counter={`${[...p.title].length}/150`} over={[...p.title].length > 150}>
        {({ id }) => <input id={id} className="input" dir="auto" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} autoFocus />}
      </Field>
      <Field label={t('engage.pl.description')} counter={`${[...p.description].length}/5000`} over={[...p.description].length > 5000}>
        {({ id }) => <textarea id={id} className="textarea" rows={3} dir="auto" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />}
      </Field>
      <div className="stack-s">
        <span className="field-label">{t('mc.privacy')}</span>
        <PrivacySeg value={p.privacy} onChange={(privacy) => setP({ ...p, privacy })} />
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy || !p.title.trim() || [...p.title].length > 150 || [...p.description].length > 5000}>
          {submitLabel}
        </button>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Cost units={cost} />
      </div>
    </form>
  );
}

function Cover({ src, large }: { src?: string; large?: boolean }) {
  return <div className="engage-cover" style={large ? undefined : {}}>{src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="playlist" />}</div>;
}

function Grid({ channelId }: { channelId: string }) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const load = useCallback((fresh: boolean) => listMyPlaylists(channelId, fresh), [channelId]);
  const st = useAsync(load);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void st.run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);
  const create = async (p: PlaylistInput) => {
    setBusy(true);
    setError(null);
    try {
      const pl = await createPlaylist(channelId, p);
      toast(t('engage.pl.created'));
      setCreating(false);
      location.hash = `playlists/${encodeURIComponent(pl.id)}`;
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack-l">
      <PageHeader
        kicker={t('shell.group.manage')}
        title={t('engage.pl.heading')}
        desc={t('engage.pl.desc')}
        actions={
          <>
            <Button variant="primary" onClick={() => setCreating(true)} disabled={creating}>
              <Icon name="plus" />
              {t('engage.pl.new')}
            </Button>
            <IconButton icon="refresh" label={t('engage.pl.refresh')} disabled={st.loading} onClick={() => void st.run(true)} />
          </>
        }
      />
      {creating && (
        <Card title={t('engage.pl.new')}>
          <PlaylistForm initial={{ title: '', description: '', privacy: 'private' }} submitLabel={t('engage.pl.create')} cost={PLAYLIST_WRITE_COST} busy={busy} onSubmit={(p) => void create(p)} onCancel={() => setCreating(false)} />
          <ErrorNotice error={error} />
        </Card>
      )}
      <ErrorNotice error={st.error} />
      {!st.data ? (
        st.loading ? <Skeleton lines={4} /> : null
      ) : st.data.length === 0 ? (
        <Empty icon="playlist" title={t('engage.pl.empty')} action={<Button variant="primary" onClick={() => setCreating(true)}>{t('engage.pl.new')}</Button>}>
          {t('engage.pl.emptyHelp')}
        </Empty>
      ) : (
        <section className="stack" aria-labelledby="pl-grid-h">
          <h2 id="pl-grid-h">{t('engage.pl.yours', { n: f.int(st.data.length) })}</h2>
          <div className="engage-grid">
            {st.data.map((p) => (
              <a key={p.id} className="engage-card" href={`#playlists/${encodeURIComponent(p.id)}`}>
                <div style={{ position: 'relative' }}>
                  <Cover src={p.thumbnail} />
                  <span className="play-btn" aria-hidden="true">
                    <Icon name="play" />
                  </span>
                </div>
                <span className="engage-card-title truncate" dir="auto">
                  {p.title || t('engage.pl.untitled')}
                </span>
                <span className="engage-card-sub">
                  {p.privacy ? t(`mc.privacy.${p.privacy}` as MessageKey) : '—'} · {p.itemCount === undefined ? '—' : t('engage.pl.videosN', { n: f.int(p.itemCount) })}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type Panel = null | 'add' | 'sort' | 'edit' | 'copy';

function Detail({ channelId, playlistId }: { channelId: string; playlistId: string }) {
  const { t, lang, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [pl, setPl] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RunProgress<unknown> | null>(null);
  const [views, setViews] = useState<Map<string, number | undefined>>(new Map());
  const stop = useRef({ aborted: false });
  const uploads = useOwnUploads(panel === 'add');

  const reload = useCallback(
    async (fresh = true) => {
      setError(null);
      try {
        const [all, its] = await Promise.all([listMyPlaylists(channelId, fresh), listPlaylistItems(channelId, playlistId, fresh)]);
        const p = all.find((x) => x.id === playlistId);
        if (!p) throw new Error(t('engage.pl.notFound'));
        setPl(p);
        setItems(its);
      } catch (e) {
        setError(e);
      }
    },
    [channelId, playlistId, t],
  );
  useEffect(() => {
    void reload(false);
  }, [reload]);

  const run = async <T,>(list: T[], work: (x: T, i: number) => Promise<void>) => {
    stop.current = { aborted: false };
    setBusy(true);
    try {
      return await runSequential(list, work, { isFatal, onProgress: (p) => setProgress(p as RunProgress<unknown>), signal: stop.current, stopOnAnyError: true });
    } finally {
      setBusy(false);
    }
  };

  /** Applies moves one by one; returns the order reached (for undo). */
  const applyPlan = async (moves: Move[], startOrder: PlaylistEntry[]) => {
    const byId = new Map(startOrder.map((x) => [x.id, x]));
    const p = await run(moves, async (m) => {
      const it = byId.get(m.id)!;
      await movePlaylistItem(channelId, it, m.to);
    });
    const order = applyMoves(
      startOrder.map((x) => x.id),
      p.ok,
    );
    setItems(order.map((id, i) => ({ ...byId.get(id)!, position: i })));
    return { p, order };
  };

  const moveItem = async (it: PlaylistEntry, where: 'up' | 'down' | 'top' | 'bottom') => {
    if (!items) return;
    const ids = items.map((x) => x.id);
    const m = moveOne(ids, it.id, where);
    if (!m) return;
    const from = ids.indexOf(it.id);
    setError(null);
    try {
      await movePlaylistItem(channelId, it, m.to);
      const order = applyMoves(ids, [m]);
      const byId = new Map(items.map((x) => [x.id, x]));
      setItems(order.map((id, i) => ({ ...byId.get(id)!, position: i })));
      toast(t('engage.pl.moved', { n: f.int(m.to + 1) }), {
        label: t('common.undo'),
        run: async () => {
          try {
            await movePlaylistItem(channelId, it, from);
            void reload(true);
          } catch (e) {
            setError(e);
          }
        },
      });
    } catch (e) {
      setError(e);
    }
  };

  const removeItem = async (it: PlaylistEntry) => {
    setError(null);
    try {
      const pos = items?.findIndex((x) => x.id === it.id) ?? 0;
      await deletePlaylistItem(channelId, it.id);
      setItems((cur) => cur?.filter((x) => x.id !== it.id) ?? cur);
      toast(t('engage.pl.removed'), {
        label: t('common.undo'),
        run: async () => {
          try {
            await insertPlaylistItem(channelId, playlistId, it.videoId, pos);
            void reload(true);
          } catch (e) {
            setError(e);
          }
        },
      });
    } catch (e) {
      setError(e);
    }
  };

  if (error && !pl)
    return (
      <div className="stack">
        <a className="btn btn-s" href="#playlists" style={{ alignSelf: 'flex-start' }}>
          {t('engage.pl.back')}
        </a>
        <ErrorNotice error={error} />
      </div>
    );
  if (!pl || !items) return <Skeleton lines={6} />;

  return (
    <div className="stack-l">
      <div className="engage-hero">
        <Cover src={pl.thumbnail ?? items[0]?.thumbnail} large />
        <div className="stack-s grow" style={{ minWidth: 0 }}>
          <a className="page-kicker" href="#playlists">
            {t('engage.pl.kicker')}
          </a>
          <h1 className="engage-pl-title" dir="auto" style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800 }}>
            {pl.title || t('engage.pl.untitled')}
          </h1>
          {pl.description && (
            <p className="page-desc clamp-2" dir="auto">
              {pl.description}
            </p>
          )}
          <p className="small">
            <span className="bold">{pl.privacy ? t(`mc.privacy.${pl.privacy}` as MessageKey) : '—'}</span> · {t('engage.pl.videosN', { n: f.int(items.length) })}
            {pl.publishedAt && <> · {formatDate(pl.publishedAt)}</>}
          </p>
        </div>
      </div>
      <div className="action-bar">
        <Button variant="primary" onClick={() => setPanel(panel === 'add' ? null : 'add')} aria-expanded={panel === 'add'}>
          <Icon name="plus" />
          {t('engage.pl.addVideos')}
        </Button>
        <Button onClick={() => setPanel(panel === 'sort' ? null : 'sort')} aria-expanded={panel === 'sort'} disabled={items.length < 2}>
          <Icon name="sort" />
          {t('engage.pl.sort')}
        </Button>
        <Button variant="ghost" onClick={() => setPanel(panel === 'edit' ? null : 'edit')} aria-expanded={panel === 'edit'}>
          <Icon name="edit" />
          {t('engage.pl.edit')}
        </Button>
        <Button variant="ghost" onClick={() => setPanel(panel === 'copy' ? null : 'copy')} aria-expanded={panel === 'copy'}>
          <Icon name="copy" />
          {t('engage.pl.copy')}
        </Button>
        <a className="btn btn-ghost" href={`https://www.youtube.com/playlist?list=${encodeURIComponent(pl.id)}`} target="_blank" rel="noreferrer noopener">
          <Icon name="external" />
          {t('engage.pl.openYt')}
        </a>
        <span className="grow" />
        <ConfirmButton
          label={t('engage.pl.delete')}
          question={t('engage.pl.deleteConfirm', { name: pl.title })}
          confirmLabel={t('engage.pl.deleteGo')}
          onConfirm={async () => {
            try {
              await deletePlaylist(channelId, pl.id);
              toast(t('engage.pl.deleted'));
              location.hash = 'playlists';
            } catch (e) {
              setError(e);
            }
          }}
        />
      </div>
      <ErrorNotice error={error} />
      <RunStatus p={progress} name={() => pl.title} onStop={() => (stop.current.aborted = true)} />

      {panel === 'edit' && (
        <EditPanel
          pl={pl}
          channelId={channelId}
          onClose={() => setPanel(null)}
          onSaved={(after) => {
            setPl({ ...pl, ...after });
            setPanel(null);
          }}
        />
      )}
      {panel === 'add' && (
        <AddPanel
          busy={busy}
          videos={uploads.videos}
          existing={items.map((x) => x.videoId)}
          onClose={() => setPanel(null)}
          onRun={async (ids) => {
            const added: PlaylistEntry[] = [];
            const p = await run(ids, async (v) => {
              added.push(await insertPlaylistItem(channelId, playlistId, v));
            });
            await reload(true);
            if (added.length)
              toast(t('engage.pl.addedN', { n: f.int(added.length) }), {
                label: t('common.undo'),
                run: async () => {
                  await run(added, (a) => deletePlaylistItem(channelId, a.id));
                  void reload(true);
                },
              });
            if (!p.failed.length) setPanel(null);
          }}
        />
      )}
      {panel === 'sort' && (
        <SortPanel
          items={items}
          busy={busy}
          lang={lang}
          views={views}
          loadViews={async () => setViews(await videoViews(channelId, items.map((x) => x.videoId)))}
          onClose={() => setPanel(null)}
          onRun={async (target) => {
            const cur = items.map((x) => x.id);
            const moves = planReorder(cur, target);
            const { p, order } = await applyPlan(moves, items);
            if (p.ok.length)
              toast(t('engage.pl.sorted', { n: f.int(p.ok.length) }), {
                label: t('common.undo'),
                run: async () => {
                  const byId = new Map(items.map((x) => [x.id, x]));
                  await applyPlan(planReorder(order, cur), order.map((id) => byId.get(id)!));
                },
              });
            if (!p.failed.length) setPanel(null);
          }}
        />
      )}
      {panel === 'copy' && (
        <CopyPanel
          pl={pl}
          items={items}
          busy={busy}
          onClose={() => setPanel(null)}
          onRun={async (input) => {
            setError(null);
            try {
              const copy = await createPlaylist(channelId, input);
              const p = await run(items, async (it) => {
                await insertPlaylistItem(channelId, copy.id, it.videoId);
              });
              toast(t('engage.pl.copied', { n: f.int(p.ok.length) }), { label: t('common.open'), run: () => (location.hash = `playlists/${encodeURIComponent(copy.id)}`) });
              setPanel(null);
            } catch (e) {
              setError(e);
            }
          }}
        />
      )}

      {items.length === 0 ? (
        <Empty icon="video" title={t('engage.pl.noItems')} action={<Button variant="primary" onClick={() => setPanel('add')}>{t('engage.pl.addVideos')}</Button>} />
      ) : (
        <section aria-labelledby="pl-items-h">
          <h2 id="pl-items-h" className="sr-only">
            {t('engage.pl.items')}
          </h2>
          <div className="track-head">
            <span className="track-n">#</span>
            <span>{t('yt.col.title')}</span>
            <span>{t('engage.pl.order')}</span>
          </div>
          <ol className="tracks" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((it, i) => (
              <li key={it.id} className="track">
                <span className="track-n">{f.int(i + 1)}</span>
                <a className="track-main" href={`https://www.youtube.com/watch?v=${encodeURIComponent(it.videoId)}&list=${encodeURIComponent(playlistId)}`} target="_blank" rel="noreferrer noopener" style={{ textDecoration: 'none' }}>
                  <Thumb videoId={it.videoId} src={it.thumbnail} />
                  <span className="stack-s" style={{ gap: 0, minWidth: 0 }}>
                    <span className="track-title truncate" dir="auto">
                      {it.title || '—'}
                    </span>
                    <span className="track-sub truncate">
                      {it.videoPublishedAt ? formatDate(it.videoPublishedAt) : t('engage.pl.noDate')}
                      {views.has(it.videoId) && <> · {t('engage.pl.viewsN', { n: f.compact(views.get(it.videoId)) })}</>}
                    </span>
                  </span>
                </a>
                <span className="track-end" style={{ gap: 2 }}>
                  <IconButton icon="arrowUp" label={t('engage.pl.moveUp')} disabled={busy || i === 0} onClick={() => void moveItem(it, 'up')} />
                  <IconButton icon="arrowDown" label={t('engage.pl.moveDown')} disabled={busy || i === items.length - 1} onClick={() => void moveItem(it, 'down')} />
                  <IconButton icon="sort" label={t('engage.pl.moveTop')} disabled={busy || i === 0} onClick={() => void moveItem(it, 'top')} />
                  <IconButton icon="x" label={t('engage.pl.remove')} disabled={busy} onClick={() => void removeItem(it)} />
                </span>
              </li>
            ))}
          </ol>
          <p className="xsmall muted">{t('engage.pl.rowCost')}</p>
        </section>
      )}
    </div>
  );
}

function EditPanel({ pl, channelId, onClose, onSaved }: { pl: Playlist; channelId: string; onClose: () => void; onSaved: (p: PlaylistInput) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<PlaylistInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const initial: PlaylistInput = { title: pl.title, description: pl.description, privacy: (PRIVACIES.includes(pl.privacy as Privacy) ? pl.privacy : 'private') as Privacy };
  const save = async (p: PlaylistInput) => {
    setBusy(true);
    setError(null);
    try {
      const r = await updatePlaylist(channelId, pl.id, p);
      onSaved(p);
      toast(t('engage.pl.saved'), {
        label: t('common.undo'),
        run: async () => {
          await updatePlaylist(channelId, pl.id, r.before).catch(() => toast(t('engage.inbox.undoFailed')));
          onSaved(r.before);
        },
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('engage.pl.edit')}>
      {!draft ? (
        <PlaylistForm initial={initial} submitLabel={t('engage.pl.reviewChanges')} cost={PLAYLIST_WRITE_COST + 1} onSubmit={setDraft} onCancel={onClose} />
      ) : (
        <div className="stack">
          {draft.title !== initial.title && <DiffLines label={t('engage.pl.title')} before={initial.title} after={draft.title} />}
          {draft.description !== initial.description && <DiffLines label={t('engage.pl.description')} before={initial.description} after={draft.description} />}
          {draft.privacy !== initial.privacy && <DiffLines label={t('mc.privacy')} before={t(`mc.privacy.${initial.privacy}` as MessageKey)} after={t(`mc.privacy.${draft.privacy}` as MessageKey)} />}
          {draft.title === initial.title && draft.description === initial.description && draft.privacy === initial.privacy && <Notice>{t('engage.pl.noChange')}</Notice>}
          <div className="row">
            <Button variant="primary" disabled={busy} onClick={() => void save(draft)}>
              {t('engage.pl.saveYt')}
            </Button>
            <Button onClick={() => setDraft(null)}>{t('common.edit')}</Button>
            <Cost units={PLAYLIST_WRITE_COST + 1} />
          </div>
        </div>
      )}
      <ErrorNotice error={error} />
    </Card>
  );
}

function AddPanel({ videos, existing, busy, onRun, onClose }: { videos: import('../../integrations/google/own').OwnVideo[] | undefined; existing: string[]; busy: boolean; onRun: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const [chosen, setChosen] = useState<string[]>([]);
  const toAdd = videosToAdd(existing, chosen);
  const have = new Set(existing);
  return (
    <Card title={t('engage.pl.addVideos')} sub={t('engage.pl.addHelp')} actions={<IconButton icon="x" label={t('common.close')} onClick={onClose} />}>
      <VideoPicker videos={videos} selected={chosen} onChange={setChosen} label={t('engage.pl.addVideos')} allow={(v) => (have.has(v.id) ? 'engage.pl.already' : null)} limit={30} />
      <div className="engage-bar">
        <span className="engage-bar-count">{t('engage.bulk2.selected', { n: f.int(toAdd.length) })}</span>
        <Cost units={toAdd.length * PLAYLIST_WRITE_COST} />
        <span className="grow" />
        <ConfirmButton
          danger={false}
          label={t('engage.pl.addN', { n: f.int(toAdd.length) })}
          question={t('engage.pl.addConfirm', { n: f.int(toAdd.length), units: f.int(toAdd.length * PLAYLIST_WRITE_COST) })}
          confirmLabel={t('engage.pl.addGo')}
          onConfirm={() => (toAdd.length && !busy ? onRun(toAdd).then(() => setChosen([])) : undefined)}
        />
      </div>
    </Card>
  );
}

function SortPanel({ items, views, loadViews, busy, lang, onRun, onClose }: { items: PlaylistEntry[]; views: Map<string, number | undefined>; loadViews: () => Promise<void>; busy: boolean; lang: 'fa' | 'en'; onRun: (target: string[]) => Promise<void>; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const [key, setKey] = useState<SortKey>('date');
  const [dir, setDir] = useState<SortDir>('desc');
  const [viewsError, setViewsError] = useState<unknown>(null);
  const [loadingViews, setLoadingViews] = useState(false);
  const needViews = key === 'views' && views.size === 0;
  const target = useMemo(
    () =>
      sortItems(
        items.map((x) => ({ id: x.id, title: x.title, publishedAt: x.videoPublishedAt, views: views.get(x.videoId), entry: x })),
        key,
        dir,
        lang,
      ),
    [items, key, dir, views, lang],
  );
  const moves = useMemo(() => (needViews ? [] : planReorder(items.map((x) => x.id), target.map((x) => x.id))), [items, target, needViews]);
  const keys: { id: SortKey; label: MessageKey }[] = [
    { id: 'date', label: 'engage.pl.sort.date' },
    { id: 'views', label: 'engage.pl.sort.views' },
    { id: 'title', label: 'engage.pl.sort.title' },
  ];
  return (
    <Card title={t('engage.pl.sort')} sub={t('engage.pl.sortHelp')} actions={<IconButton icon="x" label={t('common.close')} onClick={onClose} />}>
      <div className="row">
        <div className="engage-seg" role="group" aria-label={t('engage.pl.sortBy')}>
          {keys.map((k) => (
            <button key={k.id} type="button" aria-pressed={key === k.id} onClick={() => setKey(k.id)}>
              {t(k.label)}
            </button>
          ))}
        </div>
        <div className="engage-seg" role="group" aria-label={t('engage.pl.sortDir')}>
          <button type="button" aria-pressed={dir === 'desc'} onClick={() => setDir('desc')}>
            {t(key === 'title' ? 'engage.pl.sort.za' : key === 'date' ? 'engage.pl.sort.newest' : 'engage.pl.sort.most')}
          </button>
          <button type="button" aria-pressed={dir === 'asc'} onClick={() => setDir('asc')}>
            {t(key === 'title' ? 'engage.pl.sort.az' : key === 'date' ? 'engage.pl.sort.oldest' : 'engage.pl.sort.least')}
          </button>
        </div>
      </div>
      {needViews ? (
        <div className="row">
          <Button
            disabled={loadingViews}
            onClick={async () => {
              setLoadingViews(true);
              setViewsError(null);
              try {
                await loadViews();
              } catch (e) {
                setViewsError(e);
              } finally {
                setLoadingViews(false);
              }
            }}
          >
            {loadingViews ? t('common.loading') : t('engage.pl.loadViews')}
          </Button>
          <Cost units={Math.ceil(items.length / 50)} />
        </div>
      ) : (
        <>
          <Notice tone={moves.length ? 'info' : 'success'}>
            <p className="bold">{moves.length ? t('engage.pl.plan', { n: f.int(moves.length), total: f.int(items.length) }) : t('engage.pl.alreadySorted')}</p>
            <p className="small">{t('engage.pl.manualNote')}</p>
          </Notice>
          {moves.length > 0 && (
            <>
              <ol className="tracks" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 320, overflow: 'auto' }}>
                {target.slice(0, 50).map((x, i) => {
                  const moved = moves.some((m) => m.id === x.id);
                  return (
                    <li key={x.id} className="track" style={{ minHeight: 44 }} data-selected={moved}>
                      <span className="track-n">{f.int(i + 1)}</span>
                      <span className="track-main">
                        <Thumb videoId={x.entry.videoId} src={x.entry.thumbnail} width={56} />
                        <span className="truncate" dir="auto">
                          {x.title}
                        </span>
                      </span>
                      <span className="track-end small">{moved ? <span className="badge badge-accent">{t('engage.pl.willMove')}</span> : null}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="row">
                <ConfirmButton
                  danger={false}
                  label={t('engage.pl.applySort', { n: f.int(moves.length) })}
                  question={t('engage.pl.sortConfirm', { n: f.int(moves.length), units: f.int(moves.length * PLAYLIST_WRITE_COST) })}
                  confirmLabel={t('engage.pl.sortGo')}
                  onConfirm={() => (busy ? undefined : onRun(target.map((x) => x.id)))}
                />
                <Cost units={moves.length * PLAYLIST_WRITE_COST} />
              </div>
            </>
          )}
        </>
      )}
      <ErrorNotice error={viewsError} />
    </Card>
  );
}

function CopyPanel({ pl, items, busy, onRun, onClose }: { pl: Playlist; items: PlaylistEntry[]; busy: boolean; onRun: (p: PlaylistInput) => Promise<void>; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const cost = PLAYLIST_WRITE_COST * (1 + items.length);
  return (
    <Card title={t('engage.pl.copy')} sub={t('engage.pl.copyHelp', { n: f.int(items.length) })} actions={<IconButton icon="x" label={t('common.close')} onClick={onClose} />}>
      <PlaylistForm
        initial={{ title: t('engage.pl.copyOf', { name: pl.title }).slice(0, 150), description: pl.description, privacy: 'private' }}
        submitLabel={t('engage.pl.copyGo', { units: f.int(cost) })}
        cost={cost}
        busy={busy}
        onSubmit={(p) => void onRun(p)}
        onCancel={onClose}
      />
    </Card>
  );
}

export function PlaylistsView({ tab }: { tab?: string }) {
  const { channel, loaded } = useOwnChannel();
  const { t } = useI18n();
  if (!loaded) return null;
  if (!channel)
    return (
      <div className="stack-l">
        <PageHeader kicker={t('shell.group.manage')} title={t('engage.pl.heading')} desc={t('engage.pl.desc')} />
        <SignInEmpty icon="playlist" why="engage.signIn.playlists" />
      </div>
    );
  return tab ? <Detail key={`${channel.channelId}:${tab}`} channelId={channel.channelId} playlistId={tab} /> : <Grid key={channel.channelId} channelId={channel.channelId} />;
}
