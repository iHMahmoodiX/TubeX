// Building blocks shared by the Reports tabs and the Home page: signed-out state, track rows with
// thumbnails, ranked lists, period pills, change badges and loading rows.
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../components/icons';
import { BarChart, Button, Skeleton, Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { useFormat } from '../research/shared';
import './reports.css';

/** Signed-out explanation with the exact sign-in sentence and a way to Settings. */
export function SignedOut({ titleKey = 'reports.signedOut.title', bodyKey = 'reports.signedOut.body', unlocks }: { titleKey?: MessageKey; bodyKey?: MessageKey; unlocks?: { icon: IconName; key: MessageKey }[] }) {
  const { t } = useI18n();
  return (
    <div className="rp-signedout">
      <span className="rp-signedout-icon" aria-hidden="true">
        <Icon name="lock" />
      </span>
      <h2>{t(titleKey)}</h2>
      <p className="muted">{t(bodyKey)}</p>
      {unlocks && (
        <ul className="rp-unlocks">
          {unlocks.map((u) => (
            <li key={u.key}>
              <Icon name={u.icon} />
              <span>{t(u.key)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="bold">{t('mc.signInFirst')}</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <a className="btn btn-primary" href="#settings">
          {t('reports.signIn')}
        </a>
      </div>
    </div>
  );
}

/** Pill group for the analysis period. */
export function PeriodPills({ value, onChange, options = [7, 28, 90, 365] }: { value: number; onChange: (n: number) => void; options?: number[] }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <div className="chips" role="group" aria-label={t('reports.period')}>
      {options.map((n) => (
        <button key={n} type="button" className="chip" aria-pressed={n === value} onClick={() => onChange(n)}>
          {t('reports.days', { n: f.int(n) })}
        </button>
      ))}
    </div>
  );
}

/** Change badge text and tone: green up, red down, '—' when unknown. `invert` for metrics where down is good. */
export function useDelta() {
  const { lang } = useI18n();
  const pct = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  return (c: number | null, invert = false): { text: string; good: boolean | null } => {
    if (c === null || !Number.isFinite(c)) return { text: '—', good: null };
    if (Math.abs(c) < 0.0005) return { text: pct.format(0), good: null };
    return { text: pct.format(c), good: invert ? c < 0 : c > 0 };
  };
}

/** A Spotify-style row: index, thumbnail, title and subtitle, numbers at the end. */
export function VideoTrack({
  n,
  videoId,
  thumbnail,
  title,
  sub,
  end,
  selected,
  onSelect,
  href,
  children,
}: {
  n?: number;
  videoId?: string;
  thumbnail?: string;
  title: string;
  sub?: ReactNode;
  end?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  href?: string;
  children?: ReactNode;
}) {
  const f = useFormat();
  const main = (
    <>
      <Thumb videoId={videoId} src={thumbnail} width={72} />
      <span className="stack-s grow" style={{ gap: 0 }}>
        <span className="track-title truncate">
          <bdi>{title}</bdi>
        </span>
        {sub && <span className="track-sub">{sub}</span>}
      </span>
    </>
  );
  return (
    <div className="track rp-track" data-selected={selected ? 'true' : undefined}>
      <span className="track-n">{n !== undefined ? f.int(n) : ''}</span>
      <div className="stack-s" style={{ minWidth: 0, gap: 4 }}>
        {onSelect ? (
          <button type="button" className="track-main rp-track-btn" aria-pressed={selected} onClick={onSelect}>
            {main}
          </button>
        ) : href ? (
          <a className="track-main rp-track-link" href={href} target="_blank" rel="noreferrer noopener">
            {main}
          </a>
        ) : (
          <div className="track-main">{main}</div>
        )}
        {children}
      </div>
      {end && <div className="track-end rp-track-end">{end}</div>}
    </div>
  );
}

/** Compact ranked list with a proportional bar (search terms, sources, countries). */
export function RankedList({ items, label, empty }: { items: { key: string; label: ReactNode; value: number; display?: string }[]; label: string; empty?: string }) {
  const f = useFormat();
  const { t } = useI18n();
  if (!items.length) return <p className="small muted">{empty ?? t('mc.noData')}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="rp-ranked" aria-label={label}>
      {items.map((it, i) => (
        <li key={it.key}>
          <span className="rp-ranked-n">{f.int(i + 1)}</span>
          <span className="grow stack-s" style={{ gap: 4, minWidth: 0 }}>
            <span className="row-between" style={{ flexWrap: 'nowrap' }}>
              <span className="truncate" dir="auto">
                {it.label}
              </span>
              <span className="num-t muted small">{it.display ?? f.int(it.value)}</span>
            </span>
            <span className="rp-bar" aria-hidden="true">
              <i style={{ width: `${(it.value / max) * 100}%` }} />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function TrackSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="tracks" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="track">
          <span />
          <div className="track-main">
            <span className="thumb skel" style={{ width: 72 }} />
            <span className="grow">
              <Skeleton lines={2} />
            </span>
          </div>
          <span />
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="stats" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="stat">
          <div className="skel" style={{ width: '50%' }} />
          <div className="skel" style={{ width: '70%', minHeight: 24 }} />
        </div>
      ))}
    </div>
  );
}

/** Labelled section with an optional action at the end of its title row. */
export function Section({ title, sub, action, children, id }: { title: string; sub?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-title rp-section-title">
        <div className="stack-s" style={{ gap: 2 }}>
          <h2 id={id}>{title}</h2>
          {sub && <p className="small muted">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EstimateBadge({ k = 'reports.estimate' }: { k?: MessageKey }) {
  const { t } = useI18n();
  return <span className="badge badge-warning">{t(k)}</span>;
}

/** Studio and watch links, shown as small pills. */
export function VideoLinks({ id, studio = true }: { id: string; studio?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {studio && (
        <a className="btn btn-s btn-ghost" href={`https://studio.youtube.com/video/${encodeURIComponent(id)}/edit`} target="_blank" rel="noreferrer noopener">
          <Icon name="external" />
          {t('reports.openStudio')}
        </a>
      )}
    </>
  );
}

/** BarChart that reads in the page direction (mirrored in Persian so the first item is at the start side). */
export function DirBarChart(props: Parameters<typeof BarChart>[0]) {
  const { dir } = useI18n();
  return (
    <div style={dir === 'rtl' ? { transform: 'scaleX(-1)' } : undefined}>
      <BarChart {...props} />
    </div>
  );
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button size="s" variant="ghost" disabled={loading} onClick={onClick}>
      <Icon name="refresh" />
      {loading ? t('common.loading') : t('research.refresh')}
    </Button>
  );
}
