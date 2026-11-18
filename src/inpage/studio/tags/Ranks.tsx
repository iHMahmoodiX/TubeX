// Rank badges on Studio's tag chips: where this video ranks in YouTube search for each tag. Checked only on
// demand ("Show rankings", cost shown first), kept per video. Each badge is a tiny shadow host placed inside
// the chip right after its text, so Studio's chip itself is not restyled; "—" means not in the checked results.
// Double-clicking a chip opens the keyword popover for that tag.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../components/icons';
import { Button } from '../../../components/ui';
import { normalizeTagRanks, TAG_RANK_UNITS } from '../../../domain/inpage';
import { useI18n } from '../../../i18n';
import { rpc } from '../../../platform/rpc';
import { canReadYt, InError, stopKeys, useFmt, useStatus } from '../../common';
import { useYtTheme } from '../../InpageRoot';
import { chipFromPath, chipText, readChips, tagsField } from './dom';
import { batches, mergeRanks, norm, rankLabel, ranksFor, type RankEntry, type RankMap } from './logic';
import { openKeywordPop, useRanks } from './store';

/** Legend under the field plus the on-demand check (cost first, progress, cancel). */
export function RankLegend({ videoId, tags }: { videoId: string; tags: string[] }) {
  const { t } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const [ranks, setRanks] = useRanks(videoId);
  const [asking, setAsking] = useState<{ uncached: string[] } | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<unknown>();
  const stop = useRef(false);
  const sum = ranksFor(tags, ranks);
  const lastAt = Object.values(ranks).reduce((m, e) => (e.at > m ? e.at : m), '');
  const unchecked = tags.filter((x) => !ranks[norm(x)]);

  const ask = async () => {
    setError(undefined);
    try {
      setAsking(await rpc<{ uncached: string[] }>('tagTools.rankCost', tags.slice(0, 120)));
    } catch (e) {
      setError(e);
    }
  };

  const run = async (list: string[]) => {
    setAsking(null);
    setError(undefined);
    stop.current = false;
    setBusy({ done: 0, total: list.length });
    let done = 0;
    try {
      for (const batch of batches(list, 5)) {
        if (stop.current) break;
        const raw = await rpc('seo.tagRanks', videoId, batch);
        const at = new Date().toISOString();
        setRanks((prev) => mergeRanks(prev, normalizeTagRanks(raw, batch), at));
        done += batch.length;
        setBusy({ done, total: list.length });
      }
    } catch (e) {
      setError(e);
    }
    setBusy(null);
  };

  const cost = asking ? asking.uncached.length * TAG_RANK_UNITS : 0;
  return (
    <div className="tt-legend-wrap">
      <div className="tt-legend">
        <span className="tt-sample" aria-hidden="true">
          {f.int(1)}
        </span>
        <span className="xsmall muted grow">{t('tt.legend')}</span>
        {sum.checked > 0 && (
          <span className="xsmall muted tt-meta">
            <span>{t('tt.rankSummary', { top: sum.top10, found: sum.found, n: sum.checked })}</span>
            {lastAt && <span>{f.date(lastAt)}</span>}
          </span>
        )}
        {canReadYt(status) && !busy && !asking && (
          <Button size="s" onClick={() => void ask()} disabled={!tags.length}>
            <Icon name="trophy" />
            {sum.checked ? t('tt.ranksAgain') : t('tt.ranksShow')}
          </Button>
        )}
        {busy && (
          <span className="row tt-progress" role="status">
            <span className="xsmall">{t('tt.ranksBusy', { done: busy.done, total: busy.total })}</span>
            <Button size="s" variant="ghost" onClick={() => (stop.current = true)}>
              {t('tt.stop')}
            </Button>
          </span>
        )}
      </div>
      {status && !canReadYt(status) && <p className="xsmall faint">{t('tt.ranksSetup')}</p>}
      {asking && (
        <div className="tx-confirm" role="group" aria-label={t('tt.ranksShow')}>
          <Icon name="alert" />
          <p className="grow small">
            {t('tt.ranksCost', { n: tags.length, units: f.int(cost), cached: tags.length - asking.uncached.length })}
          </p>
          <Button size="s" variant="primary" autoFocus onClick={() => void run(tags)}>
            {t('tt.ranksRun', { units: f.int(cost) })}
          </Button>
          {unchecked.length > 0 && unchecked.length < tags.length && (
            <Button size="s" onClick={() => void run(unchecked)}>
              {t('tt.ranksNew', { n: unchecked.length })}
            </Button>
          )}
          <Button size="s" variant="ghost" onClick={() => setAsking(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {error !== undefined && <InError error={error} />}
    </div>
  );
}

// ---------------------------------------------------------------- badges inside chips

const BADGE_CSS = `
:host { all: initial; display: inline-flex; vertical-align: middle; margin-inline: 6px 2px; }
.b { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding-inline: 5px; box-sizing: border-box; border-radius: 9999px; font: 700 11px/1 Roboto, Arial, Tahoma, sans-serif; cursor: default; }
.b[data-theme='dark'] { --n: rgba(255,255,255,0.16); --nf: #f1f1f1; }
.b[data-theme='light'] { --n: rgba(0,0,0,0.08); --nf: #0f0f0f; }
.b { background: var(--n); color: var(--nf); }
.b[data-tone='top'] { background: #1ed760; color: #000; }
.b[data-tone='in'] { background: rgba(30,215,96,0.22); }
.b[data-theme='light'][data-tone='in'] { color: #0f6b30; }
`;

interface Slot {
  key: string;
  text: string;
  container: HTMLElement;
}

let seq = 0;

/** Places badge hosts in chips that have a checked rank; removes them when the rank or the chip goes. */
function useChipSlots(ranks: RankMap, enabled: boolean): Slot[] {
  const [slots, setSlots] = useState<Slot[]>([]);
  const hosts = useRef(new Map<Element, { host: HTMLElement; container: HTMLElement; key: string; text: string }>());
  const ranksRef = useRef(ranks);
  ranksRef.current = ranks;
  const [nonce, setNonce] = useState(0);

  useEffect(() => setNonce((n) => n + 1), [ranks]);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    let mo: MutationObserver | null = null;
    let watched: Element | null = null;
    const scan = () => {
      timer = undefined;
      const field = tagsField(document);
      if (field?.container !== watched) {
        mo?.disconnect();
        watched = field?.container ?? null;
        if (watched) mo?.observe(watched, { childList: true, subtree: true, characterData: true });
      }
      const live = new Set<Element>();
      let changed = false;
      for (const c of readChips(field)) {
        if (!ranksRef.current[norm(c.text)]) continue;
        live.add(c.el);
        let h = hosts.current.get(c.el);
        const anchorOk = h?.host.isConnected && h.host.parentElement && (c.textEl ? h.host.previousElementSibling === c.textEl : h.host.parentElement === c.el);
        if (!h || !anchorOk) {
          h?.host.remove();
          const host = document.createElement('tubex-tag-badge');
          const shadow = host.attachShadow({ mode: 'open' });
          const style = document.createElement('style');
          style.textContent = BADGE_CSS;
          const container = document.createElement('span');
          shadow.append(style, container);
          stopKeys(host);
          if (c.textEl) c.textEl.after(host);
          else c.el.append(host);
          h = { host, container, key: `tb${seq++}`, text: c.text };
          hosts.current.set(c.el, h);
          changed = true;
        } else if (h.text !== c.text) {
          h.text = c.text; // Studio reuses chip elements when tags change
          changed = true;
        }
      }
      for (const [el, h] of hosts.current)
        if (!live.has(el)) {
          h.host.remove();
          hosts.current.delete(el);
          changed = true;
        }
      if (changed) setSlots([...hosts.current.values()].map((h) => ({ key: h.key, text: h.text, container: h.container })));
    };
    const schedule = () => {
      if (timer === undefined) timer = window.setTimeout(scan, 200);
    };
    mo = new MutationObserver((records) => {
      if (records.every((r) => r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every((n) => n.nodeName === 'TUBEX-TAG-BADGE'))) return;
      schedule();
    });
    scan();
    return () => {
      mo?.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled, nonce]);

  useEffect(
    () => () => {
      for (const h of hosts.current.values()) h.host.remove();
      hosts.current.clear();
    },
    [],
  );
  useEffect(() => {
    if (enabled) return;
    for (const h of hosts.current.values()) h.host.remove();
    hosts.current.clear();
    setSlots([]);
  }, [enabled]);
  return slots;
}

function Badge({ entry }: { entry: RankEntry }) {
  const { t, dir } = useI18n();
  const f = useFmt();
  const theme = useYtTheme();
  const label = rankLabel(entry, (n) => f.int(n));
  if (!label) return null;
  const tone = entry.rank === null ? 'out' : entry.rank <= 10 ? 'top' : 'in';
  const text = entry.rank === null ? t('tt.badgeOut', { tag: entry.tag }) : t('tt.badgeIn', { tag: entry.tag, n: entry.rank });
  return (
    <span className="b" data-theme={theme} data-tone={tone} dir={dir} title={`TubeX: ${text} · ${f.date(entry.at)}`} role="img" aria-label={`TubeX: ${text}`}>
      {label}
    </span>
  );
}

/** Badge portals for every checked chip, plus the double-click-to-research listener on the field. */
export function ChipBadges({ videoId, enabled }: { videoId: string; enabled: boolean }) {
  const [ranks] = useRanks(videoId);
  const slots = useChipSlots(ranks, enabled);

  useEffect(() => {
    if (!enabled) return;
    const onDbl = (e: MouseEvent) => {
      const chip = chipFromPath(e.composedPath(), tagsField(document));
      if (!chip) return;
      const text = chipText(chip);
      if (text) openKeywordPop(text, chip, true);
    };
    document.addEventListener('dblclick', onDbl, true);
    return () => document.removeEventListener('dblclick', onDbl, true);
  }, [enabled]);

  return (
    <>
      {slots.map((s) => {
        const e = ranks[norm(s.text)];
        return e ? createPortal(<Badge entry={e} />, s.container, s.key) : null;
      })}
    </>
  );
}
