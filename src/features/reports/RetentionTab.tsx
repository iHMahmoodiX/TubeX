// Retention Analyzer: audience retention of one video (YouTube Analytics, elapsedVideoTimeRatio), its biggest
// drops with links to that moment, and an optional second video overlaid for comparison.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { Button, Empty, Notice, SearchInput } from '../../components/ui';
import { firstValue, isoDay } from '../../domain/reports';
import { biggestDrops, meanRelative, mmss, relativeLabel, retentionPoints, watchUrl, type RetentionPoint } from '../../domain/reportsRetention';
import { matchesQuery } from '../../domain/text';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { report } from '../../integrations/google/own';
import { ReportError } from './errors';
import { useAsync, useFormat } from '../research/shared';
import type { RVideo } from './data';
import { RetentionChart } from './RetentionChart';
import { StatSkeleton, VideoTrack } from './shared';

interface Retention {
  points: RetentionPoint[];
  views: number | null;
  avgPercent: number | null;
  avgDuration: number | null;
}

async function loadRetention(channelId: string, v: RVideo, fresh: boolean): Promise<Retention> {
  const range = { startDate: v.publishedAt.slice(0, 10) || '2005-04-23', endDate: isoDay(Date.now()) };
  const [curve, sum] = await Promise.all([
    report(channelId, { ...range, metrics: 'audienceWatchRatio,relativeRetentionPerformance', dimensions: 'elapsedVideoTimeRatio', filters: `video==${v.id}` }, fresh),
    report(channelId, { ...range, metrics: 'views,averageViewDuration,averageViewPercentage', filters: `video==${v.id}` }, fresh),
  ]);
  return { points: retentionPoints(curve), views: firstValue(sum, 'views'), avgPercent: firstValue(sum, 'averageViewPercentage'), avgDuration: firstValue(sum, 'averageViewDuration') };
}

