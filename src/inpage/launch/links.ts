// Shortcuts shared by the top-bar menus and the drawer's tools list.
import type { IconName } from '../../components/icons';
import type { StudioSection } from '../../domain/inpage';
import type { MessageKey } from '../../i18n/en';
import type { WorkspaceRoute } from '../../platform/navigation';
import type { PagePanel } from './logic';

/** Label and icon of each page-aware drawer panel. */
export const PAGE_META: Record<Exclude<PagePanel, 'none'>, { label: MessageKey; icon: IconName }> = {
  videolytics: { label: 'ln.view.videolytics', icon: 'chart' },
  channelInsights: { label: 'ln.view.channelInsights', icon: 'pulse' },
  studioContent: { label: 'ln.view.studioContent', icon: 'layers' },
  tagTools: { label: 'ln.view.tagTools', icon: 'tag' },
};

export const STUDIO_ICONS: Record<StudioSection, IconName> = { dashboard: 'home', content: 'video', analytics: 'chart', comments: 'message', monetization: 'dollar' };

export const WORKSPACE_LINKS: { route: WorkspaceRoute; label: MessageKey; icon: IconName }[] = [
  { route: 'mychannel', label: 'nav.home', icon: 'home' },
  { route: 'research', label: 'nav.research', icon: 'search' },
  { route: 'ideas', label: 'nav.ideas', icon: 'bulb' },
  { route: 'drafts', label: 'nav.drafts', icon: 'edit' },
  { route: 'competitors', label: 'nav.competitors', icon: 'users' },
  { route: 'alerts', label: 'nav.alerts', icon: 'bell' },
  { route: 'settings', label: 'nav.settings', icon: 'settings' },
];

/** In-page switches per site (labels are 'inpage.feature.<id>'; a switch whose label is missing is not listed). */
export const SITE_FEATURES: Record<'youtube' | 'studio', { id: string; icon: IconName }[]> = {
  youtube: [
    { id: 'launcherEdge', icon: 'logo' },
    { id: 'masthead', icon: 'menu' },
    { id: 'videolytics', icon: 'chart' },
    { id: 'watch', icon: 'video' },
    { id: 'search', icon: 'search' },
    { id: 'channel', icon: 'users' },
    { id: 'channelInsights', icon: 'pulse' },
  ],
  studio: [
    { id: 'studioEdge', icon: 'logo' },
    { id: 'studioMasthead', icon: 'menu' },
    { id: 'studioEditor', icon: 'edit' },
    { id: 'studioUpload', icon: 'upload' },
    { id: 'studioComments', icon: 'message' },
    { id: 'studioContent', icon: 'layers' },
    { id: 'studioTags', icon: 'tag' },
  ],
};
