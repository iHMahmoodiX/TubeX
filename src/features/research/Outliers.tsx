// Outlier Discovery Lite (#11): recent public videos doing clearly better than their own baseline, from the
// watchlist's recent uploads or one topic search. Bounded calls, cost shown before the click, raw public facts with a
// qualitative flag (no multiplier score), sample size and collection time, and one click to save as an idea.
import { useCallback, useState } from 'react';
import { useCollection } from '../../components/hooks';
import { Button, Empty, Skeleton } from '../../components/ui';
import { findOutliers, MAX_CHANNELS, PERIODS, UPLOADS_PER_CHANNEL, watchlistUnits, type Outlier, type OutlierBaseline } from '../../domain/outliers';
import { researchFromVideo } from '../../domain/workflow';
import { useI18n } from '../../i18n';
import { channelUploads, searchSample, type VideoInfo } from '../../integrations/youtube/api';
import { getChannels } from '../../integrations/youtube/seoApi';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle, useIntegrations } from '../connections/useConnections';
import { WorkflowButtons } from '../ideas/WorkflowButtons';
import { SectionHead, VideoTracks } from './parts';
import { useAsync, useFormat } from './shared';

type Mode = 'watchlist' | 'topic';
interface Run {
  mode: Mode;
  period: number;
  label: string;
  outliers: Outlier<VideoInfo>[];
  scanned: number;
  groups: number;
  skipped: number;
  fetchedAt: string;
}

async function scanWatchlist(channelIds: string[], period: number): Promise<Run> {
  const ids = channelIds.slice(0, MAX_CHANNELS);
  const meta = await getChannels(ids);
  const groups: { videos: VideoInfo[]; kind: OutlierBaseline }[] = [];
  let skipped = 0;
  for (const id of ids) {
    const pl = meta[id]?.uploadsPlaylistId;
    if (!pl) {
      skipped++;
      continue;
    }
    groups.push({ videos: (await channelUploads(pl, UPLOADS_PER_CHANNEL)).data, kind: 'channel' });
  }
  return { mode: 'watchlist', period, label: '', outliers: findOutliers(groups, period), scanned: groups.reduce((n, g) => n + g.videos.length, 0), groups: groups.length, skipped, fetchedAt: new Date().toISOString() };
}

async function scanTopic(topic: string, period: number): Promise<Run> {
  const s = await searchSample(topic, { order: 'relevance', publishedAfterDays: period, max: 50 });
  return { mode: 'topic', period, label: s.query, outliers: findOutliers([{ videos: s.videos, kind: 'sample' }], period), scanned: s.videos.length, groups: 1, skipped: 0, fetchedAt: s.fetchedAt };
}

