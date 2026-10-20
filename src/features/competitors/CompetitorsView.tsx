// Watchlist of public channels: live counts, recent uploads and new-upload badges.
import { useCallback, useState } from 'react';
import type { WatchedChannel } from '../../domain/models';
import { median, newUploads, viewsPerDay } from '../../domain/research';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Field } from '../../components/ui';
import { useI18n } from '../../i18n';
import { channelUploads, getChannel, type ChannelInfo, type VideoInfo } from '../../integrations/youtube/api';
import { YtError } from '../../integrations/youtube/client';
import { remove, save } from '../../storage/db';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { Stat, useFormat, VideoTable } from '../research/shared';
import { addWatched, markSeen, parseChannelInput } from './watchActions';
import { ExportUploads } from '../insights/PageInsights';

interface Live {
  channel?: ChannelInfo | null;
  uploads?: VideoInfo[];
  error?: unknown;
  loading?: boolean;
}

function WatchedCard({ w, live, onRefresh }: { w: WatchedChannel; live?: Live; onRefresh: (fresh: boolean) => void }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [notes, setNotes] = useState(w.notes);
  const c = live?.channel;
  const fresh = live?.uploads ? newUploads(live.uploads.map((v) => v.id), w.seenVideoIds, !w.lastCheckedAt) : [];
  const medianPerDay = live?.uploads ? median(live.uploads.map((v) => viewsPerDay(v)).filter((x): x is number => x !== undefined)) : undefined;
  return (
    <section className="card stack-s" aria-label={w.title} data-testid="watched-card">
      <div className="row-between">
        <h2 dir="auto">
          <a href={`https://www.youtube.com/channel/${w.channelId}`} target="_blank" rel="noreferrer noopener">
            {w.title}
          </a>{' '}
          <span className="small muted ltr">{w.handle}</span>
          {fresh.length > 0 && <span className="badge badge-accent" style={{ marginInlineStart: 6 }}>{t('comp.newCount', { n: fresh.length })}</span>}
        </h2>
        <div className="row">
          <Button size="s" disabled={live?.loading} onClick={() => onRefresh(true)}>
            {live?.loading ? t('common.loading') : t('comp.refresh')}
          </Button>
          {fresh.length > 0 && (
            <Button size="s" variant="ghost" onClick={() => void markSeen(w.id, live!.uploads!.map((v) => v.id))}>
              {t('comp.markSeen')}
            </Button>
          )}
          {c?.uploadsPlaylistId && <ExportUploads playlistId={c.uploadsPlaylistId} name={w.handle || w.title} count={c.videoCount} />}
          <ConfirmButton size="s" label={t('common.delete')} question={t('comp.removeConfirm', { name: w.title })} confirmLabel={t('common.delete')} onConfirm={() => void remove('watchlist', w.id)} />
        </div>
      </div>
      {w.lastCheckedAt && <p className="small muted">{t('comp.lastChecked', { date: formatDate(w.lastCheckedAt) })}</p>}
      <ErrorNotice error={live?.error} />
      {c && (
        <div className="stats">
          <Stat label={t('yt.subscribers')} value={c.subscribers === undefined ? t('yt.hidden') : f.compact(c.subscribers)} />
          <Stat label={t('yt.col.views')} value={f.compact(c.views)} />
          <Stat label={t('yt.videos')} value={f.int(c.videoCount)} />
          <Stat label={t('comp.medianPerDay')} value={f.compact(medianPerDay)} />
        </div>
      )}
      {live?.uploads && <VideoTable videos={live.uploads} showRank={false} newIds={fresh} />}
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

export function CompetitorsView() {
  const { t } = useI18n();
  const toast = useToast();
  const f = useFormat();
  const { youtube, loaded } = useIntegrations();
  const watch = useCollection('watchlist');
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<unknown>(null);
  const [live, setLive] = useState<Record<string, Live>>({});

  const refresh = useCallback(async (w: WatchedChannel, fresh: boolean) => {
    setLive((all) => ({ ...all, [w.id]: { ...all[w.id], loading: true, error: undefined } }));
    try {
      const ch = (await getChannel({ id: w.channelId }, fresh)).data;
      const uploads = ch?.uploadsPlaylistId ? (await channelUploads(ch.uploadsPlaylistId, 12, fresh)).data : [];
      setLive((all) => ({ ...all, [w.id]: { channel: ch, uploads, loading: false } }));
      // The first check records what exists so later checks can show what is new.
      if (!w.lastCheckedAt) await markSeen(w.id, uploads.map((v) => v.id));
    } catch (error) {
      setLive((all) => ({ ...all, [w.id]: { ...all[w.id], error, loading: false } }));
    }
  }, []);

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
      if (!r.existed) void refresh(r.record, false);
    } catch (e) {
      setAddError(e);
    } finally {
      setAdding(false);
    }
  };

  const rows = watch.items.map((w) => ({ w, c: live[w.id]?.channel }));
  return (
    <section className="stack" aria-labelledby="comp-h">
      <h1 id="comp-h">{t('comp.heading')}</h1>
      <p className="muted">{t('comp.intro')}</p>
      {loaded && !youtube.apiKey && <ErrorNotice error={new YtError('no-key')} />}
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="grow">
          <Field label={t('comp.addLabel')} help={t('comp.addHelp')}>
            {({ id, describedBy }) => (
              <input id={id} aria-describedby={describedBy} className="input ltr" dir="ltr" placeholder="@handle" value={input} onChange={(e) => setInput(e.target.value)} />
            )}
          </Field>
        </div>
        <button type="submit" className="btn btn-primary" disabled={!input.trim() || adding || !youtube.apiKey}>
          {t('comp.add')}
        </button>
      </form>
      <ErrorNotice error={addError} />
      {watch.items.length === 0 && !watch.loading && <Empty>{t('comp.empty')}</Empty>}
      {watch.items.length > 1 && (
        <div className="card stack-s">
          <div className="row-between">
            <h2>{t('comp.compare')}</h2>
            <Button size="s" onClick={() => watch.items.forEach((w) => void refresh(w, false))} disabled={!youtube.apiKey}>
              {t('comp.refreshAll')}
            </Button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('yt.col.channel')}</th>
                  <th className="num">{t('yt.subscribers')}</th>
                  <th className="num">{t('yt.col.views')}</th>
                  <th className="num">{t('yt.videos')}</th>
                  <th className="num">{t('yt.avgViews')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ w, c }) => (
                  <tr key={w.id}>
                    <td dir="auto">{w.title}</td>
                    <td className="num">{c ? (c.subscribers === undefined ? t('yt.hidden') : f.compact(c.subscribers)) : '—'}</td>
                    <td className="num">{f.compact(c?.views)}</td>
                    <td className="num">{f.int(c?.videoCount)}</td>
                    <td className="num">{f.compact(c?.views && c.videoCount ? c.views / c.videoCount : undefined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">{t('comp.compareNote')}</p>
        </div>
      )}
      {watch.items.map((w) => (
        <WatchedCard key={`${w.id}:${w.rev}`} w={w} live={live[w.id]} onRefresh={(fresh) => void refresh(w, fresh)} />
      ))}
    </section>
  );
}
