// Improve queue (#10): the few existing videos worth improving now, with reasons, evidence, a direct next
// action (draft, A/B variants, Studio), a before/after observation log and done/snooze/dismiss. Works without
// AI and without paid data; the optional coach (#15) adds AI suggestions on request only.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { Avatar, Button, Empty, Notice, PageHeader, Thumb } from '../../components/ui';
import { useToast } from '../../components/toasts';
import type { OptimizeItem, QueueAction, QueueStatus } from '../../domain/models';
import { newBase, nowIso } from '../../domain/models';
import { activeQueue, buildQueue, compareSnaps, effectiveStatus, queueId, type QueueEntry, type Signal } from '../../domain/optimizeQueue';
import { periods, rowsOf } from '../../domain/reports';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { report } from '../../integrations/google/own';
import { put } from '../../storage/db';
import { videoToDraft, studioUrl, type RVideo } from '../reports/data';
import { ReportError } from '../reports/errors';
import { useChannel, useOwnVideos } from '../reports/hooks';
import { loadReach } from '../reports/reach';
import { RefreshButton, SignedOut, TrackSkeleton } from '../reports/shared';
import { useAsync, useFormat } from '../research/shared';
import { CoachPanel } from './CoachPanel';
import '../reports/reports.css';
import './optimize.css';

const ACTIONS: QueueAction[] = ['title', 'thumbnail', 'description', 'tags', 'note'];

export function OptimizeView({ videoId }: { videoId?: string }) {
  const { t } = useI18n();
  const { g, active } = useChannel();
  const vids = useOwnVideos(active);
  return (
    <div className="stack-l">
      <PageHeader
        kicker={active ? `${t('nav.optimize')} · ${active.title}` : t('nav.optimize')}
        title={t('opt.title')}
        desc={t('opt.desc')}
        art={active ? <Avatar src={active.thumbnail} name={active.title} size="l" /> : undefined}
        actions={active ? <RefreshButton loading={vids.loading} onClick={() => void vids.run(true)} /> : undefined}
      />
      {!g.loaded ? (
        <TrackSkeleton rows={4} />
      ) : !active ? (
        <SignedOut />
      ) : (
        <>
          <ReportError error={vids.error} what="videos" />
          {!vids.data ? vids.loading || !vids.error ? <TrackSkeleton rows={6} /> : null : <Queue key={active.channelId} channelId={active.channelId} videos={vids.data} focus={videoId} />}
        </>
      )}
    </div>
  );
}

