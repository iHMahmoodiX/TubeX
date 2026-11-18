// Extra tools for one public video: thumbnail download, embed code and comment export.
import { useCallback, useMemo, useState } from 'react';
import { embedCode, toCsv, wordFrequencies } from '../../domain/research';
import { parseTimestamp } from '../../domain/chapters';
import { Button, Field, Notice } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { useI18n } from '../../i18n';
import { thumbnailUrls, videoComments } from '../../integrations/youtube/api';
import { copyText, downloadText } from '../../platform/files';
import { ErrorNotice } from '../connections/ErrorNotice';
import { TermChips, useAsync, useFormat } from '../research/shared';

export function ThumbnailLinks({ videoId }: { videoId: string }) {
  const { t } = useI18n();
  return (
    <div className="row">
      <span className="small muted">{t('insights.thumbnail')}</span>
      {thumbnailUrls(videoId).map((x) => (
        <a key={x.url} className="small ltr" href={x.url} target="_blank" rel="noreferrer noopener">
          {x.label}
        </a>
      ))}
    </div>
  );
}

export function EmbedBuilder({ videoId }: { videoId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [flags, setFlags] = useState({ autoplay: false, mute: false, loop: false, captions: false, privacy: true, controls: true });
  const code = useMemo(
    () => embedCode({ videoId, start: parseTimestamp(start) ?? undefined, end: parseTimestamp(end) ?? undefined, ...flags }),
    [videoId, start, end, flags],
  );
  const flag = (k: keyof typeof flags, label: string) => (
    <label className="check">
      <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <div className="stack-s">
      <div className="row">
        <Field label={t('embed.start')}>{({ id }) => <input id={id} className="input ltr" dir="ltr" placeholder="0:30" style={{ maxWidth: 90 }} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label={t('embed.end')}>{({ id }) => <input id={id} className="input ltr" dir="ltr" placeholder="2:00" style={{ maxWidth: 90 }} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      <div className="row">
        {flag('autoplay', t('embed.autoplay'))}
        {flag('mute', t('embed.mute'))}
        {flag('loop', t('embed.loop'))}
        {flag('captions', t('embed.captions'))}
        {flag('controls', t('embed.controls'))}
        {flag('privacy', t('embed.privacy'))}
      </div>
      <textarea className="textarea mono ltr" dir="ltr" readOnly rows={4} value={code} aria-label={t('embed.code')} />
      <div>
        <Button size="s" onClick={async () => toast((await copyText(code)) ? t('common.copied') : t('common.copyFailed'))}>
          {t('embed.copy')}
        </Button>
      </div>
    </div>
  );
}

export function CommentsTool({ videoId }: { videoId: string }) {
  const { t } = useI18n();
  const f = useFormat();
  const { data, error, loading, run } = useAsync(useCallback(() => videoComments(videoId, 500), [videoId]));
  const words = useMemo(() => (data ? wordFrequencies(data.comments.map((c) => c.text), 30) : []), [data]);
  return (
    <div className="stack-s">
      <div className="row">
        <Button size="s" disabled={loading} onClick={() => void run()}>
          {loading ? t('common.loading') : t('comments.load')}
        </Button>
        <span className="small muted">{t('comments.cost')}</span>
      </div>
      <ErrorNotice error={error} />
      {data?.disabled && <Notice>{t('comments.disabled')}</Notice>}
      {data && !data.disabled && (
        <>
          <p className="small">{t('comments.loaded', { n: f.int(data.comments.length) })}</p>
          <h4 className="small">{t('comments.words')}</h4>
          {words.length ? <TermChips label={t('comments.words')} items={words} /> : <p className="small muted">{t('research.none')}</p>}
          <div>
            <Button
              size="s"
              disabled={!data.comments.length}
              onClick={() =>
                downloadText(
                  `tubex-comments-${videoId}.csv`,
                  toCsv([['comment_id', 'author', 'published_at', 'likes', 'replies', 'text'], ...data.comments.map((c) => [c.id, c.author, c.publishedAt, c.likes, c.replies, c.text])]),
                  'text/csv;charset=utf-8',
                )
              }
            >
              {t('comments.export')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
