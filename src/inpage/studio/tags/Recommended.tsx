// Recommended tags under the Tag Tools bar: a target keyword (defaults to the title's main phrase) drives
// suggestions from the top search results' tags, AI and the owner's own search terms (YouTube Analytics).
// Sort by Relevance, Keyword score (scores already researched; more on request with the cost shown) or Search
// traffic (own Analytics search-term views; search volume itself is not available from any official API).
// Every suggestion has + (add to Studio's field) and research. All suggestions are shown.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../components/icons';
import { Button } from '../../../components/ui';
import { KEYWORD_SCORE_UNITS } from '../../../domain/inpage';
import type { Lang } from '../../../domain/models';
import { useI18n } from '../../../i18n';
import { rpc } from '../../../platform/rpc';
import { cachedRpc, canReadYt, InError, useAsync, useFmt, useStatus, useStored } from '../../common';
import type { StudioValues } from '../fields';
import { research, type Research } from './KeywordPop';
import { mainPhrase, mergeSuggestions, norm, scoreOf, sortSuggestions, trafficFor, type SearchTerm, type SuggestSort, type Suggestion } from './logic';
import { openKeywordPop, useKnownScores, useTargetKeyword } from './store';
import { useFieldWriter } from './writer';

interface Terms {
  channel: SearchTerm[];
  video: SearchTerm[] | null;
  days: number;
}

export function Recommended({ videoId, values }: { videoId: string; values: StudioValues }) {
  const { t } = useI18n();
  const [open, setOpen] = useStored<boolean>('tt.recOpen', true);
  return (
    <section className="tt-rec" aria-label={t('tt.rec')}>
      <div className="tt-bar-row">
        <span className="tt-title">
          <span className="tt-dot" aria-hidden="true">
            <Icon name="logo" />
          </span>
          {t('tt.rec')}
        </span>
        <span className="grow" />
        <button type="button" className="icon-btn tx-toggle" aria-expanded={open} aria-label={open ? t('inpage.hideDetails') : t('inpage.showDetails')} title={open ? t('inpage.hideDetails') : t('inpage.showDetails')} onClick={() => setOpen(!open)}>
          <Icon name="down" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {open && <RecBody videoId={videoId} values={values} />}
    </section>
  );
}