function Queue({ channelId, videos, focus }: { channelId: string; videos: RVideo[]; focus?: string }) {
  const { t } = useI18n();
  const f = useFormat();
  const stored = useCollection('optimize');
  const [open, setOpen] = useState<string | null>(focus ?? null);
  const [showAll, setShowAll] = useState(false);
  const load = useCallback(
    async (fresh: boolean) => {
      const range = periods(28).cur;
      const measuredAt = nowIso();
      let perfError: unknown;
      const perf = await report(channelId, { ...range, metrics: 'views,averageViewPercentage', dimensions: 'video', sort: '-views', maxResults: 200 }, fresh).catch((e: unknown) => {
        perfError = e;
        return null;
      });
      const reach = await loadReach(channelId, range).catch(() => null);
      const perf28 = perf
        ? rowsOf(perf).map((r) => ({ videoId: String(r.video), views: Number(r.views) || 0, avgViewPercent: r.averageViewPercentage === undefined || r.averageViewPercentage === '' ? null : Number(r.averageViewPercentage) }))
        : null;
      return { ...buildQueue({ videos, perf28, reach: reach?.rows.length ? reach.rows : null, measuredAt }), measuredAt, perfError, range };
    },
    [channelId, videos],
  );
  const { data, error, loading, run } = useAsync(load);
  useEffect(() => {
    void run(false);
  }, [run]);

  const items = useMemo(() => new Map(stored.items.filter((x) => x.channelId === channelId).map((x) => [x.id, x])), [stored.items, channelId]);
  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);
  const active = data ? activeQueue(data.entries, items, channelId, Date.now(), showAll ? 50 : 10) : [];
  const parked = [...items.values()].filter((x) => ['done', 'snoozed', 'dismissed'].includes(effectiveStatus(x)));

  return (
    <div className="stack-l">
      <ReportError error={error} what="videoPerf" />
      {data && (
        <p className="xsmall faint" data-testid="opt-freshness">
          {t('opt.freshness', { date: f.date(data.measuredAt), start: f.date(data.range.startDate), end: f.date(data.range.endDate) })}
        </p>
      )}
      {data?.perfError !== undefined && <ReportError error={data!.perfError} what="videoPerf" tone="warning" />}
      {data?.thinCtr && (
        <Notice>
          <p>{t('opt.thinCtr')}</p>
          <div>
            <a className="btn btn-s" href="#reports/clickmagnet">
              {t('opt.startCtr')}
            </a>
          </div>
        </Notice>
      )}
      {data?.thinRetention && <Notice>{t('opt.thinRetention')}</Notice>}
      {loading && !data && <TrackSkeleton rows={5} />}
      {data && !active.length && (
        <Empty icon="check" title={t('opt.emptyTitle')}>
          {t('opt.empty')}
        </Empty>
      )}
      <ol className="opt-list">
        {active.map((e, i) => (
          <li key={e.videoId}>
            <QueueCard
              rank={i + 1}
              e={e}
              v={byId.get(e.videoId)}
              item={items.get(queueId(channelId, e.videoId))}
              channelId={channelId}
              medians={data!.medians}
              open={open === e.videoId}
              onToggle={() => setOpen(open === e.videoId ? null : e.videoId)}
            />
          </li>
        ))}
      </ol>
      {data && !showAll && data.entries.length > active.length && (
        <div>
          <Button size="s" variant="ghost" onClick={() => setShowAll(true)}>
            {t('opt.showMore')}
          </Button>
        </div>
      )}
      {parked.length > 0 && <Parked items={parked} />}
      {data && <p className="xsmall faint">{t('opt.method')}</p>}
    </div>
  );
}

function signalText(t: ReturnType<typeof useI18n>['t'], f: ReturnType<typeof useFormat>, s: Signal): string {
  const e = s.evidence;
  const n = (k: string) => f.int(Number(e[k]));
  const p = (k: string) => f.pct(Number(e[k]) / 100);
  switch (s.kind) {
    case 'low-ctr':
      return t('opt.sig.low-ctr', { impressions: n('impressions'), ctr: p('ctr'), median: p('medianCtr'), missed: n('missedClicks') });
    case 'strong-retention-low-reach':
      return t('opt.sig.strong-retention-low-reach', { ret: p('avgViewPercent'), medRet: p('medianAvgViewPercent'), views: n('views'), medViews: n('medianViews') });
    case 'evergreen-traffic':
      return t('opt.sig.evergreen-traffic', { months: f.int(Math.round(Number(e.ageDays) / 30)), views: n('views'), medViews: n('medianViews') });
    default:
      return t('opt.sig.weak-packaging', { checks: String(e.checks).split(', ').map((c) => t(`reports.audit.check.${c}` as MessageKey)).join('، ') });
  }
}

