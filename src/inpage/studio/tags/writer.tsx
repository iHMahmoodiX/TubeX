// Click-only writes to Studio's Tags field with one status line: add tags, replace the whole list (sort,
// import-replace, translate-replace) with Undo. Studio's Save stays the only save; every note says so.
import { useState } from 'react';
import { Icon } from '../../../components/icons';
import { Button } from '../../../components/ui';
import { useI18n } from '../../../i18n';
import { studioEditorRoot } from '../../../platform/youtubeDomInpage';
import { addTags, replaceTags } from '../fields';
import { refreshEditorValues } from './useEditor';

export interface Note {
  tone: 'ok' | 'warn';
  text: string;
  undo?: string[];
}

export function useFieldWriter() {
  const { t } = useI18n();
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);

  const add = (tags: string[]) => {
    const root = studioEditorRoot(document);
    const r = root ? addTags(root, tags) : ({ ok: false } as const);
    refreshEditorValues();
    if (!r.ok) return setNote({ tone: 'warn', text: t('inpage.studio.noTags') });
    const parts = [t('inpage.studio.tagsAdded', { n: r.added.length })];
    if (r.duplicate.length) parts.push(t('tt.dupSkipped', { n: r.duplicate.length }));
    if (r.overLimit.length) parts.push(t('inpage.studio.tagsOver', { n: r.overLimit.length }));
    parts.push(t('inpage.studio.reviewSave'));
    setNote({ tone: r.overLimit.length ? 'warn' : 'ok', text: parts.join(' ') });
  };

  const replace = async (tags: string[], done: string) => {
    const root = studioEditorRoot(document);
    if (!root) return setNote({ tone: 'warn', text: t('inpage.studio.noTags') });
    setBusy(true);
    const r = await replaceTags(root, tags);
    setBusy(false);
    refreshEditorValues();
    if (!r.ok) return setNote({ tone: 'warn', text: r.reason === 'not-cleared' ? t('tt.clearFailed') : t('inpage.studio.noTags') });
    const over = r.overLimit.length ? ` ${t('inpage.studio.tagsOver', { n: r.overLimit.length })}` : '';
    setNote({ tone: r.overLimit.length ? 'warn' : 'ok', text: `${done}${over} ${t('inpage.studio.reviewSave')}`, undo: r.previous });
  };

  const view = note && (
    <div className={`tx-note ${note.tone === 'warn' ? 'tx-note-warn' : ''}`} role="status">
      <Icon name={note.tone === 'warn' ? 'alert' : 'info'} />
      <span className="grow">{note.text}</span>
      {note.undo && (
        <Button
          size="s"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            const prev = note.undo!;
            await replace(prev, t('tt.restored'));
            setNote({ tone: 'ok', text: `${t('tt.restored')} ${t('inpage.studio.reviewSave')}` });
          }}
        >
          {t('common.undo')}
        </Button>
      )}
      <button type="button" className="tt-icon tt-icon-s" aria-label={t('common.close')} onClick={() => setNote(null)}>
        <Icon name="x" />
      </button>
    </div>
  );

  return { add, replace, busy, note, setNote, view };
}
