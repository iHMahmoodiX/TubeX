// Niche topical analysis: topics × channels matrix. Topics come from a local, Persian-aware tokenizer over titles and
// tags (optional AI names when the owner set up AI). Each cell is the share of that channel's analysed videos on the
// topic, or "No content". A topic opens its top videos, sortable by views, engagement or outlier score.
import { Fragment, useMemo, useState } from 'react';
import { Icon } from '../../../components/icons';
import { Avatar, Thumb } from '../../../components/ui';
import { relabelTopics, topicMatrix, topicShare, topicStats, topicVideos, uploadsCost, UPLOADS_DEFAULT, type TopicChannel, type TopicSort } from '../../../domain/channelInsights';
import type { VideoInfo } from '../../../integrations/youtube/api';
import { useI18n } from '../../../i18n';
import { rpc } from '../../../platform/rpc';
import { InError, type Status } from '../../common';
import { CostNote, Section, useCiFmt } from './bits';
import { loadUploads } from './data';
import type { Subject } from './Distribution';

const MAX_COLUMNS = 8;

export function TopicalAnalysis({ self, selfVideos, others, status, id }: { self: Subject; selfVideos: VideoInfo[]; others: Subject[]; status: Status | undefined; id: string }) {
  const { t, lang } = useI18n();
  const f = useCiFmt();
  const cols = others.slice(0, MAX_COLUMNS - 1);
  const [loaded, setLoaded] = useState<Record<string, VideoInfo[]>>({});
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<unknown>();
  const [sort, setSort] = useState<TopicSort>('views');
  const [open, setOpen] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string> | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<unknown>();

  const pending = cols.filter((c) => !loaded[c.channelId]);
  const channels: TopicChannel<VideoInfo>[] = useMemo(
    () => [{ channelId: self.channelId, title: self.title, videos: selfVideos }, ...cols.filter((c) => loaded[c.channelId]).map((c) => ({ channelId: c.channelId, title: c.title, videos: loaded[c.channelId]! }))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [self.channelId, selfVideos, loaded, cols.map((c) => c.channelId).join()],
  );
  const matrix = useMemo(() => {
    const m = topicMatrix(channels, 12);
    return labels ? relabelTopics(m, labels) : m;
  }, [channels, labels]);
  const rows = useMemo(() => {
    const withStats = matrix.topics.map((tp) => ({ tp, s: topicStats(channels, tp) }));
    const key = (x: (typeof withStats)[number]) => (sort === 'views' ? x.s.views : sort === 'engagement' ? x.s.engagement : x.s.outlier) ?? -1;
    return withStats.sort((a, b) => key(b) - key(a));
  }, [matrix, channels, sort]);
  const shown = [self, ...cols.filter((c) => loaded[c.channelId])];

  async function loadAll() {
    setError(undefined);
    setBusy({ done: 0, total: pending.length });
    const next = { ...loaded };
    try {
      for (const c of pending) {
        next[c.channelId] = await loadUploads(c.channelId, UPLOADS_DEFAULT);
        setLoaded({ ...next });
        setBusy((b) => (b ? { ...b, done: b.done + 1 } : b));
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function nameWithAi() {
    setAiBusy(true);
    setAiError(undefined);
    try {
      const payload = matrix.topics.map((tp) => ({ key: tp.key, titles: topicVideos(channels, tp, 'views').slice(0, 5).map((x) => x.video.title.slice(0, 200)) }));
      const r = await rpc<{ labels: Record<string, string> }>('ci.topicLabels', payload, lang);
      setLabels(r.labels);
    } catch (e) {
      setAiError(e);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <Section id={`ci-topics-${id}`} icon="layers" title={t('ci.topics.title')} desc={t('ci.topics.desc')}>
      {pending.length > 0 && (
        <div className="ci-load">
          <CostNote units={pending.length * (uploadsCost(UPLOADS_DEFAULT) + 1)}>{t('ci.topics.loadWhy', { n: pending.length, k: UPLOADS_DEFAULT })}</CostNote>
          <button type="button" className="btn btn-s btn-primary" disabled={!!busy} onClick={() => void loadAll()}>
            {busy ? t('ci.topics.loading', { done: busy.done, total: busy.total }) : t('ci.topics.load', { n: pending.length })}
          </button>
        </div>
      )}
      {!others.length && <p className="small muted">{t('ci.topics.soloHint')}</p>}
      {error !== undefined && <InError error={error} onRetry={() => void loadAll()} />}

      <div className="ci-topics-bar">
        <div className="ci-seg" role="group" aria-label={t('ci.topics.sort')}>
          {(['views', 'engagement', 'outlier'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)}>
              {t(s === 'views' ? 'ci.sort.views' : s === 'engagement' ? 'ci.sort.engagement' : 'ci.sort.outlier')}
            </button>
          ))}
        </div>
        <span className="grow" />
        {status?.ai && matrix.topics.length > 0 && (
          <button type="button" className="btn btn-s btn-ghost" disabled={aiBusy} onClick={() => void nameWithAi()}>
            <Icon name="sparkle" />
            {aiBusy ? t('ci.topics.aiBusy') : labels ? t('ci.topics.aiAgain') : t('ci.topics.ai')}
          </button>
        )}
        {labels && (
          <button type="button" className="btn btn-s btn-ghost" onClick={() => setLabels(null)}>
            {t('ci.topics.localNames')}
          </button>
        )}
      </div>
      {aiError !== undefined && <InError error={aiError} />}

      {!matrix.topics.length && <p className="small muted">{t('ci.topics.none')}</p>}
      {matrix.topics.length > 0 && (
        <div className="ci-matrix-wrap">
          <table className="ci-matrix">
            <thead>
              <tr>
                <th scope="col">{t('ci.topics.topic')}</th>
                {shown.map((c) => (
                  <th scope="col" key={c.channelId}>
                    <span className="ci-colhead">
                      <Avatar src={c.thumbnail} name={c.title} />
                      <bdi>{c.channelId === self.channelId ? t('ci.dist.thisChannel') : c.title}</bdi>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tp, s }) => (
                <Fragment key={tp.key}>
                  <tr data-open={open === tp.key || undefined}>
                    <th scope="row">
                      <button type="button" className="ci-topic-btn" aria-expanded={open === tp.key} onClick={() => setOpen(open === tp.key ? null : tp.key)}>
                        <Icon name="down" className="icon ci-caret" />
                        <span className="ci-topic-name">
                          <bdi>{tp.label}</bdi>
                          <span className="xsmall muted">
                            {sort === 'views' ? t('ci.views', { v: f.compact(s.views) }) : sort === 'engagement' ? t('ci.topics.eng', { v: f.pct(s.engagement === undefined ? undefined : s.engagement * 100) }) : t('ci.topics.outlier', { v: f.ratio(s.outlier) })}
                          </span>
                        </span>
                      </button>
                    </th>
                    {shown.map((c) => {
                      const share = topicShare(matrix, tp, c.channelId);
                      const n = tp.byChannel[c.channelId]?.length ?? 0;
                      return (
                        <td key={c.channelId}>
                          {share === undefined ? (
                            <span className="faint">—</span>
                          ) : n === 0 ? (
                            <span className="ci-cell ci-cell-none">{t('ci.topics.noContent')}</span>
                          ) : (
                            <span className="ci-cell" style={{ ['--share' as string]: `${Math.max(6, share * 100)}%` }} title={t('ci.topics.cellHint', { n, of: matrix.sizes[c.channelId] ?? 0 })}>
                              <b className="num-t">{f.pct(share * 100)}</b>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {open === tp.key && (
                    <tr className="ci-topic-videos">
                      <td colSpan={shown.length + 1}>
                        <TopicVideoList channels={channels} topicKey={tp.key} matrixTopics={matrix.topics} sort={sort} names={Object.fromEntries(shown.map((c) => [c.channelId, c.title]))} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="xsmall faint">{t('ci.topics.rule', { n: channels.reduce((a, c) => a + c.videos.length, 0) })}</p>
    </Section>
  );
}

function TopicVideoList({ channels, topicKey, matrixTopics, sort, names }: { channels: TopicChannel<VideoInfo>[]; topicKey: string; matrixTopics: ReturnType<typeof topicMatrix>['topics']; sort: TopicSort; names: Record<string, string> }) {
  const { t } = useI18n();
  const f = useCiFmt();
  const tp = matrixTopics.find((x) => x.key === topicKey);
  const vids = useMemo(() => (tp ? topicVideos(channels, tp, sort).slice(0, 10) : []), [channels, tp, sort]);
  return (
    <ul className="ci-vlist">
      {vids.map((x) => (
        <li key={x.video.id}>
          <a className="ci-vrow" href={`https://www.youtube.com/watch?v=${x.video.id}`}>
            <Thumb videoId={x.video.id} src={x.video.thumbnail} width={88} />
            <span className="grow ci-vrow-main">
              <bdi className="ci-vtitle">{x.video.title}</bdi>
              <span className="xsmall muted">
                <bdi>{names[x.channelId] ?? ''}</bdi> · {x.video.views === undefined ? t('inpage.hidden') : t('ci.views', { v: f.compact(x.video.views) })} · {t('ci.topics.eng', { v: f.pct(x.engagement === undefined ? undefined : x.engagement * 100) })}
              </span>
            </span>
            <span className="ci-ratio" title={t('ci.sort.outlierHint')}>
              <b className="num-t">{f.ratio(x.outlier)}</b>
              <small>{t('ci.sort.outlier')}</small>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
