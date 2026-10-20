import { useState } from 'react';
import { browser } from 'wxt/browser';
import { isCapturable } from '../../src/domain/pageContext';
import { usePrefs } from '../../src/components/AppShell';
import { useActivePage } from '../../src/components/hooks';
import { Button, Notice } from '../../src/components/ui';
import { captureIdea, defaultIdeaText } from '../../src/features/ideas/ideaActions';
import { useI18n } from '../../src/i18n';
import { openWorkspace } from '../../src/platform/navigation';

export function App() {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const { ctx } = useActivePage();
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
      <p className="small muted">
        {t('settings.youtube')}: {t('profiles.notConnected')} · {t('settings.ai')}: {prefs.uiLanguage === 'fa' ? 'خاموش' : 'off'}
      </p>
    </main>
  );
}
