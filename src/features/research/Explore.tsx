// Keyword explorer: the explained keyword score, the search sample as a track list, related terms and tags.
import { useMemo } from 'react';
import { commonTags, titleWords, toCsv, viewsPerDay } from '../../domain/research';
import { band, relatedTerms, SCORE_WEIGHTS, type KeywordScore } from '../../domain/seo';
import { useToast } from '../../components/toasts';
import { Button, Empty, Meter, Notice, Score, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { copyText, downloadText, fileSlug } from '../../platform/files';
import { useAiTask } from '../ai/useAiTask';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle, useIntegrations } from '../connections/useConnections';
import { createRankTracker } from '../ranks/service';
import type { KeywordData } from './keywordData';
import { SaveKeyword } from './Lists';
import { SectionHead, VideoTracks } from './parts';
import { TermChips, useFormat } from './shared';

export const BAND_KEY: Record<'low' | 'medium' | 'high', MessageKey> = { low: 'seo.band.low', medium: 'seo.band.medium', high: 'seo.band.high' };

function sampleCsv(d: KeywordData): string {
  return toCsv([
    ['rank', 'video_id', 'title', 'channel', 'channel_subscribers', 'views', 'views_per_day', 'published_at', 'tags'],
    ...d.sample.videos.map((v, i) => [i + 1, v.id, v.title, v.channelTitle, d.channels[v.channelId]?.subscribers, v.views, Math.round(viewsPerDay(v) ?? 0), v.publishedAt, v.tags.join(' | ')]),
  ]);
}

export function PartCards({ s }: { s: KeywordScore }) {
  const { t } = useI18n();
  const f = useFormat();
  const c = s.parts.competition;
  const d = s.parts.demand;
  const ch = s.parts.chance;
  const pct = (w: number) => f.pct(w);
  return (
    <div className="grid-3">
      <section className="seo-part" aria-labelledby="part-d">
        <div className="seo-part-head">
          <h3 id="part-d">{t('seo.part.demand')}</h3>
          <b>{f.int(d.score)}</b>
        </div>
        <Meter value={d.score} tone={d.score < 40 ? 'muted' : undefined} label={t('seo.part.demand')} />
        <p className="xsmall faint">{t('seo.part.demandHelp', { w: pct(SCORE_WEIGHTS.demand) })}</p>
        <ul>
          <li>
            {t('seo.part.medianVpd', { n: f.int(s.topN) })} <b>{f.compact(d.medianViewsPerDay)}</b>
          </li>
          <li>
            {t('seo.part.recent90')} <b>{f.pct(d.recentShare)}</b>
          </li>
        </ul>
      </section>
      <section className="seo-part" aria-labelledby="part-c">
        <div className="seo-part-head">
          <h3 id="part-c">{t('seo.part.competition')}</h3>
          <b>{f.int(c.score)}</b>
        </div>
        <Meter value={c.score} tone={c.score >= 70 ? 'danger' : c.score >= 40 ? 'warning' : undefined} label={t('seo.part.competition')} />
        <p className="xsmall faint">{t('seo.part.competitionHelp', { w: pct(SCORE_WEIGHTS.competition) })}</p>
        <ul>
          <li>
            {t('seo.part.medianViews', { n: f.int(s.topN) })} <b>{f.compact(c.medianViews)}</b>
          </li>
          <li>
            {t('seo.part.medianSubs')} <b>{f.compact(c.medianSubscribers)}</b>
          </li>
          <li>
            {t('seo.part.exact')} <b>{f.pct(c.exactShare)}</b>
          </li>
        </ul>
      </section>
      <section className="seo-part" aria-labelledby="part-ch">
        <div className="seo-part-head">
          <h3 id="part-ch">{t('seo.part.chance')}</h3>
          <b>{ch.score === null ? '—' : f.int(ch.score)}</b>
        </div>
        <Meter value={ch.score ?? 0} tone={ch.score === null || ch.score < 40 ? 'muted' : undefined} label={t('seo.part.chance')} />
        <p className="xsmall faint">{t('seo.part.chanceHelp', { w: pct(SCORE_WEIGHTS.chance) })}</p>
        <ul>
          <li>
            {t('seo.part.myRank')} <b>{ch.myPositions.length ? ch.myPositions.slice(0, 3).map((p) => `#${f.int(p)}`).join(' ') : t('seo.part.notRanked')}</b>
          </li>
          <li>
            {ch.basis === 'similar' ? t('seo.part.similar') : ch.basis === 'small' ? t('seo.part.small') : t('seo.part.sizesUnknown')} <b>{f.pct(ch.similarShare)}</b>
          </li>
        </ul>
      </section>
    </div>
  );
}

