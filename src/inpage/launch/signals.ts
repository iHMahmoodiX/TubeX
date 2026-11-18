// Live watch-page signals for Videolytics' best practices. No polling: light MutationObservers scoped to the
// comments section, the player and the engagement panels (childList only, throttled), re-attached after YouTube's
// SPA navigation. State updates only when a signal changes, so the panel does not re-render on every mutation.
import { useEffect, useState } from 'react';
import { readWatchSignals, signalTargets, type WatchSignals } from './dom';

const GAP_MS = 600;
const key = (s: WatchSignals) => `${s.chapters}|${s.pinned}|${s.hearted}|${s.cards}|${s.endScreen}|${s.cc}`;

export function useWatchSignals(videoId: string): WatchSignals {
  const [signals, setSignals] = useState<WatchSignals>(() => readWatchSignals(document, videoId));
  useEffect(() => {
    let last = '';
    let timer: number | undefined;
    let observed: Element[] = [];
    let observer: MutationObserver | null = null;

    const attach = () => {
      const t = signalTargets(document);
      // Until the comments and the player exist, watch the page container (or body) for them to appear.
      const want = [t.comments, t.player, t.panels].filter((e): e is Element => !!e);
      if (!t.comments || !t.player) want.push(t.flexy ?? document.body);
      if (want.length === observed.length && want.every((e, i) => e === observed[i])) return;
      observer?.disconnect();
      observer = new MutationObserver(schedule);
      for (const el of want) observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'is-hearted', 'aria-disabled', 'aria-pressed', 'video-id'] });
      observed = want;
    };
    const run = () => {
      timer = undefined;
      const s = readWatchSignals(document, videoId);
      const k = key(s);
      if (k !== last) {
        last = k;
        setSignals(s);
      }
      attach();
    };
    function schedule() {
      if (timer === undefined) timer = window.setTimeout(run, GAP_MS);
    }
    run();
    window.addEventListener('yt-navigate-finish', schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener('yt-navigate-finish', schedule);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [videoId]);
  return signals;
}
