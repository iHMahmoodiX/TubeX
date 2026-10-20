// Health Report: a 0–100 channel scorecard with transparent sub-scores, their inputs, formula and one
// concrete recommendation each. Optional daily snapshot (background tick) to follow the score over time.
import { useCallback, useEffect, useMemo } from 'react';
import { Icon } from '../../components/icons';
import { BarChart, Notice, Score, Switch } from '../../components/ui';
import { useWork } from '../../components/useWork';
import type { HealthId, SubScore } from '../../domain/reports';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { del, put } from '../../storage/stores';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useAsync, useFormat } from '../research/shared';
import { computeHealth, healthRef, healthTrackerId, type RVideo } from './data';
import type { ReportTab } from './ReportsView';
import { StatSkeleton } from './shared';

const ORDER: HealthId[] = ['consistency', 'trend', 'engagement', 'watch', 'subscribers', 'metadata', 'ctr'];

/** Where each recommendation leads. */
const ACTION: Partial<Record<HealthId, { tab?: ReportTab; hash?: string; label: MessageKey }>> = {
  consistency: { hash: 'schedule', label: 'reports.health.go.schedule' },
  trend: { tab: 'opportunities', label: 'reports.health.go.opportunities' },
  engagement: { hash: 'comments', label: 'reports.health.go.comments' },
  watch: { tab: 'retention', label: 'reports.health.go.retention' },
  subscribers: { tab: 'besttime', label: 'reports.health.go.besttime' },
  metadata: { tab: 'audit', label: 'reports.health.go.audit' },
  ctr: { tab: 'clickmagnet', label: 'reports.health.go.clickmagnet' },
};

export function HealthTab({ channelId, videos, onTab }: { channelId: string; videos: RVideo[]; onTab: (t: ReportTab) => void }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const load = useCallback((fresh: boolean) => computeHealth(channelId, videos, fresh), [channelId, videos]);
  const { data, error, loading, run } = useAsync(load);
  useEffect(() => {
    void run(false);
  }, [run]);
  const trackers = useWork('trackers');
  const snaps = useWork('snapshots');
  const tracking = trackers.items.some((x) => x.id === healthTrackerId(channelId) && x.enabled);
  const hist = useMemo(
    () =>
      snaps.items
        .filter((s) => s.ref === healthRef(channelId) && typeof s.data.total === 'number')
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-60),
    [snaps.items, channelId],
  );

  const toggle = async (on: boolean) => {
    if (on)
      await put('trackers', {
        id: healthTrackerId(channelId),
        kind: 'reports.health',
        label: t('reports.health.trackerLabel'),
        config: { channelId },
        createdAt: new Date().toISOString(),
        enabled: true,
      });
    else await del('trackers', healthTrackerId(channelId));
  };

  const h = data?.health;
  const summaryKey: MessageKey | null = !h || h.total === null ? null : h.total >= 70 ? 'reports.health.summary.high' : h.total >= 40 ? 'reports.health.summary.mid' : 'reports.health.summary.low';

  return (
    <div className="stack-l">
      <ErrorNotice error={error} />
      {!h ? (
        loading && (
          <>
            <div className="rp-score-hero" aria-busy="true">
              <div className="score score-l" />
              <div className="grow">
                <StatSkeleton n={1} />
              </div>
            </div>
            <StatSkeleton n={6} />
          </>
        )
      ) : (
        <>
          <div className="rp-score-hero">
            <Score value={h.total} large label={t('reports.health.score')} />
            <div className="stack-s grow" style={{ minWidth: 220 }}>
              <span className="page-kicker">{t('reports.health.score')}</span>
              <h2 style={{ fontSize: 28 }}>{h.total === null ? t('reports.health.notEnough') : t(summaryKey!)}</h2>
              <p className="muted small">{t('reports.health.basis', { n: h.available, total: ORDER.length, when: formatDate(data!.computedAt) })}</p>
              <Switch checked={tracking} onChange={(v) => void toggle(v)} label={t('reports.health.track')} />
              <p className="xsmall faint">{t('reports.health.trackHelp')}</p>
            </div>
            {hist.length >= 2 && (
              <div className="stack-s" style={{ flex: '1 1 220px', maxWidth: 360 }}>
                <span className="small muted">{t('reports.health.history', { n: hist.length })}</span>
                <BarChart
                  values={hist.map((s) => s.data.total as number)}
                  labels={hist.map((s) => formatDate(s.at))}
                  height={72}
                  label={t('reports.health.history', { n: hist.length })}
                  highlight={hist.length - 1}
                />
              </div>
            )}
          </div>
          {data!.ctrError !== undefined && (
            <Notice>
              <p>{t('reports.health.ctrMissing')}</p>
            </Notice>
          )}
          <div className="rp-grid-3">
            {ORDER.map((id) => {
              const p = h.parts.find((x) => x.id === id)!;
              return <SubCard key={id} p={p} onGo={() => (ACTION[id]?.tab ? onTab(ACTION[id]!.tab!) : (location.hash = ACTION[id]!.hash!))} />;
            })}
          </div>
          <p className="small faint">{t('reports.health.note', { n: f.int(data!.audited) })}</p>
        </>
      )}
    </div>
  );
}

