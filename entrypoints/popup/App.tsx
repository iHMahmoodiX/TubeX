import { useState } from 'react';
import { browser } from 'wxt/browser';
import { isCapturable } from '../../src/domain/pageContext';
import { usePrefs } from '../../src/components/AppShell';
import { useActivePage } from '../../src/components/hooks';
import { Button, Notice } from '../../src/components/ui';
import { captureIdea, defaultIdeaText } from '../../src/features/ideas/ideaActions';
import { useI18n } from '../../src/i18n';
import { useIntegrations } from '../../src/features/connections/useConnections';
import { openWorkspace } from '../../src/platform/navigation';

export function App() {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const { ctx } = useActivePage();
  const integrations = useIntegrations();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const canSave = !!ctx && isCapturable(ctx.kind) && !!defaultIdeaText(ctx);

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

  return (
    <main className="popup">
      <div className="row-between">
        <span className="brand">
          Tube<span>X</span>
        </span>
        {ctx && <span className="badge">{t(`ctx.kind.${ctx.kind}`)}</span>}
      </div>
      {ctx?.title && (
        <p className="small truncate" dir="auto">
          {ctx.title}
        </p>
      )}
      <Button variant="primary" block disabled={!canSave} onClick={() => void quickSave()}>
        {t('popup.quickSave')}
      </Button>
      <Button block onClick={() => void openPanel()}>
        {t('popup.openPanel')}
      </Button>
      <Button block onClick={() => void openWorkspace('ideas').then(() => window.close())}>
        {t('popup.openWorkspace')}
      </Button>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <hr className="divider" />
      <nav aria-label={t('popup.quickLinks')} className="stack-s">
        <span className="small muted">{t('popup.quickLinks')}</span>
        <div className="row">
          {(
            [
              ['research', 'nav.research'],
              ['competitors', 'nav.competitors'],
              ['bulk', 'nav.bulk'],
              ['comments', 'nav.comments'],
            ] as const
          ).map(([route, label]) => (
            <Button key={route} size="s" variant="ghost" onClick={() => void openWorkspace(route).then(() => window.close())}>
              {t(label)}
            </Button>
          ))}
        </div>
        <div className="row">
          {(
            [
              ['https://studio.youtube.com/', 'popup.studio'],
              ['https://www.youtube.com/upload', 'popup.upload'],
              ['https://studio.youtube.com/channel/UC/analytics', 'popup.analytics'],
              ['https://studio.youtube.com/channel/UC/comments', 'popup.comments'],
            ] as const
          ).map(([href, label]) => (
            <a key={href} className="btn btn-s btn-ghost" href={href} target="_blank" rel="noreferrer noopener">
              {t(label)}
            </a>
          ))}
        </div>
      </nav>
      <p className="small muted">
        {t('settings.ai')}: {integrations.ai.enabled ? t('conn.on') : t('conn.off')} · {t('conn.ytHeading')}: {integrations.youtube.apiKey ? t('conn.on') : t('conn.off')}
      </p>
    </main>
  );
}
