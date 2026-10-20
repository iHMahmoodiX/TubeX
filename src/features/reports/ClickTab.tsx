// Click Magnet: thumbnail impressions and click-through rate per video (Analytics metrics whose availability
// is Inferred). Flags packaging problems against the channel's own medians. When the API rejects the metrics,
// a clearly labelled fallback ranks by views and retention and never shows anything as CTR.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { Empty, Notice } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { periods } from '../../domain/reports';
import { classifyClicks, clickRows, fallbackRanking, type ClickFlag } from '../../domain/reportsClick';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { AuthError } from '../../integrations/google/auth';
import { report } from '../../integrations/google/own';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useAsync, useFormat } from '../research/shared';
import { AiIdeas } from './AiIdeas';
import { studioUrl, videoToDraft, type RVideo } from './data';
import { PeriodPills, Section, TrackSkeleton, VideoTrack } from './shared';

type Filter = 'all' | 'low-ctr' | 'hidden-gem';

async function load(channelId: string, days: number, fresh: boolean) {
  const range = periods(days).cur;
  try {
    const r = await report(channelId, { ...range, metrics: 'videoThumbnailImpressions,videoThumbnailImpressionsClickRate,views', dimensions: 'video', sort: '-videoThumbnailImpressions', maxResults: 50 }, fresh);
    return { mode: 'ctr' as const, ctr: classifyClicks(clickRows(r)) };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    const r = await report(channelId, { ...range, metrics: 'views,averageViewDuration,averageViewPercentage', dimensions: 'video', sort: '-views', maxResults: 50 }, fresh);
    return { mode: 'fallback' as const, fallback: fallbackRanking(r), reason: e };
  }
}

