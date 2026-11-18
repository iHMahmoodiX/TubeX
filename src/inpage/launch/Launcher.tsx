// One overlay island per site: the floating edge tab (switch 'launcherEdge' / 'studioEdge') and the TubeX drawer.
// The drawer can also be opened from the top-bar buttons, so it listens even when the edge tab is switched off.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../components/icons';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { useAsync, useFmt, useStored } from '../common';
import { useHref, useInpageEnabled } from '../InpageRoot';
import { onDrawerRequest, setDrawerOpen, type DrawerView } from './bus';
import { inFullscreen, pageDir } from './dom';
import { clampTabTop, edgeSide, pagePanelFor, type Site } from './logic';

// The drawer's body (panels of every area) is code that only runs after the first open.
const Drawer = lazy(() => import('./Drawer').then((m) => ({ default: m.Drawer })));

export function Launcher({ site }: { site: Site }) {
  const all = useInpageEnabled('all');
  const edgeOn = useInpageEnabled(site === 'youtube' ? 'launcherEdge' : 'studioEdge');
  const { t } = useI18n();
  const href = useHref();
  const [open, setOpenStored, ready] = useStored<boolean>(`launch.open.${site}`, false);
  const [pinned, setPinned] = useStored<boolean>(`launch.pinned.${site}`, false);
  const [view, setView] = useStored<DrawerView>(`launch.view.${site}`, 'page');
  const [everOpened, setEverOpened] = useState(false);
  const [side, setSide] = useState<'left' | 'right'>(() => edgeSide(pageDir(document)));
  const [full, setFull] = useState(() => inFullscreen(document));
  const tabRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const setOpen = useCallback(
    (v: boolean) => {
      if (v) setEverOpened(true);
      setOpenStored(v);
    },
    [setOpenStored],
  );
  useEffect(() => {
    if (ready && open) setEverOpened(true);
  }, [ready, open]);
  useEffect(() => setDrawerOpen(ready && open), [ready, open]);

  // Requests from the top-bar buttons (same content script).
  useEffect(
    () =>
      onDrawerRequest((r) => {
        const active = document.activeElement;
        returnFocus.current = r.returnTo ?? (active instanceof HTMLElement ? active : null);
        if (r.mode === 'toggle' && openRef.current && !r.view) return setOpen(false);
        if (r.view) setView(r.view);
        setOpen(true);
      }),
    [setOpen, setView],
  );

  // Page direction can change on navigation (rare); fullscreen hides the tab. Events only, no polling.
  useEffect(() => {
    setSide(edgeSide(pageDir(document)));
  }, [href]);
  useEffect(() => {
    const onFs = () => setFull(inFullscreen(document));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Unpinned: SPA navigation closes the drawer (its page-aware panel would change under the user).
  const lastHref = useRef(href);
  useEffect(() => {
    if (lastHref.current === href) return;
    lastHref.current = href;
    if (!pinned && openRef.current) setOpen(false);
  }, [href, pinned, setOpen]);

  if (!all) return null;
  const panel = pagePanelFor(site, href);
  const close = () => {
    setOpen(false);
    const back = returnFocus.current;
    returnFocus.current = null;
    requestAnimationFrame(() => (back?.isConnected ? back : tabRef.current)?.focus());
  };

  return (
    <>
      {edgeOn && !full && !(ready && open) && (
        <EdgeTab
          site={site}
          side={side}
          tabRef={tabRef}
          label={t('ln.edge.label')}
          onOpen={() => {
            returnFocus.current = tabRef.current;
            setOpen(true);
          }}
        />
      )}
      {everOpened && ready && (
        <Suspense fallback={null}>
          <Drawer site={site} side={side} open={open} panel={panel} view={view} onView={setView} pinned={pinned} onPin={setPinned} onClose={close} />
        </Suspense>
      )}
    </>
  );
}

/** The docked tab. Drag it up or down to move it; the position is remembered per site. */
function EdgeTab({ site, side, tabRef, label, onOpen }: { site: Site; side: 'left' | 'right'; tabRef: React.RefObject<HTMLButtonElement | null>; label: string; onOpen: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const [top, setTop] = useStored<number>(`launch.edgeTop.${site}`, 160);
  const [dragTop, setDragTop] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startTop: number; moved: boolean } | null>(null);
  // Unread alerts: read once per page load (no timer); the drawer's alerts view has the live list.
  const unread = useAsync('launch.unread', () => rpc<number>('inpage.unreadAlerts').catch(() => 0));
  const count = unread.data ?? 0;
  const y = clampTabTop(dragTop ?? top, window.innerHeight);

  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = { startY: e.clientY, startTop: y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragTop(clampTabTop(d.startTop + dy, window.innerHeight));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && dragTop !== null) setTop(dragTop);
    setDragTop(null);
    if (!d?.moved) onOpen();
  };

  return (
    <button
      ref={tabRef}
      type="button"
      className="tx-ln-edge"
      data-side={side}
      style={{ top: y }}
      aria-label={count ? t('ln.edge.labelUnread', { n: count }) : label}
      title={t('ln.edge.title')}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null;
        setDragTop(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          setTop(clampTabTop(y + (e.key === 'ArrowUp' ? -24 : 24), window.innerHeight));
        }
      }}
    >
      <span className="tx-ln-edge-mark" aria-hidden="true">
        <Icon name="logo" />
      </span>
      {count > 0 && (
        <span className="tx-ln-dot" aria-hidden="true">
          {count > 9 ? '9+' : f.int(count)}
        </span>
      )}
    </button>
  );
}
