// Channelytics: the expandable section of the channel strip. Lifetime and last-30-day figures, a compare chart,
// the channel's keywords with Copy, and the channel ID. Loaded on first open (about 3 units, cached for hours).
import { useMemo, useState } from 'react';
import { Icon } from '../../../components/icons';
import { IconButton } from '../../../components/ui';
import { growthFromSnapshots, keywordsText, median, uploadsSince, UPLOADS_DEFAULT, uploadsCost, viewsByPublishDate } from '../../../domain/channelInsights';
import type { ChannelInfo } from '../../../integrations/youtube/api';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/en';
import { InError, useAsync, useStored, type Status } from '../../common';
import { CopyButton, CostNote, useCiFmt } from './bits';
import { TimeChart, type TimePoint } from './charts';
import { loadChannel, loadHistory, loadOwnDaily, loadUploads } from './data';

type Metric = 'daily' | 'perUpload' | 'snapViews' | 'snapSubs';
const METRIC_KEY: Record<Metric, MessageKey> = { daily: 'ci.cmp.daily', perUpload: 'ci.cmp.perUpload', snapViews: 'ci.cmp.snapViews', snapSubs: 'ci.cmp.snapSubs' };

export function Channelytics({ channel, own, status, onClose }: { channel: ChannelInfo; own: boolean; status: Status | undefined; onClose: () => void }) {
  const { t } = useI18n();
  const f = useCiFmt();
  const id = channel.id;
  const cd = useAsync(`ci:ch:${id}`, () => loadChannel({ id }));
  const ups = useAsync(`ci:up:${id}:${UPLOADS_DEFAULT}`, () => loadUploads(id, UPLOADS_DEFAULT));
  const hist = useAsync(cd.data ? `ci:h:${id}:${cd.data.fetchedAt}` : null, () => loadHistory(id));
  const daily = useAsync(own ? `ci:od:${id}` : null, () => loadOwnDaily(id));
  const youId = !own ? (status?.activeChannelId ?? status?.channels[0]?.channelId) : undefined;
  const [metricRaw, setMetric] = useStored<Metric>(`ci.metric.${own ? 'own' : 'other'}`, own ? 'daily' : 'perUpload');
  const metric: Metric = !own && metricRaw === 'daily' ? 'perUpload' : metricRaw;
  const youUps = useAsync(youId && metric === 'perUpload' ? `ci:up:${youId}:${UPLOADS_DEFAULT}` : null, () => loadUploads(youId!, UPLOADS_DEFAULT));
  const now = useMemo(() => Date.now(), []);

  const growth = hist.data ? growthFromSnapshots(hist.data) : undefined;
  const last30 = ups.data ? uploadsSince(ups.data, 30, now, channel.videoCount) : undefined;
  const dailyViews = daily.data?.rows.length ? daily.data.rows.reduce((n, r) => n + r.views, 0) : undefined;

  // ---- last-30-days views: Analytics for the owner's channel, else TubeX snapshots, else an honest sentence.
  let views30: { value: string; note: string } = { value: '—', note: t('ci.cl.views30None') };
  if (own && dailyViews !== undefined) views30 = { value: f.compact(dailyViews), note: t('ci.cl.views30Analytics') };
  else if (own && daily.loading) views30 = { value: '…', note: '' };
  else if (growth?.state === 'ok' && growth.views) {
    const n = Math.max(1, Math.round(growth.spanDays));
    views30 = { value: `${growth.views.delta >= 0 ? '+' : ''}${f.compact(growth.views.delta)}`, note: n >= 30 ? t('ci.cl.views30Snap') : t('ci.cl.viewsOverDays', { n }) };
  } else if (growth?.state === 'tracking') views30 = { value: '—', note: t('ci.growth.trackingSince', { date: f.sdate(growth.since) }) };

  // ---- compare chart data
  const series: { points: TimePoint[]; mode: 'line' | 'dots'; zero: boolean; note: string } | null = (() => {
    if (metric === 'daily') {
      const rows = daily.data?.rows ?? [];
      if (!rows.length) return null;
      return { points: rows.map((r) => ({ t: Date.parse(`${r.day}T12:00:00`), y: r.views })), mode: 'line', zero: true, note: t('ci.cmp.dailyNote') };
    }
    if (metric === 'perUpload') {
      const pts = viewsByPublishDate(ups.data ?? []);
      if (!pts.length) return null;
      return { points: pts.map((p) => ({ t: p.t, y: p.views, label: p.title })), mode: 'dots', zero: true, note: t('ci.cmp.perUploadNote', { n: pts.length }) };
    }
    const pts = (hist.data ?? []).filter((p) => (metric === 'snapViews' ? p.views : p.subscribers) !== undefined);
    if (pts.length < 2) return null;
    return { points: pts.map((p) => ({ t: Date.parse(p.at), y: (metric === 'snapViews' ? p.views : p.subscribers)! })), mode: 'line', zero: false, note: t('ci.cmp.snapNote', { n: pts.length }) };
  })();
  const youMedian = metric === 'perUpload' && youUps.data ? median(youUps.data.map((v) => v.views)) : undefined;
  const refLine = youMedian !== undefined ? { y: youMedian, label: t('ci.cmp.youMedian', { v: f.compact(youMedian) }) } : undefined;
  const loadingChart = (metric === 'daily' && daily.loading) || (metric === 'perUpload' && ups.loading) || (metric.startsWith('snap') && hist.loading);
  const chartError = metric === 'daily' ? daily.error : metric === 'perUpload' ? ups.error : hist.error;

  const metrics: Metric[] = own ? ['daily', 'perUpload', 'snapViews', 'snapSubs'] : ['perUpload', 'snapViews', 'snapSubs'];
  const kws = cd.data?.keywords ?? [];

  return (
    <div className="ci-cl" role="region" aria-label={t('ci.cl.title')}>
      <div className="ci-cl-head">
        <span className="ci-sec-icon" aria-hidden="true">
          <Icon name="chart" />
        </span>
        <h3 className="grow">{t('ci.cl.title')}</h3>
        <IconButton icon="x" label={t('ci.close')} onClick={onClose} />
      </div>

      <div className="ci-cl-body">
        <div className="ci-grid" role="table" aria-label={t('ci.cl.figures')}>
          <div className="ci-grid-row" role="row">
            <div className="ci-grid-h" role="rowheader">
              {t('ci.cl.lifetime')}
            </div>
            <div className="ci-grid-c" role="cell">
              <span>{t('inpage.s.totalViews')}</span>
              <b className="num-t">{f.compact(channel.views)}</b>
            </div>
            <div className="ci-grid-c" role="cell">
              <span>{t('inpage.s.videos')}</span>
              <b className="num-t">{f.int(channel.videoCount)}</b>
            </div>
          </div>
          <div className="ci-grid-row" role="row">
            <div className="ci-grid-h" role="rowheader">
              {t('ci.cl.last30')}
            </div>
            <div className="ci-grid-c" role="cell" title={views30.note}>
              <span>{t('inpage.s.totalViews')}</span>
              <b className="num-t">{views30.value}</b>
              {views30.note && <small>{views30.note}</small>}
            </div>
            <div className="ci-grid-c" role="cell">
              <span>{t('inpage.s.videos')}</span>
              <b className="num-t">{last30 ? (last30.complete ? f.int(last30.count) : t('ci.cl.atLeast', { n: last30.count })) : ups.loading ? '…' : '—'}</b>
              <small>{t('ci.cl.videos30Note')}</small>
            </div>
          </div>
        </div>

        <div className="ci-cmp">
          <div className="ci-cmp-head">
            <Icon name="trend" />
            <span className="grow small">
              <b>{t('ci.cmp.title')}</b>
            </span>
            <select className="input tx-select ci-select" value={metric} aria-label={t('ci.cmp.metric')} onChange={(e) => setMetric(e.target.value as Metric)}>
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {t(METRIC_KEY[m])}
                </option>
              ))}
            </select>
          </div>
          {loadingChart && <div className="skel ci-chart-skel" aria-busy="true" />}
          {!loadingChart && chartError !== undefined && <InError error={chartError} />}
          {!loadingChart && chartError === undefined && series && <TimeChart points={series.points} mode={series.mode} label={t(METRIC_KEY[metric])} refLine={refLine} zeroBase={series.zero} />}
          {!loadingChart && chartError === undefined && !series && (
            <p className="small muted ci-empty-line">
              {metric.startsWith('snap')
                ? hist.data?.[0]
                  ? t('ci.cmp.needTwo', { date: f.sdate(hist.data[0].at) })
                  : t('ci.cl.views30None')
                : t('ci.cmp.noData')}
            </p>
          )}
          {series && <p className="xsmall muted">{series.note}</p>}
          {own && metric !== 'daily' && <p className="xsmall faint">{t('ci.cmp.ownHint')}</p>}
        </div>
      </div>

      <div className="ci-kw">
        <div className="ci-kw-head">
          <b className="small">{t('ci.kw.title')}</b>
          {kws.length > 0 && <span className="xsmall faint num-t">{f.int(kws.length)}</span>}
          <span className="grow" />
          {kws.length > 0 && <CopyButton text={keywordsText(kws)} label={t('ci.kw.copy')} done={t('ci.kw.copied', { n: kws.length })} />}
        </div>
        {cd.loading && !cd.data && <span className="skel tx-skel-line" aria-busy="true" />}
        {cd.error !== undefined && <InError error={cd.error} onRetry={cd.reload} />}
        {cd.data && !kws.length && <p className="small muted">{t('ci.kw.none')}</p>}
        {kws.length > 0 && (
          <ul className="chips ci-kw-list">
            {kws.map((k) => (
              <li key={k}>
                <span className="ci-kw-chip">
                  <bdi>{k}</bdi>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ci-cl-foot">
        <span className="small muted">{t('ci.channelId')}</span>
        <code className="ci-id" dir="ltr">
          {id}
        </code>
        <CopyButton text={id} label={t('ci.copy')} done={t('ci.idCopied')} />
        <span className="grow" />
        <CostNote units={1 + uploadsCost(UPLOADS_DEFAULT)}>{t('ci.cl.costWhy')}</CostNote>
      </div>
      <p className="xsmall faint">{t('ci.cl.footnote')}</p>
    </div>
  );
}
