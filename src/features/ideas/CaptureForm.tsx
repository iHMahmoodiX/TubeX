import { useState } from 'react';
import { isCapturable, type PageContext } from '../../domain/pageContext';
import { usePrefs } from '../../components/AppShell';
import { useToast } from '../../components/toasts';
import { Field } from '../../components/ui';
import { useI18n } from '../../i18n';
import { remove } from '../../storage/db';
import { captureIdea, defaultIdeaText } from './ideaActions';

export function CaptureForm({ ctx }: { ctx: PageContext | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const { prefs } = usePrefs();
  const [text, setText] = useState('');
  const [link, setLink] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canLink = !!ctx && isCapturable(ctx.kind);
  const fallback = defaultIdeaText(ctx);

  const submit = async () => {
    setError(null);
    const idea = await captureIdea({ text, ctx, link: canLink && link, profileId: prefs.activeProfileId });
    if (!idea) return setError(t('capture.needText'));
    setText('');
    toast(t('capture.saved'), { label: t('common.undo'), run: () => void remove('ideas', idea.id) });
  };

  return (
    <form
      className="card stack-s"
      aria-labelledby="capture-h"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 id="capture-h">{t('capture.heading')}</h2>
      <Field label={t('capture.label')} help={t('capture.hint')}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            rows={2}
            dir={text ? 'auto' : undefined}
            placeholder={fallback || t('capture.placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        )}
      </Field>
      {error && (
        <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <div className="row-between">
        <label className="check small">
          <input type="checkbox" checked={canLink && link} disabled={!canLink} onChange={(e) => setLink(e.target.checked)} />
          {t('capture.link')}
        </label>
        <button type="submit" className="btn btn-primary">
          {t('capture.save')}
        </button>
      </div>
    </form>
  );
}
