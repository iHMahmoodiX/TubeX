// Optional AI title and thumbnail ideas for one video (runAiJson). The page works without AI.
import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { useI18n } from '../../i18n';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { ErrorNotice } from '../connections/ErrorNotice';

const strs = (v: unknown, n: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, n).map((x) => x.trim().slice(0, 200)) : []);

export function AiIdeas({ video, problem }: { video: { title: string; description: string; tags: string[] }; problem: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [out, setOut] = useState<{ titles: string[]; thumbnails: string[] } | null>(null);
  const run = async (fresh = false) => {
    setBusy(true);
    setError(null);
    try {
      const r = await runAiJson({
        task: 'reports.click-ideas.v1',
        instructions:
          'Suggest new packaging for this YouTube video. Write in the same language as the original title. ' +
          `Problem to solve: ${problem}. ` +
          'Return {"titles": [5 alternative titles, each under 70 characters, honest to the content, no clickbait lies], "thumbnails": [3 short thumbnail concepts: main image, text overlay of at most 4 words, contrast idea]}.',
        data: dataBlock('Current title', video.title, 300) + dataBlock('Description', video.description, 1500) + dataBlock('Tags', video.tags.join(', '), 500),
        maxTokens: 900,
        fresh,
      });
      setOut({ titles: strs(r.output.titles, 6), thumbnails: strs(r.output.thumbnails, 4) });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      toast(t('common.copied'));
    } catch {
      toast(t('common.copyFailed'));
    }
  };
  return (
    <div className="stack-s">
      <div className="row">
        <Button size="s" disabled={busy} onClick={() => void run(!!out)}>
          <Icon name="sparkle" />
          {busy ? t('common.loading') : out ? t('reports.ai.again') : t('reports.ai.ideas')}
        </Button>
        <span className="xsmall faint">{t('reports.ai.optional')}</span>
      </div>
      <ErrorNotice error={error} />
      {out && (
        <div className="rp-grid-2">
          <div className="stack-s">
            <b className="small">{t('reports.ai.titles')}</b>
            <ul className="rp-fails">
              {out.titles.map((x) => (
                <li key={x}>
                  <span className="grow" dir="auto">
                    {x}
                  </span>
                  <button type="button" className="icon-btn" aria-label={t('common.copy')} title={t('common.copy')} onClick={() => void copy(x)}>
                    <Icon name="copy" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="stack-s">
            <b className="small">{t('reports.ai.thumbs')}</b>
            <ul className="rp-fails">
              {out.thumbnails.map((x) => (
                <li key={x}>
                  <Icon name="image" />
                  <span dir="auto">{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
