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
  const initial = [...channel.trim()][0]?.toUpperCase() ?? '?';
  const thumb = draft.source?.videoId;
  return (
    <div className="stack" style={{ containerType: 'inline-size' }}>
      <section className="stack-s" aria-label={t('preview.search')}>
        <span className="core-yt-label">{t('preview.search')}</span>
        <div className="core-yt">
          <div className="yt-preview yt-search" lang={draft.language} dir="auto">
            <div className="yt-thumb" aria-hidden="true">
              {thumb ? <img src={`https://i.ytimg.com/vi/${thumb}/mqdefault.jpg`} alt="" referrerPolicy="no-referrer" style={{ opacity: 0.35 }} /> : null}
              <span style={{ position: 'relative' }}>{t('preview.noThumb')}</span>
            </div>
            <div className="stack-s" style={{ gap: 6 }}>
              <div className="yt-title" dir="auto">
                {title || <span style={{ opacity: 0.5 }}>{t('preview.noTitle')}</span>}
              </div>
              <div className="yt-meta row-nowrap" style={{ gap: 6 }}>
                <span className="core-yt-avatar" aria-hidden="true">
                  {initial}
                </span>
                <bdi className="truncate">{channel}</bdi>
              </div>
              {snip.text && (
                <div className="yt-snippet" dir="auto">
                  {snip.text}
                  {snip.cut && '…'}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="stack-s" aria-label={t('preview.watch')}>
        <span className="core-yt-label">{t('preview.watch')}</span>
        <div className="core-yt">
          <div className="yt-preview" lang={draft.language} dir="auto">
            {hashtags.length > 0 && (
              <div className="yt-hashtags" dir="auto" style={{ marginBlockEnd: -8 }}>
                {hashtags.map((h, i) => (
                  <span key={h}>
                    {i > 0 && ' '}
                    <bdi>{h}</bdi>
                  </span>
                ))}
              </div>
            )}
            <div className="yt-title" dir="auto" style={{ fontSize: 18, fontWeight: 700 }}>
              {title || <span style={{ opacity: 0.5 }}>{t('preview.noTitle')}</span>}
            </div>
            <div className="yt-meta row-nowrap">
              <span className="core-yt-avatar" style={{ width: 36, height: 36, fontSize: 15 }} aria-hidden="true">
                {initial}
              </span>
              <bdi className="truncate" style={{ fontWeight: 600, color: 'inherit' }}>
                {channel}
              </bdi>
            </div>
            {draft.description.trim() && (
              <div className="yt-desc" dir="auto">
                {descHead}
                {descCut && <span style={{ fontWeight: 700 }}> {t('preview.more')}</span>}
              </div>
            )}
          </div>
        </div>
      </section>
      <p className="xsmall faint">{t('preview.approx')}</p>
    </div>
  );
}
