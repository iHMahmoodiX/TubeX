// Masthead Quick Links: a round TubeX button next to YouTube's create/notifications buttons. Its menu opens
// Studio sections for the active TubeX channel and TubeX workspace sections; shows unread alerts.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../../components/icons';
import { STUDIO_SECTIONS, studioUrl, type StudioSection } from '../../domain/inpage';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import type { WorkspaceRoute } from '../../platform/navigation';
import { rpc } from '../../platform/rpc';
import { useAsync, useFmt, useStatus } from '../common';
import { useInpageEnabled } from '../InpageRoot';

const STUDIO_ICONS: Record<StudioSection, IconName> = { dashboard: 'home', content: 'video', analytics: 'chart', comments: 'message', monetization: 'dollar' };
const TUBEX: { route: WorkspaceRoute; label: MessageKey; icon: IconName }[] = [
  { route: 'mychannel', label: 'nav.home', icon: 'home' },
  { route: 'research', label: 'nav.research', icon: 'search' },
  { route: 'ideas', label: 'nav.ideas', icon: 'bulb' },
  { route: 'drafts', label: 'nav.drafts', icon: 'edit' },
  { route: 'competitors', label: 'nav.competitors', icon: 'users' },
  { route: 'alerts', label: 'nav.alerts', icon: 'bell' },
  { route: 'settings', label: 'nav.settings', icon: 'settings' },
];

export function Masthead() {
  const on = useInpageEnabled('masthead');
  if (!on) return null;
  return <QuickLinks />;
}

function QuickLinks() {
  const { t } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Unread count: refreshed when the menu opens and every 5 minutes; silently absent if unavailable.
  const unread = useAsync(`unread:${tick}`, () => rpc<number>('inpage.unreadAlerts').catch(() => 0));
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  const count = unread.data ?? 0;
  const active = status?.channels.find((c) => c.channelId === status.activeChannelId);

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
    <div className="tx-mast">
      <button
        ref={btn}
        type="button"
        className="tx-round"
        aria-haspopup="menu"
        aria-expanded={open}
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
          <div className="tx-menu-group" role="group" aria-label={t('inpage.mast.studio')}>
            <span className="tx-menu-label">{t('inpage.mast.studio')}</span>
            {STUDIO_SECTIONS.map((s) => (
              <a key={s} role="menuitem" tabIndex={-1} className="tx-menu-item" href={studioUrl(s, active?.channelId)} target="_blank" rel="noopener noreferrer" onClick={() => close(false)}>
                <Icon name={STUDIO_ICONS[s]} />
                <span className="grow">{t(`inpage.studio.${s}` as MessageKey)}</span>
                <Icon name="external" className="icon tx-menu-ext" />
              </a>
            ))}
            {!active && <span className="tx-menu-note xsmall muted">{t('inpage.mast.studioGeneric')}</span>}
          </div>
          <div className="tx-menu-group" role="group" aria-label={t('inpage.mast.workspace')}>
            <span className="tx-menu-label">{t('inpage.mast.workspace')}</span>
            {TUBEX.map((x) => (
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
                {x.route === 'alerts' && count > 0 && <span className="tx-badge tx-badge-accent">{f.int(count)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
