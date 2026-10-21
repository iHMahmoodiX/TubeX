// Videolytics (#7): a panel at the top of the watch page's right column (switch 'videolytics'), also shown in the
// TubeX drawer on watch pages. Summary, SEO (tags, ranked tags on request, TubeX score), channel block, an honest
// best-practices checklist (no API → "unknown", never ✗), tags with copy and search ranks, a Compare toggle
// (this video vs the channel's recent uploads) and a Tools menu with the watch page's actions.
// The bar under the video keeps the derived rates (views/day, engagement, like rate, age) and the SEO checklist,
// so the two never show the same numbers twice.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { Icon } from '../../components/icons';
import { Button, Score } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { normalizeTagRanks, pickKeyword, studioVideoUrl, videoSeo, type TagRank } from '../../domain/inpage';
import { LIMITS, tagsCharCount } from '../../domain/metadata';
import type { ChannelInfo, VideoInfo } from '../../integrations/youtube/api';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { rpc } from '../../platform/rpc';
import { cachedRpc, canReadYt, copyText, InError, SetupNeeded, useAsync, useFmt, useStatus, useStored } from '../common';
import { useInpageEnabled } from '../InpageRoot';
import { requestWatchSeo, setVideolyticsShown } from '../launch/bus';
import { bestPractices, rankedCount, rankPlan, ratioTo, recentAverage, type ChannelAverage, type Practice, type VideoFacts } from '../launch/logic';
import { useWatchVideoId } from './hooks';
import { useWatchActions } from './WatchActions';

type Overview = { channel: ChannelInfo | null; recent: VideoInfo[] };

/** The right-column island. */
export function Videolytics() {
  const on = useInpageEnabled('videolytics');
  const videoId = useWatchVideoId();
  const show = on && !!videoId;
  useEffect(() => {
    setVideolyticsShown(show);
    return () => setVideolyticsShown(false);
  }, [show]);
  if (!show) return null;
  return <VideolyticsFor key={videoId} videoId={videoId} variant="column" />;
}

/** The drawer's watch-page view (returns null off watch pages, per the drawer panel contract). */
export function VideolyticsPanel({ variant = 'drawer' }: { variant?: 'drawer' | 'column' }) {
  const videoId = useWatchVideoId();
  if (!videoId) return null;
  return <VideolyticsFor key={videoId} videoId={videoId} variant={variant} />;
}

