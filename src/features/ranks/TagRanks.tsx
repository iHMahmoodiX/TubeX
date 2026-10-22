// Tag rankings: for each chosen tag of a video, where the video sits in the top 50 search results for that tag.
// 100 units per tag (search.list); results are cached for 24 h, so re-checking the same tag is free.
import { useCallback, useEffect, useRef, useState } from 'react';
import { SEARCH_COST, tagAdvice, type TagAdvice } from '../../domain/seo';
import { Button, ConfirmButton, Empty, Notice, Skeleton, Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { videosMeta, type VideoMeta } from '../../integrations/youtube/seoApi';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations, useUsage } from '../connections/useConnections';
import { SectionHead } from '../research/parts';
import { useAsync, useFormat } from '../research/shared';
import { tagRanks, uncachedTags, type TagRank } from './service';
import { VideoPicker } from './VideoPicker';

const ADVICE: Record<TagAdvice, { key: MessageKey; cls: string }> = {
  keep: { key: 'seo.tags.keep', cls: 'badge-accent' },
  improve: { key: 'seo.tags.improve', cls: 'badge-warning' },
  drop: { key: 'seo.tags.drop', cls: 'badge-danger' },
};

export function TagRanks({ canRead }: { canRead: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const { youtube } = useIntegrations();
  const usage = useUsage();
  const [videoId, setVideoId] = useState('');
  const video = useAsync(useCallback(async (id: string) => (await videosMeta([id]))[0] ?? null, []));
  const [picked, setPicked] = useState<string[]>([]);
  const [uncached, setUncached] = useState<string[]>([]);
  const [results, setResults] = useState<TagRank[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const stop = useRef<AbortController | null>(null);
  const v: VideoMeta | null | undefined = video.data;

  useEffect(() => {
    setPicked([]);
    setResults([]);
    if (videoId && canRead) void video.run(videoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, canRead]);
  useEffect(() => {
    let alive = true;
    void uncachedTags(picked).then((u) => alive && setUncached(u));
    return () => {
      alive = false;
    };
  }, [picked, results]);

  const units = uncached.length * SEARCH_COST;
  const cap = youtube.dailyUnitCap || 10_000;
  const run = async () => {
    if (!v) return;
    const c = new AbortController();
    stop.current = c;
    setError(null);
    setResults([]);
    setProgress({ done: 0, total: picked.length });
    try {
      await tagRanks(
        v.id,
        picked,
        (done, r) => {
          setProgress({ done, total: picked.length });
          setResults((xs) => [...xs, r]);
        },
        c.signal,
      );
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
      stop.current = null;
    }
  };
  const counts = { keep: 0, improve: 0, drop: 0 };
  for (const r of results) counts[tagAdvice(r.position)]++;

  return (
    <div className="stack-l">
      <div className="card stack">
        <VideoPicker value={videoId} onChange={(id) => setVideoId(id)} label={t('seo.tags.video')} />
        <ErrorNotice error={video.error} />
        {video.loading && <Skeleton lines={2} />}
        {videoId && video.data === null && !video.loading && <Notice tone="warning">{t('yt.error.not-found')}</Notice>}
        {v && (
          <div className="row-nowrap" style={{ gap: 16 }}>
            <Thumb videoId={v.id} src={v.thumbnail} width={160} />
            <div className="stack-s" style={{ minWidth: 0 }}>
              <a className="bold" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer noopener" dir="auto">
                {v.title}
              </a>
              <span className="small muted">
                <bdi>{v.channelTitle}</bdi> · {t('seo.tags.count', { n: v.tags.length })}
              </span>
            </div>
          </div>
        )}
      </div>

      {!videoId && (
        <Empty icon="tag" title={t('seo.tags.emptyTitle')}>
          {t('seo.tags.emptyHelp')}
        </Empty>
      )}
      {v && (
        <section className="seo-section" aria-labelledby="tg-pick">
          <SectionHead
            id="tg-pick"
            title={t('seo.tags.pickTitle')}
            sub={t('seo.tags.pickHelp')}
            actions={
              v.tags.length > 0 && (
                <>
                  <Button size="s" variant="ghost" onClick={() => setPicked(v.tags.slice(0, 30))}>
                    {t('seo.tags.all')}
                  </Button>
                  <Button size="s" variant="ghost" onClick={() => setPicked([])}>
                    {t('seo.tags.none')}
                  </Button>
                </>
              )
            }
          />
          {!v.tags.length ? (
            <Empty icon="tag">{t('seo.tags.noTags')}</Empty>
          ) : (
            <div className="chips" role="group" aria-label={t('seo.tags.pickTitle')}>
              {v.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="chip"
                  aria-pressed={picked.includes(tag)}
                  onClick={() => setPicked((xs) => (xs.includes(tag) ? xs.filter((x) => x !== tag) : xs.length < 30 ? [...xs, tag] : xs))}
                >
                  <bdi>{tag}</bdi>
                </button>
              ))}
            </div>
          )}
          <div className="row">
            {progress ? (
              <>
                <span className="small">{t('seo.tags.progress', { done: progress.done, total: progress.total })}</span>
                <Button size="s" onClick={() => stop.current?.abort()}>
                  {t('seo.tags.stop')}
                </Button>
              </>
            ) : !picked.length || !canRead ? (
              <Button disabled>{t('seo.tags.check', { n: picked.length })}</Button>
            ) : (
              <ConfirmButton
                danger={false}
                label={t('seo.tags.check', { n: picked.length })}
                question={units ? t('seo.tags.confirm', { n: picked.length, units: f.int(units), left: f.int(Math.max(0, cap - usage.ytUnits)) }) : t('seo.tags.confirmFree', { n: picked.length })}
                confirmLabel={t('seo.tags.checkConfirm')}
                onConfirm={run}
              />
            )}
            {!progress && picked.length > 0 && <span className="seo-cost">{t('seo.tags.cost', { units: f.int(units), cached: picked.length - uncached.length })}</span>}
          </div>
          {!picked.length && <p className="xsmall faint">{t('seo.tags.selectFirst')}</p>}
          <ErrorNotice error={error} />
        </section>
      )}

      {results.length > 0 && (
        <section className="seo-section" aria-labelledby="tg-res">
          <SectionHead id="tg-res" title={t('seo.tags.results')} sub={t('seo.tags.summary', { keep: counts.keep, improve: counts.improve, drop: counts.drop })} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('seo.tags.tag')}</th>
                  <th className="num">{t('seo.tags.position')}</th>
                  <th>{t('seo.tags.topCompetitor')}</th>
                  <th>{t('seo.tags.advice')}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const a = ADVICE[tagAdvice(r.position)];
                  return (
                    <tr key={r.tag}>
                      <td dir="auto">
                        <a href={`#research/${encodeURIComponent(r.tag)}`}>{r.tag}</a>
                        {r.fromCache && <span className="xsmall faint"> · {t('seo.tags.cached')}</span>}
                      </td>
                      <td className="num">{r.position === null ? <span className="faint">{t('seo.rank.notTop50')}</span> : <b>#{f.int(r.position)}</b>}</td>
                      <td>
                        {r.top ? (
                          <div className="row-nowrap">
                            <Thumb videoId={r.top.id} src={r.top.thumbnail} width={64} />
                            <div className="stack-s" style={{ gap: 0, minWidth: 0 }}>
                              <a className="truncate" href={`https://www.youtube.com/watch?v=${r.top.id}`} target="_blank" rel="noreferrer noopener" dir="auto" style={{ maxWidth: 320 }}>
                                {r.top.title}
                              </a>
                              <span className="xsmall muted truncate">
                                <bdi>{r.top.channelTitle}</bdi>
                              </span>
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className={`badge ${a.cls}`}>{t(a.key)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Notice>
            <p>{t('seo.tags.adviceHelp')}</p>
          </Notice>
        </section>
      )}
    </div>
  );
}
