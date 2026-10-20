// Watch page card (Videolytics): a compact header with the video's key numbers and TubeX checklist score,
// and expandable tabs (Overview, Tags, SEO, Actions). Shows below the title, above the description.
import { useMemo, useState, type ReactNode } from 'react';
import { rpc } from '../../platform/rpc';
import { Icon } from '../../components/icons';
import { Avatar, Score } from '../../components/ui';
import { ageDays, engagementRate, likeRate, pickKeyword, videoSeo, viewsPerDay } from '../../domain/inpage';
import type { ChannelInfo, VideoInfo } from '../../integrations/youtube/api';
import { useI18n } from '../../i18n';
import { useWatchVideoId } from './hooks';
import { cachedRpc, canReadYt, InError, InTabs, Mark, Metric, SetupNeeded, useAsync, useFmt, useStatus, useStored } from '../common';
import { useInpageEnabled } from '../InpageRoot';
import { WatchTags } from './WatchTags';
import { WatchSeo } from './WatchSeo';
import { WatchActions } from './WatchActions';

type Tab = 'overview' | 'tags' | 'seo' | 'actions';

export function WatchCard() {
  const on = useInpageEnabled('watch');
  const videoId = useWatchVideoId();
  if (!on || !videoId) return null;
  return <WatchCardFor key={videoId} videoId={videoId} />;
}

