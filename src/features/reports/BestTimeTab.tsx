// Best Time to Publish: an estimate from the channel's own uploads (first-week views by publish weekday and
// hour, in this browser's time zone) plus channel views by weekday. YouTube does not expose when viewers are
// online, so this page never claims that.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { Empty, Meter, Notice } from '../../components/ui';
import { periods } from '../../domain/reports';
import { bestTime, firstWeekComplete, mapLimit, viewsByWeekday, type Cell } from '../../domain/reportsBestTime';
import { useI18n } from '../../i18n';
import { report } from '../../integrations/google/own';
import { ReportError } from './errors';
import { useAsync, useFormat } from '../research/shared';
import { firstWeekViews, type RVideo } from './data';
import { DirBarChart, EstimateBadge, Section, StatSkeleton } from './shared';

const MAX = 50;

function useWeekdays() {
  const { lang } = useI18n();
  const fmt = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { weekday: 'short', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { weekday: 'long', timeZone: 'UTC' });
  // 2026-10-18 is a Sunday.
  const name = (wd: number) => fmt.format(new Date(Date.UTC(2026, 9, 18 + wd)));
  const longName = (wd: number) => long.format(new Date(Date.UTC(2026, 9, 18 + wd)));
  const order = lang === 'fa' ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  return { name, longName, order };
}

