// YouTube's most popular videos in the region (videos.list chart=mostPopular, 1 unit).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { commonTags } from '../../domain/research';
import { Empty, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { mostPopular, videoCategories } from '../../integrations/youtube/api';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { SectionHead, VideoTracks } from './parts';
import { TermChips, useAsync } from './shared';

export function Trending({ onExplore, canRead }: { onExplore: (term: string) => void; canRead: boolean }) {
  const { t } = useI18n();
  const { youtube } = useIntegrations();
  const [cat, setCat] = useState('');
  const cats = useAsync(useCallback(() => videoCategories(), []));
  const pop = useAsync(useCallback((c: string, fresh: boolean) => mostPopular(c || undefined, fresh), []));
  useEffect(() => {
    if (!canRead) return;
    void cats.run();
    void pop.run('', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);
  const tags = useMemo(() => (pop.data ? commonTags(pop.data.data) : []), [pop.data]);
  return (
    <div className="stack-l">
      <div className="row">
        <div className="chips" role="group" aria-label={t('research.category')}>
          {[{ id: '', title: t('research.allCategories') }, ...(cats.data?.data ?? [])].slice(0, 16).map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={cat === c.id}
              disabled={!canRead}
              onClick={() => {
                setCat(c.id);
                void pop.run(c.id, false);
              }}
            >
              {c.title}
            </button>
          ))}
        </div>
      </div>
      <p className="seo-cost">{t('research.trendingNote', { region: youtube.region })}</p>
      <ErrorNotice error={cats.error ?? pop.error} />
      {pop.loading && !pop.data && <Skeleton lines={6} />}
      {!canRead && <Empty icon="trend" title={t('research.tab.trending')}>{t('seo.needAccessShort')}</Empty>}
      {pop.data && (
        <div className="seo-split">
          <section className="seo-section" aria-labelledby="tr-h">
            <SectionHead id="tr-h" title={t('research.tab.trending')} />
            <VideoTracks videos={pop.data.data} label={t('research.tab.trending')} />
          </section>
          {tags.length > 0 && (
            <aside className="seo-section" aria-labelledby="tr-tags">
              <SectionHead id="tr-tags" title={t('research.commonTags')} sub={t('research.chipHelp')} />
              <TermChips label={t('research.commonTags')} items={tags} onPick={onExplore} />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
