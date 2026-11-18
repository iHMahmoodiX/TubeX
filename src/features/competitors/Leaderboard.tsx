// Niche leaderboard: daily snapshots of watched channels and the owner's channels, ranked by growth,
// upload rate or average views. Growth needs two snapshots on different days; until then it shows —.
import { useMemo, useState } from 'react';
import { leaderRow, sortLeaders, type Growth, type LeaderSort, type NichePoint } from '../../domain/seo';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Avatar, Button, Empty, Notice } from '../../components/ui';
import { useWork } from '../../components/useWork';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle } from '../connections/useConnections';
import { NICHE_SETTINGS, nicheCost, takeNicheSnapshots, type NicheSnapshot } from '../ranks/service';
import { SectionHead, Sparkline } from '../research/parts';
import { useFormat } from '../research/shared';

const SORTS: { id: LeaderSort; label: MessageKey }[] = [
  { id: 'subs30', label: 'seo.lead.subs30' },
  { id: 'subs7', label: 'seo.lead.subs7' },
  { id: 'views30', label: 'seo.lead.views30' },
  { id: 'uploads30', label: 'seo.lead.uploads30' },
  { id: 'avgViews', label: 'seo.lead.avg10' },
  { id: 'subs', label: 'yt.subscribers' },
];

export function Leaderboard({ canRead }: { canRead: boolean }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const google = useGoogle();
  const watch = useCollection('watchlist').items;
  const snaps = useWork('snapshots').items;
  const trackers = useWork('trackers').items;
  const [by, setBy] = useState<LeaderSort>('subs30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const settings = trackers.find((x) => x.id === NICHE_SETTINGS);

  const chans = useMemo(() => {
    const out = google.channels.map((c) => ({ channelId: c.channelId, title: c.title, mine: true }));
    for (const w of watch) if (!out.some((x) => x.channelId === w.channelId)) out.push({ channelId: w.channelId, title: w.title, mine: false });
    return out;
  }, [google.channels, watch]);
  const rows = useMemo(() => {
    const byRef = new Map<string, { at: string; data: NicheSnapshot }[]>();
    for (const s of snaps) if (s.ref.startsWith('niche:')) byRef.set(s.ref, [...(byRef.get(s.ref) ?? []), { at: s.at, data: s.data as unknown as NicheSnapshot }]);
    return chans.map((c) => {
      const hist = byRef.get(`niche:${c.channelId}`) ?? [];
      const points: NichePoint[] = hist.map((h) => ({ at: h.at, ...h.data }));
      const last = hist.sort((a, b) => a.at.localeCompare(b.at))[hist.length - 1]?.data;
      return { row: leaderRow(c.channelId, last?.title ?? c.title, c.mine, points), thumb: last?.thumbnail };
    });
  }, [chans, snaps]);
  const sorted = sortLeaders(
    rows.map((r) => r.row),
    by,
  );
  const thumbOf = (id: string) => rows.find((r) => r.row.channelId === id)?.thumb;
  const anyHistory = rows.some((r) => r.row.history.length > 0);
  const anyGrowth = rows.some((r) => r.row.history.length > 1);

  async function take() {
    setBusy(true);
    setError(null);
    try {
      const n = await takeNicheSnapshots();
      toast(t('seo.lead.taken', { n }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const growthCell = (g: Growth | null) => {
    if (!g) return <span className="faint">—</span>;
    const sign = g.abs > 0 ? '+' : '';
    return (
      <span className={g.abs > 0 ? 'pos' : g.abs < 0 ? 'neg' : 'faint'} title={g.partial ? t('seo.lead.partial', { n: f.int(Math.max(1, Math.round(g.spanDays))) }) : undefined}>
        <bdi dir="ltr">
          {sign}
          {f.compact(g.abs)}
        </bdi>
        {g.pct !== undefined && <small className="faint"> {f.pct(g.pct)}</small>}
        {g.partial && '*'}
      </span>
    );
  };

  if (!chans.length)
    return (
      <Empty icon="trophy" title={t('seo.lead.emptyTitle')}>
        {t('seo.lead.emptyHelp')}
      </Empty>
    );

  return (
    <section className="seo-section" aria-labelledby="lead-h">
      <SectionHead
        id="lead-h"
        title={t('seo.comp.tab.leaderboard')}
        sub={settings?.lastCheckedAt ? t('seo.lead.last', { when: formatDate(settings.lastCheckedAt) }) : t('seo.lead.none')}
        actions={
          <Button size="s" disabled={busy || !canRead} onClick={() => void take()} title={t('seo.lead.cost', { n: f.int(nicheCost(chans.length)) })}>
            {busy ? t('common.loading') : t('seo.lead.take')}
          </Button>
        }
      />
      <div className="chips" role="group" aria-label={t('seo.lead.sortBy')}>
        {SORTS.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={by === s.id} onClick={() => setBy(s.id)}>
            {t(s.label)}
          </button>
        ))}
      </div>
      <ErrorNotice error={error} />
      {!anyHistory ? (
        <Empty
          icon="trophy"
          title={t('seo.lead.firstTitle')}
          action={
            <Button variant="primary" disabled={busy || !canRead} onClick={() => void take()}>
              {t('seo.lead.takeFirst', { n: f.int(nicheCost(chans.length)) })}
            </Button>
          }
        >
          {t('seo.lead.firstHelp')}
        </Empty>
      ) : (
        !anyGrowth && <Notice>{t('seo.lead.needTwo')}</Notice>
      )}
      {anyHistory && (
      <div className="table-wrap">
        <table className="table seo-lead">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('yt.col.channel')}</th>
              <th className="num">{t('yt.subscribers')}</th>
              <th className="num">{t('seo.lead.subs7')}</th>
              <th className="num">{t('seo.lead.subs30')}</th>
              <th className="num">{t('seo.lead.views30')}</th>
              <th className="num">{t('seo.lead.uploads30')}</th>
              <th className="num">{t('seo.lead.avg10')}</th>
              <th>{t('seo.lead.trend')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.channelId} data-mine={r.mine || undefined}>
                <td>{f.int(i + 1)}</td>
                <td>
                  <span className="seo-ch-cell">
                    <Avatar src={thumbOf(r.channelId)} name={r.title} />
                    <span className="stack-s" style={{ gap: 0, minWidth: 0 }}>
                      <a className="truncate bold" href={`https://www.youtube.com/channel/${r.channelId}`} target="_blank" rel="noreferrer noopener" dir="auto" style={{ textDecoration: 'none' }}>
                        {r.title}
                      </a>
                      {r.mine && <span className="xsmall" style={{ color: 'var(--accent-text)' }}>{t('seo.yours')}</span>}
                    </span>
                  </span>
                </td>
                <td className="num">{r.latest ? (r.latest.subscribers === undefined ? t('yt.hidden') : f.compact(r.latest.subscribers)) : '—'}</td>
                <td className="num">{growthCell(r.subs7)}</td>
                <td className="num">{growthCell(r.subs30)}</td>
                <td className="num">{growthCell(r.views30)}</td>
                <td className="num">{f.int(r.latest?.uploads30)}</td>
                <td className="num">{f.compact(r.latest?.avgViews10)}</td>
                <td>
                  <Sparkline values={r.history.map((p) => p.subscribers)} label={t('seo.lead.trendOf', { name: r.title })} tone={r.subs30 && r.subs30.abs > 0 ? 'up' : r.subs30 && r.subs30.abs < 0 ? 'down' : undefined} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <p className="xsmall faint">{t('seo.lead.note', { n: f.int(nicheCost(chans.length)) })}</p>
    </section>
  );
}