function WatchCardFor({ videoId }: { videoId: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const readable = canReadYt(status);
  const [open, setOpen] = useStored<boolean>('watch.open', false);
  const [tab, setTab] = useStored<Tab>('watch.tab', 'overview');
  const [savedKw, setSavedKw] = useStored<string>(`kw.${videoId}`, '');
  // After an inline edit, read the video fresh (the background caches public data for hours).
  const [rev, setRev] = useState(0);
  const video = useAsync(readable ? `v:${videoId}:${rev}` : null, async () => (rev ? await rpc<VideoInfo[]>('yt.videos', [videoId], true) : await cachedRpc<VideoInfo[]>(10 * 60_000, 'yt.videos', [videoId]))[0] ?? null);
  const v = video.data ?? undefined;
  const channel = useAsync(v?.channelId ? `c:${v.channelId}` : null, () => cachedRpc<ChannelInfo | null>(30 * 60_000, 'yt.channel', { id: v!.channelId }));

  const kw = v ? pickKeyword(savedKw, v.tags) : { keyword: '', source: 'none' as const };
  const seo = useMemo(() => (v ? videoSeo({ title: v.title, description: v.description, tags: v.tags, keyword: kw.keyword }) : null), [v, kw.keyword]);
  const own = !!v && !!status?.channels.some((c) => c.channelId === v.channelId);
  const panelId = `tx-watch-panel`;

  if (status && !readable)
    return (
      <section className="tx-card" aria-label="TubeX">
        <div className="tx-head">
          <Mark />
        </div>
        <SetupNeeded />
      </section>
    );

  const vpd = v ? viewsPerDay(v) : undefined;
  const eng = v ? engagementRate(v) : undefined;
  const lr = v ? likeRate(v) : undefined;

  return (
    <section className="tx-card tx-watch" aria-label={t('inpage.watch.label')}>
      <div className="tx-head">
        <Mark />
        {video.loading && !v && <span className="skel tx-skel-line" aria-busy="true" />}
        {v && (
          <div className="tx-metrics">
            <Metric label={t('inpage.m.vpd')} value={f.compact(vpd)} hint={t('inpage.m.vpdHint')} />
            <Metric label={t('inpage.m.engagement')} value={f.pct(eng)} hint={t('inpage.m.engagementHint')} />
            <Metric label={t('inpage.m.likeRate')} value={f.pct(lr)} hint={t('inpage.m.likeRateHint')} />
            <Metric label={t('inpage.m.age')} value={f.age(ageDays(v.publishedAt))} />
            {own && (
              <span className="tx-badge tx-badge-own">
                <Icon name="star" />
                {t('inpage.yourVideo')}
              </span>
            )}
          </div>
        )}
        <span className="grow" />
        {seo && (
          <button type="button" className="tx-score-btn" onClick={() => (setTab('seo'), setOpen(true))} aria-label={t('inpage.seo.scoreLabel', { n: seo.score ?? 0 })}>
            <Score value={seo.score} label={t('inpage.seo.score')} />
            <span className="xsmall muted">{t('inpage.seo.short')}</span>
          </button>
        )}
        <button type="button" className="icon-btn tx-toggle" aria-expanded={open} aria-controls={panelId} aria-label={open ? t('inpage.hideDetails') : t('inpage.showDetails')} title={open ? t('inpage.hideDetails') : t('inpage.showDetails')} onClick={() => setOpen(!open)}>
          <Icon name="down" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {video.error !== undefined && <InError error={video.error} onRetry={video.reload} />}
      {video.data === null && <p className="small muted">{t('inpage.watch.notFound')}</p>}
      {open && v && (
        <div id={panelId} className="stack-s">
          <InTabs<Tab>
            label={t('inpage.watch.tabs')}
            value={tab}
            onChange={setTab}
            items={[
              { id: 'overview', label: t('inpage.tab.overview'), icon: 'chart' },
              { id: 'tags', label: t('inpage.tab.tags'), icon: 'tag', count: v.tags.length },
              { id: 'seo', label: t('inpage.tab.seo'), icon: 'target' },
              { id: 'actions', label: t('inpage.tab.actions'), icon: 'bulb' },
            ]}
          />
          <div role="tabpanel" className="tx-panel">
            {tab === 'overview' && <Overview v={v} channel={channel.data ?? undefined} channelError={channel.error} />}
            {tab === 'tags' && <WatchTags v={v} />}
            {tab === 'seo' && seo && <WatchSeo v={v} seo={seo} keyword={kw.keyword} keywordSource={kw.source} onKeyword={setSavedKw} />}
            {tab === 'actions' && <WatchActions v={v} own={own} activeChannelId={status?.activeChannelId} onUpdated={() => setRev((n) => n + 1)} />}
          </div>
        </div>
      )}
    </section>
  );
}

function Overview({ v, channel, channelError }: { v: VideoInfo; channel?: ChannelInfo; channelError: unknown }) {
  const { t } = useI18n();
  const f = useFmt();
  const dur = v.durationSec;
  const durText = dur ? `${Math.floor(dur / 3600) ? `${Math.floor(dur / 3600)}:` : ''}${String(Math.floor((dur % 3600) / 60)).padStart(Math.floor(dur / 3600) ? 2 : 1, '0')}:${String(dur % 60).padStart(2, '0')}` : '—';
  return (
    <div className="stack">
      <div className="tx-stats">
        <Stat label={t('inpage.s.views')} value={f.int(v.views)} />
        <Stat label={t('inpage.s.likes')} value={f.int(v.likes)} />
        <Stat label={t('inpage.s.comments')} value={f.int(v.comments)} />
        <Stat label={t('inpage.m.vpd')} value={f.int(viewsPerDay(v))} hint={t('inpage.m.vpdHint')} />
        <Stat label={t('inpage.m.engagement')} value={f.pct(engagementRate(v))} hint={t('inpage.m.engagementHint')} />
        <Stat label={t('inpage.m.likeRate')} value={f.pct(likeRate(v))} hint={t('inpage.m.likeRateHint')} />
        <Stat label={t('inpage.s.duration')} value={<span dir="ltr">{durText}</span>} />
        <Stat label={t('inpage.s.published')} value={<span className="tx-date">{f.date(v.publishedAt)}</span>} />
      </div>
      {(v.views === undefined || v.likes === undefined || v.comments === undefined) && <p className="xsmall muted">{t('inpage.hiddenCounts')}</p>}
      <div className="tx-channel-row">
        {channel ? (
          <>
            <Avatar src={channel.thumbnail} name={channel.title} />
            <div className="stack-s grow" style={{ gap: 0 }}>
              <strong dir="auto">{channel.title}</strong>
              <span className="xsmall muted" dir="ltr">
                {channel.handle}
              </span>
            </div>
            <div className="tx-stats tx-stats-inline">
              <Stat label={t('inpage.s.subs')} value={channel.subscribers === undefined ? t('inpage.hidden') : f.compact(channel.subscribers)} />
              <Stat label={t('inpage.s.totalViews')} value={f.compact(channel.views)} />
              <Stat label={t('inpage.s.videos')} value={f.int(channel.videoCount)} />
              <Stat label={t('inpage.s.avgPerVideo')} value={f.compact(channel.views !== undefined && channel.videoCount ? channel.views / channel.videoCount : undefined)} hint={t('inpage.s.avgPerVideoHint')} />
            </div>
          </>
        ) : channelError ? (
          <InError error={channelError} />
        ) : (
          <span className="skel tx-skel-line" aria-busy="true" />
        )}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="tx-stat" title={hint}>
      <span>{label}</span>
      <b className="num-t">{value}</b>
    </div>
  );
}
