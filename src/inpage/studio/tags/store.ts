// State shared by the tag-tool islands on one page (tip, tools, popover, switcher, drawer panel, the old
// assistant card): the keyword popover target, and values in chrome.storage.local that every island follows
// live (target keyword per video, rank results per video, known keyword scores).
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { browser } from 'wxt/browser';
import { norm, type RankMap, type ScoreMap } from './logic';

// ---------------------------------------------------------------- keyword popover

export interface PopTarget {
  keyword: string;
  /** Viewport rectangle of what was double-clicked/clicked (popover sits next to it). */
  rect: { top: number; left: number; bottom: number; right: number };
  /** Opened from a tag in the field (offers "remove from field" / shows its rank). */
  fromField?: boolean;
  /** Counter so re-opening the same keyword re-focuses. */
  seq: number;
}

let pop: PopTarget | null = null;
let seq = 0;
const popSubs = new Set<() => void>();
const emitPop = () => popSubs.forEach((f) => f());

export function openKeywordPop(keyword: string, from: Element | DOMRect | null, fromField = false) {
  const r = from instanceof Element ? from.getBoundingClientRect() : from;
  const rect = r ? { top: r.top, left: r.left, bottom: r.bottom, right: r.right } : { top: 120, left: 120, bottom: 120, right: 120 };
  pop = { keyword: keyword.trim().slice(0, 200), rect, fromField, seq: ++seq };
  emitPop();
}

export function closeKeywordPop() {
  if (!pop) return;
  pop = null;
  emitPop();
}

export function useKeywordPop(): PopTarget | null {
  return useSyncExternalStore(
    (cb) => {
      popSubs.add(cb);
      return () => popSubs.delete(cb);
    },
    () => pop,
    () => null,
  );
}

// ---------------------------------------------------------------- live chrome.storage values

/** A value in chrome.storage.local under `inpage.<key>`, updated live when another island changes it. */
export function useSharedStored<T>(key: string | null, initial: T): [T, (v: T | ((prev: T) => T)) => void, boolean] {
  const full = key ? `inpage.${key}` : null;
  const [v, setV] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!full) return;
    let live = true;
    void browser.storage.local
      .get(full)
      .then((got) => {
        if (!live) return;
        setV(got[full] !== undefined ? (got[full] as T) : initial);
        setReady(true);
      })
      .catch(() => live && setReady(true));
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || !(full in changes)) return;
      const nv = changes[full]?.newValue;
      setV(nv === undefined ? initial : (nv as T));
    };
    browser.storage.onChanged.addListener(onChange);
    return () => {
      live = false;
      browser.storage.onChanged.removeListener(onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setV((prev) => {
        const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        if (full) void browser.storage.local.set({ [full]: value }).catch(() => {});
        return value;
      });
    },
    [full],
  );
  return [v, set, ready];
}

/** Target (focus) keyword of a video; the same value the assistant card calls "focus keyword". */
export const useTargetKeyword = (videoId: string | null) => useSharedStored<string>(videoId ? `kw.${videoId}` : null, '');

/** Rank results of a video's tags (cached per video, kept until the next check). */
export const useRanks = (videoId: string | null) => useSharedStored<RankMap>(videoId ? `tt.ranks.${videoId}` : null, {});

const SCORE_TTL = 7 * 86_400_000;
const SCORE_MAX = 400;

/** Keyword scores the owner has already paid for (from the popover or "score these"), kept 7 days. */
export function useKnownScores(): [ScoreMap, (entries: { keyword: string; score: number | null }[]) => void] {
  const [scores, setScores] = useSharedStored<ScoreMap>('tt.scores', {});
  const add = useCallback(
    (entries: { keyword: string; score: number | null }[]) =>
      setScores((prev) => {
        const now = Date.now();
        const next: ScoreMap = {};
        for (const [k, v] of Object.entries(prev)) if (now - Date.parse(v.at) < SCORE_TTL) next[k] = v;
        for (const e of entries) next[norm(e.keyword)] = { score: e.score, at: new Date(now).toISOString() };
        const keys = Object.keys(next);
        if (keys.length > SCORE_MAX) for (const k of keys.sort((a, b) => next[a]!.at.localeCompare(next[b]!.at)).slice(0, keys.length - SCORE_MAX)) delete next[k];
        return next;
      }),
    [setScores],
  );
  return [scores, add];
}

/** Current video id on the Studio editor page. */
export function editorVideoId(href: string): string | null {
  return href.match(/studio\.youtube\.com\/video\/([\w-]{11})\/edit/)?.[1] ?? null;
}
