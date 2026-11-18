// Search results page: a TubeX strip above the results (keyword score on click, research link) and small
// badges next to each result's metadata (views/day, age, tag count, "your channel"). Badges are React portals
// into tiny shadow roots placed next to each result; one yt.videos call (1 unit) per 50 new visible ids.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/icons';
import { Button, Score } from '../../components/ui';
import { KEYWORD_SCORE_UNITS, normalizeKeywordScore, pendingPages, resultBadge, type KeywordScore } from '../../domain/inpage';
import type { VideoInfo } from '../../integrations/youtube/api';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { rpc } from '../../platform/rpc';
import { readSearchResults } from '../../platform/youtubeDomInpage';
import { canReadYt, InError, Mark, SetupNeeded, stopKeys, useFmt, useStatus } from '../common';
import { useInpageEnabled, useYtTheme } from '../InpageRoot';
import { useSearchQuery } from './hooks';

// Video data for result ids, kept for the life of the tab (the background also caches for hours).
const videoCache = new Map<string, VideoInfo | null>();

export function SearchTools() {
  const on = useInpageEnabled('search');
  const query = useSearchQuery();
  if (!on || !query) return null;
  return <SearchToolsFor key={query} query={query} />;
}

function SearchToolsFor({ query }: { query: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const readable = canReadYt(status);
  const [score, setScore] = useState<KeywordScore | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [asking, setAsking] = useState(false);
  const { slots, data, scanError } = useResultBadges(readable);
  const ownIds = useMemo(() => new Set(status?.channels.map((c) => c.channelId) ?? []), [status]);
  const ownCount = slots.filter((s) => data.get(s.videoId) && ownIds.has(data.get(s.videoId)!.channelId)).length;

  const runScore = async () => {
    setAsking(false);
    setBusy(true);
    setError(undefined);
    try {
      setScore(normalizeKeywordScore(await rpc('seo.keywordScore', query)));
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };

  return (
    <section className="tx-card tx-search" aria-label={t('inpage.search.label')}>
      <div className="tx-head">
        <Mark />
        <span className="tx-query" dir="auto">
          <Icon name="search" />
          <bdi>{query}</bdi>
        </span>
        {score && (
          <span className="tx-kwscore">
            <Score value={score.score} label={t('inpage.search.score')} />
            <span className="stack-s" style={{ gap: 0 }}>
              <strong className="small">{t('inpage.search.score')}</strong>
              <span className="xsmall muted">
                {score.sampleSize !== undefined && t('inpage.search.sample', { n: score.sampleSize })}
                {score.fetchedAt && ` · ${f.date(score.fetchedAt)}`}
              </span>
            </span>
          </span>
        )}
        <span className="grow" />
        {readable && !score && !asking && (
          <Button size="s" variant="primary" disabled={busy} onClick={() => setAsking(true)}>
            <Icon name="target" />
            {busy ? t('common.loading') : t('inpage.search.check')}
          </Button>
        )}
        <Button size="s" onClick={() => void rpc('ui.openWorkspace', 'research', query)}>
          <Icon name="external" />
          {t('inpage.search.research')}
        </Button>
      </div>
      {asking && (
        <div className="tx-confirm" role="group" aria-label={t('inpage.search.check')}>
          <Icon name="info" />
          <p className="grow small">{t('inpage.search.cost', { units: f.int(KEYWORD_SCORE_UNITS) })}</p>
          <Button size="s" variant="primary" autoFocus onClick={() => void runScore()}>
            {t('inpage.search.run')}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setAsking(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {score && score.parts.length > 0 && (
        <ul className="tx-parts">
          {score.parts.map((p) => (
            <li key={p.key}>
              <span className="xsmall muted">{t(`inpage.part.${p.key}` as MessageKey) === `inpage.part.${p.key}` ? p.key : t(`inpage.part.${p.key}` as MessageKey)}</span>
              <b className="num-t small">{f.num(p.value, 0)}</b>
            </li>
          ))}
        </ul>
      )}
      {error !== undefined && <InError error={error} />}
      {status && !readable && <SetupNeeded />}
      {readable && (
        <p className="xsmall muted tx-legend">
          {t('inpage.search.legend', { n: slots.length })}
          {ownCount > 0 && ` · ${t('inpage.search.own', { n: ownCount })}`}
        </p>
      )}
      {scanError !== undefined && <InError error={scanError} />}
      {slots.map((s) => {
        const v = data.get(s.videoId);
        return createPortal(<ResultBadges v={v} own={!!v && ownIds.has(v.channelId)} loading={!data.has(s.videoId)} />, s.container, s.key);
      })}
    </section>
  );
}

function ResultBadges({ v, own, loading }: { v: VideoInfo | null | undefined; own: boolean; loading: boolean }) {
  const { t, dir } = useI18n();
  const f = useFmt();
  const theme = useYtTheme();
  if (loading) return <div className="b" data-theme={theme} dir={dir} aria-hidden="true"><span className="p sk" /></div>;
  if (!v) return null;
  const b = resultBadge(v, new Set(own ? [v.channelId] : []));
  const label = [
    t('inpage.badge.vpd', { n: f.compact(b.viewsPerDay) }),
    t('inpage.badge.age', { age: f.age(b.ageDays) }),
    t('inpage.badge.tags', { n: b.tagCount }),
    own ? t('inpage.badge.own') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="b" data-theme={theme} dir={dir} role="group" aria-label={`TubeX: ${label}`}>
      <span className="m" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg>
      </span>
      <span className="p" title={t('inpage.m.vpdHint')}>
        {t('inpage.badge.vpd', { n: f.compact(b.viewsPerDay) })}
      </span>
      <span className="p">{f.age(b.ageDays)}</span>
      <span className="p" title={v.tags.slice(0, 12).join(', ')}>
        {t('inpage.badge.tags', { n: b.tagCount })}
      </span>
      {own && <span className="p own">{t('inpage.badge.own')}</span>}
    </div>
  );
}

const BADGE_CSS = `
:host { all: initial; display: block; }
.b { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-block: 4px 2px; font: 500 12px/1.4 Roboto, Arial, Tahoma, sans-serif; }
.b[data-theme='dark'] { --bg: rgba(255,255,255,0.1); --fg: #f1f1f1; --mk: #1ed760; }
.b[data-theme='light'] { --bg: rgba(0,0,0,0.05); --fg: #0f0f0f; --mk: #0f8a3c; }
.m { width: 16px; height: 16px; border-radius: 50%; background: #1ed760; display: inline-grid; place-items: center; flex: none; }
.m svg { width: 9px; height: 9px; fill: #000; }
.p { padding: 1px 8px; border-radius: 9999px; background: var(--bg); color: var(--fg); white-space: nowrap; }
.p.own { background: #1ed760; color: #000; font-weight: 700; }
.sk { width: 120px; height: 16px; opacity: 0.6; }
`;

interface Slot {
  key: string;
  videoId: string;
  container: HTMLElement;
}

let slotSeq = 0;

/** Finds results, places a badge host next to each, and loads data for new ids in pages of 50. */
function useResultBadges(enabled: boolean) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [data, setData] = useState<Map<string, VideoInfo | null>>(() => new Map(videoCache));
  const [scanError, setScanError] = useState<unknown>();
  const hosts = useRef(new Map<Element, { host: HTMLElement; container: HTMLElement; key: string; videoId: string }>());
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    const root = document.querySelector('ytd-search') ?? document.body;
    let timer: number | undefined;
    let stopped = false;

    const load = async (ids: string[]) => {
      const pages = pendingPages(ids, new Set([...videoCache.keys(), ...inflight.current]));
      for (const page of pages) {
        page.forEach((id) => inflight.current.add(id));
        try {
          const got = await rpc<VideoInfo[]>('yt.videos', page);
          const byId = new Map(got.map((v) => [v.id, v]));
          for (const id of page) videoCache.set(id, byId.get(id) ?? null);
        } catch (e) {
          if (!stopped) setScanError(e);
          return; // stop on errors (quota, key); do not retry automatically
        } finally {
          page.forEach((id) => inflight.current.delete(id));
        }
        if (!stopped) setData(new Map(videoCache));
      }
    };

    const scan = () => {
      timer = undefined;
      const found = readSearchResults(root);
      const live = new Set<Element>();
      let changed = false;
      for (const s of found) {
        live.add(s.item);
        let h = hosts.current.get(s.item);
        if (!h || !h.host.isConnected || h.host.previousElementSibling !== s.after) {
          h?.host.remove();
          const host = document.createElement('tubex-badges');
          const shadow = host.attachShadow({ mode: 'open' });
          const style = document.createElement('style');
          style.textContent = BADGE_CSS;
          const container = document.createElement('div');
          shadow.append(style, container);
          stopKeys(host);
          s.after.insertAdjacentElement('afterend', host);
          h = { host, container, key: `b${slotSeq++}`, videoId: s.videoId };
          hosts.current.set(s.item, h);
          changed = true;
        } else if (h.videoId !== s.videoId) {
          h.videoId = s.videoId; // YouTube reuses result elements for new results
          changed = true;
        }
      }
      for (const [item, h] of hosts.current) {
        if (!live.has(item)) {
          h.host.remove();
          hosts.current.delete(item);
          changed = true;
        }
      }
      if (changed) setSlots([...hosts.current.values()].map((h) => ({ key: h.key, videoId: h.videoId, container: h.container })));
      void load(found.map((s) => s.videoId));
    };

    const schedule = () => {
      if (timer === undefined) timer = window.setTimeout(scan, 700);
    };
    const mo = new MutationObserver((records) => {
      // Ignore our own badge insertions.
      if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n.nodeName === 'TUBEX-BADGES'))) return;
      schedule();
    });
    mo.observe(root, { childList: true, subtree: true });
    scan();
    return () => {
      stopped = true;
      mo.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      for (const h of hosts.current.values()) h.host.remove();
      hosts.current.clear();
    };
  }, [enabled]);

  return { slots, data, scanError };
}
