// Search rank tracking: keyword → position of one video or of the whole channel in the top 50 results,
// checked on demand and once a day in the background, with history, change arrows and neighbours.
import { useMemo, useState } from 'react';
import { around, RANK_CHECK_COST } from '../../domain/seo';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Field, IconButton, LineChart, Notice, Switch, Thumb } from '../../components/ui';
import { useWork } from '../../components/useWork';
import { useI18n } from '../../i18n';
import type { VideoMeta } from '../../integrations/youtube/seoApi';
import { put, type Snapshot, type Tracker } from '../../storage/stores';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations, useUsage } from '../connections/useConnections';
import { Delta, SectionHead, Sparkline } from '../research/parts';
import { useFormat } from '../research/shared';
import { checkRank, createRankTracker, deleteTracker, rankConfig, type RankSnapshot } from './service';
import { useOwnUploads, VideoPicker } from './VideoPicker';

function readPrefill(): string {
  try {
    const v = sessionStorage.getItem('tubex.seo.prefill') ?? '';
    sessionStorage.removeItem('tubex.seo.prefill');
    return v;
  } catch {
    return '';
  }
}

/** Rank history chart with an inverted axis: position 1 at the top, "not in top 50" at the bottom. */
function RankChart({ points, label }: { points: { at: string; position: number | null }[]; label: string }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  if (points.length < 2) return <p className="small muted">{t('seo.rank.chartNeedsTwo')}</p>;
  const t0 = Date.parse(points[0]!.at);
  const pts = points.map((p) => ({ x: (Date.parse(p.at) - t0) / 86_400_000, y: p.position === null ? 0 : 51 - p.position }));
  const ticks = [1, 10, 25, 50];
  // Time runs left to right in both languages, so the chart block is laid out LTR.
  return (
    <div className="stack-s" dir="ltr">
      <div className="seo-chart">
        <div className="seo-chart-axis" style={{ position: 'relative', minWidth: 28 }} aria-hidden="true">
          {ticks.map((p) => (
            <span key={p} style={{ position: 'absolute', insetInlineEnd: 0, insetBlockStart: `${(1 - (51 - p) / 50) * 100}%`, transform: 'translateY(-50%)' }}>
              {f.int(p)}
            </span>
          ))}
          <span style={{ position: 'absolute', insetInlineEnd: 0, insetBlockStart: '100%', transform: 'translateY(-50%)' }}>—</span>
        </div>
        <LineChart points={pts} yMax={50} height={160} label={label} refLine={41} />
      </div>
      <div className="row-between xsmall faint" style={{ paddingInlineStart: 36 }}>
        <span>{formatDate(points[0]!.at)}</span>
        <span dir="auto">{t('seo.rank.chartLegend')}</span>
        <span>{formatDate(points[points.length - 1]!.at)}</span>
      </div>
    </div>
  );
}

