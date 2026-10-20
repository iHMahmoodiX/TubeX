// Public statistics for the open YouTube page, from the owner's YouTube Data API key.
import { useCallback, useEffect } from 'react';
import { fitTags } from '../../integrations/ai/tasks';
import { commonTags, engagementRate, nextMilestone, summarizeSample, viewsPerDay } from '../../domain/research';
import type { PageContext } from '../../domain/pageContext';
import { Icon } from '../../components/icons';
import { Button, Notice, Skeleton } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { useI18n } from '../../i18n';
import { allUploads, channelUploads, getChannel, getVideos, searchSample } from '../../integrations/youtube/api';
import { copyText, downloadText, fileSlug } from '../../platform/files';
import { openWorkspace } from '../../platform/navigation';
import { get, save } from '../../storage/db';
import { addWatched } from '../competitors/watchActions';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle, useIntegrations } from '../connections/useConnections';
import { Stat, TermChips, useAsync, useFormat, VideoTable, videosCsv } from '../research/shared';
import { CommentsTool, EmbedBuilder, ThumbnailLinks } from './VideoTools';

function VideoInsights({ videoId, draftId }: { videoId: string; draftId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const f = useFormat();
  const load = useCallback((fresh: boolean) => getVideos([videoId], fresh), [videoId]);
  const { data, error, loading, run } = useAsync(load);
  useEffect(() => {
    void run(false);
  }, [run]);
  const v = data?.data[0];

  const addTags = async (tags: string[]) => {
    if (!draftId) return;
    const d = await get('drafts', draftId);
    if (!d) return;
    const r = await save('drafts', { ...d, tags: fitTags([...d.tags, ...tags]) });
    toast(r.ok ? t('insights.tagsAdded') : t('draft.conflict'));
  };

  if (loading && !data) return <Skeleton lines={3} />;
  if (error) return <ErrorNotice error={error} />;
  if (!v) return data ? <p className="small muted">{t('insights.notFound')}</p> : null;
  return (
    <div className="stack-s" data-testid="video-insights">
      <div className="core-tiles">
        <Stat label={t('yt.col.views')} value={f.compact(v.views)} />
        <Stat label={t('yt.col.perDay')} value={f.compact(viewsPerDay(v))} />
        <Stat label={t('yt.likes')} value={f.compact(v.likes)} />
        <Stat label={t('yt.comments')} value={f.compact(v.comments)} />
        <Stat label={t('yt.col.engagement')} value={f.pct(engagementRate(v))} />
        <Stat label={t('yt.col.age')} value={f.age(v.publishedAt)} />
      </div>
      <h3 className="small">{t('insights.tags', { n: v.tags.length })}</h3>
      {v.tags.length ? (
        <>
          <div className="core-pill-row">
            {v.tags.map((tag) => (
              <button key={tag} type="button" className="chip" disabled={!draftId} onClick={() => void addTags([tag])} title={draftId ? t('insights.addTag') : undefined}>
                <bdi>{tag}</bdi>
              </button>
            ))}
          </div>
          <div className="row">
            <Button size="s" onClick={async () => toast((await copyText(v.tags.join(', '))) ? t('common.copied') : t('common.copyFailed'))}>
              {t('draft.copyTags')}
            </Button>
            {draftId && (
              <Button size="s" onClick={() => void addTags(v.tags)}>
                {t('insights.addAllTags')}
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="small muted">{t('insights.noTags')}</p>
      )}
      <ThumbnailLinks videoId={v.id} />
      <hr className="divider" />
      <details className="disclosure">
        <summary>
          <h3 className="small">{t('embed.heading')}</h3>
        </summary>
        <EmbedBuilder videoId={v.id} />
      </details>
      <details className="disclosure">
        <summary>
          <h3 className="small">{t('comments.heading')}</h3>
        </summary>
        <CommentsTool videoId={v.id} />
      </details>
      <p className="xsmall faint">{t('yt.fetchedAt', { when: f.age(data!.fetchedAt) })}</p>
    </div>
  );
}

function ChannelInsights({ ctx }: { ctx: PageContext }) {
  const { t } = useI18n();
  const toast = useToast();
  const f = useFormat();
  const load = useCallback(() => getChannel({ id: ctx.channelId, handle: ctx.channelHandle }), [ctx.channelId, ctx.channelHandle]);
  const { data, error, loading, run } = useAsync(load);
  const uploads = useAsync(useCallback((pl: string) => channelUploads(pl, 10), []));
  useEffect(() => {
    void run();
  }, [run]);
  const c = data?.data;
  if (loading && !data) return <Skeleton lines={3} />;
  if (error) return <ErrorNotice error={error} />;
  if (!c) return data ? <p className="small muted">{t('insights.notFound')}</p> : null;
  return (
    <div className="stack-s" data-testid="channel-insights">
      <p dir="auto" style={{ fontWeight: 600 }}>
        {c.title} <span className="small muted ltr">{c.handle}</span>
      </p>
      <div className="core-tiles">
        <Stat label={t('yt.subscribers')} value={c.subscribers === undefined ? t('yt.hidden') : f.compact(c.subscribers)} />
        <Stat label={t('yt.col.views')} value={f.compact(c.views)} />
        <Stat label={t('yt.videos')} value={f.int(c.videoCount)} />
        <Stat label={t('yt.avgViews')} value={f.compact(c.views && c.videoCount ? c.views / c.videoCount : undefined)} />
        <Stat label={t('yt.col.age')} value={f.age(c.publishedAt)} />
        {c.subscribers !== undefined && <Stat label={t('insights.nextMilestone', { m: f.compact(nextMilestone(c.subscribers)) })} value={f.compact(nextMilestone(c.subscribers) - c.subscribers)} />}
      </div>
      <div className="row">
        <Button
          size="s"
          onClick={async () => {
            const r = await addWatched(c);
            toast(r.existed ? t('comp.alreadyWatched') : t('comp.added'));
          }}
        >
          {t('comp.add')}
        </Button>
        {c.uploadsPlaylistId && (
          <Button size="s" disabled={uploads.loading} onClick={() => void uploads.run(c.uploadsPlaylistId!)}>
            {t('insights.recentUploads')}
          </Button>
        )}
        {c.uploadsPlaylistId && <ExportUploads playlistId={c.uploadsPlaylistId} name={c.handle || c.title} count={c.videoCount} />}
      </div>
      <ErrorNotice error={uploads.error} />
      {uploads.data && <VideoTable videos={uploads.data.data} showRank={false} />}
    </div>
  );
}

export function ExportUploads({ playlistId, name, count }: { playlistId: string; name: string; count?: number }) {
  const { t } = useI18n();
  const f = useFormat();
  const { error, loading, run } = useAsync(
    useCallback(async () => {
      const videos = await allUploads(playlistId, 500);
      downloadText(`tubex-videos-${fileSlug(name, 'channel')}.csv`, videosCsv(videos), 'text/csv;charset=utf-8');
      return videos.length;
    }, [playlistId, name]),
  );
  return (
    <>
      <Button size="s" variant="ghost" disabled={loading} onClick={() => void run()} title={t('insights.exportCost', { n: f.int(Math.ceil(Math.min(count ?? 500, 500) / 50) * 2) })}>
        {loading ? t('common.loading') : t('insights.exportVideos')}
      </Button>
      {!!error && <ErrorNotice error={error} />}
    </>
  );
}

function SearchInsights({ query }: { query: string }) {
  const { t } = useI18n();
  const f = useFormat();
  const { data, error, loading, run } = useAsync(useCallback(() => searchSample(query), [query]));
  const summary = data ? summarizeSample(data.videos) : undefined;
  return (
    <div className="stack-s" data-testid="search-insights">
      <div className="row">
        <Button size="s" variant="primary" disabled={loading} onClick={() => void run()}>
          {loading ? t('common.loading') : t('insights.analyzeSearch')}
        </Button>
        <span className="small muted">{t('yt.costSearch')}</span>
      </div>
      <ErrorNotice error={error} />
      {data && summary && (
        <>
          <p className="small muted">{t('research.sampleLabel', { n: summary.count, region: data.region, lang: data.language, when: f.age(data.fetchedAt) })}</p>
          <div className="core-tiles">
            <Stat label={t('research.medianViews')} value={f.compact(summary.medianViews)} />
            <Stat label={t('research.channels')} value={f.int(summary.channels)} />
            <Stat label={t('research.recentShare')} value={f.pct(summary.recentShare)} />
          </div>
          <TermChips label={t('research.commonTags')} items={commonTags(data.videos).slice(0, 15)} />
          <div>
            <Button size="s" variant="ghost" onClick={() => void openWorkspace('research', query)}>
              {t('insights.openResearch')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function PageInsights({ ctx, draftId }: { ctx: PageContext | null; draftId?: string }) {
  const { t } = useI18n();
  const { youtube, loaded } = useIntegrations();
  const google = useGoogle();
  if (!ctx || !loaded || !google.loaded) return null;
  const kind = ctx.kind;
  const relevant = ((kind === 'watch' || kind === 'shorts' || kind === 'studio-video') && ctx.videoId) || kind === 'channel' || (kind === 'search' && ctx.searchQuery);
  if (!relevant) return null;
  return (
    <section className="card stack-s" aria-labelledby="ins-h" data-testid="page-insights">
      <div className="core-mini-h">
        <h2 id="ins-h">{t('insights.heading')}</h2>
        <Icon name="chart" style={{ color: 'var(--text-2)' }} />
      </div>
      {!youtube.apiKey && !google.activeChannelId ? (
        <Notice>
          <p>{t('insights.needsKey')}</p>
          <p className="xsmall muted">{t('core.insights.signInEnough')}</p>
          <div>
            <Button size="s" onClick={() => void openWorkspace('settings')}>
              {t('conn.openSettings')}
            </Button>
          </div>
        </Notice>
      ) : kind === 'channel' ? (
        <ChannelInsights key={ctx.channelId ?? ctx.channelHandle} ctx={ctx} />
      ) : kind === 'search' ? (
        <SearchInsights key={ctx.searchQuery} query={ctx.searchQuery!} />
      ) : (
        <VideoInsights key={ctx.videoId} videoId={ctx.videoId!} draftId={draftId} />
      )}
    </section>
  );
}
