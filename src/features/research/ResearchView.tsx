// Keyword research: Keyword Explorer (explained score from a labelled search sample), keyword comparison,
// Search Insights (the channel's real search terms), Language Analysis, trending videos and keyword lists.
// Counts describe the sample; TubeX never shows search volumes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { PageHeader, Tabs } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { SearchSample } from '../../integrations/youtube/api';
import { usePublicAccess } from './access';
import { Compare, MAX_COMPARE } from './Compare';
import { Explore } from './Explore';
import { Insights } from './Insights';
import { loadKeyword } from './keywordData';
import { Language } from './Language';
import { KeywordLists } from './Lists';
import { NeedsAccess } from './parts';
import { useAsync } from './shared';
import { Trending } from './Trending';
import './seo.css';

type Tab = 'explore' | 'compare' | 'insights' | 'language' | 'trending' | 'lists';

export function ResearchView({ query }: { query?: string }) {
  const { t } = useI18n();
  const access = usePublicAccess();
  const lists = useCollection('keywordLists').items;
  const [tab, setTab] = useState<Tab>('explore');
  const [q, setQ] = useState(query ?? '');
  const [order, setOrder] = useState<SearchSample['order']>('relevance');
  const [days, setDays] = useState(0);
  const [compare, setCompare] = useState<string[]>([]);
  const kw = useAsync(useCallback((term: string, o: SearchSample['order'], d: number, fresh: boolean) => loadKeyword(term, { order: o, publishedAfterDays: d || undefined, fresh }), []));
  const lastRun = useRef('');

  const run = (term: string, fresh = false) => {
    if (!term.trim() || !access.ok) return;
    lastRun.current = `${term}|${order}|${days}`;
    void kw.run(term.trim(), order, days, fresh);
  };

  // A query in the route (#research/<q>, also from the top search box) is explored right away.
  useEffect(() => {
    if (!query || !access.loaded) return;
    setQ(query);
    setTab((x) => (x === 'compare' || x === 'language' ? x : 'explore'));
    if (lastRun.current !== `${query}|${order}|${days}`) run(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, access.loaded, access.ok]);

  const explore = (term: string) => {
    const k = term.trim();
    if (!k) return;
    setTab('explore');
    if (k === query) run(k);
    else location.hash = `research/${encodeURIComponent(k)}`;
  };
  const recent = [...new Set(lists.flatMap((l) => l.keywords.map((k) => k.text)))];

  return (
    <div className="stack-l">
      <PageHeader kicker={t('shell.group.grow')} title={t('research.heading')} desc={t('seo.research.desc')} />
      {access.loaded && !access.ok && tab !== 'lists' && <NeedsAccess />}
      {tab !== 'lists' && tab !== 'trending' && tab !== 'compare' && (
        <form
          className="seo-searchbar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim() === query) run(q, false);
            else explore(q);
          }}
        >
          <div className="search-wrap">
            <Icon name="search" />
            <input className="input" type="search" dir="auto" aria-label={t('research.keyword')} placeholder={t('seo.research.placeholder')} value={q} onChange={(e) => setQ(e.target.value)} data-testid="research-q" />
          </div>
          <select className="select" aria-label={t('research.order')} value={order} onChange={(e) => setOrder(e.target.value as SearchSample['order'])}>
            <option value="relevance">{t('research.order.relevance')}</option>
            <option value="viewCount">{t('research.order.viewCount')}</option>
            <option value="date">{t('research.order.date')}</option>
          </select>
          <select className="select" aria-label={t('research.period')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={0}>{t('research.period.any')}</option>
            <option value={7}>{t('research.period.7')}</option>
            <option value={30}>{t('research.period.30')}</option>
            <option value={365}>{t('research.period.365')}</option>
          </select>
          <button type="submit" className="play-btn" aria-label={t('research.run')} title={t('research.run')} disabled={!q.trim() || kw.loading || !access.ok}>
            <Icon name="search" />
          </button>
        </form>
      )}
      {tab !== 'lists' && tab !== 'trending' && tab !== 'compare' && <p className="seo-cost" style={{ marginBlockStart: -12 }}>{t('seo.research.cost')}</p>}
      <Tabs
        label={t('research.heading')}
        value={tab}
        onChange={setTab}
        items={[
          { id: 'explore', label: t('research.tab.explore'), icon: 'search' },
          { id: 'compare', label: t('seo.tab.compare'), icon: 'sort', count: compare.length || undefined },
          { id: 'insights', label: t('seo.tab.insights'), icon: 'chart' },
          { id: 'language', label: t('seo.tab.language'), icon: 'translate' },
          { id: 'trending', label: t('research.tab.trending'), icon: 'trend' },
          { id: 'lists', label: t('research.tab.lists'), icon: 'list' },
        ]}
      />
      {tab === 'explore' && (
        <Explore
          data={kw.data}
          loading={kw.loading}
          error={kw.error}
          onExplore={explore}
          onRefresh={() => kw.data && run(kw.data.sample.query, true)}
          onCompare={(term) => {
            setCompare((xs) => (xs.includes(term) || xs.length >= MAX_COMPARE ? xs : [...xs, term]));
            setTab('compare');
          }}
          recent={recent}
        />
      )}
      {tab === 'compare' && <Compare terms={compare} setTerms={setCompare} onExplore={explore} canRead={access.ok} />}
      {tab === 'insights' && <Insights data={kw.data} onExplore={explore} />}
      {tab === 'language' && <Language data={kw.data} />}
      {tab === 'trending' && <Trending onExplore={explore} canRead={access.ok} />}
      {tab === 'lists' && <KeywordLists onExplore={explore} />}
    </div>
  );
}