export function BestTimeTab({ channelId, videos }: { channelId: string; videos: RVideo[] }) {
  const { t, lang } = useI18n();
  const f = useFormat();
  const wd = useWeekdays();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [bin, setBin] = useState(3);
  const [progress, setProgress] = useState(0);
  const sample = useMemo(() => videos.filter((v) => v.privacy === 'public' && v.live !== 'upcoming' && firstWeekComplete(v.publishedAt)).slice(0, MAX), [videos]);

  const loadSamples = useCallback(
    async (fresh: boolean) => {
      setProgress(0);
      const views = await mapLimit(sample, 4, (v) => firstWeekViews(channelId, v.id, v.publishedAt, fresh), setProgress);
      return sample.map((v, i) => ({ videoId: v.id, publishedAt: v.publishedAt, views7: views[i] })).filter((s): s is { videoId: string; publishedAt: string; views7: number } => s.views7 !== null);
    },
    [channelId, sample],
  );
  const samples = useAsync(loadSamples);
  const loadDaily = useCallback(async () => report(channelId, { ...periods(364).cur, metrics: 'views', dimensions: 'day', sort: 'day' }), [channelId]);
  const daily = useAsync(loadDaily);
  useEffect(() => {
    void daily.run();
    void samples.run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const result = useMemo(() => (samples.data ? bestTime(samples.data, tz, bin) : null), [samples.data, tz, bin]);
  const byDay = useMemo(() => viewsByWeekday(daily.data), [daily.data]);
  const hours = Array.from({ length: 24 / bin }, (_, i) => i * bin);
  const hourLabel = (h: number) => (bin === 1 ? `${h}` : `${h}–${h + bin}`);
  const range = (c: Cell) => `${String(c.hour).padStart(2, '0')}:00–${String((c.hour + bin) % 24).padStart(2, '0')}:00`;
  const maxMedian = Math.max(1, ...(result?.cells.map((c) => c.median) ?? [1]));

  if (!videos.some((v) => v.privacy === 'public')) return <Empty icon="video" title={t('reports.noVideosTitle')}>{t('reports.retention.noPublic')}</Empty>;

  return (
    <div className="stack-l">
      <Notice tone="warning">
        <p className="row">
          <EstimateBadge k="reports.besttime.badge" />
          <span>{t('reports.besttime.honest', { tz })}</span>
        </p>
      </Notice>
      <ReportError error={samples.error} what="besttime" />

      {samples.loading && (
        <div className="rp-progress" aria-live="polite">
          <span className="small muted">{t('reports.besttime.progress', { done: f.int(progress), total: f.int(sample.length) })}</span>
          <Meter value={sample.length ? (progress / sample.length) * 100 : 0} label={t('reports.besttime.progressLabel')} />
        </div>
      )}

      {result && result.samples < 5 && !samples.loading && (
        <Notice>
          <p>{t('reports.besttime.few', { n: f.int(result.samples) })}</p>
        </Notice>
      )}

      {result && result.top.length > 0 && (
        <Section title={t('reports.besttime.top')} sub={t('reports.besttime.topSub', { n: f.int(result.samples) })} id="bt-top">
          <div className="rp-grid-3">
            {result.top.map((c, i) => (
              <div key={`${c.weekday}-${c.hour}`} className="rp-slot">
                <span className="rp-slot-rank">{f.int(i + 1)}</span>
                <div className="stack-s" style={{ gap: 0 }}>
                  <b>
                    {wd.longName(c.weekday)} <span className="ltr">{range(c)}</span>
                  </b>
                  <span className="small muted">{t('reports.besttime.slotStats', { median: f.compact(c.median), n: f.int(c.n) })}</span>
                  {result.overall !== null && result.overall > 0 && (
                    <span className={`xsmall ${c.median >= result.overall ? 'pos' : 'neg'}`}>{t('reports.besttime.vsOverall', { x: (c.median / result.overall).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: 1 }) })}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {result && (
        <Section
          title={t('reports.besttime.heatmap')}
          sub={t('reports.besttime.heatmapSub')}
          id="bt-heat"
          action={
            <div className="chips" role="group" aria-label={t('reports.besttime.bin')}>
              {[1, 3].map((b) => (
                <button key={b} type="button" className="chip" aria-pressed={bin === b} onClick={() => setBin(b)}>
                  {t('reports.besttime.binN', { n: f.int(b) })}
                </button>
              ))}
            </div>
          }
        >
          <div className="card">
            <div className="rp-heat-wrap">
              <div className="rp-heat" style={{ ['--cols' as string]: hours.length }} role="table" aria-label={t('reports.besttime.heatmap')}>
                <div role="row" style={{ display: 'contents' }}>
                  <span role="columnheader" />
                  {hours.map((h) => (
                    <span key={h} role="columnheader" className="h ltr">
                      {hourLabel(h)}
                    </span>
                  ))}
                </div>
                {wd.order.map((d) => (
                  <div key={d} role="row" style={{ display: 'contents' }}>
                    <span role="rowheader" className="d">
                      {wd.name(d)}
                    </span>
                    {hours.map((h) => {
                      const c = result.cells.find((x) => x.weekday === d && x.hour === h);
                      const isTop = !!c && result.top.some((x) => x.weekday === d && x.hour === h);
                      const a = c ? 0.15 + 0.85 * (c.median / maxMedian) : 0;
                      return (
                        <span
                          key={h}
                          role="cell"
                          className="c"
                          data-n={c ? c.n : undefined}
                          data-top={isTop ? 'true' : undefined}
                          data-low={c && a < 0.5 ? 'true' : undefined}
                          style={c ? { ['--a' as string]: a } : undefined}
                          title={c ? `${wd.longName(d)} ${range(c)} · ${t('reports.besttime.slotStats', { median: f.compact(c.median), n: f.int(c.n) })}` : `${wd.longName(d)} · ${t('reports.besttime.noUploads')}`}
                          aria-label={c ? `${wd.longName(d)} ${range(c)}: ${t('reports.besttime.slotStats', { median: f.compact(c.median), n: f.int(c.n) })}` : undefined}
                        >
                          {c ? f.compact(c.median) : ''}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="row-between">
              <span className="rp-legend">
                {t('reports.besttime.legendLow')} <i /> {t('reports.besttime.legendHigh')}
              </span>
              <span className="xsmall faint">{t('reports.besttime.empty')}</span>
            </div>
          </div>
        </Section>
      )}

      {samples.loading && !result && <StatSkeleton n={3} />}

      <div className="rp-grid-2">
        {result && (
          <div className="card">
            <h3>{t('reports.besttime.byWeekday')}</h3>
            <p className="small muted">{t('reports.besttime.byWeekdaySub')}</p>
            <DirBarChart
              values={wd.order.map((d) => result.byWeekday[d]!.median)}
              labels={wd.order.map((d) => `${wd.longName(d)} (${f.int(result.byWeekday[d]!.n)})`)}
              label={t('reports.besttime.byWeekday')}
            />
            <WeekdayAxis order={wd.order} name={wd.name} />
          </div>
        )}
        <div className="card">
          <h3>{t('reports.besttime.channelDays')}</h3>
          <p className="small muted">{t('reports.besttime.channelDaysSub')}</p>
          <ReportError error={daily.error} what="besttime" />
          {daily.data ? (
            byDay.some((d) => d.mean !== null) ? (
              <>
                <DirBarChart values={wd.order.map((d) => byDay[d]!.mean)} labels={wd.order.map((d) => wd.longName(d))} label={t('reports.besttime.channelDays')} />
                <WeekdayAxis order={wd.order} name={wd.name} />
              </>
            ) : (
              <p className="small muted">{t('mc.noData')}</p>
            )
          ) : (
            daily.loading && <StatSkeleton n={1} />
          )}
        </div>
      </div>

      <p className="xsmall faint">
        <Icon name="info" /> {t('reports.besttime.method', { n: f.int(MAX) })}
      </p>
    </div>
  );
}

function WeekdayAxis({ order, name }: { order: number[]; name: (d: number) => string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${order.length}, 1fr)`, textAlign: 'center' }} className="xsmall muted" aria-hidden="true">
      {order.map((d) => (
        <span key={d}>{name(d)}</span>
      ))}
    </div>
  );
}