export function Outliers({ canRead, initialTopic = '' }: { canRead: boolean; initialTopic?: string }) {
  const { t, lang } = useI18n();
  const f = useFormat();
  const { youtube } = useIntegrations();
  const google = useGoogle();
  const watched = useCollection('watchlist').items;
  const [mode, setMode] = useState<Mode>(watched.length ? 'watchlist' : 'topic');
  const [period, setPeriod] = useState<number>(30);
  const [topic, setTopic] = useState(initialTopic);
  const run = useAsync(useCallback((m: Mode, p: number, q: string, ids: string[]) => (m === 'watchlist' ? scanWatchlist(ids, p) : scanTopic(q, p)), []));
  const ids = watched.map((w) => w.channelId);
  const units = watchlistUnits(ids.length);
  const can = canRead && !run.loading && (mode === 'watchlist' ? ids.length > 0 : !!topic.trim());
  const go = () => can && void run.run(mode, period, topic.trim(), ids);
  const r = run.data;
  const byId = new Map(r?.outliers.map((o) => [o.video.id, o]));

  return (
    <div className="stack-l" data-testid="outliers">
      <p className="small muted">{t('outl.desc')}</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="chips" role="group" aria-label={t('outl.source')}>
          {(['watchlist', 'topic'] as const).map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t(m === 'watchlist' ? 'outl.mode.watchlist' : 'outl.mode.topic')}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label={t('outl.period')}>
          {PERIODS.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {t('outl.days', { n: f.int(p) })}
            </button>
          ))}
        </div>
      </div>
      {mode === 'topic' && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <input className="input grow" dir="auto" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('outl.topicPh')} aria-label={t('outl.topic')} maxLength={120} />
        </form>
      )}
      {mode === 'watchlist' && !ids.length && (
        <Empty icon="users" title={t('outl.noWatch')}>
          <a className="btn btn-s" href="#competitors">
            {t('outl.addCompetitors')}
          </a>
        </Empty>
      )}
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <Button variant="primary" disabled={!can} onClick={go} data-testid="outl-run">
          {t('outl.run')}
        </Button>
        <span className="seo-cost">
          {mode === 'watchlist'
            ? t('outl.costWatch', { units: f.int(units), n: f.int(Math.min(ids.length, MAX_CHANNELS)), per: f.int(UPLOADS_PER_CHANNEL) })
            : t('outl.costTopic', { region: youtube.region, lang: youtube.language })}
        </span>
      </div>
      {mode === 'watchlist' && ids.length > MAX_CHANNELS && <p className="xsmall faint">{t('outl.capped', { n: f.int(MAX_CHANNELS) })}</p>}
      <ErrorNotice error={run.error} />
      {run.loading && <Skeleton lines={5} />}
      {r && !run.loading && (
        <section className="seo-section stack-s" aria-labelledby="outl-h">
          <SectionHead
            id="outl-h"
            title={r.mode === 'topic' ? t('outl.resultsTopic', { q: r.label }) : t('outl.resultsWatch')}
            sub={t('outl.sampled', { n: f.int(r.scanned), groups: f.int(r.groups), days: f.int(r.period), date: f.date(r.fetchedAt), time: new Date(r.fetchedAt).toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })}
          />
          {r.skipped > 0 && <p className="xsmall faint">{t('outl.skipped', { n: f.int(r.skipped) })}</p>}
          {r.outliers.length === 0 ? (
            <Empty icon="search" title={t('outl.none')}>
              {t('outl.noneHelp')}
            </Empty>
          ) : (
            <VideoTracks
              label={t('outl.resultsWatch')}
              videos={r.outliers.map((o) => o.video)}
              mine={google.activeChannelId ? [google.activeChannelId] : []}
              extra={(v) => {
                const o = byId.get(v.id);
                if (!o) return null;
                return (
                  <div className="stack-s" style={{ gap: 6, marginBlockStart: 4 }}>
                    <p className="xsmall">
                      <span className="badge" data-flag={o.flag} style={{ marginInlineEnd: 6 }}>
                        {t(o.flag === 'well-above' ? 'outl.flag.well' : 'outl.flag.above')}
                      </span>
                      <span className="muted">
                        {t(o.baselineKind === 'channel' ? 'outl.factChannel' : 'outl.factSample', { perDay: f.int(Math.round(o.perDay)), base: f.int(Math.round(o.baseline)), n: f.int(o.sampleSize) })}
                      </span>
                    </p>
                    <div className="row" style={{ gap: 6 }}>
                      <WorkflowButtons
                        text={v.title}
                        research={researchFromVideo({
                          title: v.title,
                          views: v.views,
                          publishedAt: v.publishedAt,
                          channelTitle: v.channelTitle,
                          keyword: r.mode === 'topic' ? r.label : undefined,
                          retrievedAt: r.fetchedAt,
                          channelId: google.activeChannelId || undefined,
                          extra: { viewsPerDay: Math.round(o.perDay), baselinePerDay: Math.round(o.baseline), sampleSize: o.sampleSize },
                        })}
                        source={{ kind: 'watch', url: `https://www.youtube.com/watch?v=${v.id}`, videoId: v.id, title: v.title, channelName: v.channelTitle, capturedAt: r.fetchedAt, origin: 'url' }}
                      />
                    </div>
                  </div>
                );
              }}
            />
          )}
          <p className="xsmall faint">{t('outl.method')}</p>
        </section>
      )}
    </div>
  );
}
