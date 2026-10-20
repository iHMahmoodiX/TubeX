// SEO tab of the watch card: TubeX's checklist score with ✓ / ! / × items and the keyword it is checked against.
import { useEffect, useState } from 'react';
import { Score } from '../../components/ui';
import type { SeoItem, SeoResult } from '../../domain/inpage';
import type { VideoInfo } from '../../integrations/youtube/api';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { CheckRow } from '../common';

export function SeoChecklist({ items }: { items: SeoItem[] }) {
  const { t } = useI18n();
  return (
    <ul className="checks tx-checks">
      {items.map((i) => (
        <CheckRow key={i.id} state={i.state}>
          {t(`inpage.seo.${i.id}.${i.state}` as MessageKey, i.values)}
        </CheckRow>
      ))}
    </ul>
  );
}

export function WatchSeo({ v, seo, keyword, keywordSource, onKeyword }: { v: VideoInfo; seo: SeoResult; keyword: string; keywordSource: 'saved' | 'first-tag' | 'none'; onKeyword: (k: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(keyword);
  useEffect(() => setDraft(keyword), [keyword]);
  void v;
  return (
    <div className="stack">
      <div className="tx-seo-top">
        <Score value={seo.score} large label={t('inpage.seo.score')} />
        <div className="stack-s grow">
          <form
            className="row tx-kw"
            onSubmit={(e) => {
              e.preventDefault();
              onKeyword(draft.trim());
            }}
          >
            <label className="small bold" htmlFor="tx-seo-kw">
              {t('inpage.seo.keyword')}
            </label>
            <input id="tx-seo-kw" className="input tx-input" dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft.trim() !== keyword && onKeyword(draft.trim())} placeholder={t('inpage.seo.keywordPh')} maxLength={100} />
          </form>
          <span className="xsmall muted">{keywordSource === 'first-tag' ? t('inpage.seo.kwFromTag') : keywordSource === 'saved' ? t('inpage.seo.kwSaved') : t('inpage.seo.kwNone')}</span>
        </div>
      </div>
      <SeoChecklist items={seo.items} />
      <p className="xsmall faint">{t('inpage.seo.disclaimer')}</p>
    </div>
  );
}