function QueueCard({
  rank,
  e,
  v,
  item,
  channelId,
  medians,
  open,
  onToggle,
}: {
  rank: number;
  e: QueueEntry;
  v?: RVideo;
  item?: OptimizeItem;
  channelId: string;
  medians: { ctr: number | null; avgViewPercent: number | null; views: number | null };
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const status = effectiveStatus(item);
  const id = queueId(channelId, e.videoId);

  const save = async (patch: Partial<OptimizeItem>, log?: OptimizeItem['log'][number]) => {
    const base: OptimizeItem = item ?? { ...newBase(), id, channelId, videoId: e.videoId, title: e.title, status: 'open', log: [] };
    // Channel and video come from the queue entry, never from the patch, so an item cannot move between channels.
    return put('optimize', { ...base, ...patch, id, channelId, videoId: e.videoId, title: e.title, log: log ? [...base.log, log] : base.log });
  };
  const setStatus = async (s: QueueStatus, snoozeDays?: number) => {
    const prev = item;
    await save({ status: s, snoozeUntil: snoozeDays ? new Date(Date.now() + snoozeDays * 86_400_000).toISOString() : undefined, ...(s === 'doing' && !item?.baseline && { baseline: e.snap }) }, { at: nowIso(), action: 'status', after: s });
    toast(t(`opt.toast.${s}` as MessageKey), {
      label: t('common.undo'),
      run: () => void (prev ? put('optimize', prev) : save({ status: 'open', snoozeUntil: undefined })),
    });
  };
  const draft = async () => {
    if (!v) return;
    if (item?.draftId) return void (location.hash = `drafts/${encodeURIComponent(item.draftId)}`);
    const d = await videoToDraft(v);
    await save({ draftId: d.id, status: 'doing', ...(!item?.baseline && { baseline: e.snap }) });
    location.hash = `drafts/${encodeURIComponent(d.id)}`;
  };

  return (
    <article className="opt-card" data-status={status} data-testid="opt-card">
      <span className="opt-rank" aria-hidden="true">
        {f.int(rank)}
      </span>
      <Thumb videoId={e.videoId} src={e.thumbnail} width={120} />
      <div className="stack-s" style={{ minWidth: 0 }}>
        <div className="row-between">
          <h3 className="clamp-2">
            <bdi>{e.title}</bdi>
          </h3>
          {status === 'doing' && <span className="badge badge-accent">{t('opt.status.doing')}</span>}
        </div>
        <ul className="opt-reasons">
          {e.signals.map((s) => (
            <li key={s.kind}>
              <b>{t(`opt.kind.${s.kind}` as MessageKey)}</b> <span className="muted">{signalText(t, f, s)}</span>
            </li>
          ))}
        </ul>
        <p className="xsmall faint">{t('opt.why', { n: f.int(e.signals.length) })}</p>
        <div className="row">
          <Button size="s" variant="primary" onClick={() => void draft()}>
            <Icon name="edit" />
            {item?.draftId ? t('opt.openDraft') : t('opt.makeDraft')}
          </Button>
          <a className="btn btn-s" href={`#experiments/new:${encodeURIComponent(e.videoId)}`}>
            <Icon name="layers" />
            {t('opt.abVariants')}
          </a>
          <a className="btn btn-s" href={studioUrl(e.videoId)} target="_blank" rel="noreferrer noopener">
            <Icon name="external" />
            {t('reports.openStudio')}
          </a>
          <Button size="s" variant="ghost" onClick={onToggle} aria-expanded={open}>
            <Icon name="down" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
            {open ? t('opt.less') : t('opt.more')}
          </Button>
        </div>
        {open && (
          <div className="stack opt-detail">
            <ObservationLog e={e} item={item} onLog={(entry) => save({ ...(!item?.baseline && { baseline: e.snap }), status: item?.status === 'open' || !item ? 'doing' : item.status }, entry)} />
            <CoachPanel e={e} medians={medians} />
            <div className="row">
              <Button size="s" onClick={() => void setStatus('done')}>
                <Icon name="check" />
                {t('opt.markDone')}
              </Button>
              <Button size="s" variant="ghost" onClick={() => void setStatus('snoozed', 14)}>
                <Icon name="clock" />
                {t('opt.snooze')}
              </Button>
              <Button size="s" variant="ghost" onClick={() => void setStatus('dismissed')}>
                <Icon name="x" />
                {t('opt.dismiss')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ObservationLog({ e, item, onLog }: { e: QueueEntry; item?: OptimizeItem; onLog: (entry: OptimizeItem['log'][number]) => Promise<unknown> }) {
  const { t } = useI18n();
  const f = useFormat();
  const [action, setAction] = useState<QueueAction>('title');
  const [before, setBefore] = useState(e.title);
  const [after, setAfter] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => setBefore(action === 'title' ? e.title : ''), [action, e.title]);
  const cmp = compareSnaps(item?.baseline, e.snap);
  const fmt = (metric: string, n: number) => (metric === 'ctr' || metric === 'avgViewPercent' ? f.pct(n / 100) : f.int(n));
  return (
    <section className="stack-s" aria-labelledby={`log-${e.videoId}`}>
      <h4 id={`log-${e.videoId}`}>{t('opt.log.title')}</h4>
      {item?.baseline ? (
        <div className="stack-s">
          <p className="xsmall muted">{t('opt.log.baseline', { date: f.date(item.baseline.at), now: f.date(e.snap.at) })}</p>
          {!cmp.ready ? (
            <p className="small">{t('opt.log.wait')}</p>
          ) : cmp.changes.length ? (
            <table className="opt-table">
              <thead>
                <tr>
                  <th>{t('opt.log.metric')}</th>
                  <th>{t('opt.log.before')}</th>
                  <th>{t('opt.log.after')}</th>
                </tr>
              </thead>
              <tbody>
                {cmp.changes.map((c) => (
                  <tr key={c.metric}>
                    <td>{t(`opt.metric.${c.metric}` as MessageKey)}</td>
                    <td>{fmt(c.metric, c.before)}</td>
                    <td>
                      {fmt(c.metric, c.after)} <span className={c.delta >= 0 ? 'opt-up' : 'opt-down'}>({c.delta >= 0 ? '+' : ''}{fmt(c.metric, c.delta)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="small">{t('opt.log.noCommon')}</p>
          )}
          <p className="xsmall faint">{t('opt.log.notCausal')}</p>
        </div>
      ) : (
        <p className="small muted">{t('opt.log.noBaseline')}</p>
      )}
      {!!item?.log.filter((l) => l.action !== 'status').length && (
        <ul className="opt-log">
          {item.log
            .filter((l) => l.action !== 'status')
            .slice(-8)
            .reverse()
            .map((l, i) => (
              <li key={i}>
                <span className="xsmall faint">{f.date(l.at)}</span> <b className="small">{t(`opt.action.${l.action}` as MessageKey)}</b>
                {l.before && (
                  <span className="small" dir="auto">
                    {' '}
                    <del>{l.before}</del>
                  </span>
                )}
                {l.after && (
                  <span className="small" dir="auto">
                    {' → '}
                    {l.after}
                  </span>
                )}
                {l.note && (
                  <span className="small muted" dir="auto">
                    {' · '}
                    {l.note}
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}
      <form
        className="opt-logform"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!after.trim() && !note.trim()) return;
          void onLog({ at: nowIso(), action, ...(before.trim() && { before: before.trim() }), ...(after.trim() && { after: after.trim() }), ...(note.trim() && { note: note.trim() }) }).then(() => {
            setAfter('');
            setNote('');
          });
        }}
      >
        <select className="select" aria-label={t('opt.log.what')} value={action} onChange={(ev) => setAction(ev.target.value as QueueAction)}>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {t(`opt.action.${a}` as MessageKey)}
            </option>
          ))}
        </select>
        {action !== 'note' && <input className="input" dir="auto" aria-label={t('opt.log.before')} placeholder={t('opt.log.before')} value={before} onChange={(ev) => setBefore(ev.target.value)} />}
        {action !== 'note' && <input className="input" dir="auto" aria-label={t('opt.log.after')} placeholder={t('opt.log.after')} value={after} onChange={(ev) => setAfter(ev.target.value)} />}
        <input className="input" dir="auto" aria-label={t('opt.log.note')} placeholder={t('opt.log.note')} value={note} onChange={(ev) => setNote(ev.target.value)} />
        <Button size="s" type="submit">
          <Icon name="plus" />
          {t('opt.log.add')}
        </Button>
      </form>
    </section>
  );
}

function Parked({ items }: { items: OptimizeItem[] }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <details className="opt-parked">
      <summary>{t('opt.parked', { n: f.int(items.length) })}</summary>
      <ul className="stack-s">
        {items.map((x) => (
          <li key={x.id} className="row-between">
            <span className="small" dir="auto">
              <bdi>{x.title}</bdi> <span className="muted">· {t(`opt.status.${effectiveStatus(x)}` as MessageKey)}</span>
              {x.status === 'snoozed' && x.snoozeUntil && <span className="xsmall faint"> · {t('opt.until', { date: f.date(x.snoozeUntil) })}</span>}
            </span>
            <Button size="s" variant="ghost" onClick={() => void put('optimize', { ...x, status: 'open', snoozeUntil: undefined })}>
              {t('opt.reopen')}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
