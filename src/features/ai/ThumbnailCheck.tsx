// Local thumbnail preview at the sizes viewers see, plus optional AI critique. The image stays in
// memory only; it is sent to the AI provider only when the owner clicks "critique".
import { useState } from 'react';
import { Button, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { useAiTask } from './useAiTask';
import { ThumbnailMaker } from './ThumbnailMaker';
import { ContextPreview } from '../thumbs/ContextPreview';

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
          <ContextPreview candidates={[{ key: 'draft', label: t('tctx.yours'), title, thumb: img.dataUrl }]} language={language} defaultQuery={title} />
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
