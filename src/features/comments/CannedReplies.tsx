// Canned responses library (the 'replies' collection): create, edit, copy, delete. Placeholders {name} and
// {video} are filled when a reply is used in the inbox.
import { useState } from 'react';
import { fillReply, placeholdersIn } from '../../domain/engageComments';
import { newBase, type Reply } from '../../domain/models';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Field, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { copyText } from '../../platform/files';
import { create, remove, save } from '../../storage/db';
import { renderCommentMarkup } from './markup';

function ReplyRow({ r, index }: { r: Reply; index: number }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.name);
  const [text, setText] = useState(r.text);
  const num = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US');
  if (editing)
    return (
      <li className="card card-2 stack-s">
        <Field label={t('common.name')}>{({ id }) => <input id={id} className="input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('comments.replyText')} help={t('engage.replies.placeholders')}>
          {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" rows={3} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        <div className="row">
          <Button
            size="s"
            variant="primary"
            disabled={!name.trim() || !text.trim()}
            onClick={async () => {
              const res = await save('replies', { ...r, name: name.trim(), text });
              if (!res.ok) toast(t('draft.conflict'));
              setEditing(false);
            }}
          >
            {t('common.save')}
          </Button>
          <Button size="s" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </li>
    );
  const vars = placeholdersIn(r.text);
  return (
    <li className="track" style={{ alignItems: 'start', minHeight: 0, paddingBlock: 10 }}>
      <span className="track-n" style={{ paddingBlockStart: 2 }}>
        {num.format(index + 1)}
      </span>
      <div className="stack-s" style={{ gap: 4, minWidth: 0 }}>
        <span className="row-nowrap">
          <strong dir="auto" className="truncate">
            {r.name}
          </strong>
          {vars.map((v) => (
            <span key={v} className="badge badge-info ltr">{`{${v}}`}</span>
          ))}
        </span>
        <p className="small muted" dir="auto" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {renderCommentMarkup(r.text)}
        </p>
      </div>
      <div className="row">
        <Button size="s" variant="ghost" onClick={async () => toast((await copyText(r.text)) ? t('common.copied') : t('common.copyFailed'))}>
          <Icon name="copy" />
          {t('common.copy')}
        </Button>
        <Button size="s" variant="ghost" onClick={() => setEditing(true)}>
          {t('common.edit')}
        </Button>
        <ConfirmButton size="s" label={t('common.delete')} question={t('comments.deleteReply', { name: r.name })} confirmLabel={t('common.delete')} onConfirm={() => void remove('replies', r.id)} />
      </div>
    </li>
  );
}

export function CannedReplies() {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const replies = useCollection('replies');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const sample = fillReply(text, { name: t('engage.replies.sampleName'), video: t('engage.replies.sampleVideo') });
  return (
    <div className="editor-grid">
      <section className="stack" aria-labelledby="canned-h">
        <div className="row-between">
          <h2 id="canned-h">{t('comments.replies')}</h2>
          <span className="small muted">{t('engage.replies.count', { n: replies.items.length })}</span>
        </div>
        {replies.loading ? (
          <Skeleton lines={4} />
        ) : replies.items.length === 0 ? (
          <Empty icon="message" title={t('comments.noReplies')}>
            {t('engage.replies.emptyHelp')}
          </Empty>
        ) : (
          <ul className="tracks" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {replies.items.map((r, i) => (
              <ReplyRow key={`${r.id}:${r.rev}`} r={r} index={i} />
            ))}
          </ul>
        )}
      </section>
      <form
        className="card stack"
        aria-labelledby="canned-new-h"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !text.trim()) return;
          await create('replies', { ...newBase(), name: name.trim(), text, ...(prefs.activeProfileId && { profileId: prefs.activeProfileId }) });
          setName('');
          setText('');
        }}
      >
        <h2 id="canned-new-h">{t('engage.replies.new')}</h2>
        <p className="small muted">{t('comments.repliesHelp')}</p>
        <Field label={t('common.name')}>{({ id }) => <input id={id} className="input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('comments.replyText')} help={t('engage.replies.placeholders')}>
          {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" rows={4} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        <div className="row">
          <Button size="s" variant="ghost" onClick={() => setText((x) => `${x}{name}`)}>
            {'{name}'}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setText((x) => `${x}{video}`)}>
            {'{video}'}
          </Button>
        </div>
        {text.trim() && (
          <div className="stack-s">
            <span className="xsmall muted bold">{t('engage.replies.preview')}</span>
            <div className="engage-preview-box" dir="auto">
              {renderCommentMarkup(sample)}
            </div>
          </div>
        )}
        <div>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || !text.trim()}>
            {t('comments.addReply')}
          </button>
        </div>
      </form>
    </div>
  );
}
