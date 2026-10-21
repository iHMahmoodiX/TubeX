// Above Studio's Tags box: the tip line ("Double-click any tag to research it") and, at its end edge right over
// the box's corner, copy-all and clear-all. Clearing asks first, fills Studio's field only, and offers Undo;
// Studio's Save stays the only save.
import { useState } from 'react';
import { Icon } from '../../../components/icons';
import { Button } from '../../../components/ui';
import { useToast } from '../../../components/toasts';
import { useI18n } from '../../../i18n';
import { studioEditorRoot } from '../../../platform/youtubeDomInpage';
import { copyText } from '../../common';
import { useInpageEnabled } from '../../InpageRoot';
import { replaceTags } from '../fields';
import { pageDir } from './dom';
import { refreshEditorValues, useEditor } from './useEditor';

export function TagTip() {
  const on = useInpageEnabled('studioTags');
  const { videoId, values } = useEditor();
  const { t, dir } = useI18n();
  if (!on || !videoId) return null;
  // The row follows the page's direction so copy/clear sit over the box's end corner, like Studio's own controls.
  return (
    <div className="tt tt-tip-row" dir={pageDir(document)}>
      <span className="tt-dot" aria-hidden="true">
        <Icon name="logo" />
      </span>
      <p className="tt-tip" dir={dir}>
        <b>{t('tt.tipLead')}</b> {t('tt.tip')}
      </p>
      <span className="grow" />
      <CornerActions tags={values.tags} dir={dir} />
    </div>
  );
}

function CornerActions({ tags, dir }: { tags: string[]; dir: 'rtl' | 'ltr' }) {
  const { t } = useI18n();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [undo, setUndo] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);

  const replace = async (next: string[], after: (previous: string[]) => void) => {
    const root = studioEditorRoot(document);
    if (!root) return setWarn(t('inpage.studio.noTags'));
    setBusy(true);
    const r = await replaceTags(root, next);
    setBusy(false);
    refreshEditorValues();
    if (!r.ok) return setWarn(r.reason === 'not-cleared' ? t('tt.clearFailed') : t('inpage.studio.noTags'));
    setWarn(null);
    after(r.previous);
  };

  return (
    <>
      <span className="tt-corner" role="group" aria-label={t('tt.cornerLabel')}>
        <button
          type="button"
          className="tt-icon"
          disabled={!tags.length}
          title={t('tt.copyAll')}
          aria-label={t('tt.copyAll')}
          onClick={async () => toast((await copyText(tags.join(', '))) ? t('tt.copied', { n: tags.length }) : t('common.copyFailed'))}
        >
          <Icon name="copy" />
        </button>
        <button type="button" className="tt-icon" disabled={!tags.length || busy} title={t('tt.clearAll')} aria-label={t('tt.clearAll')} aria-expanded={confirm} onClick={() => setConfirm(!confirm)}>
          <Icon name="x" />
        </button>
      </span>
      {confirm && (
        <div className="tx-confirm tt-full" dir={dir} role="group" aria-label={t('tt.clearAll')}>
          <Icon name="alert" />
          <p className="grow small">{t('tt.clearConfirm', { n: tags.length })}</p>
          <Button
            size="s"
            variant="primary"
            autoFocus
            disabled={busy}
            onClick={() =>
              void replace([], (previous) => {
                setConfirm(false);
                setUndo(previous);
              })
            }
          >
            {t('tt.clearRun')}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setConfirm(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {undo && !confirm && (
        <div className="tx-note tt-full" dir={dir} role="status">
          <Icon name="info" />
          <span className="grow">{t('tt.cleared', { n: undo.length })}</span>
          <Button size="s" variant="ghost" disabled={busy} onClick={() => void replace(undo, () => setUndo(null))}>
            {t('common.undo')}
          </Button>
        </div>
      )}
      {warn && (
        <div className="tx-note tx-note-warn tt-full" dir={dir} role="alert">
          <Icon name="alert" />
          <span className="grow">{warn}</span>
        </div>
      )}
    </>
  );
}
