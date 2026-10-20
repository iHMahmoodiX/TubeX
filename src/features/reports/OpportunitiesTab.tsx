// Opportunity Finder: concrete next steps with evidence, ranked by an explicit score.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { Button, Empty, Notice, Score } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { periods, rowsOf } from '../../domain/reports';
import { competitorTopics, rankOpportunities, refreshPackaging, searchGaps, updateOld, type Opportunity, type OpportunityKind } from '../../domain/reportsOpportunities';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { AuthError } from '../../integrations/google/auth';
import { report } from '../../integrations/google/own';
import { channelUploads, getChannel } from '../../integrations/youtube/api';
import { captureIdea } from '../ideas/ideaActions';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useAsync, useFormat } from '../research/shared';
import { AiIdeas } from './AiIdeas';
import { studioUrl, videoToDraft, type RVideo } from './data';
import { TrackSkeleton } from './shared';
import { Thumb } from '../../components/ui';

const KINDS: OpportunityKind[] = ['search-gap', 'refresh-packaging', 'update-old', 'competitor-topic'];
const MAX_COMPETITORS = 8;

async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  try {
    return { value: await p };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return { error };
  }
}

export function OpportunitiesTab({ channelId, videos }: { channelId: string; videos: RVideo[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const watch = useCollection('watchlist');
  const competitorIds = useMemo(() => watch.items.slice(0, MAX_COMPETITORS).map((w) => w.channelId).join(','), [watch.items]);
  const [kind, setKind] = useState<OpportunityKind | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (fresh: boolean) => {
      const p90 = periods(90).cur;
      const p28 = periods(28).cur;
      const [terms, perf, recent, comp] = await Promise.all([
        settle(report(channelId, { ...p90, metrics: 'views', dimensions: 'insightTrafficSourceDetail', filters: 'insightTrafficSourceType==YT_SEARCH', sort: '-views', maxResults: 25 }, fresh)),
        settle(report(channelId, { ...p90, metrics: 'views,averageViewPercentage', dimensions: 'video', sort: '-views', maxResults: 200 }, fresh)),
        settle(report(channelId, { ...p28, metrics: 'views', dimensions: 'video', sort: '-views', maxResults: 200 }, fresh)),
        settle(
          (async () => {
            const ids = competitorIds ? competitorIds.split(',') : [];
            const out: { title: string; channelTitle: string }[] = [];
            for (const id of ids) {
              const ch = (await getChannel({ id }, fresh)).data;
              if (ch?.uploadsPlaylistId) out.push(...(await channelUploads(ch.uploadsPlaylistId, 10, fresh)).data.map((v) => ({ title: v.title, channelTitle: v.channelTitle })));
            }
            return out;
          })(),
        ),
      ]);
      const own = videos.filter((v) => v.privacy === 'public');
      const list = rankOpportunities([
        terms.value ? searchGaps(rowsOf(terms.value).map((r) => ({ term: String(r.insightTrafficSourceDetail), views: Number(r.views) || 0 })), own) : [],
        perf.value ? refreshPackaging(rowsOf(perf.value).map((r) => ({ videoId: String(r.video), views: Number(r.views) || 0, avgViewPercent: r.averageViewPercentage === undefined || r.averageViewPercentage === '' ? null : Number(r.averageViewPercentage) })), own) : [],
        recent.value ? updateOld(rowsOf(recent.value).map((r) => ({ videoId: String(r.video), views: Number(r.views) || 0 })), own) : [],
        comp.value ? competitorTopics(comp.value, own) : [],
      ]);
      return { list, errors: [terms.error, perf.error, recent.error].filter(Boolean), compError: comp.error, competitors: competitorIds ? competitorIds.split(',').length : 0 };
    },
    [channelId, videos, competitorIds],
  );
  const { data, error, loading, run } = useAsync(load);
  useEffect(() => {
    if (!watch.loading) void run(false);
  }, [run, watch.loading]);
  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos]);

  const shown = (data?.list ?? []).filter((o) => kind === 'all' || o.kind === kind);
  return (
    <div className="stack-l">
      <ErrorNotice error={error} />
      {data && (
        <div className="rp-chip-row" role="group" aria-label={t('reports.opp.filter')}>
          <button type="button" className="chip" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
            {t('reports.audit.all')} <small>{f.int(data.list.length)}</small>
          </button>
          {KINDS.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t(`reports.opp.kind.${k}` as MessageKey)} <small>{f.int(data.list.filter((o) => o.kind === k).length)}</small>
            </button>
          ))}
        </div>
      )}
      {data?.errors.map((e, i) => <ErrorNotice key={i} error={e} />)}
      {data && data.competitors === 0 && (
        <Notice>
          <p>{t('reports.opp.noCompetitors')}</p>
          <div>
            <a className="btn btn-s" href="#competitors">
              {t('reports.opp.addCompetitors')}
            </a>
          </div>
        </Notice>
      )}
      {data?.compError !== undefined && (
        <Notice tone="warning">
          <p>{t('reports.opp.compFailed')}</p>
          <ErrorNotice error={data!.compError} />
        </Notice>
      )}
      {loading && !data && <TrackSkeleton rows={5} />}
      {data && !shown.length && (
        <Empty icon="rocket" title={t('reports.opp.noneTitle')}>
          {t('reports.opp.none')}
        </Empty>
      )}
      <div className="stack">
        {shown.map((o) => (
          <OppCard key={o.key} o={o} v={o.videoId ? byId.get(o.videoId) : undefined} open={open === o.key} onToggle={() => setOpen(open === o.key ? null : o.key)} />
        ))}
      </div>
      {data && <p className="xsmall faint">{t('reports.opp.method')}</p>}
    </div>
  );
}

