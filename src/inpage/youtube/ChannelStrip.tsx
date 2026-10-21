// Channel page strip (Channelytics): subscribers, total views, videos, average views of the latest uploads,
// upload frequency and last upload, with "Add to competitors" and "Open in TubeX". Two expandable sections (#5):
// Channelytics (lifetime / 30-day figures, compare chart, keywords, channel ID) and Channel Insights inline (the same
// component the TubeX drawer shows; switch 'channelInsights').
import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { channelSummary } from '../../domain/inpage';
import type { ChannelInfo, VideoInfo } from '../../integrations/youtube/api';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { readChannelRef } from '../../platform/youtubeDomInpage';
import { cachedRpc, canReadYt, InError, isUnknownMethod, Mark, SetupNeeded, useAsync, useFmt, useStatus, useStored } from '../common';
import { ChannelInsights, Channelytics } from './insights';
import { useHref, useInpageEnabled } from '../InpageRoot';
import { Stat } from './WatchCard';

type Overview = { channel: ChannelInfo | null; recent: VideoInfo[] };

/** One background call when available; otherwise the core methods (channel, then its uploads). */
async function loadOverview(ref: { id?: string; handle?: string }): Promise<Overview> {
  try {
    return await cachedRpc<Overview>(30 * 60_000, 'inpage.channelOverview', ref);
  } catch (e) {
    if (!isUnknownMethod(e)) throw e;
  }
  const channel = await cachedRpc<ChannelInfo | null>(30 * 60_000, 'yt.channel', ref);
  const recent = channel?.uploadsPlaylistId ? await cachedRpc<VideoInfo[]>(30 * 60_000, 'yt.uploads', channel.uploadsPlaylistId, 10) : [];
  return { channel, recent };
}

export function ChannelStrip() {
  const on = useInpageEnabled('channel');
  const href = useHref();
  const ref = readChannelRef(document, href);
  if (!on || !ref) return null;
  const key = ref.id ?? ref.handle ?? '';
  return <ChannelStripFor key={key} refKey={key} channelRef={ref} />;
}

function ChannelStripFor({ refKey, channelRef }: { refKey: string; channelRef: { id?: string; handle?: string } }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const status = useStatus();
  const readable = canReadYt(status);
  const r = useAsync(readable ? `ch:${refKey}` : null, () => loadOverview(channelRef));
  const [error, setError] = useState<unknown>();
  const ch = r.data?.channel ?? undefined;
  const sum = ch ? channelSummary(ch, r.data?.recent ?? []) : undefined;
  const own = !!ch && !!status?.channels.some((c) => c.channelId === ch.id);
  const insightsOn = useInpageEnabled('channelInsights');
  const [statsOpen, setStatsOpen] = useStored<boolean>('ci.strip.stats', false);
  const [insightsOpen, setInsightsOpen] = useStored<boolean>('ci.strip.insights', false);

  return (
    <section className="tx-card tx-channel" aria-label={t('inpage.channel.label')}>
      <div className="tx-head">
        <Mark />
        <span className="small muted">{t('inpage.channel.kicker')}</span>
        {own && (
          <span className="tx-badge tx-badge-own">
            <Icon name="star" />
            {t('inpage.badge.own')}
          </span>
        )}
        <span className="grow" />
        {ch && !own && (
          <Button
            size="s"
            onClick={async () => {
              setError(undefined);
              try {
                toast((await rpc<boolean>('watch.add', ch.id)) ? t('inpage.act.competitorExists') : t('inpage.act.competitorDone'));
              } catch (e) {
                setError(e);
              }
            }}
          >
            <Icon name="plus" />
            {t('inpage.act.competitor')}
          </Button>
        )}
        <Button size="s" onClick={() => void rpc('ui.openWorkspace', own ? 'mychannel' : 'competitors')}>
          <Icon name="external" />
          {t('inpage.openTubex')}
        </Button>
      </div>
      {status && !readable && <SetupNeeded />}
      {r.loading && !ch && <span className="skel tx-skel-line" aria-busy="true" />}
      {r.error !== undefined && <InError error={r.error} onRetry={r.reload} />}
      {r.data && !r.data.channel && <p className="small muted">{t('inpage.channel.notFound')}</p>}
      {ch && sum && (
        <div className="tx-stats tx-stats-strip">
          <Stat label={t('inpage.s.subs')} value={ch.subscribers === undefined ? t('inpage.hidden') : f.compact(ch.subscribers)} />
          <Stat label={t('inpage.s.totalViews')} value={f.compact(ch.views)} />
          <Stat label={t('inpage.s.videos')} value={f.int(ch.videoCount)} />
          <Stat label={t('inpage.channel.avgRecent', { n: sum.sample })} value={f.compact(sum.avgRecentViews)} hint={t('inpage.channel.avgRecentHint')} />
          <Stat label={t('inpage.channel.freq')} value={sum.uploadsPerWeek === undefined ? '—' : t('inpage.channel.perWeek', { n: f.num(sum.uploadsPerWeek, 1) })} hint={t('inpage.channel.freqHint')} />
          <Stat label={t('inpage.channel.last')} value={sum.lastUploadDays === undefined ? '—' : t('inpage.channel.ago', { age: f.age(sum.lastUploadDays) })} />
        </div>
      )}
      {ch && (
        <div className="ci-strip-toggles">
          <button type="button" className="ci-toggle" aria-expanded={statsOpen} aria-controls="ci-strip-stats" onClick={() => setStatsOpen(!statsOpen)}>
            <Icon name="chart" />
            {t('ci.cl.title')}
            <Icon name="down" className="icon ci-caret" />
          </button>
          {insightsOn && (
            <button type="button" className="ci-toggle" aria-expanded={insightsOpen} aria-controls="ci-strip-insights" onClick={() => setInsightsOpen(!insightsOpen)}>
              <Icon name="pulse" />
              {t('ci.openInsights')}
              <Icon name="down" className="icon ci-caret" />
            </button>
          )}
        </div>
      )}
      {ch && statsOpen && (
        <div id="ci-strip-stats">
          <Channelytics channel={ch} own={own} status={status} onClose={() => setStatsOpen(false)} />
        </div>
      )}
      {ch && insightsOn && insightsOpen && (
        <div id="ci-strip-insights" className="ci-strip-insights">
          <ChannelInsights channelRef={{ id: ch.id }} variant="inline" />
        </div>
      )}
      {error !== undefined && <InError error={error} />}
    </section>
  );
}