function RecBody({ videoId, values }: { videoId: string; values: StudioValues }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const readable = canReadYt(status);
  const signedIn = !!status?.channels.length;
  const kwId = useId();
  const [saved, setSaved] = useTargetKeyword(videoId);
  const derived = mainPhrase(values.title);
  const keyword = (saved.trim() || derived).slice(0, 200);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const [sort, setSort] = useState<SuggestSort>('relevance');
  const [scores, addScores] = useKnownScores();
  const writer = useFieldWriter();

  // Top results' tags for the target keyword: automatic when cached (free), otherwise on click with the cost.
  const [top, setTop] = useState<Research | null>(null);
  const [topState, setTopState] = useState<'idle' | 'ask' | 'busy' | 'cached?'>('cached?');
  const [topError, setTopError] = useState<unknown>();
  const runTop = async () => {
    setTopState('busy');
    setTopError(undefined);
    try {
      const r = await research(keyword);
      setTop(r);
      addScores([{ keyword: r.keyword, score: r.score }]);
    } catch (e) {
      setTopError(e);
    }
    setTopState('idle');
  };
  useEffect(() => {
    setTop(null);
    setTopError(undefined);
    if (!readable || !keyword) return setTopState('idle');
    let live = true;
    setTopState('cached?');
    const timer = window.setTimeout(() => {
      void rpc<boolean[]>('tagTools.cached', [keyword])
        .then(([c]) => {
          if (!live) return;
          if (c) void runTop();
          else setTopState('idle');
        })
        .catch(() => live && setTopState('idle'));
    }, 500); // wait for typing to settle
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, readable]);

  // AI suggestions on click.
  const [ai, setAi] = useState<string[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<unknown>();
  const runAi = async () => {
    setAiBusy(true);
    setAiError(undefined);
    try {
      const out = await rpc<{ tags: string[] }>('ai.task', 'tags', { language: lang as Lang, title: values.title, description: values.description.slice(0, 3000), tags: values.tags, focusKeyword: keyword });
      setAi(out.tags);
    } catch (e) {
      setAiError(e);
    }
    setAiBusy(false);
  };

  // Own search terms (Analytics; no Data API units) when signed in.
  const terms = useAsync<Terms>(signedIn ? `tt-terms:${videoId}` : null, () => cachedRpc<Terms>(30 * 60_000, 'tagTools.searchTerms', videoId));
  const termList = useMemo(() => {
    const m = new Map<string, SearchTerm>();
    for (const x of [...(terms.data?.channel ?? []), ...(terms.data?.video ?? [])]) {
      const k = norm(x.term);
      const cur = m.get(k);
      if (!cur || x.views > cur.views) m.set(k, x);
    }
    return [...m.values()];
  }, [terms.data]);

  const list = useMemo(() => {
    const merged = mergeSuggestions({ top: top?.topTags, sampleSize: top?.sampleSize, ai: ai ?? undefined, terms: terms.data?.video ?? undefined }, values.tags, keyword);
    // Traffic uses every own search term (channel + this video), not only the ones suggested.
    const withTraffic: Suggestion[] = merged.map((s) => ({ ...s, traffic: termList.length ? trafficFor(s.tag, termList) : undefined }));
    return sortSuggestions(withTraffic, sort, scores);
  }, [top, ai, terms.data, termList, values.tags, keyword, sort, scores]);

  const unscored = list.filter((s) => scoreOf(scores, s.tag) === undefined).slice(0, 10);
  const [asking, setAsking] = useState(false);
  const [scoring, setScoring] = useState<{ done: number; total: number } | null>(null);
  const [scoreError, setScoreError] = useState<unknown>();
  const stop = useRef(false);
  const scoreSome = async () => {
    const batch = unscored.map((s) => s.tag);
    setAsking(false);
    setScoreError(undefined);
    stop.current = false;
    setScoring({ done: 0, total: batch.length });
    try {
      for (let i = 0; i < batch.length && !stop.current; i++) {
        const r = await research(batch[i]!);
        addScores([{ keyword: batch[i]!, score: r.score }]);
        setScoring({ done: i + 1, total: batch.length });
      }
    } catch (e) {
      setScoreError(e);
    }
    setScoring(null);
  };

  const sorts: { id: SuggestSort; label: string; help: string; disabled?: boolean }[] = [
    { id: 'relevance', label: t('tt.rec.relevance'), help: t('tt.rec.relevanceHelp') },
    { id: 'score', label: t('tt.rec.score'), help: t('tt.rec.scoreHelp') },
    { id: 'traffic', label: t('tt.rec.traffic'), help: signedIn ? t('tt.rec.trafficHelp') : t('tt.rec.trafficOff'), disabled: !signedIn },
  ];
  const current = sorts.find((s) => s.id === sort)!;
  const fresh = list.map((s) => s.tag);

  const meta = (s: Suggestion) => {
    if (sort === 'score') {
      const v = scoreOf(scores, s.tag);
      return typeof v === 'number' ? f.int(v) : '—';
    }
    if (sort === 'traffic') return s.traffic !== undefined ? f.compact(s.traffic) : '—';
    if (s.count) return t('tt.rec.usedBy', { n: s.count });
    return null;
  };

  return (
    <div className="stack-s">
      <form
        className="tt-target"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(draft.trim());
        }}
      >
        <label htmlFor={kwId} className="small bold">
          <Icon name="target" />
          {t('tt.target')}
        </label>
        <input
          id={kwId}
          className="input tx-input grow"
          dir="auto"
          value={draft}
          placeholder={derived || t('inpage.studio.kwPh')}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== saved && setSaved(draft.trim())}
        />
      </form>
      <p className="xsmall muted">{saved.trim() ? t('tt.targetHelp') : derived ? t('tt.targetFromTitle', { k: derived }) : t('tt.targetHelp')}</p>

      <div className="row tt-sources">
        {readable && keyword && !top && topState !== 'busy' && topState !== 'cached?' && topState !== 'ask' && (
          <Button size="s" onClick={() => setTopState('ask')}>
            <Icon name="search" />
            {t('tt.rec.fromTop')}
          </Button>
        )}
        {status?.ai && (
          <Button size="s" disabled={aiBusy} onClick={() => void runAi()}>
            <Icon name="sparkle" />
            {aiBusy ? t('common.loading') : ai ? t('tt.rec.aiAgain') : t('inpage.studio.suggestAi')}
          </Button>
        )}
        {top && (
          <span className="xsmall muted">
            {t('tt.rec.topDone', { n: top.sampleSize ?? top.topTags.length, k: top.keyword })}
            {top.fetchedAt && ` · ${f.date(top.fetchedAt)}`}
          </span>
        )}
      </div>
      {topState === 'ask' && (
        <div className="tx-confirm" role="group" aria-label={t('tt.rec.fromTop')}>
          <Icon name="info" />
          <p className="grow small">{t('tt.rec.topCost', { k: keyword, units: f.int(KEYWORD_SCORE_UNITS + 1) })}</p>
          <Button size="s" variant="primary" autoFocus onClick={() => void runTop()}>
            {t('inpage.search.run')}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setTopState('idle')}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {status && !readable && <p className="xsmall faint">{t('tt.ranksSetup')}</p>}
      {!status?.ai && status && <p className="xsmall faint">{t('inpage.studio.aiOff')}</p>}
      {topError !== undefined && <InError error={topError} onRetry={() => void runTop()} />}
      {aiError !== undefined && <InError error={aiError} />}
      {terms.error !== undefined && <InError error={terms.error} onRetry={terms.reload} />}

      <div className="tt-sortby">
        <span className="small bold">{t('tt.rec.sortBy')}</span>
        <div className="tt-radios" role="radiogroup" aria-label={t('tt.rec.sortBy')}>
          {sorts.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={sort === s.id} disabled={s.disabled} className="tt-radio" title={s.help} onClick={() => setSort(s.id)}>
              {s.label}
              <span className="tt-help" aria-hidden="true">
                ?
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="xsmall muted">{current.help}</p>
      {!signedIn && status && <p className="xsmall faint">{t('tt.rec.trafficOff')}</p>}
      {sort === 'traffic' && terms.data && <p className="xsmall faint">{t('tt.rec.trafficNote', { days: terms.data.days, n: termList.length })}</p>}
      {sort === 'score' && unscored.length > 0 && canReadYt(status) && !scoring && !asking && (
        <div>
          <Button size="s" onClick={() => setAsking(true)}>
            <Icon name="target" />
            {t('tt.scoreSome', { n: unscored.length })}
          </Button>
        </div>
      )}
      {asking && (
        <div className="tx-confirm" role="group" aria-label={t('tt.scoreSome', { n: unscored.length })}>
          <Icon name="alert" />
          <p className="grow small">{t('tt.scoreCost', { n: unscored.length, units: f.int(unscored.length * (KEYWORD_SCORE_UNITS + 1)) })}</p>
          <Button size="s" variant="primary" autoFocus onClick={() => void scoreSome()}>
            {t('tt.research')}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setAsking(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {scoring && (
        <div className="row" role="status">
          <span className="xsmall">{t('tt.scoring', { done: scoring.done, total: scoring.total })}</span>
          <Button size="s" variant="ghost" onClick={() => (stop.current = true)}>
            {t('tt.stop')}
          </Button>
        </div>
      )}
      {scoreError !== undefined && <InError error={scoreError} />}

      {(topState === 'busy' || topState === 'cached?' || terms.loading) && !list.length && <span className="skel tx-skel-line" aria-busy="true" />}
      {list.length > 0 ? (
        <>
          <div className="tt-sugg-panel">
            <ul className="tt-sugg" aria-label={t('tt.rec')}>
              {list.map((s) => {
                const m = meta(s);
                return (
                  <li key={s.key} className="tt-sugg-chip" data-src={s.sources.join(' ')}>
                    <button type="button" className="tt-sugg-add" dir="auto" onClick={() => writer.add([s.tag])} aria-label={t('inpage.studio.addTag', { tag: s.tag })} title={sourceText(s, t)}>
                      <Icon name="plus" />
                      <bdi>{s.tag}</bdi>
                      {m && <small className="num-t">{m}</small>}
                    </button>
                    <button type="button" className="tt-sugg-research" aria-label={t('tt.researchTag', { tag: s.tag })} title={t('tt.researchTag', { tag: s.tag })} onClick={(e) => openKeywordPop(s.tag, e.currentTarget)}>
                      <Icon name="search" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="row">
            <span className="xsmall muted grow">{t('tt.rec.count', { n: list.length })}</span>
            <Button size="s" variant="ghost" disabled={writer.busy} onClick={() => writer.add(fresh)}>
              <Icon name="plus" />
              {t('inpage.studio.addAll')}
            </Button>
          </div>
        </>
      ) : (
        (top || ai || terms.data) && <p className="small muted">{t('inpage.studio.noNew')}</p>
      )}
      {!top && !ai && !terms.data && topState === 'idle' && !terms.loading && <p className="xsmall muted">{t('tt.rec.empty')}</p>}
      {writer.view}
    </div>
  );
}

function sourceText(s: Suggestion, t: ReturnType<typeof useI18n>['t']): string {
  return s.sources.map((x) => (x === 'top' ? t('tt.src.top', { n: s.count ?? 0 }) : x === 'ai' ? t('tt.src.ai') : x === 'search' ? t('tt.src.search') : t('tt.src.translate'))).join(' · ');
}
