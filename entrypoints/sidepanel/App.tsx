import { useEffect, useRef, useState } from 'react';
import { isCapturable } from '../../src/domain/pageContext';
import { usePrefs } from '../../src/components/AppShell';
import { useActivePage, useCollection } from '../../src/components/hooks';
import { Button, Empty, Field } from '../../src/components/ui';
import { DraftEditor } from '../../src/features/drafts/DraftEditor';
import { CaptureForm } from '../../src/features/ideas/CaptureForm';
import { ContextCard } from '../../src/features/ideas/ContextCard';
import { createDraft, sourceFromContext } from '../../src/features/ideas/ideaActions';
import { IdeaRow } from '../../src/features/ideas/IdeasView';
import { PageInsights } from '../../src/features/insights/PageInsights';
import { ProfileSelect } from '../../src/features/profiles/ProfilesView';
import { useI18n } from '../../src/i18n';
import { openWorkspace } from '../../src/platform/navigation';

export function App() {
  const { t } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const { ctx } = useActivePage();
  const ideas = useCollection('ideas');
  const drafts = useCollection('drafts');
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

  const recent = ideas.items.slice(0, 5);

  return (
    <main className="panel">
      <header className="panel-header">
        <span className="brand">
          Tube<span>X</span>
        </span>
        <div className="grow" />
        <ProfileSelect />
        <Button size="s" variant="ghost" onClick={() => void openWorkspace('ideas')}>
          {t('popup.openWorkspace')}
        </Button>
      </header>

      <ContextCard ctx={ctx} />
      <PageInsights ctx={ctx} draftId={draftId} />
      <CaptureForm ctx={ctx} />

      <section className="stack" aria-labelledby="draft-h">
        <div className="row-between">
          <h2 id="draft-h">{t('draft.heading')}</h2>
          <Button size="s" variant="primary" onClick={() => void newDraft()}>
            {t('draft.new')}
          </Button>
        </div>
        {drafts.items.length > 0 && (
          <Field label={t('draft.pick')}>
            {({ id }) => (
              <select id={id} className="select" value={draftId ?? ''} onChange={(e) => select(e.target.value || undefined)}>
                <option value="">—</option>
                {drafts.items.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title.trim() || t('draft.untitled')}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {draftId ? (
          <DraftEditor key={draftId} draftId={draftId} compact pageCtx={ctx} onDeleted={() => select(undefined)} />
        ) : (
          drafts.items.length === 0 && !drafts.loading && <Empty>{t('draft.empty')}</Empty>
        )}
      </section>

      <section className="stack-s" aria-labelledby="recent-h">
        <div className="row-between">
          <h2 id="recent-h">{t('ideas.recent')}</h2>
          {ideas.items.length > 0 && (
            <Button size="s" variant="ghost" onClick={() => void openWorkspace('ideas')}>
              {t('ideas.viewAll')}
            </Button>
          )}
        </div>
        {recent.length === 0 ? (
          !ideas.loading && <Empty>{t('ideas.empty')}</Empty>
        ) : (
          <ul className="list">
            {recent.map((i) => (
              <IdeaRow key={i.id} idea={i} compact onStartDraft={select} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