function OppCard({ o, v, open, onToggle }: { o: Opportunity; v?: RVideo; open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const e = o.evidence;
  const num = (k: string) => f.int(Number(e[k]));
  const evidence = (() => {
    switch (o.kind) {
      case 'search-gap':
        return t('reports.opp.ev.search-gap', { views: num('views') });
      case 'refresh-packaging':
        return t('reports.opp.ev.refresh-packaging', { views: num('views'), mean: num('meanViews'), ret: f.pct(Number(e.retention) / 100), meanRet: f.pct(Number(e.meanRetention) / 100) });
      case 'update-old':
        return t('reports.opp.ev.update-old', { views: num('views'), age: f.int(Math.round(Number(e.ageDays) / 30)) });
      default:
        return t('reports.opp.ev.competitor-topic', { videos: num('videos'), channels: num('channels') });
    }
  })();
  const idea = async (text: string) => {
    const r = await captureIdea({ text, ctx: null, link: false });
    if (r) toast(t('reports.opp.ideaSaved'), { label: t('common.open'), run: () => (location.hash = 'ideas') });
  };
  const draft = async () => {
    if (!v) return;
    const d = await videoToDraft(v);
    toast(t('mc.draftCreated'), { label: t('common.open'), run: () => (location.hash = `drafts/${encodeURIComponent(d.id)}`) });
  };
  return (
    <article className="rp-opp">
      <Score value={o.score} label={t('reports.opp.score')} />
      <div className="stack-s" style={{ minWidth: 0 }}>
        <span className="xsmall muted">{t(`reports.opp.kind.${o.kind}` as MessageKey)}</span>
        <div className="row-nowrap">
          {v && <Thumb videoId={v.id} src={v.thumbnail} width={64} />}
          <h3 className="clamp-2">
            {o.term ? <bdi>“{o.term}”</bdi> : <bdi>{o.title ?? ''}</bdi>}
          </h3>
        </div>
        <p className="rp-opp-evidence">{evidence}</p>
        {o.kind === 'competitor-topic' && e.example && (
          <p className="xsmall faint" dir="auto">
            {t('reports.opp.example')}: {String(e.example)}
          </p>
        )}
        <p className="small">{t(`reports.opp.do.${o.kind}` as MessageKey)}</p>
      </div>
      <div className="rp-opp-actions">
        {(o.kind === 'search-gap' || o.kind === 'competitor-topic') && o.term && (
          <>
            <Button size="s" variant="primary" onClick={() => void idea(o.term!)}>
              <Icon name="plus" />
              {t('reports.opp.makeVideo')}
            </Button>
            <a className="btn btn-s" href={`#research/${encodeURIComponent(o.term)}`}>
              <Icon name="search" />
              {t('reports.opp.research')}
            </a>
          </>
        )}
        {o.kind === 'refresh-packaging' && v && (
          <>
            <Button size="s" variant="primary" onClick={onToggle} aria-expanded={open}>
              <Icon name="sparkle" />
              {t('reports.opp.refresh')}
            </Button>
            <a className="btn btn-s" href="#thumbs">
              <Icon name="image" />
              {t('reports.click.goThumbs')}
            </a>
          </>
        )}
        {o.kind === 'update-old' && v && (
          <a className="btn btn-s btn-primary" href={studioUrl(v.id)} target="_blank" rel="noreferrer noopener">
            <Icon name="external" />
            {t('reports.opp.updateDesc')}
          </a>
        )}
        {v && (
          <Button size="s" variant="ghost" onClick={() => void draft()}>
            <Icon name="copy" />
            {t('mc.toDraft')}
          </Button>
        )}
      </div>
      {open && v && (
        <div style={{ gridColumn: '1 / -1' }}>
          <AiIdeas video={v} problem="viewers who click stay longer than average, but few click: make the title and thumbnail more compelling and clearer" />
        </div>
      )}
    </article>
  );
}
