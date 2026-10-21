// The Content page islands: the "Bulk & tools" button at the end of the tabs row (two-column mega menu), the
// TubeX dropdown in Studio's selection toolbar, and the runner both use to open tools and flows.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Icon, type IconName } from '../../../components/icons';
import { contentTab, VIDEO_TABS, type ContentTab } from '../../../domain/coppa';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/en';
import { InError, useFmt } from '../../common';
import { useHref, useInpageEnabled } from '../../InpageRoot';
import { readSelectedRows, selectionBar, selectionCount, type RowRef } from './dom';
import { KidsFlow, RelatedSetup } from './flows';
import { openTool, TOOL_GROUPS, type Tool, type ToolAction, type ToolGroup } from './tools';

export const FEATURE = 'studioContent';

type Flow = { kind: 'related'; rows: RowRef[]; mode: 'add' | 'clear' } | { kind: 'kids'; rows: RowRef[]; value: boolean | null };

// Flows opened from the selection toolbar are shown by the header island when it is mounted: Studio removes the
// selection bar (and our island in it) as soon as rows are deselected, which would close an open flow.
const flowHosts: ((f: Flow) => void)[] = [];
function useFlowHost(set: (f: Flow) => void) {
  useEffect(() => {
    flowHosts.push(set);
    return () => {
      const i = flowHosts.indexOf(set);
      if (i >= 0) flowHosts.splice(i, 1);
    };
  }, [set]);
}
function sendFlow(f: Flow): boolean {
  const host = flowHosts[0];
  if (!host) return false;
  host(f);
  return true;
}

/** Opens tools for the current tab and selection; renders the open flow (related queue setup, made for kids). */
export function useToolRunner() {
  const href = useHref();
  const tab = contentTab(href);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [error, setError] = useState<unknown>();
  const run = (a: ToolAction, rows: RowRef[] = readSelectedRows(document)) => {
    setError(undefined);
    if (a.kind === 'off') return;
    if (a.kind === 'related') return setFlow({ kind: 'related', rows: tab === 'shorts' ? rows : [], mode: 'add' });
    openTool(a, { tab, ids: rows.map((r) => r.id) }).catch(setError);
  };
  const close = () => setFlow(null);
  const sheet =
    flow?.kind === 'related' ? (
      <RelatedSetup shorts={flow.rows} tabIsShorts={tab === 'shorts'} initialMode={flow.mode} onClose={close} />
    ) : flow?.kind === 'kids' ? (
      <KidsFlow rows={flow.rows} initialValue={flow.value} onClose={close} />
    ) : null;
  return { tab, run, setFlow, sheet, error };
}

// ---------------------------------------------------------------- popover menu plumbing

function usePopover(btn: RefObject<HTMLButtonElement | null>, width: number) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 16);
      // Align with the page's own direction (Studio is usually LTR even when TubeX speaks Persian).
      const host = (btn.current!.getRootNode() as ShadowRoot).host as Element | undefined;
      const rtl = getComputedStyle(host?.parentElement ?? document.documentElement).direction === 'rtl';
      const want = rtl ? r.left : r.right - w;
      setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, want), window.innerWidth - w - 8) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, width, btn]);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => (menu.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])') as HTMLElement | null)?.focus());
    const host = btn.current?.getRootNode() instanceof ShadowRoot ? (btn.current.getRootNode() as ShadowRoot).host : null;
    const away = (e: PointerEvent) => {
      if (host && e.composedPath().includes(host)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, btn]);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const cur = (menu.current?.getRootNode() as ShadowRoot | Document | undefined)?.activeElement;
    const i = items.indexOf(cur as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab') close(false);
  };
  return { open, setOpen, pos, menu, close, onKey };
}

