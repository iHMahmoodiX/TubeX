import { useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { isCapturable } from '../../src/domain/pageContext';
import { usePrefs } from '../../src/components/AppShell';
import { useActivePage } from '../../src/components/hooks';
import { Icon, type IconName } from '../../src/components/icons';
import { Avatar, Notice } from '../../src/components/ui';
import { useWork } from '../../src/components/useWork';
import { StatusPill } from '../../src/features/connections/ConnectionsSettings';
import { useGoogle, useIntegrations } from '../../src/features/connections/useConnections';
import { captureIdea, defaultIdeaText } from '../../src/features/ideas/ideaActions';
import { useI18n } from '../../src/i18n';
import type { MessageKey } from '../../src/i18n/en';
import { openWorkspace, type WorkspaceRoute } from '../../src/platform/navigation';
import '../../src/features/core/core.css';

function Action({ icon, title, sub, onClick, primary, disabled, end }: { icon: IconName; title: string; sub?: string; onClick: () => void; primary?: boolean; disabled?: boolean; end?: ReactNode }) {
  return (
    <button type="button" className="core-action" data-primary={primary ? 'true' : undefined} disabled={disabled} onClick={onClick}>
      <span className="core-action-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="core-action-text">
        <b>{title}</b>
        {sub && <span dir="auto">{sub}</span>}
      </span>
      {end}
    </button>
  );
}

const SECTIONS: { route: WorkspaceRoute; label: MessageKey; icon: IconName; sub: MessageKey }[] = [
  { route: 'mychannel', label: 'nav.home', icon: 'home', sub: 'core.popup.homeSub' },
  { route: 'research', label: 'nav.research', icon: 'search', sub: 'core.popup.researchSub' },
  { route: 'bulk', label: 'nav.bulk', icon: 'layers', sub: 'core.popup.bulkSub' },
  { route: 'alerts', label: 'nav.alerts', icon: 'bell', sub: 'core.popup.alertsSub' },
];

export function App() {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const { ctx } = useActivePage();
  const integrations = useIntegrations();
  const google = useGoogle();
  const alerts = useWork('alerts').items;
  const unread = alerts.filter((a) => !a.read).length;
  const active = google.channels.find((c) => c.channelId === google.activeChannelId);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const canSave = !!ctx && isCapturable(ctx.kind) && !!defaultIdeaText(ctx);
  const video = ctx && (ctx.kind === 'watch' || ctx.kind === 'shorts') && ctx.videoId;

  const openPanel = async () => {
    try {
      const win = await browser.windows.getCurrent();
      if (win.id === undefined) throw new Error('no window');
      await browser.sidePanel.open({ windowId: win.id });
      window.close();
    } catch {
      setMessage({ tone: 'error', text: t('popup.panelFailed') });
    }
  };

  const quickSave = async () => {
    const idea = await captureIdea({ text: '', ctx, link: true, profileId: prefs.activeProfileId });
    setMessage(idea ? { tone: 'success', text: t('capture.saved') } : { tone: 'error', text: t('capture.needText') });
  };
  const open = (route: WorkspaceRoute) => void openWorkspace(route).then(() => window.close());

  return (
    <main className="core-popup">
      <div className="row-between" style={{ flexWrap: 'nowrap' }}>
        <span className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">
            <Icon name="logo" />
          </span>
          TubeX
        </span>
        {active ? (
          <span className="row-nowrap small muted" title={active.title}>
            <bdi className="truncate" style={{ maxWidth: 140 }}>
              {active.title}
            </bdi>
            <Avatar src={active.thumbnail} name={active.title} />
          </span>
        ) : (
          ctx && <span className="badge">{t(`ctx.kind.${ctx.kind}`)}</span>
        )}
      </div>

      {(video || ctx?.title) && (
        <div className="core-account" style={{ background: 'var(--surface)', flexWrap: 'nowrap' }}>
          {video && <img className="thumb" src={`https://i.ytimg.com/vi/${ctx.videoId}/mqdefault.jpg`} alt="" referrerPolicy="no-referrer" style={{ width: 80 }} />}
          <span className="stack-s grow" style={{ gap: 0 }}>
            <span className="xsmall muted">{t(`ctx.kind.${ctx!.kind}`)}</span>
            <span className="small bold clamp-2" dir="auto">
              {ctx?.title}
            </span>
          </span>
        </div>
      )}

      <div className="core-actions">
        <Action icon="bulb" primary title={t('popup.quickSave')} sub={canSave ? t('core.popup.saveSub') : t('core.popup.saveOff')} disabled={!canSave} onClick={() => void quickSave()} />
        <Action icon="list" title={t('popup.openPanel')} sub={t('core.popup.panelSub')} onClick={() => void openPanel()} />
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <hr className="divider" />
      <nav aria-label={t('popup.quickLinks')} className="core-actions">
        {SECTIONS.map((s) => (
          <Action
            key={s.route}
            icon={s.icon}
            title={t(s.label)}
            sub={t(s.sub)}
            onClick={() => open(s.route)}
            end={
              s.route === 'alerts' && unread > 0 ? (
                <span className="badge badge-accent" aria-label={t('shell.alertsUnread', { n: unread })}>
                  {unread}
                </span>
              ) : undefined
            }
          />
        ))}
      </nav>
      <div className="core-pill-row">
        {(
          [
            ['https://studio.youtube.com/', 'popup.studio'],
            ['https://www.youtube.com/upload', 'popup.upload'],
          ] as const
        ).map(([href, label]) => (
          <a key={href} className="chip" href={href} target="_blank" rel="noreferrer noopener">
            <Icon name="external" />
            {t(label)}
          </a>
        ))}
      </div>

      <hr className="divider" />
      <div className="stack-s">
        <span className="xsmall muted bold">{t('core.popup.connections')}</span>
        <div className="core-conn">
          <StatusPill on={!!active}>{active ? t('core.popup.google') : t('core.conn.signedOut')}</StatusPill>
          <StatusPill on={!!integrations.youtube.apiKey}>{t('core.popup.ytKey')}</StatusPill>
          <StatusPill on={integrations.ai.enabled}>{t('core.popup.ai')}</StatusPill>
          <button type="button" className="btn btn-ghost btn-s" onClick={() => open('settings')}>
            <Icon name="settings" />
            {t('nav.settings')}
          </button>
        </div>
      </div>
    </main>
  );
}