function SubCard({ p, onGo }: { p: SubScore; onGo: () => void }) {
  const { t, lang } = useI18n();
  const f = useFormat();
  const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : f.int(v));
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : f.pct(v));
  const i = p.inputs;
  const rows: [MessageKey, string][] = (() => {
    switch (p.id) {
      case 'consistency':
        return [
          ['reports.health.in.uploads90', num(i.uploads90)],
          ['reports.health.in.activeWeeks', i.activeWeeks === null ? '—' : t('reports.health.ofWeeks', { n: f.int(i.activeWeeks!) })],
          ['reports.health.in.longestGap', i.longestGapDays === null ? '—' : t('reports.health.daysN', { n: f.int(i.longestGapDays!) })],
        ];
      case 'trend':
        return [
          ['reports.health.in.views28', num(i.views28)],
          ['reports.health.in.viewsPrev28', num(i.viewsPrev28)],
          ['reports.health.in.change', i.change === null ? '—' : f.pct(i.change!)],
        ];
      case 'engagement':
        return [
          ['reports.health.in.interactions', num(i.interactions)],
          ['reports.health.in.views28', num(i.views28)],
          ['reports.health.in.rate', pct(i.rate)],
        ];
      case 'watch':
        return [
          ['reports.health.in.avgPercent', i.avgViewPercent === null ? '—' : f.pct(i.avgViewPercent! / 100)],
          ['reports.health.in.minutesPerView', i.minutesPerView === null ? '—' : f.duration(Math.round(i.minutesPerView! * 60))],
        ];
      case 'subscribers':
        return [
          ['reports.health.in.net', num(i.net)],
          ['reports.health.in.per1k', i.per1k === null ? '—' : (Math.round(i.per1k! * 10) / 10).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US')],
        ];
      case 'metadata':
        return [['reports.health.in.share', pct(i.share)]];
      default:
        return [['reports.health.in.ctr', pct(i.ctr)]];
    }
  })();
  const recKey = (p.band ? `reports.health.rec.${p.id}.${p.band}` : `reports.health.rec.${p.id}.none`) as MessageKey;
  return (
    <article className="rp-sub" aria-labelledby={`hs-${p.id}`}>
      <div className="rp-sub-head">
        <Score value={p.score} label={t(`reports.health.part.${p.id}` as MessageKey)} />
        <div className="stack-s grow" style={{ gap: 0 }}>
          <h3 id={`hs-${p.id}`}>{t(`reports.health.part.${p.id}` as MessageKey)}</h3>
          <span className="xsmall muted">{t('reports.health.weight', { n: p.weight })}</span>
        </div>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{t(k)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="rp-formula">{t(`reports.health.formula.${p.id}` as MessageKey)}</p>
      <div className="rp-rec">
        <Icon name="bulb" />
        <span className="grow">{t(recKey)}</span>
      </div>
      <div>
        <button type="button" className="btn btn-s" onClick={onGo}>
          {t(ACTION[p.id]!.label)}
        </button>
      </div>
    </article>
  );
}
