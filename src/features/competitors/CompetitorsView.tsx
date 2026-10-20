// Competitors: a watchlist of public channels as a card grid with a detail panel, upload alerts (background
// check every 3 h), a niche leaderboard from daily snapshots and a side-by-side scorecard.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WatchedChannel } from '../../domain/models';
import { median, viewsPerDay } from '../../domain/research';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Avatar, Button, ConfirmButton, Empty, Field, Notice, PageHeader, Skeleton, Stat, Switch, Tabs } from '../../components/ui';
import { useWork } from '../../components/useWork';
import { useI18n } from '../../i18n';
import { channelUploads, getChannel, type VideoInfo } from '../../integrations/youtube/api';
import { YtError } from '../../integrations/youtube/client';
import { getChannels, type ChannelMeta } from '../../integrations/youtube/seoApi';
import { remove, save } from '../../storage/db';
import { put } from '../../storage/stores';
import { ErrorNotice } from '../connections/ErrorNotice';
import { ExportUploads } from '../insights/PageInsights';
import {
  checkCompetitor,
  clearUnseen,
  COMPETITOR_SETTINGS,
  competitorConfig,
  competitorTrackerId,
  setCompetitorAlerts,
  syncCompetitorTrackers,
} from '../ranks/service';
import { usePublicAccess } from '../research/access';
import { NeedsAccess, SectionHead, VideoTracks } from '../research/parts';
import { useAsync, useFormat } from '../research/shared';
import { Leaderboard } from './Leaderboard';
import { addWatched, markSeen, parseChannelInput } from './watchActions';
import '../research/seo.css';

type Tab = 'watchlist' | 'leaderboard' | 'compare';

function Detail({ w, meta, canRead, onClose }: { w: WatchedChannel; meta?: ChannelMeta; canRead: boolean; onClose: () => void }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const trackers = useWork('trackers').items;
  const tr = trackers.find((x) => x.id === competitorTrackerId(w.channelId));
  const unseen = tr ? competitorConfig(tr).unseen : [];
  const [notes, setNotes] = useState(w.notes);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<unknown>(null);
  const uploads = useAsync(
    useCallback(async (playlist: string | undefined, fresh: boolean) => {
      const ch = playlist ? null : (await getChannel({ id: w.channelId }, fresh)).data;
      const pl = playlist ?? ch?.uploadsPlaylistId;
      return pl ? (await channelUploads(pl, 12, fresh)).data : [];
    }, [w.channelId]),
  );
  useEffect(() => {
    setNotes(w.notes);
    if (canRead) void uploads.run(meta?.uploadsPlaylistId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.id, canRead, meta?.uploadsPlaylistId]);
  const vids: VideoInfo[] = uploads.data ?? [];
  const medianPerDay = median(vids.map((v) => viewsPerDay(v)).filter((x): x is number => x !== undefined));
  const unseenIds = new Set(unseen.map((u) => u.id));
  const check = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      await syncCompetitorTrackers();
      const fresh = await checkCompetitor(competitorTrackerId(w.channelId));
      toast(t('seo.comp.checked', { n: fresh.length }));
      void uploads.run(meta?.uploadsPlaylistId, true);
    } catch (e) {
      setCheckError(e);
    } finally {
      setChecking(false);
    }
  };
  return (
    <section className="card stack" aria-labelledby="comp-detail" style={{ padding: 24 }}>
      <div className="seo-ch-detail">
        <Avatar src={meta?.thumbnail} name={w.title} size="xl" />
        <div className="stack-s" style={{ minWidth: 0 }}>
          <span className="seo-kicker">{t('seo.comp.channel')}</span>
          <h2 id="comp-detail" style={{ fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 800 }} dir="auto">
            <a href={`https://www.youtube.com/channel/${w.channelId}`} target="_blank" rel="noreferrer noopener" style={{ textDecoration: 'none' }}>
              {w.title}
            </a>
          </h2>
          <span className="small muted ltr">{w.handle}</span>
          <div className="row">
            <Button size="s" variant="primary" disabled={checking || !canRead} onClick={() => void check()} title={t('seo.comp.checkCost')}>
              {checking ? t('common.loading') : t('seo.comp.checkNow')}
            </Button>
            {unseen.length > 0 && (
              <Button
                size="s"
                onClick={async () => {
                  await clearUnseen(competitorTrackerId(w.channelId));
                  await markSeen(w.id, vids.map((v) => v.id));
                }}
              >
                {t('comp.markSeen')}
              </Button>
            )}
            <Button size="s" variant="ghost" disabled={uploads.loading || !canRead} onClick={() => void uploads.run(meta?.uploadsPlaylistId, true)}>
              {t('comp.refresh')}
            </Button>
            {meta?.uploadsPlaylistId && <ExportUploads playlistId={meta.uploadsPlaylistId} name={w.handle || w.title} count={meta.videoCount} />}
            <ConfirmButton
              size="s"
              label={t('common.delete')}
              question={t('comp.removeConfirm', { name: w.title })}
              confirmLabel={t('common.delete')}
              onConfirm={async () => {
                await remove('watchlist', w.id);
                await syncCompetitorTrackers();
                onClose();
              }}
            />
          </div>
        </div>
      </div>
      <ErrorNotice error={checkError} />
      <div className="stats">
        <Stat label={t('yt.subscribers')} value={meta ? (meta.subscribers === undefined ? t('yt.hidden') : f.compact(meta.subscribers)) : '—'} />
        <Stat label={t('yt.col.views')} value={f.compact(meta?.views)} />
        <Stat label={t('yt.videos')} value={f.int(meta?.videoCount)} />
        <Stat label={t('comp.medianPerDay')} value={f.compact(medianPerDay)} />
      </div>
      <div className="row-between">
        {tr ? (
          <Switch checked={tr.enabled} onChange={(v) => void put('trackers', { ...tr, enabled: v })} label={t('seo.comp.alertsFor', { name: w.title })} />
        ) : (
          <span />
        )}
        <span className="xsmall faint">{tr?.lastCheckedAt ? t('seo.rank.lastChecked', { when: formatDate(tr.lastCheckedAt) }) : t('seo.comp.notChecked')}</span>
      </div>
      <SectionHead title={t('seo.comp.uploads')} sub={unseen.length ? t('comp.newCount', { n: unseen.length }) : undefined} />
      <ErrorNotice error={uploads.error} />
      {uploads.loading && !uploads.data && <Skeleton lines={4} />}
      {vids.length > 0 && (
        <VideoTracks
          videos={vids}
          label={t('seo.comp.uploads')}
          extra={(v) => (unseenIds.has(v.id) ? <span><span className="badge badge-accent">{t('comp.new')}</span></span> : null)}
        />
      )}
      {uploads.data && !vids.length && <p className="small muted">{t('seo.comp.noUploads')}</p>}
      <Field label={t('common.notes')}>
        {({ id }) => (
          <textarea
            id={id}
            className="textarea"
            rows={2}
            dir="auto"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={async () => {
              if (notes === w.notes) return;
              const r = await save('watchlist', { ...w, notes });
              if (!r.ok) toast(t('draft.conflict'));
            }}
          />
        )}
      </Field>
    </section>
  );
}

