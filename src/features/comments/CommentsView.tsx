// Comment helpers that work without signing in: a formatter for YouTube's comment markup and
// canned replies to copy into YouTube. Posting replies from TubeX needs sign-in (later milestone).
import { useRef, useState } from 'react';
import { newBase, type Reply } from '../../domain/models';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Field } from '../../components/ui';
import { useI18n } from '../../i18n';
import { copyText } from '../../platform/files';
import { create, remove, save } from '../../storage/db';

/** Renders YouTube comment markup (*bold*, _italic_, -strike-) to React nodes for preview. */
export function renderCommentMarkup(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(^|[\s(])([*_-])(?=\S)([^\n]*?\S)\2(?=$|[\s.,!?:;)،؟])/gu;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index! + m[1]!.length;
    out.push(text.slice(last, start));
    const inner = m[3]!;
    out.push(m[2] === '*' ? <strong key={k++}>{inner}</strong> : m[2] === '_' ? <em key={k++}>{inner}</em> : <s key={k++}>{inner}</s>);
    last = start + inner.length + 2;
  }
  out.push(text.slice(last));
  return out;
}

function Formatter() {
  const { t } = useI18n();
  const toast = useToast();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (mark: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = text.slice(a, b).trim() || t('comments.sample');
    const next = `${text.slice(0, a)}${mark}${sel}${mark}${text.slice(b)}`;
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + 1, a + 1 + sel.length);
    });
  };
  return (
    <div className="card stack-s">
      <h2>{t('comments.formatter')}</h2>
      <p className="small muted">{t('comments.formatterHelp')}</p>
      <div className="row">
        <Button size="s" onClick={() => wrap('*')}>
          <strong>{t('comments.bold')}</strong>
        </Button>
        <Button size="s" onClick={() => wrap('_')}>
          <em>{t('comments.italic')}</em>
        </Button>
        <Button size="s" onClick={() => wrap('-')}>
          <s>{t('comments.strike')}</s>
        </Button>
      </div>
      <textarea ref={ref} className="textarea" rows={4} dir="auto" aria-label={t('comments.formatter')} value={text} onChange={(e) => setText(e.target.value)} />
      {text && (
        <div className="yt-desc" dir="auto" data-testid="comment-preview">
          {renderCommentMarkup(text)}
        </div>
      )}
      <div>
        <Button size="s" disabled={!text} onClick={async () => toast((await copyText(text)) ? t('common.copied') : t('common.copyFailed'))}>
          {t('common.copy')}
        </Button>
      </div>
    </div>
  );
}

function ReplyRow({ r }: { r: Reply }) {
  const { t } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.name);
  const [text, setText] = useState(r.text);
  if (editing)
    return (
      <li className="list-item stack-s">
        <Field label={t('common.name')}>{({ id }) => <input id={id} className="input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('comments.replyText')}>{({ id }) => <textarea id={id} className="textarea" rows={3} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        <div className="row">
          <Button
            size="s"
            variant="primary"
            disabled={!name.trim()}
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
  return (
    <li className="list-item">
      <div className="row-between">
        <strong dir="auto">{r.name}</strong>
        <div className="row">
          <Button size="s" onClick={async () => toast((await copyText(r.text)) ? t('common.copied') : t('common.copyFailed'))}>
            {t('common.copy')}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
          <ConfirmButton size="s" label={t('common.delete')} question={t('comments.deleteReply', { name: r.name })} confirmLabel={t('common.delete')} onConfirm={() => void remove('replies', r.id)} />
        </div>
      </div>
      <p className="small" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
        {renderCommentMarkup(r.text)}
      </p>
    </li>
  );
}

function CannedReplies() {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const replies = useCollection('replies');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  return (
    <div className="card stack-s">
      <h2>{t('comments.replies')}</h2>
      <p className="small muted">{t('comments.repliesHelp')}</p>
      <form
        className="stack-s"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !text.trim()) return;
          await create('replies', { ...newBase(), name: name.trim(), text, ...(prefs.activeProfileId && { profileId: prefs.activeProfileId }) });
          setName('');
          setText('');
        }}
      >
        <Field label={t('common.name')}>{({ id }) => <input id={id} className="input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('comments.replyText')}>{({ id }) => <textarea id={id} className="textarea" rows={3} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        <div>
          <button type="submit" className="btn btn-primary btn-s" disabled={!name.trim() || !text.trim()}>
            {t('comments.addReply')}
          </button>
        </div>
      </form>
      {replies.items.length === 0 && !replies.loading ? (
        <Empty>{t('comments.noReplies')}</Empty>
      ) : (
        <ul className="list">
          {replies.items.map((r) => (
            <ReplyRow key={`${r.id}:${r.rev}`} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function CommentsView() {
  const { t } = useI18n();
  return (
    <section className="stack" aria-labelledby="cm-h">
      <h1 id="cm-h">{t('comments.heading')}</h1>
      <p className="muted">{t('comments.intro')}</p>
      <div className="editor-grid">
        <CannedReplies />
        <Formatter />
      </div>
    </section>
  );
}
