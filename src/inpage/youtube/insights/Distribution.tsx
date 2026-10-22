// Niche insights: performance distribution of a channel's uploads against the channel's own baseline (views ÷ median
// views of the same group, Shorts vs long-form), percentile bands, and the outliers (hits and flops). The channel can
// be this one or any niche channel; other channels' uploads are loaded on demand with their cost shown first.
import { useMemo, useState } from 'react';
import { Avatar, Thumb } from '../../../components/ui';
import { performance, uploadsCost, UPLOADS_DEFAULT, type Band, type PerfItem } from '../../../domain/channelInsights';
import type { VideoInfo } from '../../../integrations/youtube/api';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/en';
import { InError, useAsync } from '../../common';
import { CostNote, KindBadge, Section, useCiFmt } from './bits';
import { DistributionPlot } from './charts';
import { loadUploads } from './data';

export interface Subject {
  channelId: string;
  title: string;
  thumbnail?: string;
}

const BAND_KEY: Record<Band, MessageKey> = { typical: 'ci.band.typical', uncommon: 'ci.band.uncommon', rare: 'ci.band.rare', veryRare: 'ci.band.veryRare' };
const BAND_RANGE: Record<Band, string> = { typical: '0–75', uncommon: '75–85', rare: '85–95', veryRare: '95–100' };

export function NicheInsights({ self, selfVideos, others, id }: { self: Subject; selfVideos: VideoInfo[]; others: Subject[]; id: string }) {
  const { t } = useI18n();
  const [pick, setPick] = useState(self.channelId);
  const subject = [self, ...others].find((s) => s.channelId === pick) ?? self;
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const needLoad = pick !== self.channelId && !asked.has(pick);
  const other = useAsync(pick !== self.channelId && asked.has(pick) ? `ci:up:${pick}:${UPLOADS_DEFAULT}` : null, () => loadUploads(pick, UPLOADS_DEFAULT));
  const videos = pick === self.channelId ? selfVideos : other.data;

  return (
    <Section id={`ci-dist-${id}`} icon="target" title={t('ci.dist.title')} desc={t('ci.dist.desc')}>
      {others.length > 0 && (
        <div className="chips ci-subjects" role="group" aria-label={t('ci.dist.channel')}>
          {[self, ...others].map((s) => (
            <button key={s.channelId} type="button" className="chip" aria-pressed={pick === s.channelId} onClick={() => setPick(s.channelId)}>
              <Avatar src={s.thumbnail} name={s.title} />
              <bdi>{s.channelId === self.channelId ? t('ci.dist.thisChannel') : s.title}</bdi>
            </button>
          ))}
        </div>
      )}
      {needLoad && (
        <div className="ci-load">
          <CostNote units={uploadsCost(UPLOADS_DEFAULT) + 1}>{t('ci.dist.loadWhy', { n: UPLOADS_DEFAULT, name: subject.title })}</CostNote>
          <button type="button" className="btn btn-s btn-primary" onClick={() => setAsked(new Set([...asked, pick]))}>
            {t('ci.dist.load')}
          </button>
        </div>
      )}
      {other.loading && <div className="skel ci-chart-skel" aria-busy="true" />}
      {other.error !== undefined && <InError error={other.error} onRetry={other.reload} />}
      {videos && <Dist videos={videos} />}
    </Section>
  );
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 1;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
};

function Dist({ videos }: { videos: VideoInfo[] }) {
  const { t } = useI18n();
  const f = useCiFmt();
  const perf = useMemo(() => performance(videos, Date.now()), [videos]);
  const ratios = useMemo(() => perf.items.map((i) => i.ratio).filter(Number.isFinite).sort((a, b) => a - b), [perf]);
  const n = perf.items.length;
  if (!n)
    return (
      <p className="small muted">
        {t('ci.dist.notEnough', { min: 5 })} {perf.tooNew.length > 0 && t('ci.dist.tooNew', { n: perf.tooNew.length })}
      </p>
    );
  const edges = { p50: t('ci.dist.median'), p75: quantile(ratios, 0.75), p85: quantile(ratios, 0.85), p95: quantile(ratios, 0.95) };
  return (
    <div className="ci-dist-wrap">
      <div className="ci-bands">
        {(['typical', 'uncommon', 'rare', 'veryRare'] as const).map((b) => (
          <div key={b} className="ci-bandtile" data-band={b}>
            <span className="xsmall">
              {t(BAND_KEY[b])} <span className="faint ltr">{BAND_RANGE[b]}%</span>
            </span>
            <b className="num-t">{f.int(perf.counts[b])}</b>
            <span className="xsmall muted">{f.pct((perf.counts[b] / n) * 100)}</span>
          </div>
        ))}
      </div>
      <DistributionPlot items={perf.items} label={t('ci.dist.plot')} edges={edges} />
      <p className="xsmall muted">
        {t('ci.dist.baseline', { long: f.compact(perf.baseline.long), short: f.compact(perf.baseline.short) })}
        {perf.thin.length > 0 && ` ${t('ci.dist.thin')}`}
        {perf.tooNew.length > 0 && ` ${t('ci.dist.tooNew', { n: perf.tooNew.length })}`}
        {perf.hidden.length > 0 && ` ${t('ci.dist.hidden', { n: perf.hidden.length })}`}
      </p>
      <div className="ci-outliers">
        <OutlierList title={t('ci.dist.hits')} empty={t('ci.dist.noHits')} items={perf.hits.slice(0, 8)} />
        <OutlierList title={t('ci.dist.flops')} empty={t('ci.dist.noFlops')} items={perf.flops.slice(0, 8)} />
      </div>
      <p className="xsmall faint">{t('ci.dist.rule')}</p>
    </div>
  );
}

function OutlierList({ title, empty, items }: { title: string; empty: string; items: PerfItem[] }) {
  const { t } = useI18n();
  const f = useCiFmt();
  return (
    <div className="ci-olist">
      <h4 className="small">{title}</h4>
      {!items.length && <p className="xsmall muted">{empty}</p>}
      <ul className="ci-vlist">
        {items.map((it) => (
          <li key={it.video.id}>
            <a className="ci-vrow" href={`https://www.youtube.com/watch?v=${it.video.id}`}>
              <Thumb videoId={it.video.id} src={it.video.thumbnail} width={88} />
              <span className="grow ci-vrow-main">
                <bdi className="ci-vtitle">{it.video.title}</bdi>
                <span className="xsmall muted">
                  {t('ci.views', { v: f.compact(it.video.views) })} · {f.sdate(it.video.publishedAt)} · <KindBadge durationSec={it.video.durationSec} />
                </span>
              </span>
              <span className="ci-ratio" data-band={it.flop ? 'flop' : it.band}>
                <b className="num-t">{f.ratio(it.ratio)}</b>
                <small>{it.flop ? t('ci.band.flop') : t(BAND_KEY[it.band])}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