function Scorecard({ items, meta }: { items: WatchedChannel[]; meta: Record<string, ChannelMeta> }) {
  const { t } = useI18n();
  const f = useFormat();
  const snaps = useWork('snapshots').items;
  const latest = (channelId: string) =>
    snaps
      .filter((s) => s.ref === `niche:${channelId}`)
      .sort((a, b) => a.at.localeCompare(b.at))
      .pop()?.data as { uploads30?: number; avgViews10?: number } | undefined;
  if (items.length < 2) return <Empty icon="sort">{t('seo.comp.compareNeedsTwo')}</Empty>;
  return (
    <section className="seo-section" aria-labelledby="sc-h">
      <SectionHead id="sc-h" title={t('comp.compare')} sub={t('comp.compareNote')} />
      <div className="table-wrap">
        <table className="table seo-lead">
          <thead>
            <tr>
              <th>{t('yt.col.channel')}</th>
              <th className="num">{t('yt.subscribers')}</th>
              <th className="num">{t('yt.col.views')}</th>
              <th className="num">{t('yt.videos')}</th>
              <th className="num">{t('yt.avgViews')}</th>
              <th className="num">{t('seo.lead.uploads30')}</th>
              <th className="num">{t('seo.lead.avg10')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => {
              const c = meta[w.channelId];
              const l = latest(w.channelId);
              return (
                <tr key={w.id}>
                  <td>
                    <span className="seo-ch-cell">
                      <Avatar src={c?.thumbnail} name={w.title} />
                      <bdi className="truncate">{w.title}</bdi>
                    </span>
                  </td>
                  <td className="num">{c ? (c.subscribers === undefined ? t('yt.hidden') : f.compact(c.subscribers)) : '—'}</td>
                  <td className="num">{f.compact(c?.views)}</td>
                  <td className="num">{f.int(c?.videoCount)}</td>
                  <td className="num">{f.compact(c?.views && c.videoCount ? c.views / c.videoCount : undefined)}</td>
                  <td className="num">{f.int(l?.uploads30)}</td>
                  <td className="num">{f.compact(l?.avgViews10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CompetitorsView() {
  const { t } = useI18n();
  const toast = useToast();
  const f = useFormat();
  const access = usePublicAccess();
  const watch = useCollection('watchlist');
  const trackers = useWork('trackers').items;
  const [tab, setTab] = useState<Tab>('watchlist');
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const meta = useAsync(useCallback((ids: string[], fresh: boolean) => getChannels(ids, fresh), []));
  const ids = useMemo(() => watch.items.map((w) => w.channelId).sort(), [watch.items]);

  useEffect(() => {
    if (!watch.loading) void syncCompetitorTrackers();
  }, [ids.join(','), watch.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (access.ok && ids.length) void meta.run(ids, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(','), access.ok]);

  const settings = trackers.find((x) => x.id === COMPETITOR_SETTINGS);
  const alertsOn = settings ? settings.enabled : true;
  const unseenOf = (w: WatchedChannel) => {
    const tr = trackers.find((x) => x.id === competitorTrackerId(w.channelId));
    return tr ? competitorConfig(tr).unseen.length : 0;
  };
  const sel = watch.items.find((w) => w.id === selected);
  const m = meta.data ?? {};

  const add = async () => {
    setAddError(null);
    const ref = parseChannelInput(input);
    if (!ref) return setAddError(new YtError('bad-request', t('comp.badInput')));
    setAdding(true);
    try {
      const ch = (await getChannel(ref)).data;
      if (!ch) throw new YtError('not-found');
      const r = await addWatched(ch);
      toast(r.existed ? t('comp.alreadyWatched') : t('comp.added'));
      setInput('');
      setSelected(r.record.id);
      setTab('watchlist');
      await syncCompetitorTrackers();
      // First check records what exists so later checks can tell what is new.
      if (!r.existed) await checkCompetitor(competitorTrackerId(ch.id)).catch(() => undefined);
    } catch (e) {
      setAddError(e);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="stack-l">
      <PageHeader kicker={t('shell.group.grow')} title={t('comp.heading')} desc={t('comp.intro')} />
      {access.loaded && !access.ok && <NeedsAccess />}
      <form
        className="seo-searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="search-wrap">
          <Icon name="users" />
          <input className="input ltr" dir="ltr" aria-label={t('comp.addLabel')} placeholder={t('seo.comp.addPlaceholder')} value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!input.trim() || adding || !access.ok}>
          {adding ? t('common.loading') : t('comp.add')}
        </button>
      </form>
      <p className="seo-cost" style={{ marginBlockStart: -12 }}>
        {t('comp.addHelp')}
      </p>
      <ErrorNotice error={addError} />
      <div className="row-between">
        <Tabs
          label={t('comp.heading')}
          value={tab}
          onChange={setTab}
          items={[
            { id: 'watchlist', label: t('seo.comp.tab.watchlist'), icon: 'users', count: watch.items.length || undefined },
            { id: 'leaderboard', label: t('seo.comp.tab.leaderboard'), icon: 'trophy' },
            { id: 'compare', label: t('seo.comp.tab.compare'), icon: 'sort' },
          ]}
        />
        <Switch checked={alertsOn} onChange={(v) => void setCompetitorAlerts(v)} label={t('seo.comp.alertsGlobal')} />
      </div>

      {tab === 'watchlist' && (
        <>
          {watch.items.length === 0 && !watch.loading && (
            <Empty icon="users" title={t('seo.comp.emptyTitle')}>
              {t('comp.empty')}
            </Empty>
          )}
          <ErrorNotice error={meta.error} />
          {watch.items.length > 0 && (
            <div className="seo-grid" role="list" aria-label={t('seo.comp.tab.watchlist')}>
              {watch.items.map((w) => {
                const c = m[w.channelId];
                const n = unseenOf(w);
                return (
                  <div role="listitem" key={w.id} style={{ display: 'grid' }}>
                    <button type="button" className="seo-ch-card" aria-pressed={selected === w.id} onClick={() => setSelected((x) => (x === w.id ? null : w.id))} data-testid="watched-card">
                      <Avatar src={c?.thumbnail} name={w.title} />
                      {n > 0 && <span className="badge badge-accent seo-ch-badge">{t('comp.newCount', { n })}</span>}
                      <span className="seo-ch-name truncate" dir="auto">
                        {w.title}
                      </span>
                      <span className="xsmall muted truncate">{c ? (c.subscribers === undefined ? t('yt.hidden') : t('seo.comp.subs', { n: f.compact(c.subscribers) })) : <span className="ltr">{w.handle}</span>}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {sel && <Detail key={sel.id} w={sel} meta={m[sel.channelId]} canRead={access.ok} onClose={() => setSelected(null)} />}
          {watch.items.length > 0 && !sel && <p className="small muted">{t('seo.comp.pick')}</p>}
          {watch.items.length > 0 && (
            <Notice>
              <p>{alertsOn ? t('seo.comp.alertsHow', { n: f.int(watch.items.length * 8) }) : t('seo.comp.alertsOff')}</p>
              <p className="small muted">{t('jobs.browserOpen')}</p>
            </Notice>
          )}
        </>
      )}
      {tab === 'leaderboard' && <Leaderboard canRead={access.ok} />}
      {tab === 'compare' && <Scorecard items={watch.items} meta={m} />}
    </div>
  );
}
