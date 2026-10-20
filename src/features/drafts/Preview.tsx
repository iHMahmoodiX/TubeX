import type { Draft } from '../../domain/models';
import { extractHashtags, snippet } from '../../domain/metadata';
import { useI18n } from '../../i18n';

/** Approximate YouTube layouts built from the draft's exact text. Not a pixel copy of YouTube. */
export function Preview({ draft, channelName }: { draft: Draft; channelName?: string }) {
  const { t } = useI18n();
  const title = draft.title.trim();
  const snip = snippet(draft.description);
  const hashtags = extractHashtags(draft.description).slice(0, 3);
  const descLines = draft.description.split('\n');
  const descHead = descLines.slice(0, 3).join('\n');
  const descCut = descLines.length > 3;
  const channel = channelName || t('preview.channel');
  return (
    <div className="stack" style={{ containerType: 'inline-size' }}>
      <p className="small muted">{t('preview.approx')}</p>
      <section className="stack-s" aria-label={t('preview.search')}>
        <h3 className="small muted">{t('preview.search')}</h3>
        <div className="yt-preview yt-search" lang={draft.language} dir="auto">
          <div className="yt-thumb" aria-hidden="true">
            {t('preview.noThumb')}
          </div>
          <div className="stack-s">
            <div className="yt-title" dir="auto">
              {title || <span className="muted">{t('preview.noTitle')}</span>}
            </div>
            <div className="yt-meta">
              <bdi>{channel}</bdi>
            </div>
            {snip.text && (
              <div className="yt-snippet" dir="auto">
                {snip.text}
                {snip.cut && '…'}
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="stack-s" aria-label={t('preview.watch')}>
        <h3 className="small muted">{t('preview.watch')}</h3>
        <div className="yt-preview" lang={draft.language} dir="auto">
          {hashtags.length > 0 && (
            <div className="yt-hashtags" dir="auto">
              {hashtags.map((h) => (
                <bdi key={h}>{h} </bdi>
              ))}
            </div>
          )}
          <div className="yt-title" dir="auto">
            {title || <span className="muted">{t('preview.noTitle')}</span>}
          </div>
          <div className="yt-meta">
            <bdi>{channel}</bdi>
          </div>
          {draft.description.trim() && (
            <div className="yt-desc" dir="auto">
              {descHead}
              {descCut && <span className="muted"> {t('preview.more')}</span>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
