// Aparat page and Blog page: every YouTube upload of the active channel with its state on that platform.
// One click opens the video's package; "Do it all" runs the whole chain (Aparat: package + AI rewrite;
// blog: captions → article → WordPress draft) for one video or for the selected ones, one after another.
// TubeX never uploads to or signs in to Aparat, and never publishes on WordPress (drafts only).
import { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { Avatar, Button, Empty, Notice, PageHeader, SearchInput } from '../../components/ui';
import { Icon } from '../../components/icons';
import { APARAT_UPLOAD_URL, checkAparat } from '../../domain/aparat';
import type { Draft, PublishStatus } from '../../domain/models';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { onDataChanged } from '../../storage/db';
import { matchesQuery } from '../../domain/text';
import { loadRepublish } from '../../storage/republish';
import { loadWpSites } from '../../storage/wordpress';
import { useChannel, useOwnVideos } from '../reports/hooks';
import { SignedOut, TrackSkeleton, VideoTrack } from '../reports/shared';
import type { RVideo } from '../reports/data';
import { useFormat } from '../research/shared';
import { useIntegrations } from '../connections/useConnections';
import { errorKey } from '../connections/useConnections';
import { WpError } from '../../integrations/wordpress';
import { wpErrorText } from '../settings/WordPressSettings';
import { autoAparat, autoBlog, type StepReport } from '../republish/pipeline';
import { draftForVideo, draftsByVideo, openAparatDraft, openBlogDraft, prepareForAparat } from './aparatActions';

type Filter = 'all' | 'none' | PublishStatus;
export type Platform = 'aparat' | 'blog';
const PAGE = 40;
/** Captions (250) per video; the daily default is 10,000 units. */
const CAPTION_UNITS = 250;

interface RunRow {
  id: string;
  title: string;
  state: 'waiting' | 'running' | 'done' | 'failed';
  steps: StepReport[];
}

export function AparatView({ platform = 'aparat' }: { platform?: Platform }) {
  const { t } = useI18n();
  const f = useFormat();
  const { g, active } = useChannel();
  const vids = useOwnVideos(active);
  const { ai } = useIntegrations();
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<RunRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  useEffect(() => {
    const load = () => void draftsByVideo().then(setDrafts).catch(() => undefined);
    load();
    return onDataChanged((name) => {
      if (name === 'drafts') load();
    });
  }, []);
  useEffect(() => {
    setFilter('all');
    setPicked(new Set());
  }, [platform]);

  const isBlog = platform === 'blog';
  const pkgOf = (d?: Draft) => (isBlog ? d?.platforms?.blog : d?.platforms?.aparat);
  const rows = useMemo(() => (vids.data ?? []).map((v) => ({ v, d: drafts.get(v.id) })).map((r) => ({ ...r, p: isBlog ? r.d?.platforms?.blog : r.d?.platforms?.aparat })), [vids.data, drafts, isBlog]);
  const count = (fl: Filter) => rows.filter((r) => (fl === 'all' ? true : fl === 'none' ? !r.p : r.p?.status === fl)).length;
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'none' ? !r.p : r.p?.status === filter) && matchesQuery(r.v.title, q));
  const st = (s: PublishStatus) => t(`${isBlog ? 'blog' : 'aparat'}.st.${s}` as MessageKey);

  const open = async (v: RVideo, d?: Draft) => {
    setBusy(v.id);
    try {
      if (isBlog) openBlogDraft((await draftForVideo(v, d)).id);
      else openAparatDraft((await prepareForAparat(v, d)).id);
    } finally {
      setBusy(null);
    }
  };

  /** Runs the whole chain for the given videos, one at a time. Must start from a click (image permission). */
  const runAuto = async (list: RVideo[]) => {
    if (!list.length || running) return;
    const settings = await loadRepublish();
    const wantsImage = isBlog && settings.blog.autoWpDraft && settings.blog.featuredImage && (await loadWpSites()).length > 0;
    const imageAllowed = wantsImage ? await browser.permissions.request({ origins: ['https://i.ytimg.com/*'] }).catch(() => false) : false;
    stopRef.current = false;
    setRunning(true);
    const state: RunRow[] = list.map((v) => ({ id: v.id, title: v.title, state: 'waiting', steps: [] }));
    const push = () => setRun(state.map((r) => ({ ...r, steps: [...r.steps] })));
    push();
    for (const [i, v] of list.entries()) {
      if (stopRef.current) break;
      const row = state[i]!;
      row.state = 'running';
      push();
      try {
        const d = await draftForVideo(v, drafts.get(v.id));
        const ctx = { settings, aiEnabled: ai.enabled, imageAllowed, onStep: (s: StepReport) => (row.steps.push(s), push()) };
        const r = isBlog ? await autoBlog(d, ctx) : await autoAparat(d, ctx);
        row.state = r.steps.some((s) => s.state === 'failed') ? 'failed' : 'done';
      } catch (e) {
        row.steps.push({ step: 'draft', state: 'failed', error: e });
        row.state = 'failed';
      }
      push();
    }
    setRunning(false);
    setPicked(new Set());
  };

  const toggle = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const visible = shown.slice(0, limit);
  const allPicked = visible.length > 0 && visible.every((r) => picked.has(r.v.id));
  const pickedVideos = rows.filter((r) => picked.has(r.v.id)).map((r) => r.v);

  const stepText = (s: StepReport) => {
    const name = t(`auto.step.${s.step}` as MessageKey);
    if (s.state === 'failed') return `${name}: ${s.error instanceof WpError ? wpErrorText(t, s.error) : t(errorKey(s.error))}`;
    if (s.note) return `${name}: ${t(`auto.note.${s.note}` as MessageKey)}`;
    return name;
  };

  return (
    <div className="stack-l">
      <PageHeader
        kicker={active ? `${t(isBlog ? 'nav.blog' : 'nav.aparat')} · ${active.title}` : t(isBlog ? 'nav.blog' : 'nav.aparat')}
        title={t(isBlog ? 'blog.page.title' : 'aparat.page.title')}
        desc={t(isBlog ? 'blog.page.desc' : 'aparat.page.desc')}
        art={active ? <Avatar src={active.thumbnail} name={active.title} size="l" /> : undefined}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-s btn-ghost" href={isBlog ? '#settings/set-blog' : '#settings/set-aparat'}>
              <Icon name="settings" />
              {t('auto.settings')}
            </a>
            {!isBlog && (
              <a className="btn btn-s" href={APARAT_UPLOAD_URL} target="_blank" rel="noreferrer noopener">
                <Icon name="external" />
                {t('aparat.open')}
              </a>
            )}
          </div>
        }
      />
      {!g.loaded ? (
        <TrackSkeleton rows={4} />
      ) : !active ? (
        <SignedOut />
      ) : (
        <>
          {run && (
            <div className="card stack-s" data-testid="auto-run" aria-live="polite">
              <div className="row-between">
                <strong>{running ? t('auto.running', { done: f.int(run.filter((r) => r.state === 'done' || r.state === 'failed').length), n: f.int(run.length) }) : t('auto.finished', { ok: f.int(run.filter((r) => r.state === 'done').length), n: f.int(run.length) })}</strong>
                {running ? (
                  <Button size="s" variant="ghost" onClick={() => (stopRef.current = true)}>
                    {t('auto.stop')}
                  </Button>
                ) : (
                  <Button size="s" variant="ghost" onClick={() => setRun(null)}>
                    {t('auto.close')}
                  </Button>
                )}
              </div>
              {running && <p className="xsmall muted">{t('auto.keepOpen')}</p>}
              <ul className="stack-s small" style={{ margin: 0, paddingInlineStart: 18 }}>
                {run.map((r) => (
                  <li key={r.id}>
                    <bdi>{r.title}</bdi> — <span className={r.state === 'failed' ? 'neg' : r.state === 'done' ? '' : 'muted'}>{t(`auto.state.${r.state}` as MessageKey)}</span>
                    {r.steps.length > 0 && <div className="xsmall muted">{r.steps.map(stepText).join(' · ')}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!ai.enabled && <Notice tone="warning">{t('auto.noAi')}</Notice>}
          <div className="rp-toolbar" style={{ flexWrap: 'wrap' }}>
            <div className="chips" role="group" aria-label={t('aparat.status')}>
              {(['all', 'none', 'prepared', 'uploaded', 'published'] as const).map((fl) => (
                <button key={fl} type="button" className="chip" aria-pressed={filter === fl} onClick={() => setFilter(fl)}>
                  {fl === 'all' ? t('aparat.page.all') : fl === 'none' ? t('aparat.page.none') : st(fl)} · {f.int(count(fl))}
                </button>
              ))}
            </div>
            <SearchInput value={q} onChange={setQ} label={t('reports.searchVideos')} placeholder={t('reports.searchVideos')} />
          </div>
          {visible.length > 0 && (
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="check">
                <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(visible.map((r) => r.v.id)))} data-testid="auto-pick-all" />
                <span className="small">{t('auto.pickAll')}</span>
              </label>
              <Button size="s" variant="primary" disabled={!picked.size || running} onClick={() => void runAuto(pickedVideos)} data-testid="auto-run-selected">
                <Icon name="sparkle" />
                {t('auto.runSelected', { n: f.int(picked.size) })}
              </Button>
              {picked.size === 0 && <span className="xsmall muted">{t('auto.pickHint')}</span>}
              {isBlog && picked.size > 0 && <span className="xsmall muted">{t('auto.quota', { units: f.int(picked.size * CAPTION_UNITS) })}</span>}
            </div>
          )}
          {vids.loading && !vids.data ? (
            <TrackSkeleton rows={6} />
          ) : shown.length === 0 ? (
            <Empty icon="video">{t('mc.noVideos')}</Empty>
          ) : (
            <div className="tracks" data-testid="aparat-list">
              {visible.map(({ v, d, p }, i) => {
                const ap = d?.platforms?.aparat;
                const errors = !isBlog && ap ? checkAparat(ap).filter((x) => x.severity === 'error').length : 0;
                const url = pkgOf(d)?.url;
                return (
                  <VideoTrack
                    key={v.id}
                    n={i + 1}
                    videoId={v.id}
                    thumbnail={v.thumbnail}
                    title={v.title || '—'}
                    selected={picked.has(v.id)}
                    onSelect={() => toggle(v.id)}
                    sub={
                      <>
                        <span className={`badge ${p?.status === 'published' ? 'badge-accent' : ''}`} style={{ marginInlineEnd: 6 }}>
                          {p ? st(p.status) : t('aparat.page.none')}
                        </span>
                        {p && p.status === 'prepared' && errors > 0 && <span className="muted">{t('aparat.page.toFix', { n: f.int(errors) })} · </span>}
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer noopener" className="ltr" onClick={(e) => e.stopPropagation()}>
                            {url.replace(/^https:\/\/(www\.)?/, '')}
                          </a>
                        ) : (
                          <span className="muted">
                            {f.compact(v.views)} {t('reports.viewsShort')} · {f.age(v.publishedAt)}
                          </span>
                        )}
                      </>
                    }
                    end={
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <Button size="s" variant={p ? 'default' : 'primary'} disabled={busy === v.id || running} onClick={() => void runAuto([v])} data-testid="auto-row" title={t(isBlog ? 'auto.blogHelp' : 'auto.aparatHelp')}>
                          <Icon name="sparkle" />
                          {p ? t('auto.again') : t('auto.one')}
                        </Button>
                        <Button size="s" variant="ghost" disabled={busy === v.id} onClick={() => void open(v, d)} data-testid={isBlog ? 'blog-row-open' : 'aparat-row-open'}>
                          <Icon name={isBlog ? 'file' : 'globe'} />
                          {p ? t('aparat.page.openPkg') : t('auto.manual')}
                        </Button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
          {shown.length > limit && (
            <div>
              <Button size="s" variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
                {t('opt.showMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
