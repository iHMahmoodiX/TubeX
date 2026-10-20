// Keyword research from a labeled sample of public search results, trending videos and saved
// keyword lists. Counts describe the sample; TubeX never shows invented search volumes or scores.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { commonTags, positionsOf, summarizeSample, titleWords, toCsv, viewsPerDay } from '../../domain/research';
import { newBase } from '../../domain/models';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { getChannel, mostPopular, searchSample, videoCategories, type SearchSample } from '../../integrations/youtube/api';
import { copyText, downloadText, fileSlug } from '../../platform/files';
import { create, remove, save } from '../../storage/db';
import { useAiTask } from '../ai/useAiTask';
import { addKeyword, parseChannelInput } from '../competitors/watchActions';
import { YtError } from '../../integrations/youtube/client';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { Stat, TermChips, useAsync, useFormat, VideoTable } from './shared';

type Tab = 'explore' | 'trending' | 'lists';

function sampleCsv(s: SearchSample): string {
  return toCsv([
    ['rank', 'video_id', 'title', 'channel', 'views', 'views_per_day', 'likes', 'comments', 'published_at', 'tags'],
    ...s.videos.map((v, i) => [i + 1, v.id, v.title, v.channelTitle, v.views, Math.round(viewsPerDay(v) ?? 0), v.likes, v.comments, v.publishedAt, v.tags.join(' | ')]),
  ]);
}

