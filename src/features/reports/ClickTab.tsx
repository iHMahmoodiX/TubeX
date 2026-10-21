// Click Magnet: thumbnail impressions and click-through rate per video, flagged against the channel's own
// medians. The Analytics API v2 does not support impressions/CTR queries (400 "The query is not supported"),
// so they come from the YouTube Reporting API's daily channel reach report, collected after the owner clicks
// "Start collecting" and stored locally (reach.ts). Until days are stored, a clearly labelled fallback ranks
// by views and retention and never shows anything as CTR.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { Button, Empty, Notice } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { useWork } from '../../components/useWork';
import { periods } from '../../domain/reports';
import { classifyClicks, fallbackRanking, type ClickFlag } from '../../domain/reportsClick';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { AuthError } from '../../integrations/google/auth';
import { report } from '../../integrations/google/own';
import { REPORTING_BASE, ReportingError } from '../../integrations/google/reporting';
import { requestOrigin } from '../../platform/permissions';
import { useAsync, useFormat } from '../research/shared';
import { AiIdeas } from './AiIdeas';
import { studioUrl, videoToDraft, type RVideo } from './data';
import { ReportError, StoredError } from './errors';
import { getReachState, loadReach, pauseReach, reachRef, startReach, syncReach, type ReachRows, type ReachState } from './reach';
import { PeriodPills, Section, TrackSkeleton, VideoTrack } from './shared';

type Filter = 'all' | 'low-ctr' | 'hidden-gem';

async function load(channelId: string, days: number, fresh: boolean) {
  const range = periods(days).cur;
  const [state, reach] = await Promise.all([getReachState(channelId), loadReach(channelId, range)]);
  if (reach.rows.length) return { mode: 'ctr' as const, ctr: classifyClicks(reach.rows), reach, state, days };
  try {
    const r = await report(channelId, { ...range, metrics: 'views,averageViewDuration,averageViewPercentage', dimensions: 'video', sort: '-views', maxResults: 50 }, fresh);
    return { mode: 'fallback' as const, fallback: fallbackRanking(r), fallbackError: undefined as unknown, reach, state, days };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    return { mode: 'fallback' as const, fallback: null, fallbackError: e, reach, state, days };
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
  // Re-read when the background stores new days or the collection state changes.
  const trackers = useWork('trackers');
  const tracker = trackers.items.find((x) => x.id === reachRef(channelId));
  const stamp = `${tracker?.lastCheckedAt ?? ''}|${String(tracker?.config.cursor ?? '')}|${String(tracker?.enabled ?? '')}`;
  useEffect(() => {
    void run(days, false);
  }, [run, days, stamp]);
  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);
  const reload = () => void run(days, false);

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
      <ReportError error={error} what="click" />
      {loading && !data && <TrackSkeleton rows={6} />}
      {data && <ReachCard channelId={channelId} state={data.state} reach={data.reach} period={data.days} onChanged={reload} />}
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
          <Notice tone="info">
            <p>{t('reports.click.unavailable')}</p>
          </Notice>
          {data.fallbackError !== undefined && <ReportError error={data.fallbackError} what="retention" tone="warning" />}
          {data.fallback && (
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
          )}
        </>
      )}
    </div>
  );
}

/** Collection status of the YouTube Reporting API channel reach report: start, waiting, coverage, check now. */
function ReachCard({ channelId, state, reach, period, onChanged }: { channelId: string; state: ReachState | null; reach: ReachRows; period: number; onChanged: () => void }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  // requestOrigin runs first with no await before it, so the click still counts as the user gesture.
  const withAccess = async (work: () => Promise<void>) => {
    const granted = await requestOrigin(REPORTING_BASE);
    if (!granted) {
      setErr(new ReportingError('permission'));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
      onChanged();
    }
  };
  const check = async () => {
    const r = await syncReach(channelId);
    toast(r.days ? t('reports.reach.checked', { n: f.int(r.days) }) : t('reports.reach.nothingNew'));
  };

  if (!state)
    return (
      <div className="card stack-s">
        <h3>{t('reports.reach.title')}</h3>
        <p className="small">{t('reports.reach.intro')}</p>
        <p className="small muted">{t('reports.reach.wait')}</p>
        <p className="xsmall faint">{t('reports.reach.access')}</p>
        <ReportError error={err} what="reach" tone="warning" />
        <div className="row">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void withAccess(async () => {
                await startReach(channelId);
                // Backfilled days may already be there; a failure here shows from the stored state.
                await syncReach(channelId).catch(() => undefined);
                toast(t('reports.reach.started'));
              })
            }
          >
            {busy ? t('reports.reach.starting') : t('reports.reach.start')}
          </Button>
        </div>
      </div>
    );

  return (
    <div className="card stack-s">
      <div className="row-between">
        <h3>{t('reports.reach.title')}</h3>
        <div className="row">
          <Button size="s" disabled={busy || !state.enabled} onClick={() => void withAccess(check)}>
            {busy ? t('reports.reach.checking') : t('reports.reach.checkNow')}
          </Button>
          <Button size="s" variant="ghost" disabled={busy} onClick={() => void pauseReach(channelId, !state.enabled).then(onChanged)}>
            {state.enabled ? t('reports.reach.pause') : t('reports.reach.resume')}
          </Button>
        </div>
      </div>
      {reach.days > 0 ? (
        <p className="small muted">
          {t('reports.reach.coverage', { n: f.int(reach.days), period: f.int(period), from: formatDate(reach.first!), to: formatDate(reach.last!), since: formatDate(state.jobCreatedAt) })}
        </p>
      ) : (
        <p className="small">{t('reports.reach.waiting', { since: formatDate(state.jobCreatedAt) })}</p>
      )}
      <p className="xsmall faint">
        {state.lastSyncAt ? t('reports.reach.lastCheck', { at: formatDate(state.lastSyncAt) }) : t('reports.reach.neverChecked')} {state.enabled ? t('reports.reach.background') : t('reports.reach.paused')}
      </p>
      {err ? <ReportError error={err} what="reach" tone="warning" /> : state.lastError ? <StoredError code={state.lastError} detail={state.lastErrorDetail} what="reach" /> : null}
    </div>
  );
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
