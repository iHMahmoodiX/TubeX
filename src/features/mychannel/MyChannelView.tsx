// The signed-in channel: YouTube Analytics for a period, top videos, traffic sources, YouTube search terms,
// countries, and every upload with a metadata audit. Read-only.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { checkDraft } from '../../domain/metadata';
import { newBase } from '../../domain/models';
import { useToast } from '../../components/toasts';
import { Button, Empty, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { setActiveChannel } from '../../integrations/google/auth';
import { ownVideos, report, type OwnVideo, type Report } from '../../integrations/google/own';
import { downloadText, fileSlug } from '../../platform/files';
import { openWorkspace } from '../../platform/navigation';
import { create } from '../../storage/db';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle } from '../connections/useConnections';
import { Stat, useAsync, useFormat, videosCsv } from '../research/shared';

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const TRAFFIC: Record<string, MessageKey> = {
  YT_SEARCH: 'mc.src.YT_SEARCH',
  SUBSCRIBER: 'mc.src.SUBSCRIBER',
  RELATED_VIDEO: 'mc.src.RELATED_VIDEO',
  EXT_URL: 'mc.src.EXT_URL',
  NO_LINK_OTHER: 'mc.src.NO_LINK_OTHER',
  PLAYLIST: 'mc.src.PLAYLIST',
  NOTIFICATION: 'mc.src.NOTIFICATION',
  SHORTS: 'mc.src.SHORTS',
  YT_CHANNEL: 'mc.src.YT_CHANNEL',
  YT_OTHER_PAGE: 'mc.src.YT_OTHER_PAGE',
  END_SCREEN: 'mc.src.END_SCREEN',
  ADVERTISING: 'mc.src.ADVERTISING',
  HASHTAGS: 'mc.src.HASHTAGS',
};

function col(r: Report | undefined, name: string): number {
  const i = r?.columns.indexOf(name) ?? -1;
  return i < 0 || !r?.rows[0] ? NaN : Number(r.rows[0][i]);
}