function VideolyticsFor({ videoId, variant }: { videoId: string; variant: 'drawer' | 'column' }) {
  const { t } = useI18n();
  const status = useStatus();
  const readable = canReadYt(status);
  const [collapsed, setCollapsed] = useStored<boolean>('vl.collapsed', false);
  const [compare, setCompare] = useStored<boolean>('vl.compare', false);
  const [savedKw] = useStored<string>(`kw.${videoId}`, '');
  const [rev, setRev] = useState(0);
  const bodyId = useId();

  const video = useAsync(readable ? `vl:${videoId}:${rev}` : null, async () => (rev ? await rpc<VideoInfo[]>('yt.videos', [videoId], true) : await cachedRpc<VideoInfo[]>(10 * 60_000, 'yt.videos', [videoId]))[0] ?? null);
  const v = video.data ?? undefined;
  const channel = useAsync(v?.channelId ? `c:${v.channelId}` : null, () => cachedRpc<ChannelInfo | null>(30 * 60_000, 'yt.channel', { id: v!.channelId }));
  const facts = useAsync(v ? `facts:${videoId}` : null, () => cachedRpc<VideoFacts | null>(10 * 60_000, 'launchers.videoFacts', videoId));
  const overview = useAsync(compare && v?.channelId ? `ov:${v.channelId}` : null, () => cachedRpc<Overview>(30 * 60_000, 'inpage.channelOverview', { id: v!.channelId }));
  const avg = overview.data ? recentAverage(overview.data.recent, videoId) : undefined;

  const kw = v ? pickKeyword(savedKw, v.tags) : { keyword: '', source: 'none' as const };
  const seo = useMemo(() => (v ? videoSeo({ title: v.title, description: v.description, tags: v.tags, keyword: kw.keyword }) : null), [v, kw.keyword]);
  const own = !!v && !!status?.channels.some((c) => c.channelId === v.channelId);
  const [ranks, setRanks] = useState<TagRank[] | null>(null);

  const showBody = variant === 'drawer' || !collapsed;
  return (
    <section className={`tx-vl ${variant === 'column' ? 'tx-vl-column' : ''}`} aria-label={t('ln.vl.label')}>
      <header className="tx-vl-head">
        {variant === 'column' && (
          <span className="tx-mark">
            <i aria-hidden="true">
              <Icon name="logo" />
            </i>
            <span>{t('ln.vl.title')}</span>
          </span>
        )}
        <span className="grow" />
        {v && (
          <button type="button" className="tx-vl-pill" aria-pressed={compare} onClick={() => setCompare(!compare)} title={t('ln.vl.compareHint')}>
            <Icon name="chart" />
            {compare ? t('ln.vl.compareOn') : t('ln.vl.compareOff')}
          </button>
        )}
        {v && <ToolsMenu v={v} own={own} activeChannelId={status?.activeChannelId} onUpdated={() => setRev((n) => n + 1)} />}
        {variant === 'column' && (
          <button type="button" className="tx-ln-iconbtn" aria-expanded={!collapsed} aria-controls={bodyId} aria-label={collapsed ? t('inpage.showDetails') : t('inpage.hideDetails')} title={collapsed ? t('inpage.showDetails') : t('inpage.hideDetails')} onClick={() => setCollapsed(!collapsed)}>
            <Icon name="down" style={{ transform: collapsed ? undefined : 'rotate(180deg)' }} />
          </button>
        )}
      </header>
      {showBody && (
        <div id={bodyId} className="tx-vl-body">
          {status && !readable && <SetupNeeded />}
          {video.error !== undefined && <InError error={video.error} onRetry={video.reload} />}
          {video.data === null && <p className="small muted">{t('inpage.watch.notFound')}</p>}
          {readable && video.loading && !v && <VlSkeleton />}
          {v && (
            <>
              <Summary v={v} compare={compare} avg={avg} loading={overview.loading} error={overview.error} />
              <Seo v={v} score={seo?.score ?? null} ranks={ranks} onRanks={setRanks} />
              <ChannelBlock ch={channel.data ?? undefined} error={channel.error} channelId={v.channelId} />
              <Practices v={v} facts={facts.data} factsError={facts.error} own={own} />
              <Tags v={v} ranks={ranks} onRanks={setRanks} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function VlSkeleton() {
  return (
    <div className="stack-s" aria-busy="true">
      <span className="skel tx-skel-line" />
      <span className="skel tx-skel-line" />
      <span className="skel tx-skel-line" />
    </div>
  );
}

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="tx-vl-block">
      <div className="tx-vl-block-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Big({ value, label, exact, sub }: { value: ReactNode; label: string; exact?: string; sub?: ReactNode }) {
  return (
    <div className="tx-vl-big" title={exact}>
      <b className="num-t">{value}</b>
      <span>{label}</span>
      {sub}
    </div>
  );
}

// ---------------------------------------------------------------- summary (+ compare)

function Summary({ v, compare, avg, loading, error }: { v: VideoInfo; compare: boolean; avg?: ChannelAverage; loading: boolean; error: unknown }) {
  const { t } = useI18n();
  const f = useFmt();
  const delta = (value: number | undefined, a: number | undefined) => {
    if (!compare) return undefined;
    if (loading && !avg) return <span className="skel tx-vl-delta-skel" aria-hidden="true" />;
    const r = ratioTo(value, a);
    if (r === undefined) return <span className="tx-vl-delta">—</span>;
    const tone = r >= 1.1 ? 'good' : r <= 0.9 ? 'bad' : undefined;
    return (
      <span className="tx-vl-delta" data-tone={tone} title={t('ln.vl.vsAvgHint', { avg: f.int(a) })}>
        {t('ln.vl.vsAvg', { x: f.num(r, r < 10 ? 1 : 0) })}
      </span>
    );
  };
  const hidden = v.views === undefined || v.likes === undefined || v.comments === undefined;
  return (
    <Block title={t('ln.vl.summary')}>
      <div className="tx-vl-grid3">
        <Big value={f.compact(v.views)} label={t('inpage.s.views')} exact={v.views === undefined ? t('inpage.hidden') : f.int(v.views)} sub={delta(v.views, avg?.views)} />
        <Big value={f.compact(v.comments)} label={t('inpage.s.comments')} exact={v.comments === undefined ? t('inpage.hidden') : f.int(v.comments)} sub={delta(v.comments, avg?.comments)} />
        <Big value={f.compact(v.likes)} label={t('inpage.s.likes')} exact={v.likes === undefined ? t('inpage.hidden') : f.int(v.likes)} sub={delta(v.likes, avg?.likes)} />
      </div>
      {hidden && <p className="xsmall muted">{t('inpage.hiddenCounts')}</p>}
      {compare && error !== undefined && <InError error={error} />}
      {compare && avg && <p className="xsmall faint">{avg.sample ? t('ln.vl.compareNote', { n: avg.sample }) : t('ln.vl.compareNone')}</p>}
    </Block>
  );
}

// ---------------------------------------------------------------- SEO

function Seo({ v, score, ranks, onRanks }: { v: VideoInfo; score: number | null; ranks: TagRank[] | null; onRanks: (r: TagRank[]) => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const barShown = useInpageEnabled('watch');
  const chars = tagsCharCount(v.tags);
  const [asking, setAsking] = useState(false);
  return (
    <Block title={t('ln.vl.seo')}>
      <div className="tx-vl-grid3">
        <Big value={v.tags.length ? f.int(v.tags.length) : '—'} label={t('ln.vl.tagsUsed')} sub={<span className="tx-vl-sub">{t('ln.vl.tagChars', { n: f.int(chars), max: f.int(LIMITS.tagsChars) })}</span>} />
        {ranks ? (
          <Big value={`${f.int(rankedCount(ranks))}/${f.int(ranks.length)}`} label={t('ln.vl.rankedTags')} sub={<span className="tx-vl-sub">{t('ln.vl.rankedSub')}</span>} />
        ) : (
          <div className="tx-vl-big">
            <button type="button" className="tx-vl-load" disabled={!v.tags.length} onClick={() => setAsking(true)} aria-expanded={asking}>
              {t('ln.vl.clickToLoad')}
            </button>
            <span>{t('ln.vl.rankedTags')}</span>
          </div>
        )}
        <div className="tx-vl-big">
          {barShown ? (
            <button type="button" className="tx-vl-score" onClick={requestWatchSeo} title={t('ln.vl.scoreHint')} aria-label={t('inpage.seo.scoreLabel', { n: score ?? 0 })}>
              <Score value={score} label={t('inpage.seo.score')} />
            </button>
          ) : (
            <Score value={score} label={t('inpage.seo.score')} />
          )}
          <span>{t('ln.vl.seoScore')}</span>
        </div>
      </div>
      {asking && !ranks && <RankConfirm v={v} onDone={(r) => (onRanks(r), setAsking(false))} onCancel={() => setAsking(false)} />}
      <p className="xsmall faint">{t('ln.vl.creatorSuggestedNote')}</p>
    </Block>
  );
}

/** States the quota cost (cached tags are free) before any search.list call. */
function RankConfirm({ v, onDone, onCancel }: { v: VideoInfo; onDone: (r: TagRank[]) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const candidate = v.tags.slice(0, 30);
  const uncached = useAsync(`uncached:${v.id}:${candidate.join('|')}`, () => rpc<number>('launchers.uncachedTags', candidate).catch(() => undefined));
  const plan = rankPlan(v.tags, uncached.loading ? undefined : uncached.data);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onDone(normalizeTagRanks(await rpc('seo.tagRanks', v.id, plan.tags), plan.tags));
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };
  return (
    <div className="stack-s">
      <div className="tx-confirm" role="group" aria-label={t('ln.vl.rankedTags')}>
        <Icon name="alert" />
        <p className="grow small">
          {t('ln.vl.rankCost', { n: f.int(plan.tags.length), units: f.int(plan.units) })}
          {plan.cached > 0 && ` ${t('ln.vl.rankCached', { n: f.int(plan.cached) })}`}
          {v.tags.length > plan.tags.length && ` ${t('ln.vl.rankFirst', { n: f.int(plan.tags.length), total: f.int(v.tags.length) })}`}
        </p>
        <Button size="s" variant="primary" disabled={busy || uncached.loading} onClick={() => void run()}>
          {busy ? t('common.loading') : t('inpage.ranks.run', { units: f.int(plan.units) })}
        </Button>
        <Button size="s" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      {error !== undefined && <InError error={error} />}
    </div>
  );
}

// ---------------------------------------------------------------- channel block

function ChannelBlock({ ch, error, channelId }: { ch?: ChannelInfo; error: unknown; channelId: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const href = `https://www.youtube.com/channel/${channelId}`;
  const goInsights = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // The drawer opens on Channel Insights when the channel page loads (remembered per site).
    await browser.storage.local.set({ 'inpage.launch.open.youtube': true, 'inpage.launch.view.youtube': 'page' }).catch(() => undefined);
    location.assign(href);
  };
  return (
    <Block
      title={t('ln.vl.channel')}
      action={
        <a className="tx-vl-link" href={href} onClick={(e) => void goInsights(e)}>
          {t('ln.vl.channelInsights')}
        </a>
      }
    >
      {error !== undefined ? (
        <InError error={error} />
      ) : !ch ? (
        <span className="skel tx-skel-line" aria-busy="true" />
      ) : (
        <div className="tx-vl-grid3">
          <Big value={f.compact(ch.views)} label={t('inpage.s.totalViews')} exact={f.int(ch.views)} />
          <Big value={ch.subscribers === undefined ? '—' : f.compact(ch.subscribers)} label={t('inpage.s.subs')} exact={ch.subscribers === undefined ? t('inpage.hidden') : f.int(ch.subscribers)} />
          <Big value={f.compact(ch.videoCount)} label={t('inpage.s.videos')} exact={f.int(ch.videoCount)} />
        </div>
      )}
    </Block>
  );
}

// ---------------------------------------------------------------- best practices

const PRACTICE_MARK: Record<Practice['state'], string> = { ok: '✓', fail: '×', warn: '!', unknown: '?' };

function Practices({ v, facts, factsError, own }: { v: VideoInfo; facts: VideoFacts | null | undefined; factsError: unknown; own: boolean }) {
  const { t } = useI18n();
  const items = bestPractices(v.description, facts);
  const stateLabel = (s: Practice['state']) => t(`ln.bp.state.${s}` as MessageKey);
  return (
    <Block title={t('ln.vl.practices')}>
      <ul className="tx-vl-bp">
        {items.map((p) => {
          const hint = t(`ln.bp.${p.id}.${p.state === 'unknown' ? 'unknown' : 'hint'}` as MessageKey);
          return (
            <li key={p.id} data-state={p.state} title={hint}>
              <span className="tx-vl-bp-mark" aria-hidden="true">
                {PRACTICE_MARK[p.state]}
              </span>
              <span className="sr-only">{stateLabel(p.state)}: </span>
              <span>{t(`ln.bp.${p.id}` as MessageKey)}</span>
              <span className="sr-only">. {hint}</span>
            </li>
          );
        })}
      </ul>
      {factsError !== undefined && <InError error={factsError} />}
      <p className="xsmall faint">
        {t('ln.bp.noApi')}{' '}
        {own && (
          <a className="tx-vl-link" href={studioVideoUrl(v.id)} target="_blank" rel="noopener noreferrer">
            {t('ln.bp.checkInStudio')}
          </a>
        )}
      </p>
    </Block>
  );
}

// ---------------------------------------------------------------- tags

function Tags({ v, ranks, onRanks }: { v: VideoInfo; ranks: TagRank[] | null; onRanks: (r: TagRank[]) => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const [showRanks, setShowRanks] = useState(false);
  const [asking, setAsking] = useState(false);
  const rankOf = useMemo(() => new Map((ranks ?? []).map((r) => [r.tag, r.rank])), [ranks]);
  const copy = async (text: string, what: string) => toast((await copyText(text)) ? t('inpage.copied', { what }) : t('common.copyFailed'));
  return (
    <Block
      title={t('ln.vl.tags')}
      action={
        v.tags.length > 0 && (
          <span className="tx-vl-actions">
            <button type="button" className="tx-vl-textbtn" onClick={() => void copy(v.tags.join(', '), t('inpage.tags.all'))}>
              <Icon name="copy" />
              {t('ln.vl.copy')}
            </button>
            <button
              type="button"
              className="tx-vl-textbtn"
              aria-pressed={showRanks && !!ranks}
              onClick={() => {
                if (ranks) setShowRanks(!showRanks);
                else setAsking(true);
              }}
            >
              <Icon name="eye" />
              {showRanks && ranks ? t('ln.vl.hideRanks') : t('ln.vl.showRanks')}
            </button>
          </span>
        )
      }
    >
      {asking && !ranks && (
        <RankConfirm
          v={v}
          onDone={(r) => {
            onRanks(r);
            setAsking(false);
            setShowRanks(true);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
      {!v.tags.length ? (
        <p className="small muted">{t('inpage.tags.none')}</p>
      ) : (
        <ul className="chips tx-vl-tags" aria-label={t('ln.vl.tags')}>
          {v.tags.map((tag) => {
            const r = rankOf.get(tag);
            return (
              <li key={tag}>
                <button type="button" className="chip" dir="auto" onClick={() => void copy(tag, `“${tag}”`)} title={t('inpage.tags.copyOne', { tag })}>
                  {tag}
                  {showRanks && ranks && (rankOf.has(tag) ? <span className={`tx-vl-rank ${r !== null && r !== undefined && r <= 10 ? 'is-top' : ''}`}>{r === null || r === undefined ? '—' : `#${f.int(r)}`}</span> : <span className="tx-vl-rank">{t('ln.vl.notChecked')}</span>)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showRanks && ranks && <p className="xsmall faint">{t('ln.vl.ranksNote')}</p>}
    </Block>
  );
}

// ---------------------------------------------------------------- tools menu

function ToolsMenu(props: { v: VideoInfo; own: boolean; activeChannelId?: string; onUpdated: () => void }) {
  const { t } = useI18n();
  const { actions, trigger, busy, error, panel, panelNode, setPanel } = useWatchActions(props);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = 288;
    setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => (menu.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus());
    const host = (btn.current?.getRootNode() as ShadowRoot | undefined)?.host;
    const away = (e: PointerEvent) => {
      if (host && e.composedPath().includes(menu.current as EventTarget)) return;
      if (e.composedPath().includes(btn.current as EventTarget)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('scroll', onScroll);
    };
  }, [open]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const cur = (menu.current?.getRootNode() as ShadowRoot | undefined)?.activeElement;
    const i = items.indexOf(cur as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <>
      <button ref={btn} type="button" className="tx-vl-pill" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('ln.vl.tools')}
        <Icon name="down" />
      </button>
      {open && pos && (
        <div ref={menu} className="tx-menu" role="menu" aria-label={t('ln.vl.tools')} style={{ top: pos.top, left: pos.left }} onKeyDown={onKey}>
          <div className="tx-menu-group" role="none">
          {actions.map((a) =>
            a.href ? (
              <a key={a.id} role="menuitem" tabIndex={-1} className="tx-menu-item" href={a.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <Icon name={a.icon} />
                <span className="grow">{a.title}</span>
                <Icon name="external" className="icon tx-menu-ext" />
              </a>
            ) : (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={a.disabled || undefined}
                className="tx-menu-item"
                title={a.sub}
                onClick={() => {
                  if (a.disabled) return;
                  setOpen(false);
                  void trigger(a);
                }}
              >
                <Icon name={busy === a.id ? 'refresh' : a.icon} />
                <span className="grow">{a.title}</span>
              </button>
            ),
          )}
          </div>
        </div>
      )}
      {(panelNode || error !== undefined || busy) && (
        <ToolsOutput>
          {busy && <p className="small muted">{t('common.loading')}</p>}
          {error !== undefined && <InError error={error} />}
          {panelNode && (
            <div className="stack-s">
              {panelNode}
              <div>
                <Button size="s" variant="ghost" onClick={() => setPanel(null)}>
                  {t('common.close')}
                </Button>
              </div>
            </div>
          )}
          {panel === null && null}
        </ToolsOutput>
      )}
    </>
  );
}

/** Output of a Tools action (embed builder, editor, errors) sits in a full-width row under the header. */
function ToolsOutput({ children }: { children: ReactNode }) {
  return <div className="tx-vl-out">{children}</div>;
}
