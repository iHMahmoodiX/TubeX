import { useEffect, useRef, useState } from 'react';
import { isCapturable } from '../../src/domain/pageContext';
import { usePrefs } from '../../src/components/AppShell';
import { useActivePage, useCollection } from '../../src/components/hooks';
import { Icon } from '../../src/components/icons';
import { Avatar, Button, Empty, IconButton } from '../../src/components/ui';
import { useGoogle } from '../../src/features/connections/useConnections';
import { DraftEditor } from '../../src/features/drafts/DraftEditor';
import { CaptureForm } from '../../src/features/ideas/CaptureForm';
import { ContextCard } from '../../src/features/ideas/ContextCard';
import { createDraft, sourceFromContext } from '../../src/features/ideas/ideaActions';
import { IdeaTrack } from '../../src/features/ideas/IdeasView';
import { PageInsights } from '../../src/features/insights/PageInsights';
import { ProfileSelect } from '../../src/features/profiles/ProfilesView';
import { useI18n } from '../../src/i18n';
import { openWorkspace } from '../../src/platform/navigation';
import { ReconnectBanner } from '../../src/features/connections/Reconnect';
import '../../src/features/core/core.css';

export function App() {
  const { t } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const { ctx } = useActivePage();
  const ideas = useCollection('ideas');
  const drafts = useCollection('drafts');
  const google = useGoogle();
  const active = google.channels.find((c) => c.channelId === google.activeChannelId);
  const [draftId, setDraftId] = useState<string | undefined>(prefs.lastDraftId);

  // Drop a remembered draft that no longer exists (checked once, on first load). The panel never
  // switches drafts on its own when the open page changes.
  const checked = useRef(false);
  useEffect(() => {
    if (drafts.loading || checked.current) return;
    checked.current = true;
    if (draftId && !drafts.items.some((d) => d.id === draftId)) setDraftId(undefined);
  }, [drafts.loading, drafts.items, draftId]);

  const select = (id: string | undefined) => {
    setDraftId(id);
    void setPrefs({ lastDraftId: id });
  };

  const newDraft = async () => {
    const source = ctx && isCapturable(ctx.kind) ? sourceFromContext(ctx) : undefined;
    const d = await createDraft({ profileId: prefs.activeProfileId, language: prefs.uiLanguage, source });
    select(d.id);
  };

  const recent = [...ideas.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <main className="core-panel">
      <header className="core-panel-head">
        <span className="brand">
          <span className="brand-mark">
            <Icon name="logo" />
          </span>
          TubeX
        </span>
        <span className="grow" />
        <ProfileSelect />
        {active ? (
          <button type="button" className="icon-btn" title={active.title} aria-label={`${t('core.panel.channel')}: ${active.title}`} onClick={() => void openWorkspace('mychannel')}>
            <Avatar src={active.thumbnail} name={active.title} />
          </button>
        ) : (
          google.loaded && <IconButton icon="users" label={t('shell.signIn')} onClick={() => void openWorkspace('settings')} />
        )}
        <IconButton icon="external" label={t('popup.openWorkspace')} onClick={() => void openWorkspace('mychannel')} />
      </header>
      <ReconnectBanner />

      <ContextCard ctx={ctx} />
      <PageInsights ctx={ctx} draftId={draftId} />
      <CaptureForm ctx={ctx} />

      <section className="card stack" aria-labelledby="draft-h">
        <div className="core-mini-h">
          <h2 id="draft-h">{t('draft.heading')}</h2>
          <Button size="s" variant="primary" onClick={() => void newDraft()}>
            <Icon name="plus" />
            {t('draft.new')}
          </Button>
        </div>
        {drafts.items.length > 0 && (
          <select className="select core-select-pill" style={{ width: '100%' }} aria-label={t('draft.pick')} value={draftId ?? ''} onChange={(e) => select(e.target.value || undefined)}>
            <option value="">{t('core.panel.pickDraft')}</option>
            {drafts.items.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title.trim() || t('draft.untitled')}
              </option>
            ))}
          </select>
        )}
        {draftId ? (
          <>
            <DraftEditor key={draftId} draftId={draftId} compact pageCtx={ctx} onDeleted={() => select(undefined)} />
            <Button size="s" variant="ghost" onClick={() => void openWorkspace('drafts', draftId)}>
              <Icon name="external" />
              {t('draft.openInWorkspace')}
            </Button>
          </>
        ) : (
          drafts.items.length === 0 && !drafts.loading && <Empty icon="edit">{t('draft.empty')}</Empty>
        )}
      </section>

      <section className="stack-s" aria-labelledby="recent-h">
        <div className="core-mini-h">
          <h2 id="recent-h">{t('ideas.recent')}</h2>
          {ideas.items.length > 0 && (
            <Button size="s" variant="ghost" onClick={() => void openWorkspace('ideas')}>
              {t('ideas.viewAll')}
            </Button>
          )}
        </div>
        {recent.length === 0 ? (
          !ideas.loading && <Empty icon="bulb">{t('ideas.empty')}</Empty>
        ) : (
          <ul className="tracks core-mini-tracks" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="recent-ideas">
            {recent.map((i, n) => (
              <IdeaTrack key={i.id} idea={i} index={n} compact onStartDraft={select} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
