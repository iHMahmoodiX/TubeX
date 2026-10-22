// Comment tools: the markup formatter, and export / frequent words of a video's public comments.
import { useRef, useState } from 'react';
import { isValidVideoId, parsePageUrl } from '../../domain/pageContext';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, Card, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { copyText } from '../../platform/files';
import { CommentsTool } from '../insights/VideoTools';
import { useOwnChannel, useOwnUploads } from '../bulk/engageKit';
import { renderCommentMarkup } from './markup';

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
    <Card title={t('comments.formatter')} sub={t('comments.formatterHelp')}>
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
      <textarea ref={ref} className="textarea" rows={5} dir="auto" aria-label={t('comments.formatter')} value={text} onChange={(e) => setText(e.target.value)} />
      {text && (
        <div className="yt-desc" dir="auto" data-testid="comment-preview">
          {renderCommentMarkup(text)}
        </div>
      )}
      <div>
        <Button size="s" variant="primary" disabled={!text} onClick={async () => toast((await copyText(text)) ? t('common.copied') : t('common.copyFailed'))}>
          <Icon name="copy" />
          {t('common.copy')}
        </Button>
      </div>
    </Card>
  );
}

function VideoComments() {
  const { t } = useI18n();
  const { channel } = useOwnChannel();
  const uploads = useOwnUploads(!!channel);
  const [input, setInput] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const parsed = (() => {
    const v = input.trim();
    if (isValidVideoId(v)) return v;
    const ctx = parsePageUrl(v);
    return ctx.videoId ?? null;
  })();
  return (
    <Card title={t('engage.tools.exportTitle')} sub={t('engage.tools.exportHelp')}>
      {channel && uploads.videos && uploads.videos.length > 0 && (
        <select className="select" aria-label={t('engage.tools.pickVideo')} value={videoId ?? ''} onChange={(e) => setVideoId(e.target.value || null)}>
          <option value="">{t('engage.tools.pickVideo')}</option>
          {uploads.videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed) setVideoId(parsed);
        }}
      >
        <input className="input grow ltr" dir="ltr" style={{ flex: '1 1 200px' }} aria-label={t('engage.tools.videoUrl')} placeholder="https://www.youtube.com/watch?v=…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="btn btn-s" disabled={!parsed}>
          {t('engage.tools.useVideo')}
        </button>
      </form>
      {videoId ? <CommentsTool key={videoId} videoId={videoId} /> : <Notice>{t('engage.tools.needsKey')}</Notice>}
    </Card>
  );
}

export function CommentTools() {
  return (
    <div className="editor-grid">
      <Formatter />
      <VideoComments />
    </div>
  );
}
