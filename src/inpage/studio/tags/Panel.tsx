// Compact, page-aware panel for the TubeX drawer on Studio's video details page: SEO score, tag count and
// characters, rank summary and quick actions that lead to the tools at the Tags field. Null on other pages.
import { useMemo } from 'react';
import { Icon } from '../../../components/icons';
import { Score } from '../../../components/ui';
import { useToast } from '../../../components/toasts';
import { videoSeo } from '../../../domain/inpage';
import { LIMITS, tagsCharCount } from '../../../domain/metadata';
import { useI18n } from '../../../i18n';
import { rpc } from '../../../platform/rpc';
import { copyText, useFmt } from '../../common';
import { scrollToTags } from './dom';
import { mainPhrase, ranksFor } from './logic';
import { openKeywordPop, useRanks, useTargetKeyword } from './store';
import { onEditorPage, useEditor } from './useEditor';

export function TagToolsPanel() {
  const { videoId, values } = useEditor();
  if (!videoId || !onEditorPage()) return null;
  return <PanelBody videoId={videoId} values={values} />;
}

function PanelBody({ videoId, values }: { videoId: string; values: ReturnType<typeof useEditor>['values'] }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const [saved] = useTargetKeyword(videoId);
  const [ranks] = useRanks(videoId);
  const keyword = saved.trim() || mainPhrase(values.title);
  const seo = useMemo(() => videoSeo({ title: values.title, description: values.description, tags: values.tags, keyword }), [values, keyword]);
  const chars = tagsCharCount(values.tags);
  const r = ranksFor(values.tags, ranks);

  const tile = (icon: Parameters<typeof Icon>[0]['name'], label: string, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void, disabled = false) => (
    <button type="button" className="tx-tile" disabled={disabled} onClick={onClick}>
      <span className="tx-tile-icon">
        <Icon name={icon} />
      </span>
      <strong>{label}</strong>
    </button>
  );

  return (
    <section className="stack-s tt-drawer" aria-label={t('tt.panel')}>
      <div className="tx-head">
        <Score value={values.found.title ? seo.score : null} label={t('inpage.seo.score')} />
        <span className="stack-s grow" style={{ gap: 0 }}>
          <strong className="small">{t('tt.panel')}</strong>
          <span className="xsmall muted">{t('tt.count', { n: values.tags.length, chars, max: LIMITS.tagsChars })}</span>
        </span>
      </div>
      <div className="tx-metrics">
        <span className="tx-metric">
          <b className="num-t">{values.found.tags ? f.int(values.tags.length) : '—'}</b>
          <span>{t('tt.panel.tags')}</span>
        </span>
        <span className="tx-metric" title={t('tt.legend')}>
          <b className="num-t">{r.checked ? f.int(r.top10) : '—'}</b>
          <span>{t('tt.panel.top10')}</span>
        </span>
        <span className="tx-metric">
          <b className="num-t" dir="auto">
            {keyword || '—'}
          </b>
          <span>{t('tt.target')}</span>
        </span>
      </div>
      {!values.found.tags && <p className="xsmall muted">{t('inpage.studio.tagsHidden')}</p>}
      <div className="tx-actions">
        {tile('tag', t('tt.panel.goTools'), () => {
          if (!scrollToTags(document)) toast(t('inpage.studio.tagsHidden'));
        })}
        {tile('copy', t('tt.copyAll'), async () => toast((await copyText(values.tags.join(', '))) ? t('tt.copied', { n: values.tags.length }) : t('common.copyFailed')), !values.tags.length)}
        {tile('search', t('tt.explorer'), (e) => openKeywordPop(keyword || values.tags[0] || '', e.currentTarget), !keyword && !values.tags.length)}
        {tile('external', t('tt.fullResearch'), () => void rpc('ui.openWorkspace', 'research', keyword || undefined))}
      </div>
    </section>
  );
}
