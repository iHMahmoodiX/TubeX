// Local thumbnail preview at the sizes viewers see, plus optional AI critique. The image stays in
// memory only; it is sent to the AI provider only when the owner clicks "critique".
import { useState } from 'react';
import { Button, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { useAiTask } from './useAiTask';
import { ThumbnailMaker } from './ThumbnailMaker';

const SIZES = [
  { key: 'thumb.size.search', width: 360 },
  { key: 'thumb.size.sidebar', width: 168 },
  { key: 'thumb.size.tiny', width: 120 },
] as const;

/** Loads an image file and re-encodes it as a JPEG no larger than 1280×720. */
export async function loadThumbnail(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / bitmap.width, 720 / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height };
}

export function ThumbnailCheck({ title, language }: { title: string; language: 'fa' | 'en' }) {
  const { t } = useI18n();
  const { ai } = useIntegrations();
  const { run, cancel, running, results, error } = useAiTask();
  const [img, setImg] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [dark, setDark] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const out = results.thumbnail?.output;

  return (
    <div className="stack-s" data-testid="thumb-check">
      <Field label={t('thumb.choose')} help={t('thumb.help')}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              setLoadError(false);
              if (!f) return;
              try {
                setImg(await loadThumbnail(f));
              } catch {
                setLoadError(true);
              }
            }}
          />
        )}
      </Field>
      {loadError && <Notice tone="error">{t('thumb.loadError')}</Notice>}
      <details className="disclosure">
        <summary>
          <h3 className="small">{t('maker.heading')}</h3>
        </summary>
        <ThumbnailMaker defaultText={title} onUse={setImg} />
      </details>
      {img && (
        <>
          {Math.abs(img.width / img.height - 16 / 9) > 0.02 && <Notice tone="warning">{t('thumb.ratio')}</Notice>}
          <label className="check">
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
            <span>{t('thumb.dark')}</span>
          </label>
          <div className="stack-s" style={{ background: dark ? '#0f0f0f' : '#ffffff', color: dark ? '#f1f1f1' : '#0f0f0f', padding: 12, borderRadius: 10 }}>
            {SIZES.map((s) => (
              <figure key={s.key} style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ position: 'relative', width: s.width, flex: 'none' }}>
                  <img src={img.dataUrl} alt="" style={{ width: s.width, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: s.width > 200 ? 12 : 8, display: 'block' }} />
                  <span
                    aria-hidden="true"
                    style={{ position: 'absolute', insetInlineEnd: 4, insetBlockEnd: 4, background: 'rgb(0 0 0 / .8)', color: '#fff', fontSize: 11, padding: '0 4px', borderRadius: 4, direction: 'ltr' }}
                  >
                    12:34
                  </span>
                </div>
                <figcaption className="stack-s" style={{ minWidth: 0 }}>
                  <span className="yt-title" dir="auto" lang={language} style={{ fontSize: s.width > 200 ? 16 : 13 }}>
                    {title || t('draft.untitled')}
                  </span>
                  <span className="small" style={{ opacity: 0.7 }}>
                    {t(s.key)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          {ai.enabled && (
            <div className="row">
              <Button size="s" variant="primary" disabled={!!running} onClick={() => void run('thumbnail', { language, title }, {}, { imageDataUrl: img.dataUrl })}>
                {running ? t('ai.running') : t('thumb.critique')}
              </Button>
              {running && (
                <Button size="s" onClick={cancel}>
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          )}
          {ai.enabled && <p className="small muted">{t('thumb.visionNote')}</p>}
          <ErrorNotice error={error} />
          {out?.task === 'thumbnail' && (
            <div className="stack-s" dir="auto">
              <p>{out.summary}</p>
              {(
                [
                  ['thumb.strengths', out.strengths],
                  ['thumb.issues', out.issues],
                  ['thumb.suggestions', out.suggestions],
                ] as const
              ).map(([k, items]) =>
                items.length ? (
                  <div key={k} className="stack-s">
                    <h4 className="small">{t(k)}</h4>
                    <ul style={{ margin: 0, paddingInlineStart: '1.2em' }}>
                      {items.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
