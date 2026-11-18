// The Content page tool groups (TubeBuddy's "Bulk & Misc Tools" grouping), shared by the header mega menu,
// the selection dropdown and the drawer panel. Items TubeX cannot do carry the reason instead of an action.
import type { IconName } from '../../../components/icons';
import type { ContentTab } from '../../../domain/coppa';
import type { MessageKey } from '../../../i18n/en';
import type { WorkspaceRoute } from '../../../platform/navigation';
import { rpc } from '../../../platform/rpc';

export type ToolAction =
  | { kind: 'open'; route: WorkspaceRoute; sub?: string; withSelection?: boolean }
  | { kind: 'related' }
  | { kind: 'off'; reason: MessageKey };

export interface Tool {
  id: string;
  label: MessageKey;
  icon: IconName;
  action: ToolAction;
  badge?: MessageKey;
}

export interface ToolGroup {
  id: 'bulk' | 'cards' | 'endscreens' | 'misc';
  label: MessageKey;
  icon: IconName;
  items: Tool[];
}

const NO_API: ToolAction = { kind: 'off', reason: 'sc.noApi' };

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'bulk',
    label: 'sc.g.bulk',
    icon: 'layers',
    items: [
      { id: 'findReplace', label: 'sc.t.findReplace', icon: 'search', action: { kind: 'open', route: 'bulk', withSelection: true } },
      { id: 'overlays', label: 'sc.t.overlays', icon: 'image', action: { kind: 'open', route: 'thumbs', withSelection: true } },
    ],
  },
  {
    id: 'cards',
    label: 'sc.g.cards',
    icon: 'file',
    items: [
      { id: 'cardsCopy', label: 'sc.t.copy', icon: 'copy', action: NO_API },
      { id: 'cardsUpdate', label: 'sc.t.update', icon: 'edit', action: NO_API },
      { id: 'cardsDelete', label: 'sc.t.delete', icon: 'trash', action: NO_API },
    ],
  },
  {
    id: 'endscreens',
    label: 'sc.g.end',
    icon: 'video',
    items: [
      { id: 'endCopy', label: 'sc.t.copy', icon: 'copy', action: NO_API },
      { id: 'endUpdate', label: 'sc.t.update', icon: 'edit', action: NO_API },
      { id: 'endDelete', label: 'sc.t.delete', icon: 'trash', action: NO_API },
    ],
  },
  {
    id: 'misc',
    label: 'sc.g.misc',
    icon: 'more',
    items: [
      { id: 'related', label: 'sc.t.related', icon: 'link', action: { kind: 'related' }, badge: 'sc.badge.handoff' },
      { id: 'coppa', label: 'sc.t.coppa', icon: 'shield', action: { kind: 'open', route: 'kids', withSelection: true } },
      { id: 'demonetization', label: 'sc.t.demonetization', icon: 'dollar', action: { kind: 'open', route: 'reports', sub: 'demonetization' } },
      { id: 'backup', label: 'sc.t.backup', icon: 'download', action: { kind: 'open', route: 'settings' } },
      { id: 'schedule', label: 'sc.t.schedule', icon: 'calendar', action: { kind: 'open', route: 'schedule' } },
      { id: 'clickmagnet', label: 'sc.t.clickmagnet', icon: 'target', action: { kind: 'open', route: 'reports', sub: 'clickmagnet' } },
    ],
  },
];

/** Opens a workspace tool, passing the selected rows and the Content tab when the tool accepts them. */
export function openTool(a: Extract<ToolAction, { kind: 'open' }>, ctx: { tab: ContentTab | null; ids: string[] }): Promise<unknown> {
  if (a.sub) return rpc('studioContent.open', a.route, { sub: a.sub });
  if (a.withSelection) return rpc('studioContent.open', a.route, { ids: ctx.ids.slice(0, 500), tab: ctx.tab ?? undefined });
  return rpc('studioContent.open', a.route);
}