export function ClickTab({ channelId, videos }: { channelId: string; videos: RVideo[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const [days, setDays] = useState(90);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const fn = useCallback((n: number, fresh: boolean) => load(channelId, n, fresh), [channelId]);
  const { data, error, loading, run } = useAsync(fn);
  useEffect(() => {
    void run(days, false);
  }, [run, days]);
  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);

  const header = (
    <div className="row-between">
      <PeriodPills value={days} onChange={setDays} options={[28, 90, 365]} />
      {data?.mode === 'ctr' && (
        <div className="chips" role="group" aria-label={t('reports.click.filter')}>
          {(['all', 'low-ctr', 'hidden-gem'] as Filter[]).map((x) => (
            <button key={x} type="button" className="chip" aria-pressed={filter === x} onClick={() => setFilter(x)}>
              {t(`reports.click.f.${x}` as MessageKey)}
              {x !== 'all' && <small>{f.int(data.ctr.rows.filter((r) => r.flag === x).length)}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="stack-l">
      {header}
      <ErrorNotice error={error} />
      {loading && !data && <TrackSkeleton rows={6} />}
      {data?.mode === 'ctr' && (
        <>
          <div className="stats rp-stats">
            <div className="stat">
              <span>{t('reports.click.medianImpr')}</span>
              <b>{f.compact(data.ctr.medianImpressions ?? undefined)}</b>
            </div>
            <div className="stat">
              <span>{t('reports.click.medianCtr')}</span>
              <b>{f.pct(data.ctr.medianCtr ?? undefined)}</b>
            </div>
            <div className="stat">
              <span>{t('reports.click.f.low-ctr')}</span>
              <b>{f.int(data.ctr.rows.filter((r) => r.flag === 'low-ctr').length)}</b>
            </div>
            <div className="stat">
              <span>{t('reports.click.f.hidden-gem')}</span>
              <b>{f.int(data.ctr.rows.filter((r) => r.flag === 'hidden-gem').length)}</b>
            </div>
          </div>
          <p className="small muted">{t('reports.click.rules')}</p>
          {(() => {
            const rows = data.ctr.rows.filter((r) => filter === 'all' || r.flag === filter);
            if (!rows.length) return <Empty icon="target" title={t('reports.click.noneTitle')}>{t('reports.click.none')}</Empty>;
            return (
              <div className="tracks">
                {rows.map((r, i) => {
                  const v = byId.get(r.videoId);
                  return (
                    <VideoTrack
                      key={r.videoId}
                      n={i + 1}
                      videoId={r.videoId}
                      thumbnail={v?.thumbnail}
                      title={v?.title ?? r.videoId}
                      sub={r.flag ? <FlagBadge flag={r.flag} /> : v ? f.age(v.publishedAt) : undefined}
                      selected={open === r.videoId}
                      onSelect={() => setOpen(open === r.videoId ? null : r.videoId)}
                      end={
                        <>
                          <span className="rp-num">
                            <small>{t('reports.click.impr')}</small>
                            <b>{f.compact(r.impressions)}</b>
                          </span>
                          <span className="rp-num">
                            <small>{t('reports.click.ctr')}</small>
                            <b className={r.flag === 'low-ctr' ? 'neg' : r.flag === 'hidden-gem' ? 'pos' : undefined}>{f.pct(r.ctr)}</b>
                          </span>
                        </>
                      }
                    >
                      {open === r.videoId && v && <Suggest v={v} flag={r.flag} missed={r.missedClicks} />}
                    </VideoTrack>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}
      {data?.mode === 'fallback' && (
        <>
          <Notice tone="warning">
            <p>{t('reports.click.unavailable')}</p>
            <ErrorDetail e={data.reason} />
          </Notice>
          <Section title={t('reports.click.fallbackTitle')} sub={t('reports.click.fallbackSub')} id="cm-fb">
            {data.fallback.rows.length === 0 ? (
              <Empty icon="chart">{t('mc.noData')}</Empty>
            ) : (
              <div className="tracks">
                {data.fallback.rows.map((r, i) => {
                  const v = byId.get(r.videoId);
                  return (
                    <VideoTrack
                      key={r.videoId}
                      n={i + 1}
                      videoId={r.videoId}
                      thumbnail={v?.thumbnail}
                      title={v?.title ?? r.videoId}
                      sub={r.flag ? <span className="badge badge-info">{t('reports.click.f.strong')}</span> : v ? f.age(v.publishedAt) : undefined}
                      selected={open === r.videoId}
                      onSelect={() => setOpen(open === r.videoId ? null : r.videoId)}
                      end={
                        <>
                          <span className="rp-num">
                            <small>{t('yt.col.views')}</small>
                            <b>{f.compact(r.views)}</b>
                          </span>
                          <span className="rp-num">
                            <small>{t('mc.avgPercent')}</small>
                            <b>{r.avgViewPercent === null ? '—' : f.pct(r.avgViewPercent / 100)}</b>
                          </span>
                          <span className="rp-num">
                            <small>{t('mc.avgDuration')}</small>
                            <b>{r.avgViewDuration === null ? '—' : f.duration(Math.round(r.avgViewDuration))}</b>
                          </span>
                        </>
                      }
                    >
                      {open === r.videoId && v && <Suggest v={v} flag={r.flag ? 'hidden-gem' : null} />}
                    </VideoTrack>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function ErrorDetail({ e }: { e: unknown }) {
  const d = (e as { detail?: string } | null)?.detail;
  return d ? (
    <p className="xsmall muted mono ltr" dir="ltr">
      {d}
    </p>
  ) : null;
}

function FlagBadge({ flag }: { flag: Exclude<ClickFlag, null> }) {
  const { t } = useI18n();
  return <span className={`badge ${flag === 'low-ctr' ? 'badge-danger' : 'badge-accent'}`}>{t(`reports.click.f.${flag}` as MessageKey)}</span>;
}

function Suggest({ v, flag, missed }: { v: RVideo; flag: ClickFlag; missed?: number }) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const problem = flag === 'low-ctr' ? 'shown often but rarely clicked: the title and thumbnail do not earn the click' : flag === 'hidden-gem' ? 'viewers click it often but YouTube shows it rarely: make the topic clearer and more searchable' : 'improve the click-through rate';
  return (
    <div className="rp-detail">
      <p className="small">{t(flag ? (`reports.click.why.${flag}` as MessageKey) : 'reports.click.why.none', { n: f.int(missed ?? 0) })}</p>
      <ul className="rp-fails small">
        {(flag === 'hidden-gem' ? ['reports.click.tip.gem1', 'reports.click.tip.gem2', 'reports.click.tip.gem3'] : ['reports.click.tip.low1', 'reports.click.tip.low2', 'reports.click.tip.low3']).map((k) => (
          <li key={k}>
            <Icon name="bulb" />
            <span>{t(k as MessageKey)}</span>
          </li>
        ))}
      </ul>
      <AiIdeas video={v} problem={problem} />
      <div className="row">
        <a className="btn btn-s" href="#thumbs">
          <Icon name="image" />
          {t('reports.click.goThumbs')}
        </a>
        <a className="btn btn-s" href="#schedule">
          <Icon name="calendar" />
          {t('reports.click.goSchedule')}
        </a>
        <a className="btn btn-s" href="#bulk">
          <Icon name="layers" />
          {t('reports.click.goBulk')}
        </a>
        <button
          type="button"
          className="btn btn-s btn-ghost"
          onClick={async () => {
            const d = await videoToDraft(v);
            toast(t('mc.draftCreated'), { label: t('common.open'), run: () => (location.hash = `drafts/${encodeURIComponent(d.id)}`) });
          }}
        >
          <Icon name="copy" />
          {t('mc.toDraft')}
        </button>
        <a className="btn btn-s btn-ghost" href={studioUrl(v.id)} target="_blank" rel="noreferrer noopener">
          <Icon name="external" />
          {t('reports.openStudio')}
        </a>
      </div>
    </div>
  );
}
