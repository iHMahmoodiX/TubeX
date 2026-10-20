import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useArtColor } from '../../src/components/artColor';
import { usePrefs } from '../../src/components/AppShell';
import { useCollection } from '../../src/components/hooks';
import { Icon, type IconName } from '../../src/components/icons';
import { Avatar, IconButton } from '../../src/components/ui';
import { useWork } from '../../src/components/useWork';
import { AlertsView } from '../../src/features/alerts/AlertsView';
import { BulkView } from '../../src/features/bulk/BulkView';
import { CommentsView } from '../../src/features/comments/CommentsView';
import { CompetitorsView } from '../../src/features/competitors/CompetitorsView';
import { useGoogle } from '../../src/features/connections/useConnections';
import { DraftsView } from '../../src/features/drafts/DraftsView';
import { IdeasView } from '../../src/features/ideas/IdeasView';
import { MyChannelView } from '../../src/features/mychannel/MyChannelView';
import { PlaylistsView } from '../../src/features/playlists/PlaylistsView';
import { ProfilesView } from '../../src/features/profiles/ProfilesView';
import { RanksView } from '../../src/features/ranks/RanksView';
import { ReportsView } from '../../src/features/reports/ReportsView';
import { ResearchView } from '../../src/features/research/ResearchView';
import { ScheduleView } from '../../src/features/schedule/ScheduleView';
import { SettingsView } from '../../src/features/settings/SettingsView';
import { ShortsView } from '../../src/features/shorts/ShortsView';
import { TemplatesView } from '../../src/features/templates/TemplatesView';
import { ThumbsView } from '../../src/features/thumbs/ThumbsView';
import { setActiveChannel } from '../../src/integrations/google/auth';
import { useI18n } from '../../src/i18n';
import type { MessageKey } from '../../src/i18n/en';
import type { WorkspaceRoute } from '../../src/platform/navigation';

interface NavItem {
  route: WorkspaceRoute;
  label: MessageKey;
  icon: IconName;
}
const NAV: { group?: MessageKey; items: NavItem[] }[] = [
  { items: [{ route: 'mychannel', label: 'nav.home', icon: 'home' }] },
  {
    group: 'shell.group.create',
    items: [
      { route: 'ideas', label: 'nav.ideas', icon: 'bulb' },
      { route: 'drafts', label: 'nav.drafts', icon: 'edit' },
      { route: 'templates', label: 'nav.templates', icon: 'file' },
      { route: 'shorts', label: 'nav.shorts', icon: 'scissors' },
    ],
  },
  {
    group: 'shell.group.grow',
    items: [
      { route: 'research', label: 'nav.research', icon: 'search' },
      { route: 'ranks', label: 'nav.ranks', icon: 'trophy' },
      { route: 'competitors', label: 'nav.competitors', icon: 'users' },
    ],
  },
  { group: 'shell.group.analyze', items: [{ route: 'reports', label: 'nav.reports', icon: 'chart' }] },
  {
    group: 'shell.group.manage',
    items: [
      { route: 'bulk', label: 'nav.bulk', icon: 'layers' },
      { route: 'playlists', label: 'nav.playlists', icon: 'playlist' },
      { route: 'schedule', label: 'nav.schedule', icon: 'calendar' },
      { route: 'thumbs', label: 'nav.thumbs', icon: 'image' },
    ],
  },
  {
    group: 'shell.group.engage',
    items: [
      { route: 'comments', label: 'nav.comments', icon: 'message' },
      { route: 'alerts', label: 'nav.alerts', icon: 'bell' },
    ],
  },
  {
    items: [
      { route: 'channels', label: 'nav.channels', icon: 'users' },
      { route: 'settings', label: 'nav.settings', icon: 'settings' },
    ],
  },
];
const ROUTES = NAV.flatMap((g) => g.items.map((i) => i.route));