function SaveKeyword({ term, onSaved }: { term: string; onSaved?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const lists = useCollection('keywordLists').items;
  const [listId, setListId] = useState('');
  useEffect(() => {
    if (!listId && lists[0]) setListId(lists[0].id);
  }, [lists, listId]);
  const go = async () => {
    let id = listId;
    if (!id) {
      id = (await create('keywordLists', { ...newBase(), name: t('research.defaultList'), keywords: [] })).id;
      setListId(id);
    }
    const r = await addKeyword(id, term);
    toast(t(r === 'exists' ? 'research.keywordExists' : 'research.keywordSaved', { k: term }));
    onSaved?.();
  };
  return (
    <div className="row">
      {lists.length > 1 && (
        <select className="select" style={{ width: 'auto' }} aria-label={t('research.list')} value={listId} onChange={(e) => setListId(e.target.value)}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      <Button size="s" disabled={!term.trim()} onClick={() => void go()}>
        {t('research.saveKeyword')}
      </Button>
    </div>
  );
}

function Explore({ initial }: { initial?: string }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const f = useFormat();
  const { prefs } = usePrefs();
  const profiles = useCollection('profiles').items;
  const { ai } = useIntegrations();
  const [q, setQ] = useState(initial ?? '');
  const [order, setOrder] = useState<SearchSample['order']>('relevance');
  const [days, setDays] = useState(0);
  const [mineHandle, setMineHandle] = useState('');
  const sample = useAsync(useCallback((query: string, o: SearchSample['order'], d: number, fresh: boolean) => searchSample(query, { order: o, publishedAfterDays: d || undefined, fresh }), []));
  const mine = useAsync(useCallback(async (handle: string) => (await getChannel(parseChannelInput(handle) ?? {})).data, []));
  const aiTask = useAiTask();

  useEffect(() => {
    const p = profiles.find((x) => x.id === prefs.activeProfileId) ?? profiles[0];
    if (p?.handle && !mineHandle) setMineHandle(p.handle);
  }, [profiles, prefs.activeProfileId, mineHandle]);

  const s = sample.data;
  const summary = useMemo(() => (s ? summarizeSample(s.videos) : undefined), [s]);
  const tags = useMemo(() => (s ? commonTags(s.videos) : []), [s]);
  const words = useMemo(() => (s ? titleWords(s.videos) : []), [s]);
  const myId = mine.data?.id;
  const positions = s && myId ? positionsOf(s.videos, myId) : [];
  const kw = aiTask.results.keywords?.output;

  const submit = (fresh = false) => {
    if (!q.trim()) return;
    void sample.run(q, order, days, fresh);
    if (mineHandle.trim() && !mine.data) void mine.run(mineHandle);
  };

  return (
    <div className="stack">
      <form
        className="card stack-s"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t('research.keyword')}>
          {({ id }) => <input id={id} className="input" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} data-testid="research-q" />}
        </Field>
        <div className="row">
          <Field label={t('research.order')}>
            {({ id }) => (
              <select id={id} className="select" value={order} onChange={(e) => setOrder(e.target.value as SearchSample['order'])}>
                <option value="relevance">{t('research.order.relevance')}</option>
                <option value="viewCount">{t('research.order.viewCount')}</option>
                <option value="date">{t('research.order.date')}</option>
              </select>
            )}
          </Field>
          <Field label={t('research.period')}>
            {({ id }) => (
              <select id={id} className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={0}>{t('research.period.any')}</option>
                <option value={7}>{t('research.period.7')}</option>
                <option value={30}>{t('research.period.30')}</option>
                <option value={365}>{t('research.period.365')}</option>
              </select>
            )}
          </Field>
          <Field label={t('research.myChannel')} help={t('research.myChannelHelp')}>
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className="input ltr"
                dir="ltr"
                placeholder="@handle"
                value={mineHandle}
                onChange={(e) => {
                  setMineHandle(e.target.value);
                  mine.reset();
                }}
              />
            )}
          </Field>
        </div>
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={!q.trim() || sample.loading}>
            {sample.loading ? t('common.loading') : t('research.run')}
          </button>
          <span className="small muted">{t('yt.costSearch')}</span>
        </div>
      </form>
      <ErrorNotice error={sample.error} />
      {s && summary && (
        <>
          <div className="card stack-s" data-testid="research-summary">
            <div className="row-between">
              <h2 dir="auto">{s.query}</h2>
              <div className="row">
                <SaveKeyword term={s.query} />
                <Button size="s" variant="ghost" onClick={() => downloadText(`tubex-research-${fileSlug(s.query)}.csv`, sampleCsv(s), 'text/csv;charset=utf-8')}>
                  {t('research.exportCsv')}
                </Button>
                <Button size="s" variant="ghost" disabled={sample.loading} onClick={() => submit(true)}>
                  {t('research.refresh')}
                </Button>
              </div>
            </div>
            <p className="small muted">{t('research.sampleLabel', { n: summary.count, region: s.region, lang: s.language, when: f.age(s.fetchedAt) })}</p>
            <div className="stats">
              <Stat label={t('research.medianViews')} value={f.compact(summary.medianViews)} />
              <Stat label={t('research.medianAge')} value={summary.medianAgeDays === undefined ? '—' : f.int(Math.round(summary.medianAgeDays))} />
              <Stat label={t('research.channels')} value={f.int(summary.channels)} />
              <Stat label={t('research.recentShare')} value={f.pct(summary.recentShare)} />
            </div>
            {myId && <p className="small">{positions.length ? t('research.myPositions', { p: positions.map((p) => f.int(p)).join('، ') }) : t('research.notInSample')}</p>}
            <ErrorNotice error={mine.error} />
            <Notice>{t('research.sampleNote')}</Notice>
          </div>
          <div className="card stack-s">
            <h3>{t('research.commonTags')}</h3>
            {tags.length ? <TermChips label={t('research.commonTags')} items={tags} onPick={(term) => setQ(term)} /> : <p className="small muted">{t('research.none')}</p>}
            <h3>{t('research.titleWords')}</h3>
            {words.length ? <TermChips label={t('research.titleWords')} items={words} onPick={(term) => setQ(`${s.query} ${term}`)} /> : <p className="small muted">{t('research.none')}</p>}
            <p className="small muted">{t('research.chipHelp')}</p>
          </div>
          {ai.enabled && (
            <div className="card stack-s">
              <div className="row-between">
                <h3>{t('research.aiIdeas')}</h3>
                <Button
                  size="s"
                  disabled={!!aiTask.running}
                  onClick={() => void aiTask.run('keywords', { language: lang }, { keyword: s.query, sampleTitles: s.videos.map((v) => v.title).slice(0, 25) })}
                >
                  {aiTask.running ? t('ai.running') : t('ai.generate')}
                </Button>
              </div>
              <ErrorNotice error={aiTask.error} />
              {kw?.task === 'keywords' && (
                <>
                  {(
                    [
                      ['research.related', kw.related],
                      ['research.questions', kw.questions],
                      ['research.angles', kw.angles],
                    ] as [MessageKey, string[]][]
                  ).map(([k, items]) => (
                    <div key={k} className="stack-s">
                      <h4 className="small">{t(k)}</h4>
                      <div className="row">
                        {items.map((x) => (
                          <button key={x} type="button" className="chip" onClick={() => setQ(x)}>
                            <bdi>{x}</bdi>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="small muted">{t('ai.disclaimer')}</p>
                </>
              )}
            </div>
          )}
          <VideoTable videos={s.videos} mine={myId ? [myId] : []} />
          {sample.data && (
            <div>
              <Button size="s" variant="ghost" onClick={async () => toast((await copyText(s.videos.map((v) => v.title).join('\n'))) ? t('common.copied') : t('common.copyFailed'))}>
                {t('research.copyTitles')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Trending() {
  const { t } = useI18n();
  const { youtube } = useIntegrations();
  const [cat, setCat] = useState('');
  const cats = useAsync(useCallback(() => videoCategories(), []));
  const pop = useAsync(useCallback((c: string, fresh: boolean) => mostPopular(c || undefined, fresh), []));
  useEffect(() => {
    void cats.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tags = useMemo(() => (pop.data ? commonTags(pop.data.data) : []), [pop.data]);
  return (
    <div className="stack">
      <div className="card row">
        <Field label={t('research.category')}>
          {({ id }) => (
            <select id={id} className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">{t('research.allCategories')}</option>
              {(cats.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="row" style={{ alignSelf: 'flex-end' }}>
          <Button variant="primary" disabled={pop.loading} onClick={() => void pop.run(cat, false)}>
            {pop.loading ? t('common.loading') : t('research.loadTrending')}
          </Button>
          <span className="small muted">{t('research.trendingNote', { region: youtube.region })}</span>
        </div>
      </div>
      <ErrorNotice error={cats.error ?? pop.error} />
      {pop.data && (
        <>
          {tags.length > 0 && (
            <div className="card stack-s">
              <h3>{t('research.commonTags')}</h3>
              <TermChips label={t('research.commonTags')} items={tags} />
            </div>
          )}
          <VideoTable videos={pop.data.data} />
        </>
      )}
    </div>
  );
}

function KeywordLists() {
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const lists = useCollection('keywordLists');
  const [name, setName] = useState('');
  return (
    <div className="stack">
      <form
        className="card row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await create('keywordLists', { ...newBase(), name: name.trim(), keywords: [] });
          setName('');
        }}
      >
        <div className="grow">
          <Field label={t('research.newList')}>{({ id }) => <input id={id} className="input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        </div>
        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={!name.trim()}>
          {t('common.new')}
        </button>
      </form>
      {lists.items.length === 0 && !lists.loading && <Empty>{t('research.noLists')}</Empty>}
      {lists.items.map((l) => (
        <section key={l.id} className="card stack-s" aria-label={l.name}>
          <div className="row-between">
            <h3 dir="auto">
              {l.name} <span className="badge">{l.keywords.length}</span>
            </h3>
            <div className="row">
              <Button
                size="s"
                variant="ghost"
                disabled={!l.keywords.length}
                onClick={() =>
                  downloadText(
                    `tubex-keywords-${fileSlug(l.name, 'list')}.csv`,
                    toCsv([['keyword', 'note', 'added_at'], ...l.keywords.map((k) => [k.text, k.note, k.addedAt])]),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                {t('research.exportCsv')}
              </Button>
              <ConfirmButton size="s" label={t('common.delete')} question={t('research.deleteList', { name: l.name })} confirmLabel={t('common.delete')} onConfirm={() => void remove('keywordLists', l.id)} />
            </div>
          </div>
          {l.keywords.length ? (
            <ul className="list">
              {l.keywords.map((k) => (
                <li key={k.text} className="list-item">
                  <div className="row-between">
                    <a href={`#research/${encodeURIComponent(k.text)}`} dir="auto">
                      {k.text}
                    </a>
                    <div className="row">
                      <span className="small muted">{formatDate(k.addedAt)}</span>
                      <Button
                        size="s"
                        variant="ghost"
                        aria-label={t('research.removeKeyword', { k: k.text })}
                        onClick={async () => {
                          const r = await save('keywordLists', { ...l, keywords: l.keywords.filter((x) => x !== k) });
                          if (!r.ok) toast(t('draft.conflict'));
                        }}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">{t('research.emptyList')}</p>
          )}
        </section>
      ))}
    </div>
  );
}

export function ResearchView({ query }: { query?: string }) {
  const { t } = useI18n();
  const { youtube, loaded } = useIntegrations();
  const [tab, setTab] = useState<Tab>('explore');
  const tabs: { id: Tab; label: MessageKey }[] = [
    { id: 'explore', label: 'research.tab.explore' },
    { id: 'trending', label: 'research.tab.trending' },
    { id: 'lists', label: 'research.tab.lists' },
  ];
  return (
    <section className="stack" aria-labelledby="res-h">
      <h1 id="res-h">{t('research.heading')}</h1>
      {loaded && !youtube.apiKey && tab !== 'lists' && <ErrorNotice error={new YtError('no-key')} />}
      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
            {t(x.label)}
          </button>
        ))}
      </div>
      {tab === 'explore' && <Explore key={query} initial={query} />}
      {tab === 'trending' && <Trending />}
      {tab === 'lists' && <KeywordLists />}
    </section>
  );
}
