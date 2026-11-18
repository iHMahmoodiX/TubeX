// Home: the signed-in channel at a glance. Hero with public counts, period analytics with change vs the
// previous period, daily views, latest uploads shelf, top videos, search terms, traffic sources, countries,
// shortcuts to every report and the full uploads list with a metadata audit. Read-only.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Avatar, BarChart, Button, Empty, PageHeader, Score, SearchInput, Stat } from '../../components/ui';
import { change, firstValue, periods, rowsOf } from '../../domain/reports';
import { auditAll } from '../../domain/reportsAudit';
import { matchesQuery } from '../../domain/text';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { setActiveChannel, type GoogleChannel } from '../../integrations/google/auth';
import { report, type Report } from '../../integrations/google/own';
import { downloadText, fileSlug } from '../../platform/files';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useAsync, useFormat, videosCsv } from '../research/shared';
import { checkLabel } from '../reports/AuditTab';
import { draftKeywords, loadChannelStats, studioUrl, TOTAL_METRICS, videoToDraft, youtubeUrl, type RVideo } from '../reports/data';
import { useChannel, useOwnVideos } from '../reports/hooks';
import { REPORT_META, REPORT_TABS } from '../reports/ReportsView';
import { PeriodPills, RankedList, Section, SignedOut, StatSkeleton, TrackSkeleton, useDelta, VideoTrack } from '../reports/shared';
import '../reports/reports.css';

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

const UNLOCKS: { icon: 'chart' | 'pulse' | 'trend' | 'clock' | 'layers' | 'dollar'; key: MessageKey }[] = [
  { icon: 'chart', key: 'reports.home.unlock.analytics' },
  { icon: 'pulse', key: 'reports.home.unlock.health' },
  { icon: 'trend', key: 'reports.home.unlock.retention' },
  { icon: 'clock', key: 'reports.home.unlock.besttime' },
  { icon: 'layers', key: 'reports.home.unlock.bulk' },
  { icon: 'dollar', key: 'reports.home.unlock.demonetization' },
];

export function MyChannelView() {
  const { t } = useI18n();
  const { g, active } = useChannel();
  if (!g.loaded) return <TrackSkeleton rows={4} />;
  if (!active)
    return (
      <div className="stack-l">
        <PageHeader kicker="TubeX" title={t('reports.home.welcome')} desc={t('reports.home.welcomeDesc')} />
        <SignedOut titleKey="reports.home.signedOutTitle" bodyKey="reports.home.signedOutBody" unlocks={UNLOCKS} />
      </div>
    );
  return <Home key={active.channelId} active={active} channels={g.channels} />;
}