function parseHash(): { route: WorkspaceRoute; id?: string } {
  const [route, ...rest] = location.hash.replace(/^#/, '').split('/');
  const known = ROUTES.find((r) => r === route) ?? 'mychannel';
  const id = rest.join('/');
  return { route: known, id: id ? decodeURIComponent(id) : undefined };
}

export function App() {
  const { t, lang } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const [loc, setLoc] = useState(parseHash);
  const [query, setQuery] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const google = useGoogle();
  const watch = useCollection('watchlist').items;
  const alerts = useWork('alerts').items;
  const unread = alerts.filter((a) => !a.read).length;
  const active = google.channels.find((c) => c.channelId === google.activeChannelId);
  const hero = useArtColor(active?.thumbnail, active?.channelId ?? loc.route);

  useEffect(() => {
    // Move focus to the new section's heading so keyboard and screen-reader users land in the content.
    const on = () => {
      setLoc(parseHash());
      mainRef.current?.scrollTo({ top: 0 });
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

  let view: ReactNode;
  switch (loc.route) {
    case 'ideas': view = <IdeasView onOpenDraft={(id) => go('drafts', id)} />; break;
    case 'drafts': view = <DraftsView draftId={loc.id} onSelect={(id) => go('drafts', id)} />; break;
    case 'templates': view = <TemplatesView />; break;
    case 'shorts': view = <ShortsView tab={loc.id} />; break;
    case 'research': view = <ResearchView query={loc.id} />; break;
    case 'ranks': view = <RanksView tab={loc.id} />; break;
    case 'competitors': view = <CompetitorsView />; break;
    case 'reports': view = <ReportsView tab={loc.id} />; break;
    case 'bulk': view = <BulkView />; break;
    case 'playlists': view = <PlaylistsView tab={loc.id} />; break;
    case 'schedule': view = <ScheduleView tab={loc.id} />; break;
    case 'thumbs': view = <ThumbsView tab={loc.id} />; break;
    case 'comments': view = <CommentsView tab={loc.id} />; break;
    case 'alerts': view = <AlertsView tab={loc.id} />; break;
    case 'channels': view = <ProfilesView />; break;
    case 'settings': view = <SettingsView />; break;
    default: view = <MyChannelView />;
  }

  return (
    <div className="ws">
      <nav className="ws-nav" aria-label={t('nav.label')}>
        <span className="brand">
          <span className="brand-mark">
            <Icon name="logo" />
          </span>
          TubeX
        </span>
        {NAV.map((g, gi) => (
          <div key={gi} className="stack-s" style={{ gap: 0 }}>
            {g.group && <div className="ws-nav-group">{t(g.group)}</div>}
            <ul className="ws-nav-list">
              {g.items.map((r) => (
                <li key={r.route}>
                  <a href={`#${r.route}`} aria-current={loc.route === r.route ? 'page' : undefined}>
                    <Icon name={r.icon} />
                    <span>{t(r.label)}</span>
                    {r.route === 'alerts' && unread > 0 && (
                      <span className="badge badge-accent" style={{ marginInlineStart: 'auto' }} aria-label={t('shell.alertsUnread', { n: unread })}>
                        {unread}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="ws-nav-group">{t('shell.library')}</div>
        <div className="lib">
          {google.channels.length === 0 && google.loaded && <p className="small muted" style={{ paddingInline: 8 }}>{t('shell.libraryEmpty')}</p>}
          {google.channels.map((c) => (
            <button
              key={c.channelId}
              aria-pressed={c.channelId === google.activeChannelId}
              onClick={() => {
                void setActiveChannel(c.channelId);
                go('mychannel');
              }}
            >
              <Avatar src={c.thumbnail} name={c.title} />
              <span className="stack-s grow" style={{ gap: 0 }}>
                <span className="truncate bold" dir="auto" style={{ color: c.channelId === google.activeChannelId ? 'var(--accent-text)' : undefined }}>
                  {c.title}
                </span>
                <span className="xsmall muted truncate ltr">{c.handle}</span>
              </span>
            </button>
          ))}
          {watch.slice(0, 8).map((w) => (
            <button key={w.id} onClick={() => go('competitors')}>
              <Avatar name={w.title} />
              <span className="stack-s grow" style={{ gap: 0 }}>
                <span className="truncate" dir="auto">
                  {w.title}
                </span>
                <span className="xsmall muted">{t('shell.competitorsLib')}</span>
              </span>
            </button>
          ))}
        </div>
      </nav>
      <main className="ws-main" ref={mainRef} style={{ ['--hero' as string]: hero }}>
        <div className="ws-hero-tint" aria-hidden="true" />
        <div className="ws-main-inner">
          <div className="ws-top">
            <IconButton icon="chevron" label={t('shell.back')} data-hist="1" onClick={() => history.back()} style={{ transform: 'scaleX(-1)' }} className="btn-dark" />
            <IconButton icon="chevron" label={t('shell.forward')} data-hist="1" onClick={() => history.forward()} className="btn-dark" />
            <form
              className="grow ws-top-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) go('research', query.trim());
              }}
            >
              <div className="search-wrap">
                <Icon name="search" />
                <input className="input" type="search" aria-label={t('shell.searchLabel')} placeholder={t('shell.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            </form>
            <span className="grow" />
            <button type="button" className="chip ws-top-lang" onClick={() => void setPrefs({ uiLanguage: lang === 'fa' ? 'en' : 'fa' })}>
              {t('shell.lang')}
            </button>
            <IconButton
              icon={prefs.theme === 'light' ? 'moon' : 'sun'}
              label={t('shell.theme')}
              onClick={() => void setPrefs({ theme: prefs.theme === 'light' ? 'dark' : 'light' })}
            />
            <a href="#alerts" className="icon-btn" aria-label={unread ? t('shell.alertsUnread', { n: unread }) : t('shell.alerts')} title={t('shell.alerts')} style={{ position: 'relative' }}>
              <Icon name="bell" />
              {unread > 0 && <span className="dot dot-on" style={{ position: 'absolute', insetBlockStart: 6, insetInlineEnd: 6 }} />}
            </a>
            {active ? (
              <a href="#mychannel" title={active.title} aria-label={active.title}>
                <Avatar src={active.thumbnail} name={active.title} />
              </a>
            ) : (
              <a className="btn btn-s" href="#settings">
                {t('shell.signIn')}
              </a>
            )}
          </div>
          {view}
        </div>
      </main>
    </div>
  );
}