function TrackerRow({ tr, snaps, open, onToggle }: { tr: Tracker; snaps: RankSnapshot[]; open: boolean; onToggle: () => void }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const c = rankConfig(tr);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pos = c.last?.position;
  const delta = c.last && c.prev && c.last.position !== null && c.prev.position !== null ? c.prev.position - c.last.position : null;
  const latest = snaps[snaps.length - 1];
  const target = c.videoId ? t('seo.rank.forVideo', { v: c.targetTitle ?? c.videoId }) : t('seo.rank.forChannel', { c: c.targetTitle ?? c.channelId ?? '' });
  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await checkRank(tr.id);
      toast(r.position === null ? t('seo.rank.checkedNone', { k: c.keyword }) : t('seo.rank.checked', { k: c.keyword, n: r.position }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const isMine = (x: { id: string; channelId: string }) => (c.videoId ? x.id === c.videoId : x.channelId === c.channelId);
  return (
    <li>
      <div className="seo-rank-row" data-open={open || undefined}>
        <div className="seo-pos" data-none={pos === null || pos === undefined || undefined}>
          {pos === undefined ? '…' : pos === null ? '—' : f.int(pos)}
          <small>{pos === undefined ? t('seo.rank.notChecked') : pos === null ? t('seo.rank.notTop50') : <Delta delta={delta} />}</small>
        </div>
        <button type="button" className="item-button stack-s" style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0, textAlign: "start" }} aria-expanded={open} onClick={onToggle}>
          <span className="bold truncate">
            <bdi>{c.keyword}</bdi>
          </span>
          <span className="small muted truncate">
            <bdi>{target}</bdi>
          </span>
          <span className="xsmall faint">{tr.lastCheckedAt ? t('seo.rank.lastChecked', { when: formatDate(tr.lastCheckedAt) }) : t('seo.rank.neverChecked')}</span>
        </button>
        <div className="row-nowrap">
          <span className="seo-hide-s">
            <Sparkline values={snaps.map((s) => s.position)} invert label={t('seo.rank.history')} tone={delta === null ? undefined : delta > 0 ? 'up' : delta < 0 ? 'down' : undefined} />
          </span>
          <Switch checked={tr.enabled} onChange={(v) => void put('trackers', { ...tr, enabled: v })} label={<span className="seo-hide-s xsmall">{t('seo.rank.daily')}</span>} />
          <Button size="s" disabled={busy} onClick={() => void check()} title={t('seo.rank.costEach', { n: RANK_CHECK_COST })}>
            {busy ? t('common.loading') : t('seo.rank.checkNow')}
          </Button>
          <IconButton icon="chevron" label={open ? t('seo.rank.hide') : t('seo.rank.details')} onClick={onToggle} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
        </div>
      </div>
      <ErrorNotice error={error} />
      {open && (
        <div className="seo-rank-detail">
          <div className="stack-s">
            <h3>{t('seo.rank.history')}</h3>
            <RankChart points={snaps.map((s) => ({ at: s.checkedAt, position: s.position }))} label={t('seo.rank.historyOf', { k: c.keyword })} />
          </div>
          <div className="stack-s">
            <h3>{latest && latest.position !== null ? t('seo.rank.around') : t('seo.rank.topNow')}</h3>
            {!latest ? (
              <p className="small muted">{t('seo.rank.neverChecked')}</p>
            ) : (
              <ol className="seo-tracks">
                {around(latest.items, latest.position).map(({ pos: p, item }) => (
                  <li key={item.id} className="seo-track" data-mine={isMine(item) || undefined} style={{ minHeight: 48 }}>
                    <span className="track-n">{f.int(p)}</span>
                    <div className="seo-track-main">
                      <Thumb videoId={item.id} width={72} />
                      <div className="seo-track-text">
                        <a className="seo-track-title truncate" href={`https://www.youtube.com/watch?v=${item.id}`} target="_blank" rel="noreferrer noopener" dir="auto">
                          {item.title}
                        </a>
                        <span className="seo-track-sub truncate">
                          <bdi>{item.channelTitle}</bdi>
                        </span>
                      </div>
                    </div>
                    <span className="seo-track-end">
                      <span className="seo-num">{f.compact(item.views)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {latest && (
              <p className="xsmall faint">
                {t('seo.rank.sampleNote', { region: latest.region ?? '—', lang: latest.language ?? '—' })}
              </p>
            )}
          </div>
          <div className="row">
            <a className="btn btn-s" href={`#research/${encodeURIComponent(c.keyword)}`}>
              {t('seo.rank.explore')}
            </a>
            <ConfirmButton size="s" label={t('common.delete')} question={t('seo.rank.deleteQ', { k: c.keyword })} confirmLabel={t('common.delete')} onConfirm={() => deleteTracker(tr.id, `rank:${tr.id}`)} />
          </div>
        </div>
      )}
    </li>
  );
}

export function Tracking({ canRead }: { canRead: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const { youtube } = useIntegrations();
  const usage = useUsage();
  const trackers = useWork('trackers');
  const snapshots = useWork('snapshots');
  const own = useOwnUploads(false);
  const [keyword, setKeyword] = useState(readPrefill);
  const [mode, setMode] = useState<'channel' | 'video'>('channel');
  const [videoId, setVideoId] = useState('');
  const [video, setVideo] = useState<VideoMeta>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const effectiveMode = own.active ? mode : 'video';

  const rank = trackers.items.filter((x) => x.kind === 'rank').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byRef = useMemo(() => {
    const m = new Map<string, Snapshot[]>();
    for (const s of snapshots.items) if (s.ref.startsWith('rank:')) m.set(s.ref, [...(m.get(s.ref) ?? []), s]);
    for (const xs of m.values()) xs.sort((a, b) => a.at.localeCompare(b.at));
    return m;
  }, [snapshots.items]);
  const enabled = rank.filter((x) => x.enabled).length;
  const cap = youtube.dailyUnitCap || 10_000;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const tr =
        effectiveMode === 'channel'
          ? await createRankTracker({ keyword, channelId: own.active!.channelId, targetTitle: own.active!.title })
          : await createRankTracker({ keyword, videoId, targetTitle: video?.title });
      setKeyword('');
      setOpen(tr.id);
      const r = await checkRank(tr.id);
      toast(r.position === null ? t('seo.rank.checkedNone', { k: rankConfig(tr).keyword }) : t('seo.rank.checked', { k: rankConfig(tr).keyword, n: r.position }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const ready = keyword.trim() && (effectiveMode === 'channel' || videoId) && canRead;

  return (
    <div className="stack-l">
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void add();
        }}
      >
        <h2 className="small" style={{ fontSize: 16 }}>
          {t('seo.rank.addTitle')}
        </h2>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow" style={{ minWidth: 'min(100%, 220px)' }}>
            <Field label={t('research.keyword')}>{({ id }) => <input id={id} className="input" dir="auto" value={keyword} onChange={(e) => setKeyword(e.target.value)} />}</Field>
          </div>
          <div className="stack-s">
            <span className="field-label">{t('seo.rank.target')}</span>
            <div className="chips" role="radiogroup" aria-label={t('seo.rank.target')}>
              <button type="button" role="radio" className="chip" aria-checked={effectiveMode === 'channel'} aria-pressed={effectiveMode === 'channel'} disabled={!own.active} onClick={() => setMode('channel')} title={own.active ? undefined : t('seo.rank.channelNeedsSignIn')}>
                {t('seo.rank.wholeChannel')}
              </button>
              <button type="button" role="radio" className="chip" aria-checked={effectiveMode === 'video'} aria-pressed={effectiveMode === 'video'} onClick={() => setMode('video')}>
                {t('seo.rank.oneVideo')}
              </button>
            </div>
          </div>
        </div>
        {effectiveMode === 'video' && (
          <VideoPicker
            value={videoId}
            label={t('seo.rank.video')}
            onChange={(id, v) => {
              setVideoId(id);
              setVideo(v);
            }}
          />
        )}
        {effectiveMode === 'channel' && own.active && <p className="small muted">{t('seo.rank.forChannel', { c: own.active.title })}</p>}
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
            {busy ? t('common.loading') : t('seo.rank.trackAndCheck')}
          </button>
          <span className="seo-cost">{t('seo.rank.costEach', { n: RANK_CHECK_COST })}</span>
        </div>
        <ErrorNotice error={error} />
      </form>

      <section className="seo-section" aria-labelledby="rt-h">
        <SectionHead
          id="rt-h"
          title={t('seo.rank.listTitle')}
          sub={t('seo.rank.budget', { n: enabled, units: f.int(enabled * RANK_CHECK_COST), cap: f.int(cap), used: f.int(usage.ytUnits) })}
        />
        {trackers.loaded && !rank.length ? (
          <Empty icon="trend" title={t('seo.rank.emptyTitle')}>
            {t('seo.rank.emptyHelp')}
          </Empty>
        ) : (
          <ul className="list" style={{ gap: 2 }}>
            {rank.map((tr) => (
              <TrackerRow
                key={tr.id}
                tr={tr}
                snaps={(byRef.get(`rank:${tr.id}`) ?? []).map((s) => s.data as unknown as RankSnapshot)}
                open={open === tr.id}
                onToggle={() => setOpen((x) => (x === tr.id ? null : tr.id))}
              />
            ))}
          </ul>
        )}
        <Notice>
          <p>{t('seo.rank.how')}</p>
          <p className="small muted">{t('jobs.browserOpen')}</p>
        </Notice>
      </section>
    </div>
  );
}
