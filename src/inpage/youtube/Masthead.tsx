// Top-bar TubeX button (#6): a pill with the TubeX mark and a menu icon, next to YouTube's Create/notifications
// (switch 'masthead') and Studio's help/notifications (switch 'studioMasthead'). Its menu opens the TubeX drawer
// (this page's panel, tools, alerts), Studio sections for the active TubeX channel and TubeX workspace sections.
// The unread-alerts badge is read on load and when the menu opens (no timer).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../components/icons';
import { STUDIO_SECTIONS, studioUrl } from '../../domain/inpage';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { rpc } from '../../platform/rpc';
import { useAsync, useFmt, useStatus } from '../common';
import { useHref, useInpageEnabled } from '../InpageRoot';
import { requestDrawer, useDrawerOpen, type DrawerView } from '../launch/bus';
import { PAGE_META, STUDIO_ICONS, WORKSPACE_LINKS } from '../launch/links';
import { pagePanelFor } from '../launch/logic';


export function Masthead({ site = 'youtube' }: { site?: 'youtube' | 'studio' }) {
  const on = useInpageEnabled(site === 'youtube' ? 'masthead' : 'studioMasthead');
  if (!on) return null;
  return <QuickLinks site={site} />;
}

function QuickLinks({ site }: { site: 'youtube' | 'studio' }) {
  const { t } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const href = useHref();
  const drawerOpen = useDrawerOpen();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const unread = useAsync(`unread:${tick}`, () => rpc<number>('inpage.unreadAlerts').catch(() => 0));
  const count = unread.data ?? 0;
  const active = status?.channels.find((c) => c.channelId === status.activeChannelId);
  const panel = pagePanelFor(site, href);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const w = 288;
      const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
      setPos({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => (menu.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus());
    const host = btn.current?.getRootNode() instanceof ShadowRoot ? (btn.current.getRootNode() as ShadowRoot).host : null;
    const away = (e: PointerEvent) => {
      if (host && e.composedPath().includes(host)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const drawer = (view: DrawerView) => {
    close(false);
    // Focus returns to this button when the drawer closes.
    if (!requestDrawer({ mode: 'open', view, returnTo: btn.current })) void rpc('ui.openWorkspace', view === 'alerts' ? 'alerts' : 'mychannel');
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const cur = (menu.current?.getRootNode() as ShadowRoot | Document | undefined)?.activeElement;
    const i = items.indexOf(cur as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[n]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab') close(false);
  };

  return (
    <div className="tx-mast" data-site={site}>
      <button
        ref={btn}
        type="button"
        className="tx-round tx-ln-mastbtn"
        dir="ltr"
        aria-haspopup="menu"
        aria-expanded={open}
        data-drawer={drawerOpen}
        aria-label={count ? t('inpage.mast.labelUnread', { n: count }) : t('inpage.mast.label')}
        title={t('inpage.mast.label')}
        onClick={() => {
          if (!open) setTick((n) => n + 1);
          setOpen(!open);
        }}
      >
        <span className="tx-round-mark" aria-hidden="true">
          <Icon name="logo" />
        </span>
        <Icon name="menu" />
        {count > 0 && (
          <span className="tx-round-count" aria-hidden="true">
            {count > 99 ? '99+' : f.int(count)}
          </span>
        )}
      </button>
      {open && pos && (
        <div ref={menu} className="tx-menu" role="menu" aria-label={t('inpage.mast.label')} style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey}>
          <div className="tx-menu-head">
            <span className="tx-mark">
              <i aria-hidden="true">
                <Icon name="logo" />
              </i>
              TubeX
            </span>
            {active && (
              <span className="xsmall muted truncate" dir="auto">
                {active.title}
              </span>
            )}
          </div>
          <div className="tx-menu-group" role="group" aria-label={t('ln.mast.drawer')}>
            <span className="tx-menu-label">{t('ln.mast.drawer')}</span>
            {panel !== 'none' && (
              <button type="button" role="menuitem" tabIndex={-1} className="tx-menu-item" onClick={() => drawer('page')}>
                <Icon name={PAGE_META[panel].icon} />
                <span className="grow">{t(PAGE_META[panel].label)}</span>
              </button>
            )}
            <button type="button" role="menuitem" tabIndex={-1} className="tx-menu-item" onClick={() => drawer('tools')}>
              <Icon name="layers" />
              <span className="grow">{t('ln.mast.openDrawer')}</span>
            </button>
            <button type="button" role="menuitem" tabIndex={-1} className="tx-menu-item" onClick={() => drawer('alerts')}>
              <Icon name="bell" />
              <span className="grow">{t('ln.view.alerts')}</span>
              {count > 0 && <span className="tx-badge tx-badge-accent">{f.int(count)}</span>}
            </button>
          </div>
          <div className="tx-menu-group" role="group" aria-label={t('inpage.mast.studio')}>
            <span className="tx-menu-label">{t('inpage.mast.studio')}</span>
            {STUDIO_SECTIONS.map((s) => (
              <a key={s} role="menuitem" tabIndex={-1} className="tx-menu-item" href={studioUrl(s, active?.channelId)} target={site === 'studio' ? '_self' : '_blank'} rel="noopener noreferrer" onClick={() => close(false)}>
                <Icon name={STUDIO_ICONS[s]} />
                <span className="grow">{t(`inpage.studio.${s}` as MessageKey)}</span>
                {site !== 'studio' && <Icon name="external" className="icon tx-menu-ext" />}
              </a>
            ))}
            {!active && <span className="tx-menu-note xsmall muted">{t('inpage.mast.studioGeneric')}</span>}
          </div>
          <div className="tx-menu-group" role="group" aria-label={t('inpage.mast.workspace')}>
            <span className="tx-menu-label">{t('inpage.mast.workspace')}</span>
            {WORKSPACE_LINKS.map((x) => (
              <button
                key={x.route}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="tx-menu-item"
                onClick={() => {
                  close(false);
                  void rpc('ui.openWorkspace', x.route);
                }}
              >
                <Icon name={x.icon} />
                <span className="grow">{t(x.label)}</span>
                <Icon name="external" className="icon tx-menu-ext" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
