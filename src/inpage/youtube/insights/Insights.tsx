// Channel Insights for one channel: header (avatar, name, counts, niche actions), first-run intro, and three views:
// Channel (growth benchmark, compared to you / niche, content calendar, activity feed), Niche insights (performance
// distribution and outliers) and Topics (topics × channels). Shared by the strip ("Open insights") and the drawer.
import { useState } from 'react';
import { Icon } from '../../../components/icons';
import { Avatar, IconButton } from '../../../components/ui';
import { useToast } from '../../../components/toasts';
import { uploadsCost, UPLOADS_DEFAULT, UPLOADS_MAX } from '../../../domain/channelInsights';
import { useI18n } from '../../../i18n';
import { canReadYt, InError, InTabs, SetupNeeded, useAsync, useStatus, useStored } from '../../common';
import { CostNote, useCiFmt } from './bits';
import { ActivityFeed, ContentCalendar } from './Calendar';
import { addToNiche, loadChannel, loadNiche, loadUploads, removeFromNiche, undoRemove, type ChannelRef } from './data';
import { NicheInsights, type Subject } from './Distribution';
import { GrowthBlock } from './Growth';
import { Intro, type IntroTab } from './Intro';
import { NicheManager } from './Niche';
import { TopicalAnalysis } from './Topics';

type View = 'channel' | 'niche' | 'topics';

export function ChannelInsights({ channelRef, variant }: { channelRef: ChannelRef; variant: 'inline' | 'drawer' }) {
  const { t } = useI18n();
  const status = useStatus();
  const readable = canReadYt(status);
  const key = channelRef.id ?? channelRef.handle ?? '';
  const cd = useAsync(readable ? `ci:ch:${key}` : null, () => loadChannel(channelRef));
  if (status && !readable) return <SetupNeeded />;
  if (cd.error !== undefined) return <InError error={cd.error} onRetry={cd.reload} />;
  if (cd.data && !cd.data.channel) return <p className="small muted">{t('inpage.channel.notFound')}</p>;
  const ch = cd.data?.channel;
  if (!ch) return <div className="skel ci-head-skel" aria-busy="true" />;
  return <Body key={ch.id} channelId={ch.id} title={ch.title} thumbnail={ch.thumbnail} subscribers={ch.subscribers} videoCount={ch.videoCount} variant={variant} />;
}