function MenuItem({ icon, label, reason, badge, onPick }: { icon: IconName; label: string; reason?: string; badge?: string; onPick?: () => void }) {
  const off = !onPick;
  return (
    <button type="button" role="menuitem" tabIndex={-1} className="tx-menu-item sc-item" aria-disabled={off || undefined} title={reason} onClick={() => onPick?.()}>
      <Icon name={icon} />
      <span className="stack-s grow" style={{ gap: 0, minWidth: 0 }}>
        <span className="sc-item-label">
          {label}
          {badge && <span className="tx-badge sc-badge">{badge}</span>}
        </span>
        {reason && <span className="xsmall muted sc-item-reason">{reason}</span>}
      </span>
    </button>
  );
}

function GroupBlock({ g, onRun, tab }: { g: ToolGroup; onRun: (t: Tool) => void; tab: ContentTab | null }) {
  const { t } = useI18n();
  return (
    <div className="sc-group" role="group" aria-label={t(g.label)}>
      <span className="sc-group-label">
        <Icon name={g.icon} />
        {t(g.label)}
      </span>
      {g.items.map((it) => {
        const reason = it.action.kind === 'off' ? t(it.action.reason) : it.action.kind === 'related' && tab !== 'shorts' ? t('sc.rel.shortsOnly') : undefined;
        return <MenuItem key={it.id} icon={it.icon} label={t(it.label)} badge={it.badge ? t(it.badge) : undefined} reason={reason} onPick={it.action.kind === 'off' ? undefined : () => onRun(it)} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------- header button

export function ContentTools() {
  const on = useInpageEnabled(FEATURE);
  if (!on) return null;
  return <ToolsButton />;
}

function ToolsButton() {
  const { t } = useI18n();
  const f = useFmt();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = usePopover(btn, 560);
  const runner = useToolRunner();
  useFlowHost(runner.setFlow);
  const [rows, setRows] = useState<RowRef[]>([]);
  const pick = (tool: Tool) => {
    pop.close(false);
    runner.run(tool.action, rows);
  };
  const cols: ToolGroup[][] = [TOOL_GROUPS.filter((g) => g.id !== 'misc'), TOOL_GROUPS.filter((g) => g.id === 'misc')];
  return (
    <div className="sc-tools" data-tubex="">
      <button
        ref={btn}
        type="button"
        className="sc-tools-btn"
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={() => {
          if (!pop.open) setRows(readSelectedRows(document));
          pop.setOpen(!pop.open);
        }}
      >
        <span className="tx-round-mark" aria-hidden="true">
          <Icon name="logo" />
        </span>
        <span>{t('sc.tools.button')}</span>
        <Icon name="down" className="icon sc-chev" />
      </button>
      {pop.open && pop.pos && (
        <div ref={pop.menu} className="tx-menu sc-mega" role="menu" aria-label={t('sc.tools.button')} style={{ top: pop.pos.top, left: pop.pos.left }} onKeyDown={pop.onKey}>
          <div className="sc-mega-head">
            <span className="tx-mark">
              <i aria-hidden="true">
                <Icon name="logo" />
              </i>
              TubeX
            </span>
            <span className="xsmall muted">
              {rows.length ? t('sc.tools.scoped', { n: f.int(rows.length), tab: runner.tab ? t(`sc.tab.${runner.tab}` as MessageKey) : '—' }) : t('sc.tools.unscoped')}
            </span>
          </div>
          <div className="sc-mega-cols">
            {cols.map((col, i) => (
              <div key={i} className="sc-mega-col">
                {col.map((g) => (
                  <GroupBlock key={g.id} g={g} tab={runner.tab} onRun={pick} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {runner.error !== undefined && (
        <div className="sc-float-err">
          <InError error={runner.error} />
        </div>
      )}
      {runner.sheet}
    </div>
  );
}

// ---------------------------------------------------------------- selection toolbar dropdown

export function SelectionActions() {
  const on = useInpageEnabled(FEATURE);
  const href = useHref();
  const tab = contentTab(href);
  if (!on || !tab || !VIDEO_TABS.includes(tab)) return null;
  return <SelectionButton />;
}

function SelectionButton() {
  const { t } = useI18n();
  const f = useFmt();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = usePopover(btn, 340);
  const runner = useToolRunner();
  const [rows, setRows] = useState<RowRef[]>([]);
  const [studioCount, setStudioCount] = useState<number | undefined>();
  const shorts = runner.tab === 'shorts';
  const openFlow = (fl: Flow) => {
    if (!sendFlow(fl)) runner.setFlow(fl);
  };
  const go = (fn: () => void) => () => {
    pop.close(false);
    fn();
  };
  const notShorts = shorts ? undefined : t('sc.rel.shortsOnly');
  const none = rows.length ? undefined : t('sc.sel.none');
  const item = (icon: IconName, label: MessageKey, fn: () => void, reason?: string, params?: Record<string, string>): ReactNode => (
    <MenuItem icon={icon} label={t(label, params)} reason={reason} onPick={reason ? undefined : go(fn)} />
  );
  return (
    <div className="sc-sel" data-tubex="">
      <button
        ref={btn}
        type="button"
        className="sc-sel-btn"
        aria-haspopup="menu"
        aria-expanded={pop.open}
        onClick={() => {
          if (!pop.open) {
            setRows(readSelectedRows(document));
            const bar = selectionBar(document);
            setStudioCount(bar ? selectionCount(bar) : undefined);
          }
          pop.setOpen(!pop.open);
        }}
      >
        <span className="tx-round-mark" aria-hidden="true">
          <Icon name="logo" />
        </span>
        <span>{t('sc.sel.button')}</span>
        <Icon name="down" className="icon sc-chev" />
      </button>
      {pop.open && pop.pos && (
        <div ref={pop.menu} className="tx-menu sc-selmenu" role="menu" aria-label={t('sc.sel.button')} style={{ top: pop.pos.top, left: pop.pos.left }} onKeyDown={pop.onKey}>
          <div className="tx-menu-head">
            <span className="small bold">{t('sc.sel.count', { n: f.int(rows.length) })}</span>
            {studioCount !== undefined && studioCount > rows.length && <span className="xsmall tx-warn">{t('sc.sel.partial', { n: f.int(studioCount), seen: f.int(rows.length) })}</span>}
          </div>
          <div className="tx-menu-group" role="group" aria-label={t('sc.sel.related')}>
            <span className="tx-menu-label">{t('sc.sel.related')}</span>
            {item('link', 'sc.rel.addSel', () => openFlow({ kind: 'related', rows, mode: 'add' }), notShorts ?? none)}
            {item('x', 'sc.rel.clearSel', () => openFlow({ kind: 'related', rows, mode: 'clear' }), notShorts ?? none)}
          </div>
          <div className="tx-menu-group" role="group" aria-label={t('sc.sel.kids')}>
            <span className="tx-menu-label">{t('sc.sel.kids')}</span>
            {item('shield', 'sc.kids.setYesSel', () => openFlow({ kind: 'kids', rows, value: true }), none)}
            {item('shield', 'sc.kids.setNoSel', () => openFlow({ kind: 'kids', rows, value: false }), none)}
          </div>
          <div className="tx-menu-group" role="group" aria-label={t('sc.sel.open')}>
            <span className="tx-menu-label">{t('sc.sel.open')}</span>
            {item('layers', 'sc.sel.bulk', () => runner.run({ kind: 'open', route: 'bulk', withSelection: true }, rows), none)}
            {item('image', 'sc.sel.thumbs', () => runner.run({ kind: 'open', route: 'thumbs', withSelection: true }, rows), none)}
            {item('calendar', 'sc.sel.schedule', () => runner.run({ kind: 'open', route: 'schedule' }, rows))}
          </div>
        </div>
      )}
      {runner.error !== undefined && (
        <div className="sc-float-err">
          <InError error={runner.error} />
        </div>
      )}
      {runner.sheet}
    </div>
  );
}
