import { useEffect, useRef, useState } from 'react';
import { BulkView } from '../../src/features/bulk/BulkView';
import { MyChannelView } from '../../src/features/mychannel/MyChannelView';
import { CommentsView } from '../../src/features/comments/CommentsView';
import { CompetitorsView } from '../../src/features/competitors/CompetitorsView';
import { DraftsView } from '../../src/features/drafts/DraftsView';
import { IdeasView } from '../../src/features/ideas/IdeasView';
import { ResearchView } from '../../src/features/research/ResearchView';
import { ProfileSelect, ProfilesView } from '../../src/features/profiles/ProfilesView';
import { SettingsView } from '../../src/features/settings/SettingsView';
import { TemplatesView } from '../../src/features/templates/TemplatesView';
import { useI18n } from '../../src/i18n';
import type { MessageKey } from '../../src/i18n/en';
import type { WorkspaceRoute } from '../../src/platform/navigation';

const ROUTES: { route: WorkspaceRoute; label: MessageKey }[] = [
  { route: 'mychannel', label: 'nav.mychannel' },
  { route: 'ideas', label: 'nav.ideas' },
  { route: 'drafts', label: 'nav.drafts' },
  { route: 'research', label: 'nav.research' },
  { route: 'competitors', label: 'nav.competitors' },
  { route: 'bulk', label: 'nav.bulk' },
  { route: 'comments', label: 'nav.comments' },
  { route: 'templates', label: 'nav.templates' },
  { route: 'channels', label: 'nav.channels' },
  { route: 'settings', label: 'nav.settings' },
];

function parseHash(): { route: WorkspaceRoute; id?: string } {
  const [route, id] = location.hash.replace(/^#/, '').split('/');
  const known = ROUTES.find((r) => r.route === route)?.route ?? 'ideas';
  return { route: known, id: id ? decodeURIComponent(id) : undefined };
}

export function App() {
  const { t } = useI18n();
  const [loc, setLoc] = useState(parseHash);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Move focus to the new section's heading so keyboard and screen-reader users land in the content.
    const on = () => {
      setLoc(parseHash());
      requestAnimationFrame(() => {
        const h1 = mainRef.current?.querySelector('h1');
        if (h1) {
          h1.tabIndex = -1;
          h1.focus();
        }
      });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (route: WorkspaceRoute, id?: string) => {
    location.hash = id ? `${route}/${encodeURIComponent(id)}` : route;
  };

  return (
    <div className="ws">
      <nav className="ws-nav" aria-label={t('nav.label')}>
        <span className="brand">
          Tube<span>X</span>
        </span>
        <ul className="ws-nav-list">
          {ROUTES.map((r) => (
            <li key={r.route}>
              <a href={`#${r.route}`} aria-current={loc.route === r.route ? 'page' : undefined}>
                {t(r.label)}
              </a>
            </li>
          ))}
        </ul>
        <div style={{ marginBlockStart: 'auto' }}>
          <ProfileSelect />
        </div>
      </nav>
      <main className="ws-main" ref={mainRef}>
        {loc.route === 'ideas' && <IdeasView onOpenDraft={(id) => go('drafts', id)} />}
        {loc.route === 'drafts' && <DraftsView draftId={loc.id} onSelect={(id) => go('drafts', id)} />}
        {loc.route === 'research' && <ResearchView query={loc.id} />}
        {loc.route === 'competitors' && <CompetitorsView />}
        {loc.route === 'mychannel' && <MyChannelView />}
        {loc.route === 'bulk' && <BulkView />}
        {loc.route === 'comments' && <CommentsView />}
        {loc.route === 'templates' && <TemplatesView />}
        {loc.route === 'channels' && <ProfilesView />}
        {loc.route === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
