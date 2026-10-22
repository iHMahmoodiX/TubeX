// Small building blocks shared by Research, Rankings and Competitors.
import type { ReactNode } from 'react';
import './seo.css';
import { viewsPerDay } from '../../domain/research';
import { BUCKETS, type LangBucket, type LangMix } from '../../domain/seoLanguage';
import { Icon } from '../../components/icons';
import { Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { useFormat } from './shared';

export interface TrackVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  views?: number;
  thumbnail?: string;
}

/** Spotify-style list of videos: position, thumbnail, title and channel, views, views/day and age. */
export function VideoTracks({ videos, mine = [], highlight, positions, extra, label }: { videos: TrackVideo[]; mine?: string[]; highlight?: string; positions?: number[]; extra?: (v: TrackVideo) => ReactNode; label: string }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <div>
      <div className="seo-track-head" aria-hidden="true">
        <span style={{ textAlign: 'center' }}>#</span>
        <span>{t('yt.col.title')}</span>
        <span className="seo-track-end">
          <span className="seo-num">{t('yt.col.views')}</span>
          <span className="seo-num seo-hide-s">{t('yt.col.perDay')}</span>
          <span className="seo-num seo-hide-s">{t('yt.col.age')}</span>
        </span>
      </div>
      <ol className="seo-tracks" aria-label={label}>
        {videos.map((v, i) => {
          const isMine = mine.includes(v.channelId) || highlight === v.id;
          return (
            <li key={`${v.id}-${i}`} className="seo-track" data-mine={isMine || undefined}>
              <span className="track-n">{f.int(positions?.[i] ?? i + 1)}</span>
              <div className="seo-track-main">
                <Thumb videoId={v.id} src={v.thumbnail} width={88} />
                <div className="seo-track-text">
                  <a className="seo-track-title truncate" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer noopener" dir="auto" title={v.title}>
                    {v.title}
                  </a>
                  <span className="seo-track-sub truncate">
                    <bdi>{v.channelTitle}</bdi>
                    {isMine && <span className="badge badge-accent" style={{ marginInlineStart: 6 }}>{t('seo.yours')}</span>}
                  </span>
                  {extra?.(v)}
                </div>
              </div>
              <span className="seo-track-end">
                <span className="seo-num">{f.compact(v.views)}</span>
                <span className="seo-num seo-hide-s">{f.compact(viewsPerDay(v))}</span>
                <span className="seo-num seo-hide-s">{f.age(v.publishedAt)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Change in rank: up (better), down or unchanged. */
export function Delta({ delta }: { delta: number | null | undefined }) {
  const { t } = useI18n();
  const f = useFormat();
  if (delta === null || delta === undefined) return null;
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const label = dir === 'up' ? t('seo.rank.up', { n: delta }) : dir === 'down' ? t('seo.rank.down', { n: -delta }) : t('seo.rank.same');
  return (
    <span className="seo-delta" data-dir={dir} title={label} aria-label={label}>
      {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='}
      {dir !== 'flat' && f.int(Math.abs(delta))}
    </span>
  );
}

/** Tiny line of a series. `invert` draws smaller values higher (rank positions). Missing values are gaps. */
export function Sparkline({ values, invert, label, tone }: { values: (number | null | undefined)[]; invert?: boolean; label: string; tone?: 'up' | 'down' }) {
  const xs = values.map((v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v));
  const defined = xs.filter((v): v is number => v !== null);
  if (defined.length < 2) return <span className="faint xsmall" aria-label={label}>—</span>;
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const W = 88;
  const H = 28;
  const px = (i: number) => (xs.length === 1 ? W / 2 : (i / (xs.length - 1)) * (W - 4) + 2);
  const py = (v: number) => {
    const r = max === min ? 0.5 : (v - min) / (max - min);
    return 2 + (invert ? r : 1 - r) * (H - 4);
  };
  let d = '';
  let pen = false;
  xs.forEach((v, i) => {
    if (v === null) return void (pen = false);
    d += `${pen ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)} `;
    pen = true;
  });
  return (
    <svg className="seo-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-tone={tone}>
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const LANG_KEYS: Record<LangBucket, MessageKey> = {
  fa: 'seo.lang.fa',
  ar: 'seo.lang.ar',
  en: 'seo.lang.en',
  latin: 'seo.lang.latin',
  other: 'seo.lang.other',
};

/** Language shares as small pills, dominant first. */
export function MixChips({ mix }: { mix: LangMix }) {
  const { t } = useI18n();
  const f = useFormat();
  if (!mix.total) return <span className="xsmall faint">—</span>;
  const order = [...BUCKETS].filter((b) => mix.counts[b] > 0).sort((a, b) => mix.counts[b] - mix.counts[a]);
  return (
    <span className="seo-mix">
      {order.map((b) => (
        <span key={b} data-main={b === mix.dominant || undefined}>
          {t(LANG_KEYS[b])} {f.pct(mix.shares[b])}
        </span>
      ))}
    </span>
  );
}

/** Horizontal share bars per language. */
export function MixBars({ mix, label }: { mix: LangMix; label: string }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <div className="seo-bars" role="list" aria-label={label}>
      {BUCKETS.map((b) => (
        <div key={b} className="seo-bar" role="listitem">
          <span>{t(LANG_KEYS[b])}</span>
          <div className="meter" data-tone={b === mix.dominant ? undefined : 'muted'}>
            <i style={{ width: `${Math.round(mix.shares[b] * 100)}%` }} />
          </div>
          <span>{mix.total ? f.pct(mix.shares[b]) : '—'}</span>
        </div>
      ))}
    </div>
  );
}

export function SectionHead({ title, actions, sub, id }: { title: string; actions?: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <div className="stack-s" style={{ gap: 4 }}>
      <div className="seo-section-head">
        <h2 id={id}>{title}</h2>
        {actions && <div className="row">{actions}</div>}
      </div>
      {sub && <p className="small muted">{sub}</p>}
    </div>
  );
}

/** "Sign in or add a key" notice for public reads. Keeps the existing no-key text and says signing in is enough. */
export function NeedsAccess() {
  const { t } = useI18n();
  return (
    <div className="notice notice-warning" role="status">
      <span className="notice-icon">
        <Icon name="key" />
      </span>
      <div className="grow stack-s">
        <p>{t('yt.error.no-key')}</p>
        <p className="small muted">{t('seo.signInEnough')}</p>
        <div>
          <a className="btn btn-s" href="#settings">
            {t('conn.openSettings')}
          </a>
        </div>
      </div>
    </div>
  );
}