export function RetentionTab({ channelId, videos }: { channelId: string; videos: RVideo[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const candidates = useMemo(() => videos.filter((v) => v.privacy === 'public' && v.durationSec > 0 && v.live !== 'upcoming'), [videos]);
  const [q, setQ] = useState('');
  const [a, setA] = useState<string | null>(candidates[0]?.id ?? null);
  const [b, setB] = useState<string | null>(null);
  const [picking, setPicking] = useState<'a' | 'b'>('a');
  const va = candidates.find((v) => v.id === a);
  const vb = candidates.find((v) => v.id === b);

  const load = useCallback(
    async (fresh: boolean) => {
      const [ra, rb] = await Promise.all([va ? loadRetention(channelId, va, fresh) : null, vb ? loadRetention(channelId, vb, fresh) : null]);
      return { ra, rb };
    },
    [channelId, va, vb],
  );
  const { data, error, loading, run } = useAsync(load);
  useEffect(() => {
    if (va) void run(false);
  }, [run, va]);

  if (!candidates.length) return <Empty icon="video" title={t('reports.noVideosTitle')}>{t('reports.retention.noPublic')}</Empty>;
  const list = candidates.filter((v) => matchesQuery(v.title, q)).slice(0, 100);
  const ra = data?.ra;
  const rb = data?.rb;
  const drops = ra && va ? biggestDrops(ra.points, va.durationSec) : [];

  return (
    <div className="split">
      <aside className="stack" aria-label={t('reports.retention.pick')}>
        <div className="chips" role="group" aria-label={t('reports.retention.pickMode')}>
          <button type="button" className="chip" aria-pressed={picking === 'a'} onClick={() => setPicking('a')}>
            {t('reports.retention.pickMain')}
          </button>
          <button type="button" className="chip" aria-pressed={picking === 'b'} onClick={() => setPicking('b')}>
            {t('reports.retention.pickCompare')}
          </button>
        </div>
        <SearchInput value={q} onChange={setQ} label={t('reports.searchVideos')} placeholder={t('reports.searchVideos')} />
        <div className="tracks rp-picker">
          {list.map((v) => (
            <VideoTrack
              key={v.id}
              videoId={v.id}
              thumbnail={v.thumbnail}
              title={v.title}
              sub={`${f.duration(v.durationSec)} · ${f.compact(v.views)} ${t('reports.viewsShort')}`}
              selected={v.id === a || v.id === b}
              onSelect={() => {
                if (picking === 'a') {
                  setA(v.id);
                  if (b === v.id) setB(null);
                } else setB(v.id === a ? null : v.id);
              }}
              end={v.id === a ? <span className="badge badge-accent">A</span> : v.id === b ? <span className="badge">B</span> : undefined}
            />
          ))}
          {!list.length && <p className="small muted">{t('reports.noMatch')}</p>}
        </div>
      </aside>

      <div className="stack-l" style={{ minWidth: 0 }}>
        <ReportError error={error} what="retention" />
        {va && (
          <div className="row-between">
            <div className="row-nowrap" style={{ minWidth: 0 }}>
              <span className="badge badge-accent">A</span>
              <h2 className="truncate">
                <bdi>{va.title}</bdi>
              </h2>
            </div>
            {vb && (
              <Button size="s" variant="ghost" onClick={() => setB(null)}>
                <Icon name="x" />
                {t('reports.retention.clearCompare')}
              </Button>
            )}
          </div>
        )}
        {loading ? (
          <StatSkeleton n={3} />
        ) : ra && va ? (
          ra.points.length === 0 ? (
            <Empty icon="chart" title={t('reports.retention.noDataTitle')}>
              {t('reports.retention.noData')}
            </Empty>
          ) : (
            <>
              <div className="stats rp-stats">
                <Summary r={ra} label="A" />
                {rb && vb && <Summary r={rb} label="B" />}
              </div>
              <div className="card">
                <div className="rp-chart-legend">
                  <span>
                    <i /> <bdi className="truncate" style={{ maxWidth: 260 }}>A · {va.title}</bdi>
                  </span>
                  {vb && rb && rb.points.length > 0 && (
                    <span>
                      <i className="s1" /> <bdi className="truncate" style={{ maxWidth: 260 }}>B · {vb.title}</bdi>
                    </span>
                  )}
                </div>
                <RetentionChart
                  series={[{ points: ra.points, name: 'A' }, ...(rb && rb.points.length ? [{ points: rb.points, name: 'B' }] : [])]}
                  durationSec={va.durationSec}
                  drops={drops}
                  label={t('reports.retention.chartLabel', { title: va.title })}
                  timeAxis={!rb}
                />
                {rb && <p className="xsmall faint">{t('reports.retention.compareAxis')}</p>}
                {vb && rb && rb.points.length === 0 && <Notice>{t('reports.retention.compareNoData')}</Notice>}
              </div>
              <section className="stack" aria-labelledby="drops-h">
                <h3 id="drops-h">{t('reports.retention.drops')}</h3>
                {drops.length ? (
                  <ol className="rp-drops">
                    {drops.map((d, i) => (
                      <li key={i}>
                        <span className="xsmall muted">{t('reports.retention.dropN', { n: i + 1 })}</span>
                        <b className="ltr">{mmss(d.seconds)}</b>
                        <span className="small">{t('reports.retention.dropText', { pct: f.pct(d.drop), from: f.pct(d.from), to: f.pct(d.to) })}</span>
                        <a className="btn btn-s" href={watchUrl(va.id, Math.max(0, d.seconds - 3))} target="_blank" rel="noreferrer noopener" style={{ alignSelf: 'flex-start' }}>
                          <Icon name="play" />
                          {t('reports.retention.watchMoment')}
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="small muted">{t('reports.retention.noDrops')}</p>
                )}
                <p className="xsmall faint">{t('reports.retention.dropsHelp')}</p>
              </section>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}

function Summary({ r, label }: { r: Retention; label: string }) {
  const { t } = useI18n();
  const f = useFormat();
  const rel = relativeLabel(meanRelative(r.points));
  return (
    <>
      <div className="stat">
        <span>
          {label} · {t('mc.avgPercent')}
        </span>
        <b>{r.avgPercent === null ? '—' : f.pct(r.avgPercent / 100)}</b>
        <small className="faint">{r.avgDuration === null ? '—' : `${t('mc.avgDuration')}: ${f.duration(Math.round(r.avgDuration))}`}</small>
      </div>
      <div className="stat">
        <span>
          {label} · {t('reports.retention.relative')}
        </span>
        <b style={{ fontSize: 20 }}>{rel ? t(`reports.retention.rel.${rel}` as MessageKey) : '—'}</b>
        <small className={rel === 'above' ? 'pos' : rel === 'below' ? 'neg' : 'faint'}>{t('reports.retention.relativeHelp')}</small>
      </div>
      <div className="stat">
        <span>
          {label} · {t('yt.col.views')}
        </span>
        <b>{f.compact(r.views ?? undefined)}</b>
        <small className="faint">{t('reports.retention.lifetime')}</small>
      </div>
    </>
  );
}
