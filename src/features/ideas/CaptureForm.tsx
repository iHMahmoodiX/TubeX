import { useState } from 'react';
import { isCapturable, type PageContext } from '../../domain/pageContext';
import { usePrefs } from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Field, Switch } from '../../components/ui';
import { useI18n } from '../../i18n';
import { remove } from '../../storage/db';
import { captureIdea, defaultIdeaText } from './ideaActions';

/** Compact idea capture for the side panel: optional text, link to the open page, one green button. */
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
      data-testid="capture"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="core-mini-h">
        <h2 id="capture-h">{t('capture.heading')}</h2>
        <span className="xsmall faint">{t('capture.hint')}</span>
      </div>
      <Field label={t('capture.label')}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            style={{ minHeight: 64 }}
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
        <Switch checked={canLink && link} disabled={!canLink} onChange={setLink} label={<span className="small">{t('capture.link')}</span>} />
        <button type="submit" className="btn btn-primary">
          <Icon name="plus" />
          {t('capture.save')}
        </button>
      </div>
    </form>
  );
}