function Body({ channelId, title, thumbnail, subscribers, videoCount, variant }: { channelId: string; title: string; thumbnail?: string; subscribers?: number; videoCount?: number; variant: 'inline' | 'drawer' }) {
  const { t } = useI18n();
  const f = useCiFmt();
  const toast = useToast();
  const status = useStatus();
  const [rev, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  const niche = useAsync(`ci:niche:${rev}`, () => loadNiche());
  const [view, setView] = useStored<View>('ci.view', 'channel');
  const [seen, setSeen, seenReady] = useStored<boolean>('ci.introSeen', false);
  const [introOpen, setIntroOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [max, setMax] = useState(UPLOADS_DEFAULT);
  const ups = useAsync(`ci:up:${channelId}:${max}`, () => loadUploads(channelId, max));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const mine = !!status?.channels.some((c) => c.channelId === channelId);
  const inNiche = !!niche.data?.some((c) => c.channelId === channelId && !c.mine);
  const others: Subject[] = (niche.data ?? [])
    .filter((c) => c.channelId !== channelId)
    .sort((a, b) => Number(b.mine) - Number(a.mine))
    .map((c) => ({ channelId: c.channelId, title: c.mine ? `${c.title} (${t('ci.you')})` : c.title, thumbnail: c.thumbnail ?? status?.channels.find((x) => x.channelId === c.channelId)?.thumbnail }));
  const self: Subject = { channelId, title, thumbnail };
  const showIntro = introOpen || (seenReady && !seen);
  const closeIntro = () => {
    setIntroOpen(false);
    if (!seen) setSeen(true);
  };
  const onIntroAction = (tab: IntroTab) => {
    if (tab === 'start') setManaging(true);
    else setView(tab === 'channel' ? 'channel' : tab);
  };

  async function toggleNiche() {
    setError(undefined);
    setBusy(true);
    try {
      if (inNiche) {
        if (await removeFromNiche(channelId)) toast(t('ci.niche.removed', { name: title }), { label: t('common.undo'), run: () => void undoRemove(channelId).then(bump, setError) });
      } else {
        const existed = await addToNiche(channelId);
        toast(existed ? t('ci.niche.already', { name: title }) : t('ci.niche.added', { name: title }));
      }
      bump();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ci-root" data-variant={variant}>
      <div className="ci-head">
        <Avatar src={thumbnail} name={title} size="l" />
        <div className="grow ci-head-main">
          <bdi className="ci-head-title">{title}</bdi>
          <span className="small muted">
            {subscribers === undefined ? t('ci.subsHidden') : t('ci.subs', { v: f.compact(subscribers) })} · {t('ci.videos', { v: f.int(videoCount) })}
          </span>
        </div>
        <IconButton icon="info" label={t('ci.intro.open')} onClick={() => setIntroOpen(true)} />
      </div>
      <div className="ci-head-actions">
        {!mine && (
          <button type="button" className="btn btn-s" aria-pressed={inNiche} disabled={busy || !niche.data} onClick={() => void toggleNiche()}>
            <Icon name={inNiche ? 'check' : 'plus'} />
            {inNiche ? t('ci.niche.inNiche') : t('ci.niche.add')}
          </button>
        )}
        <button type="button" className="btn btn-s" aria-expanded={managing} onClick={() => setManaging(!managing)}>
          <Icon name="users" />
          {t('ci.niche.manage')}
        </button>
      </div>
      {error !== undefined && <InError error={error} />}
      {showIntro && <Intro onClose={closeIntro} onAction={onIntroAction} />}
      {managing && <NicheManager rev={rev} onChanged={bump} onClose={() => setManaging(false)} />}

      <InTabs
        value={view}
        onChange={setView}
        label={t('ci.title')}
        items={[
          { id: 'channel', label: t('ci.view.channel'), icon: 'pulse' },
          { id: 'niche', label: t('ci.view.niche'), icon: 'target' },
          { id: 'topics', label: t('ci.view.topics'), icon: 'layers' },
        ]}
      />

      <div className="ci-uploads-line">
        <span className="xsmall muted grow">
          {ups.data ? t('ci.uploads.analysed', { n: ups.data.length }) : ups.loading ? t('ci.uploads.loading') : ''}
        </span>
        {max < UPLOADS_MAX && (videoCount === undefined || videoCount > max) && (
          <>
            <CostNote units={uploadsCost(UPLOADS_MAX)} />
            <button type="button" className="btn btn-s btn-ghost" onClick={() => setMax(UPLOADS_MAX)}>
              {t('ci.uploads.more', { n: UPLOADS_MAX })}
            </button>
          </>
        )}
      </div>
      {ups.error !== undefined && <InError error={ups.error} onRetry={ups.reload} />}

      <div role="tabpanel" className="ci-view">
        {view === 'channel' && (
          <>
            <GrowthBlock channelId={channelId} title={title} thumbnail={thumbnail} rev={rev} onManage={() => setManaging(true)} />
            {ups.loading && !ups.data && <div className="skel ci-chart-skel" aria-busy="true" />}
            {ups.data && <ContentCalendar videos={ups.data} id={channelId} />}
            {ups.data && <ActivityFeed videos={ups.data} id={channelId} />}
          </>
        )}
        {view === 'niche' && (ups.data ? <NicheInsights self={self} selfVideos={ups.data} others={others} id={channelId} /> : <div className="skel ci-chart-skel" aria-busy="true" />)}
        {view === 'topics' && (ups.data ? <TopicalAnalysis self={self} selfVideos={ups.data} others={others} status={status} id={channelId} /> : <div className="skel ci-chart-skel" aria-busy="true" />)}
      </div>
      <p className="xsmall faint">{t('ci.foot')}</p>
    </div>
  );
}
