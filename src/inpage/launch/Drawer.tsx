// The TubeX drawer: a side panel docked to the page's end edge with a rail of views. The first view is
// page-aware (Videolytics on a watch page, Channel Insights on a channel page, the Studio Content tools,
// Studio tag tools); other views are a general tools list, alerts and the in-page switches.
// Not modal: the page stays usable. Escape closes it; focus moves in on open and back out on close.
// Pinned, it stays open across navigation and outside clicks; unpinned, it closes on either.
import { Component, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/icons';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { ChannelInsightsPanel } from '../youtube/insights';
import { StudioContentPanel } from '../studio/content';
import { TagToolsPanel } from '../studio/tags';
import { VideolyticsPanel } from '../youtube/Videolytics';
import { useAsync, useFmt, useStored } from '../common';
import type { DrawerView } from './bus';
import { clampWidth, DRAWER_DEFAULT, type PagePanel, type Site } from './logic';
import { PAGE_META } from './links';
import { AlertsView, SettingsView, ToolsView } from './ToolsPanel';


export function Drawer({ site, side, open, panel, view, onView, pinned, onPin, onClose }: { site: Site; side: 'left' | 'right'; open: boolean; panel: PagePanel; view: DrawerView; onView: (v: DrawerView) => void; pinned: boolean; onPin: (v: boolean) => void; onClose: () => void }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const [width, setWidth] = useStored<number>('launch.width', DRAWER_DEFAULT);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [alertsTick, setAlertsTick] = useState(0);
  const unread = useAsync(open ? `launch.unread.${alertsTick}` : null, () => rpc<number>('inpage.unreadAlerts').catch(() => 0));

  const views: { id: DrawerView; label: string; icon: IconName; count?: number }[] = [
    ...(panel !== 'none' ? [{ id: 'page' as const, label: t(PAGE_META[panel].label), icon: PAGE_META[panel].icon }] : []),
    { id: 'tools', label: t('ln.view.tools'), icon: 'menu' },
    { id: 'alerts', label: t('ln.view.alerts'), icon: 'bell', count: unread.data || undefined },
    { id: 'settings', label: t('ln.view.settings'), icon: 'settings' },
  ];
  const active: DrawerView = view === 'page' && panel === 'none' ? 'tools' : view;
  const title = views.find((v) => v.id === active)?.label ?? 'TubeX';

  // Focus the heading when the drawer opens (screen readers hear which view it is).
  useEffect(() => {
    if (open) requestAnimationFrame(() => heading.current?.focus());
  }, [open]);

  // Unpinned: a click outside (on the page or another island) closes it.
  useEffect(() => {
    if (!open || pinned) return;
    const host = (root.current?.getRootNode() as ShadowRoot | undefined)?.host;
    const away = (e: PointerEvent) => {
      if (host && e.composedPath().includes(host)) return;
      // The top-bar buttons toggle the drawer themselves.
      if (e.composedPath().some((n) => n instanceof Element && /^TUBEX-(MASTHEAD|STUDIO-MASTHEAD)$/.test(n.tagName))) return;
      onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, pinned, onClose]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
    }
  };

  // Resizing from the drawer's inner edge.
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = clampWidth(width, window.innerWidth);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let w = startW;
    const move = (ev: PointerEvent) => {
      w = clampWidth(startW + (side === 'right' ? startX - ev.clientX : ev.clientX - startX), window.innerWidth);
      setLiveWidth(w);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setWidth(w);
      setLiveWidth(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const w = liveWidth ?? clampWidth(width, window.innerWidth);
  const uiDir = lang === 'fa' ? 'rtl' : 'ltr';

  return (
    <div
      ref={root}
      className="tx-ln-drawer"
      data-side={side}
      data-pinned={pinned}
      hidden={!open}
      dir="ltr"
      style={{ width: w }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tx-ln-title"
      onKeyDown={onKey}
    >
      <div
        className="tx-ln-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('ln.drawer.resize')}
        aria-valuenow={w}
        aria-valuemin={320}
        aria-valuemax={720}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const grow = (e.key === 'ArrowLeft') === (side === 'right');
          setWidth(clampWidth(w + (grow ? 24 : -24), window.innerWidth));
        }}
      />
      <section className="tx-ln-main" dir={uiDir}>
        <header className="tx-ln-head">
          <span className="tx-ln-head-mark" aria-hidden="true">
            <Icon name="logo" />
          </span>
          <h2 id="tx-ln-title" ref={heading} tabIndex={-1} className="tx-ln-title">
            {title}
          </h2>
          <button type="button" className="tx-ln-iconbtn" aria-pressed={pinned} aria-label={pinned ? t('ln.drawer.unpin') : t('ln.drawer.pin')} title={pinned ? t('ln.drawer.unpinHint') : t('ln.drawer.pinHint')} onClick={() => onPin(!pinned)}>
            <PinIcon pinned={pinned} side={side} />
          </button>
          <button type="button" className="tx-ln-iconbtn" aria-label={t('ln.drawer.close')} title={t('ln.drawer.close')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        <div className="tx-ln-body" id="tx-ln-body" role="tabpanel" aria-labelledby={`tx-ln-tab-${active}`}>
          {open && active === 'page' && <PagePanelView panel={panel} />}
          {open && active === 'tools' && <ToolsView site={site} panel={panel} onView={onView} />}
          {open && active === 'alerts' && <AlertsView onChanged={() => setAlertsTick((n) => n + 1)} />}
          {open && active === 'settings' && <SettingsView site={site} />}
        </div>
      </section>
      <nav className="tx-ln-rail" role="tablist" aria-orientation="vertical" aria-label={t('ln.drawer.views')} onKeyDown={(e) => railKeys(e, views, active, onView)}>
        {views.map((v) => (
          <button
            key={v.id}
            id={`tx-ln-tab-${v.id}`}
            type="button"
            role="tab"
            aria-selected={v.id === active}
            aria-controls="tx-ln-body"
            tabIndex={v.id === active ? 0 : -1}
            className="tx-ln-railbtn"
            title={v.label}
            aria-label={v.count ? `${v.label} (${f.int(v.count)})` : v.label}
            onClick={() => onView(v.id)}
          >
            <Icon name={v.icon} />
            {v.count ? <span className="tx-ln-dot" aria-hidden="true">{v.count > 9 ? '9+' : f.int(v.count)}</span> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}

function railKeys(e: KeyboardEvent<HTMLElement>, views: { id: DrawerView }[], active: DrawerView, onView: (v: DrawerView) => void) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const i = Math.max(0, views.findIndex((v) => v.id === active));
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? views.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + views.length) % views.length;
  const next = views[n];
  if (!next) return;
  onView(next.id);
  const list = e.currentTarget;
  requestAnimationFrame(() => (list.querySelectorAll('[role="tab"]')[n] as HTMLElement | undefined)?.focus());
}

/** The page-aware panel from each area; when it renders nothing (not its page, or not built yet) the tools list shows. */
function PagePanelView({ panel }: { panel: PagePanel }) {
  const node =
    panel === 'videolytics' ? <VideolyticsPanel variant="drawer" /> : panel === 'channelInsights' ? <ChannelInsightsPanel /> : panel === 'studioContent' ? <StudioContentPanel /> : panel === 'tagTools' ? <TagToolsPanel /> : null;
  return <PanelSlot fallback={<PanelFallback />}>{node}</PanelSlot>;
}

function PanelFallback() {
  const { t } = useI18n();
  return (
    <div className="tx-empty">
      <Icon name="info" />
      <p className="small">{t('ln.drawer.panelEmpty')}</p>
    </div>
  );
}

/** Renders `children`; shows `fallback` while they render nothing or after they throw. */
function PanelSlot({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setEmpty(el.childNodes.length === 0);
    check();
    // Scoped to our own slot element (not the page), so this observer is cheap.
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true });
    return () => mo.disconnect();
  }, []);
  return (
    <>
      <div ref={ref} className="tx-ln-slot" hidden={empty}>
        <Boundary fallback={fallback}>{children}</Boundary>
      </div>
      {empty && fallback}
    </>
  );
}

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Split-panel icon (pin = keep the drawer docked open), drawn here because the shared icon set has none. */
function PinIcon({ pinned, side }: { pinned: boolean; side: 'left' | 'right' }) {
  const x = side === 'right' ? 14 : 4;
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={side === 'right' ? 'M15 4v16' : 'M9 4v16'} />
      {pinned && <rect x={x + 1} y="5" width="5" height="14" fill="currentColor" stroke="none" />}
    </svg>
  );
}
