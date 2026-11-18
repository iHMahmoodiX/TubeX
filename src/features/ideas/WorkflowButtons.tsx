// "Save idea" and "Idea + draft" from any research surface (#14): the idea keeps its source and research record,
// and the draft starts with the keyword, language and signals already filled. Two deliberate clicks at most.
import { useState } from 'react';
import { usePrefs } from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui';
import { useToast } from '../../components/toasts';
import type { ResearchRef, SourceRef } from '../../domain/models';
import { useI18n } from '../../i18n';
import { captureIdea, ideaAndDraft } from './ideaActions';

export function WorkflowButtons({ text, research, source, size = 's' }: { text: string; research: ResearchRef; source?: SourceRef; size?: 's' }) {
  const { t } = useI18n();
  const toast = useToast();
  const { prefs } = usePrefs();
  const [busy, setBusy] = useState(false);
  const saveIdea = async () => {
    setBusy(true);
    try {
      const idea = await captureIdea({ text, ctx: null, link: false, research, source, profileId: prefs.activeProfileId });
      if (idea) toast(t('flow.ideaSaved'), { label: t('common.open'), run: () => (location.hash = 'ideas') });
    } finally {
      setBusy(false);
    }
  };
  const toDraft = async () => {
    setBusy(true);
    try {
      const r = await ideaAndDraft({ text, research, source, profileId: prefs.activeProfileId, language: research.language ?? prefs.uiLanguage });
      if (r) location.hash = `drafts/${encodeURIComponent(r.draft.id)}`;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button size={size} variant="primary" disabled={busy} onClick={() => void toDraft()} data-testid="flow-draft">
        <Icon name="edit" />
        {t('flow.ideaDraft')}
      </Button>
      <Button size={size} disabled={busy} onClick={() => void saveIdea()} data-testid="flow-idea">
        <Icon name="bulb" />
        {t('flow.saveIdea')}
      </Button>
    </>
  );
}