function Bars({ rows, label }: { rows: (string | number)[][]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[1])));
  const w = 100 / Math.max(1, rows.length);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label} style={{ width: '100%', height: 120, display: 'block' }}>
      {rows.map((r, i) => {
        const h = (Number(r[1]) / max) * 28;
        return (
          <rect key={String(r[0])} x={i * w + w * 0.1} y={30 - h} width={w * 0.8} height={h} fill="var(--accent)">
            <title>{`${r[0]}: ${r[1]}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i ? 'num' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j ? 'num' : undefined} dir={j ? undefined : 'auto'}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Analytics({ channelId, videos }: { channelId: string; videos: OwnVideo[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const [days, setDays] = useState(28);
  const load = useCallback(
    async (n: number, fresh: boolean) => {
      const range = { startDate: day(n), endDate: day(0) };
      const [totals, daily, top, traffic, terms, countries] = await Promise.all([
        report(channelId, { ...range, metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares' }, fresh),
        report(channelId, { ...range, metrics: 'views', dimensions: 'day', sort: 'day' }, fresh),
        report(channelId, { ...range, metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained', dimensions: 'video', sort: '-views', maxResults: 15 }, fresh),
        report(channelId, { ...range, metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views' }, fresh),
        report(channelId, { ...range, metrics: 'views', dimensions: 'insightTrafficSourceDetail', filters: 'insightTrafficSourceType==YT_SEARCH', sort: '-views', maxResults: 25 }, fresh),
        report(channelId, { ...range, metrics: 'views', dimensions: 'country', sort: '-views', maxResults: 10 }, fresh),
      ]);
      return { totals, daily, top, traffic, terms, countries };
    },
    [channelId],
  );
  const { data, error, loading, run } = useAsync(load);
  useEffect(() => {
    void run(days, false);
  }, [run, days]);
  const title = (id: string) => videos.find((v) => v.id === id)?.title ?? id;
  const tot = data?.totals;
  return (
    <section className="stack" aria-labelledby="an-h">
      <div className="row-between">
        <h2 id="an-h">{t('mc.analytics')}</h2>
        <div className="row">
          <select className="select" style={{ width: 'auto' }} aria-label={t('research.period')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 28, 90, 365].map((n) => (
              <option key={n} value={n}>
                {t('mc.lastDays', { n: f.int(n) })}
              </option>
            ))}
          </select>
          <Button size="s" variant="ghost" disabled={loading} onClick={() => void run(days, true)}>
            {loading ? t('common.loading') : t('research.refresh')}
          </Button>
        </div>
      </div>
      <ErrorNotice error={error} />
      {tot && (
        <div className="stats" data-testid="mc-totals">
          <Stat label={t('yt.col.views')} value={f.compact(col(tot, 'views'))} />
          <Stat label={t('mc.watchHours')} value={f.compact(col(tot, 'estimatedMinutesWatched') / 60)} />
          <Stat label={t('mc.avgDuration')} value={Number.isNaN(col(tot, 'averageViewDuration')) ? '—' : f.duration(Math.round(col(tot, 'averageViewDuration')))} />
          <Stat label={t('mc.avgPercent')} value={f.pct(col(tot, 'averageViewPercentage') / 100)} />
          <Stat label={t('mc.subsNet')} value={f.int(col(tot, 'subscribersGained') - col(tot, 'subscribersLost'))} />
          <Stat label={t('yt.likes')} value={f.compact(col(tot, 'likes'))} />
          <Stat label={t('yt.comments')} value={f.compact(col(tot, 'comments'))} />
          <Stat label={t('mc.shares')} value={f.compact(col(tot, 'shares'))} />
        </div>
      )}
      {data && (
        <>
          <div className="card stack-s">
            <h3>{t('mc.dailyViews')}</h3>
            {data.daily.rows.length ? <Bars rows={data.daily.rows} label={t('mc.dailyViews')} /> : <p className="small muted">{t('mc.noData')}</p>}
          </div>
          <div className="editor-grid">
            <div className="card stack-s">
              <h3>{t('mc.searchTerms')}</h3>
              <p className="small muted">{t('mc.searchTermsHelp')}</p>
              {data.terms.rows.length ? (
                <Table head={[t('research.keyword'), t('yt.col.views')]} rows={data.terms.rows.map((r) => [String(r[0]), f.int(Number(r[1]))])} />
              ) : (
                <p className="small muted">{t('mc.noData')}</p>
              )}
            </div>
            <div className="stack">
              <div className="card stack-s">
                <h3>{t('mc.traffic')}</h3>
                <Table
                  head={[t('mc.source'), t('yt.col.views')]}
                  rows={data.traffic.rows.map((r) => [TRAFFIC[String(r[0])] ? t(TRAFFIC[String(r[0])]!) : String(r[0]), f.int(Number(r[1]))])}
                />
              </div>
              <div className="card stack-s">
                <h3>{t('mc.countries')}</h3>
                <Table head={[t('mc.country'), t('yt.col.views')]} rows={data.countries.rows.map((r) => [String(r[0]), f.int(Number(r[1]))])} />
              </div>
            </div>
          </div>
          <div className="card stack-s">
            <h3>{t('mc.topVideos')}</h3>
            <Table
              head={[t('yt.col.title'), t('yt.col.views'), t('mc.watchHours'), t('mc.avgPercent'), t('yt.subscribers')]}
              rows={data.top.rows.map((r) => [title(String(r[0])), f.int(Number(r[1])), f.int(Number(r[2]) / 60), f.pct(Number(r[3]) / 100), f.int(Number(r[4]))])}
            />
          </div>
          <p className="small muted">{t('mc.analyticsNote')}</p>
        </>
      )}
    </section>
  );
}

function Videos({ videos, channelName }: { videos: OwnVideo[]; channelName: string }) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [onlyIssues, setOnlyIssues] = useState(false);
  const audited = useMemo(
    () =>
      videos.map((v) => {
        const checks = checkDraft({ title: v.title, description: v.description, tags: v.tags, focusKeyword: '' }).filter((c) => c.severity !== 'info');
        return { v, checks };
      }),
    [videos],
  );
  const shown = onlyIssues ? audited.filter((a) => a.checks.length) : audited;
  const toDraft = async (v: OwnVideo) => {
    const d = await create('drafts', {
      ...newBase(),
      language: /[؀-ۿ]/.test(v.title) ? 'fa' : 'en',
      focusKeyword: '',
      title: v.title,
      description: v.description,
      tags: v.tags,
      source: { kind: 'watch', url: `https://www.youtube.com/watch?v=${v.id}`, videoId: v.id, title: v.title, capturedAt: new Date().toISOString(), origin: 'url' },
    });
    toast(t('mc.draftCreated'), { label: t('common.open'), run: () => void openWorkspace('drafts', d.id) });
  };
  return (
    <section className="stack" aria-labelledby="vid-h">
      <div className="row-between">
        <h2 id="vid-h">{t('mc.videos', { n: f.int(videos.length) })}</h2>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
            <span>{t('mc.onlyIssues')}</span>
          </label>
          <Button size="s" variant="ghost" onClick={() => downloadText(`tubex-my-videos-${fileSlug(channelName, 'channel')}.csv`, videosCsv(videos), 'text/csv;charset=utf-8')}>
            {t('research.exportCsv')}
          </Button>
        </div>
      </div>
      {shown.length === 0 ? (
        <Empty>{t('mc.noVideos')}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('yt.col.title')}</th>
                <th>{t('mc.privacy')}</th>
                <th className="num">{t('yt.col.views')}</th>
                <th className="num">{t('yt.col.age')}</th>
                <th>{t('mc.audit')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ v, checks }) => (
                <tr key={v.id}>
                  <td>
                    <a href={`https://studio.youtube.com/video/${v.id}/edit`} target="_blank" rel="noreferrer noopener" dir="auto">
                      {v.title}
                    </a>
                  </td>
                  <td>{v.privacy ? t(`mc.privacy.${v.privacy}` as MessageKey) : '—'}</td>
                  <td className="num">{f.compact(v.views)}</td>
                  <td className="num">{f.age(v.publishedAt)}</td>
                  <td className="small">{checks.length ? checks.map((c) => t(`checks.${c.id}` as MessageKey, c.values)).join(' · ') : '✓'}</td>
                  <td>
                    <Button size="s" variant="ghost" onClick={() => void toDraft(v)}>
                      {t('mc.toDraft')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function MyChannelView() {
  const { t } = useI18n();
  const g = useGoogle();
  const active = g.channels.find((c) => c.channelId === g.activeChannelId);
  const load = useCallback((fresh: boolean) => (active?.uploadsPlaylistId ? ownVideos(active.channelId, active.uploadsPlaylistId, 500, fresh) : Promise.resolve([])), [active?.channelId, active?.uploadsPlaylistId]);
  const vids = useAsync(load);
  useEffect(() => {
    if (active) void vids.run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.channelId]);

  return (
    <section className="stack" aria-labelledby="mc-h">
      <h1 id="mc-h">{t('mc.heading')}</h1>
      {!g.loaded ? null : !active ? (
        <Notice>
          <p>{t('mc.signInFirst')}</p>
          <div>
            <Button size="s" variant="primary" onClick={() => (location.hash = 'settings')}>
              {t('conn.openSettings')}
            </Button>
          </div>
        </Notice>
      ) : (
        <>
          {g.channels.length > 1 && (
            <Field label={t('mc.channel')}>
              {({ id }) => (
                <select id={id} className="select" style={{ maxWidth: 360 }} value={active.channelId} onChange={(e) => void setActiveChannel(e.target.value)}>
                  {g.channels.map((c) => (
                    <option key={c.channelId} value={c.channelId}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <p className="row">
            {active.thumbnail && <img src={active.thumbnail} alt="" width={32} height={32} style={{ borderRadius: '50%' }} />}
            <strong dir="auto">{active.title}</strong> <span className="small muted ltr">{active.handle}</span>
          </p>
          <Analytics key={active.channelId} channelId={active.channelId} videos={vids.data ?? []} />
          <ErrorNotice error={vids.error} />
          {vids.loading && !vids.data && <p className="muted">{t('common.loading')}</p>}
          {vids.data && <Videos videos={vids.data} channelName={active.handle || active.title} />}
        </>
      )}
    </section>
  );
}