function Home({ active, channels }: { active: GoogleChannel; channels: GoogleChannel[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const vids = useOwnVideos(active);
  const statsFn = useCallback((fresh: boolean) => loadChannelStats(active.channelId, fresh), [active.channelId]);
  const stats = useAsync(statsFn);
  useEffect(() => {
    void stats.run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const s = stats.data;
  const refresh = () => {
    void stats.run(true);
    void vids.run(true);
  };

  return (
    <div className="stack-l">
      <header className="rp-hero">
        <Avatar src={active.thumbnail} name={active.title} size="xl" />
        <div className="stack-s grow" style={{ minWidth: 0 }}>
          <span className="page-kicker">{t('reports.home.kicker')}</span>
          <h1>
            <bdi>{active.title}</bdi>
          </h1>
          <div className="rp-hero-meta">
            {active.handle && <span className="ltr bold">{active.handle}</span>}
            <span className="sep">•</span>
            <span>{s?.hiddenSubscribers ? t('reports.home.subsHidden') : t('reports.home.subs', { n: f.compact(s?.subscribers) })}</span>
            <span className="sep">•</span>
            <span>{t('reports.home.totalViews', { n: f.compact(s?.views) })}</span>
            <span className="sep">•</span>
            <span>{t('reports.home.videoCount', { n: f.int(s?.videoCount) })}</span>
          </div>
        </div>
      </header>

      <div className="action-bar">
        <a className="play-btn" href="#reports/health" aria-label={t('reports.home.openReports')} title={t('reports.home.openReports')}>
          <Icon name="chart" />
        </a>
        <a className="btn btn-primary" href="#reports/health">
          {t('reports.home.openReports')}
        </a>
        <Button variant="ghost" disabled={vids.loading || stats.loading} onClick={refresh}>
          <Icon name="refresh" />
          {vids.loading ? t('common.loading') : t('research.refresh')}
        </Button>
        {channels.length > 1 && (
          <div className="chips" role="group" aria-label={t('mc.channel')}>
            {channels.map((c) => (
              <button key={c.channelId} type="button" className="chip" aria-pressed={c.channelId === active.channelId} onClick={() => void setActiveChannel(c.channelId)}>
                <Avatar src={c.thumbnail} name={c.title} />
                <bdi className="truncate" style={{ maxWidth: 160 }}>
                  {c.title}
                </bdi>
              </button>
            ))}
          </div>
        )}
      </div>
      <ErrorNotice error={stats.error} />

      <ErrorNotice error={vids.error} />
      <Analytics
        channelId={active.channelId}
        videos={vids.data ?? []}
        latest={vids.data ? <Latest videos={vids.data} /> : vids.loading ? <TrackSkeleton rows={4} /> : null}
      />

      <Section title={t('reports.home.reports')} sub={t('reports.home.reportsSub')} id="home-reports">
        <div className="rp-tiles">
          {REPORT_TABS.map((id) => (
            <a key={id} className="rp-tile" href={`#reports/${id}`}>
              <span className="rp-tile-icon">
                <Icon name={REPORT_META[id].icon} />
              </span>
              <span style={{ minWidth: 0 }}>
                <b>{t(REPORT_META[id].label)}</b>
                <small className="clamp-2">{t(`reports.short.${id}` as MessageKey)}</small>
              </span>
            </a>
          ))}
        </div>
      </Section>

      {vids.data && <Videos videos={vids.data} channelName={active.handle || active.title} />}
    </div>
  );
}

function Analytics({ channelId, videos, latest }: { channelId: string; videos: RVideo[]; latest: ReactNode }) {
  const { t, lang, formatDate } = useI18n();
  const f = useFormat();
  const delta = useDelta();
  const [days, setDays] = useState(28);
  const load = useCallback(
    async (n: number, fresh: boolean) => {
      const p = periods(n);
      const range = p.cur;
      const [totals, prev, daily, top, traffic, terms, countries] = await Promise.all([
        report(channelId, { ...range, metrics: TOTAL_METRICS }, fresh),
        report(channelId, { ...p.prev, metrics: TOTAL_METRICS }, fresh),
        report(channelId, { ...range, metrics: 'views', dimensions: 'day', sort: 'day' }, fresh),
        report(channelId, { ...range, metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained', dimensions: 'video', sort: '-views', maxResults: 10 }, fresh),
        report(channelId, { ...range, metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views' }, fresh),
        report(channelId, { ...range, metrics: 'views', dimensions: 'insightTrafficSourceDetail', filters: 'insightTrafficSourceType==YT_SEARCH', sort: '-views', maxResults: 10 }, fresh),
        report(channelId, { ...range, metrics: 'views', dimensions: 'country', sort: '-views', maxResults: 8 }, fresh),
      ]);
      return { totals, prev, daily, top, traffic, terms, countries, range };
    },
    [channelId],
  );
  const { data, error, loading, run } = useAsync(load);
  useEffect(() => {
    void run(days, false);
  }, [run, days]);

  const regions = useMemo(() => {
    try {
      return new Intl.DisplayNames([lang === 'fa' ? 'fa' : 'en'], { type: 'region' });
    } catch {
      return null;
    }
  }, [lang]);
  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);

  const tile = (label: string, k: string, show: (x: number) => string, derive?: (r: Report) => number | null) => {
    const cur = data ? (derive ? derive(data.totals) : firstValue(data.totals, k)) : null;
    const prev = data ? (derive ? derive(data.prev) : firstValue(data.prev, k)) : null;
    const d = delta(change(cur, prev));
    return <Stat key={label} label={label} value={cur === null ? '—' : show(cur)} delta={{ good: d.good, text: d.good === null && d.text === '—' ? `— ${t('reports.home.vsPrev')}` : `${d.text} ${t('reports.home.vsPrev')}` }} />;
  };
  const net = (r: Report) => {
    const a = firstValue(r, 'subscribersGained');
    const b = firstValue(r, 'subscribersLost');
    return a === null || b === null ? null : a - b;
  };

  return (
    <Section
      title={t('mc.analytics')}
      sub={data ? t('reports.home.range', { from: formatDate(`${data.range.startDate}T12:00:00Z`).split(/[,،]/)[0]!, to: formatDate(`${data.range.endDate}T12:00:00Z`).split(/[,،]/)[0]! }) : undefined}
      id="home-analytics"
      action={<PeriodPills value={days} onChange={setDays} />}
    >
      <ErrorNotice error={error} />
      {!data && loading && <StatSkeleton n={8} />}
      {!data && !loading && latest}
      {data && (
        <div className="stack-l" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
          <div className="stats rp-stats" data-testid="mc-totals">
            {tile(t('yt.col.views'), 'views', (x) => f.compact(x))}
            {tile(t('mc.watchHours'), 'estimatedMinutesWatched', (x) => f.compact(x / 60))}
            {tile(t('mc.avgDuration'), 'averageViewDuration', (x) => f.duration(Math.round(x)))}
            {tile(t('mc.avgPercent'), 'averageViewPercentage', (x) => f.pct(x / 100))}
            {tile(t('mc.subsNet'), 'net', (x) => f.int(x), net)}
            {tile(t('yt.likes'), 'likes', (x) => f.compact(x))}
            {tile(t('yt.comments'), 'comments', (x) => f.compact(x))}
            {tile(t('mc.shares'), 'shares', (x) => f.compact(x))}
          </div>
          <div className="card">
            <div className="card-head">
              <h2>{t('mc.dailyViews')}</h2>
            </div>
            {data.daily.rows.length ? (
              <>
                <BarChart values={data.daily.rows.map((r) => Number(r[1]))} labels={data.daily.rows.map((r) => String(r[0]))} label={t('mc.dailyViews')} height={140} highlight={data.daily.rows.length - 1} />
                <div className="row-between xsmall muted ltr" dir="ltr">
                  <span>{String(data.daily.rows[0]![0])}</span>
                  <span>{String(data.daily.rows[data.daily.rows.length - 1]![0])}</span>
                </div>
              </>
            ) : (
              <p className="small muted">{t('mc.noData')}</p>
            )}
          </div>

          {latest}

          <Section title={t('mc.topVideos')} id="home-top">
            {data.top.rows.length ? (
              <div className="tracks">
                <div className="track-head rp-track">
                  <span>#</span>
                  <span>{t('yt.col.title')}</span>
                  <span>{t('yt.col.views')}</span>
                </div>
                {rowsOf(data.top).map((r, i) => {
                  const vid = byId.get(String(r.video));
                  return (
                    <VideoTrack
                      key={String(r.video)}
                      n={i + 1}
                      videoId={String(r.video)}
                      thumbnail={vid?.thumbnail}
                      title={vid?.title ?? String(r.video)}
                      href={youtubeUrl(String(r.video))}
                      sub={vid ? `${f.duration(vid.durationSec)} · ${f.age(vid.publishedAt)}` : undefined}
                      end={
                        <>
                          <span className="rp-num">
                            <small>{t('mc.watchHours')}</small>
                            <b>{f.int(Number(r.estimatedMinutesWatched) / 60)}</b>
                          </span>
                          <span className="rp-num">
                            <small>{t('mc.avgPercent')}</small>
                            <b>{f.pct(Number(r.averageViewPercentage) / 100)}</b>
                          </span>
                          <span className="rp-num">
                            <small>{t('yt.col.views')}</small>
                            <b>{f.compact(Number(r.views))}</b>
                          </span>
                        </>
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <p className="small muted">{t('mc.noData')}</p>
            )}
          </Section>

          <div className="rp-grid-3">
            <div className="card">
              <div className="stack-s" style={{ gap: 2 }}>
                <h3>{t('reports.home.searchTerms')}</h3>
                <p className="xsmall muted">{t('mc.searchTermsHelp')}</p>
              </div>
              <RankedList
                label={t('mc.searchTerms')}
                items={rowsOf(data.terms).map((r) => ({ key: String(r.insightTrafficSourceDetail), label: <bdi>{String(r.insightTrafficSourceDetail)}</bdi>, value: Number(r.views) || 0 }))}
              />
              {data.terms.rows.length > 0 && (
                <a className="btn btn-s btn-ghost" href="#reports/opportunities" style={{ alignSelf: 'flex-start' }}>
                  {t('reports.home.findGaps')}
                </a>
              )}
            </div>
            <div className="card">
              <h3>{t('mc.traffic')}</h3>
              <RankedList
                label={t('mc.traffic')}
                items={rowsOf(data.traffic).map((r) => {
                  const k = String(r.insightTrafficSourceType);
                  return { key: k, label: TRAFFIC[k] ? t(TRAFFIC[k]!) : k, value: Number(r.views) || 0 };
                })}
              />
            </div>
            <div className="card">
              <h3>{t('mc.countries')}</h3>
              <RankedList
                label={t('mc.countries')}
                items={rowsOf(data.countries).map((r) => {
                  const c = String(r.country);
                  let name = c;
                  try {
                    name = regions?.of(c) ?? c;
                  } catch {
                    /* unknown code */
                  }
                  return { key: c, label: name, value: Number(r.views) || 0 };
                })}
              />
            </div>
          </div>
          <p className="xsmall faint">{t('reports.home.analyticsNote')}</p>
        </div>
      )}
    </Section>
  );
}

function Latest({ videos }: { videos: RVideo[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const latest = useMemo(() => videos.filter((v) => v.live !== 'upcoming').slice(0, 8), [videos]);
  const audits = useMemo(() => new Map(auditAll(videos).map((r) => [r.id, r])), [videos]);
  if (!latest.length)
    return (
      <Empty icon="video" title={t('reports.noVideosTitle')}>
        {t('mc.noVideos')}
      </Empty>
    );
  return (
    <Section title={t('reports.home.latest')} sub={t('reports.home.latestSub')} id="home-latest">
      <div className="rp-shelf">
        {latest.map((v) => (
          <article key={v.id} className="rp-card">
            <img className="thumb" src={v.thumbnail ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" />
            {v.privacy && v.privacy !== 'public' && <span className="badge">{t(`mc.privacy.${v.privacy}` as MessageKey)}</span>}
            <div className="rp-card-title clamp-2">
              <a href={studioUrl(v.id)} target="_blank" rel="noreferrer noopener">
                <bdi>{v.title || '—'}</bdi>
              </a>
            </div>
            <div className="rp-card-stats">
              <span title={t('yt.col.views')}>
                <Icon name="eye" />
                {f.compact(v.views)}
              </span>
              <span title={t('yt.likes')}>
                <Icon name="heart" />
                {f.compact(v.likes)}
              </span>
              <span title={t('yt.comments')}>
                <Icon name="message" />
                {f.compact(v.comments)}
              </span>
              <span title={t('yt.col.age')}>
                <Icon name="clock" />
                {f.age(v.publishedAt)}
              </span>
            </div>
            <div className="row-between xsmall muted">
              <span>{t('reports.home.auditScore')}</span>
              <span className={`num-t bold ${(audits.get(v.id)?.score ?? 0) >= 70 ? 'pos' : 'neg'}`}>{f.int(audits.get(v.id)?.score)}</span>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

const PAGE = 30;

function Videos({ videos, channelName }: { videos: RVideo[]; channelName: string }) {
  const { t, lang } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [keywords, setKeywords] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void draftKeywords().then(setKeywords).catch(() => undefined);
  }, []);
  const audited = useMemo(() => {
    const r = auditAll(videos.map((v) => ({ ...v, keyword: keywords.get(v.id) })));
    return videos.map((v, i) => ({ v, r: r[i]! }));
  }, [videos, keywords]);
  const shown = audited.filter((a) => (!onlyIssues || a.r.failing.some((c) => c.severity !== 'tip')) && matchesQuery(a.v.title, q));
  const toDraft = async (v: RVideo) => {
    const d = await videoToDraft(v);
    toast(t('mc.draftCreated'), { label: t('common.open'), run: () => (location.hash = `drafts/${encodeURIComponent(d.id)}`) });
  };
  return (
    <Section
      title={t('mc.videos', { n: f.int(videos.length) })}
      id="home-videos"
      action={
        <Button size="s" variant="ghost" onClick={() => downloadText(`tubex-my-videos-${fileSlug(channelName, 'channel')}.csv`, videosCsv(videos), 'text/csv;charset=utf-8')}>
          <Icon name="download" />
          {t('research.exportCsv')}
        </Button>
      }
    >
      <div className="rp-toolbar">
        <SearchInput value={q} onChange={setQ} label={t('reports.searchVideos')} placeholder={t('reports.searchVideos')} />
        <label className="check">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          <span>{t('mc.onlyIssues')}</span>
        </label>
      </div>
      {shown.length === 0 ? (
        <Empty icon="video">{t('mc.noVideos')}</Empty>
      ) : (
        <div className="tracks">
          <div className="track-head rp-track">
            <span>#</span>
            <span>{t('yt.col.title')}</span>
            <span>{t('mc.audit')}</span>
          </div>
          {shown.slice(0, limit).map(({ v, r }, i) => {
            const issues = r.failing.filter((c) => c.severity !== 'tip');
            return (
              <VideoTrack
                key={v.id}
                n={i + 1}
                videoId={v.id}
                thumbnail={v.thumbnail}
                title={v.title || '—'}
                href={studioUrl(v.id)}
                sub={
                  <>
                    {v.privacy && <span className={`badge ${v.privacy === 'public' ? '' : 'badge-info'}`} style={{ marginInlineEnd: 6 }}>{t(`mc.privacy.${v.privacy}` as MessageKey)}</span>}
                    {f.compact(v.views)} {t('reports.viewsShort')} · {f.age(v.publishedAt)}
                    {issues.length > 0 && (
                      <>
                        {' · '}
                        <span className={issues.some((c) => c.severity === 'error') ? 'neg' : 'muted'}>{issues.map((c) => t(checkLabel(c.id))).join(lang === 'fa' ? '، ' : ', ')}</span>
                      </>
                    )}
                  </>
                }
                end={
                  <>
                    <Score value={r.score} label={t('reports.audit.score')} />
                    <Button size="s" variant="ghost" onClick={() => void toDraft(v)}>
                      {t('mc.toDraft')}
                    </Button>
                  </>
                }
              />
            );
          })}
          {shown.length > limit && (
            <div className="row" style={{ justifyContent: 'center', paddingBlock: 12 }}>
              <Button size="s" onClick={() => setLimit(limit + PAGE)}>
                {t('reports.showMore', { n: f.int(shown.length - limit) })}
              </Button>
            </div>
          )}
        </div>
      )}
      <a className="btn btn-s btn-ghost" href="#reports/audit" style={{ alignSelf: 'flex-start' }}>
        {t('reports.home.fullAudit')}
      </a>
    </Section>
  );
}