export function Explore({
  data,
  loading,
  error,
  onExplore,
  onRefresh,
  onCompare,
  recent,
}: {
  data?: KeywordData;
  loading: boolean;
  error: unknown;
  onExplore: (term: string) => void;
  onRefresh: () => void;
  onCompare: (term: string) => void;
  recent: string[];
}) {
  const { t, lang } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const { ai } = useIntegrations();
  const google = useGoogle();
  const aiTask = useAiTask();
  const s = data?.sample;
  const tags = useMemo(() => (s ? commonTags(s.videos) : []), [s]);
  const words = useMemo(() => (s ? titleWords(s.videos) : []), [s]);
  const kw = aiTask.results.keywords?.output;
  const aiRelated = kw?.task === 'keywords' ? [...kw.related, ...kw.questions] : [];
  const related = useMemo(() => (s ? relatedTerms(s.query, [aiRelated, tags.map((x) => x.term)], 24) : []), [s, tags, aiRelated.join('\n')]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = google.channels.find((c) => c.channelId === google.activeChannelId);

  if (loading && !data) return <Skeleton lines={6} />;
  if (!data)
    return (
      <div className="stack">
        <ErrorNotice error={error} />
        <Empty icon="search" title={t('seo.explore.emptyTitle')}>
          {t('seo.explore.emptyHelp')}
        </Empty>
        {recent.length > 0 && (
          <div className="stack-s">
            <h3 className="small muted">{t('seo.explore.saved')}</h3>
            <TermChips label={t('seo.explore.saved')} items={recent.map((term) => ({ term, count: 0 })).slice(0, 20)} onPick={onExplore} />
          </div>
        )}
      </div>
    );

  const sc = data.score;
  const b = band(sc.score);
  const track = async () => {
    if (!active) {
      try {
        sessionStorage.setItem('tubex.seo.prefill', s!.query);
      } catch {
        /* storage blocked: the form simply starts empty */
      }
      location.hash = 'ranks/tracking';
      return;
    }
    await createRankTracker({ keyword: s!.query, channelId: active.channelId, targetTitle: active.title });
    toast(t('seo.rank.created', { k: s!.query }));
  };

  return (
    <div className="stack-l" data-testid="research-summary">
      <ErrorNotice error={error} />
      <section className="seo-hero" aria-labelledby="kw-h">
        <Score large value={sc.sampleSize ? sc.score : null} label={t('seo.score')} />
        <div className="stack-s">
          <span className="seo-kicker">
            {t('seo.score')} · {t('seo.estimate')}
          </span>
          <h2 id="kw-h" dir="auto">
            {s!.query}
          </h2>
          {b && sc.sampleSize > 0 && (
            <p>
              <span className="seo-band" data-band={b}>
                {t(BAND_KEY[b])}
              </span>
              <span className="muted"> · {t('seo.scoreExplain')}</span>
            </p>
          )}
          <p className="xsmall faint">{t('research.sampleLabel', { n: s!.videos.length, region: s!.region, lang: s!.language, when: f.age(s!.fetchedAt) })}</p>
          <div className="row" style={{ marginBlockStart: 4 }}>
            <SaveKeyword term={s!.query} />
            <Button size="s" onClick={() => onCompare(s!.query)}>
              {t('seo.compare.add')}
            </Button>
            <Button size="s" onClick={() => void track()} title={active ? undefined : t('seo.rank.needVideo')}>
              {t('seo.rank.track')}
            </Button>
            <Button size="s" variant="ghost" onClick={() => downloadText(`tubex-research-${fileSlug(s!.query)}.csv`, sampleCsv(data), 'text/csv;charset=utf-8')}>
              {t('research.exportCsv')}
            </Button>
            <Button size="s" variant="ghost" disabled={loading} onClick={onRefresh}>
              {loading ? t('common.loading') : t('research.refresh')}
            </Button>
          </div>
        </div>
      </section>

      <PartCards s={sc} />
      <Notice>{t('research.sampleNote')}</Notice>

      <div className="seo-split">
        <section className="seo-section" aria-labelledby="res-top">
          <SectionHead
            id="res-top"
            title={t('seo.explore.top')}
            actions={
              <Button size="s" variant="ghost" onClick={async () => toast((await copyText(s!.videos.map((v) => v.title).join('\n'))) ? t('common.copied') : t('common.copyFailed'))}>
                {t('research.copyTitles')}
              </Button>
            }
          />
          {s!.videos.length ? <VideoTracks videos={s!.videos} mine={data.mine} label={t('seo.explore.top')} /> : <Empty icon="search">{t('seo.explore.noResults')}</Empty>}
        </section>
        <aside className="stack-l">
          <section className="seo-section" aria-labelledby="res-rel">
            <SectionHead
              id="res-rel"
              title={t('seo.related')}
              sub={t('seo.relatedHelp')}
              actions={
                ai.enabled ? (
                  <Button
                    size="s"
                    disabled={!!aiTask.running}
                    onClick={() => void aiTask.run('keywords', { language: lang }, { keyword: s!.query, sampleTitles: s!.videos.map((v) => v.title).slice(0, 25) })}
                  >
                    {aiTask.running ? t('ai.running') : t('seo.relatedAi')}
                  </Button>
                ) : undefined
              }
            />
            <ErrorNotice error={aiTask.error} />
            {related.length ? (
              <div className="chips" role="list" aria-label={t('seo.related')}>
                {related.map((term) => (
                  <span role="listitem" key={term}>
                    <button type="button" className="chip" onClick={() => onExplore(term)}>
                      <bdi>{term}</bdi>
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="small muted">{t('research.none')}</p>
            )}
            {kw?.task === 'keywords' && kw.angles.length > 0 && (
              <div className="stack-s">
                <h3 className="small">{t('research.angles')}</h3>
                <ul className="small muted" style={{ margin: 0, paddingInlineStart: 18 }}>
                  {kw.angles.map((a) => (
                    <li key={a} dir="auto">
                      {a}
                    </li>
                  ))}
                </ul>
                <p className="xsmall faint">{t('ai.disclaimer')}</p>
              </div>
            )}
          </section>
          <section className="seo-section" aria-labelledby="res-tags">
            <SectionHead id="res-tags" title={t('research.commonTags')} />
            {tags.length ? <TermChips label={t('research.commonTags')} items={tags} onPick={onExplore} /> : <p className="small muted">{t('research.none')}</p>}
          </section>
          <section className="seo-section" aria-labelledby="res-words">
            <SectionHead id="res-words" title={t('research.titleWords')} sub={t('research.chipHelp')} />
            {words.length ? <TermChips label={t('research.titleWords')} items={words} onPick={(w) => onExplore(`${s!.query} ${w}`)} /> : <p className="small muted">{t('research.none')}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
