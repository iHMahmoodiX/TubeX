// Up to three keywords side by side: score, sub-signals and the sample numbers behind them.
import { useState, type ReactNode } from 'react';
import { band } from '../../domain/seo';
import { Icon } from '../../components/icons';
import { Button, Empty, Score } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ErrorNotice } from '../connections/ErrorNotice';
import { BAND_KEY } from './Explore';
import { loadKeyword, type KeywordData } from './keywordData';
import { useFormat } from './shared';

export const MAX_COMPARE = 3;

type Row = { label: string; value: (d: KeywordData) => number | undefined; show: (d: KeywordData) => ReactNode; better: 'high' | 'low' };

export function Compare({ terms, setTerms, onExplore, canRead }: { terms: string[]; setTerms: (t: string[]) => void; onExplore: (term: string) => void; canRead: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const [input, setInput] = useState('');
  const [data, setData] = useState<Record<string, KeywordData>>({});
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  const add = () => {
    const k = input.trim();
    if (!k || terms.length >= MAX_COMPARE || terms.some((x) => x.toLowerCase() === k.toLowerCase())) return;
    setTerms([...terms, k]);
    setInput('');
  };
  const run = async () => {
    setLoading(true);
    for (const k of terms) {
      if (data[k]) continue;
      try {
        const d = await loadKeyword(k);
        setData((all) => ({ ...all, [k]: d }));
        setErrors(({ [k]: _, ...rest }) => rest);
      } catch (e) {
        setErrors((all) => ({ ...all, [k]: e }));
        break; // quota or key problems would repeat for every keyword
      }
    }
    setLoading(false);
  };
  const missing = terms.filter((k) => !data[k]);
  const loaded = terms.filter((k) => data[k]);
  const rows: Row[] = [
    { label: t('seo.part.demand'), value: (d) => d.score.parts.demand.score, show: (d) => f.int(d.score.parts.demand.score), better: 'high' },
    { label: t('seo.part.competition'), value: (d) => d.score.parts.competition.score, show: (d) => f.int(d.score.parts.competition.score), better: 'low' },
    { label: t('seo.part.chance'), value: (d) => d.score.parts.chance.score ?? undefined, show: (d) => (d.score.parts.chance.score === null ? '—' : f.int(d.score.parts.chance.score)), better: 'high' },
    { label: t('research.medianViews'), value: (d) => d.score.parts.competition.medianViews, show: (d) => f.compact(d.score.parts.competition.medianViews), better: 'high' },
    { label: t('seo.compare.vpd'), value: (d) => d.score.parts.demand.medianViewsPerDay, show: (d) => f.compact(d.score.parts.demand.medianViewsPerDay), better: 'high' },
    { label: t('seo.part.medianSubs'), value: (d) => d.score.parts.competition.medianSubscribers, show: (d) => f.compact(d.score.parts.competition.medianSubscribers), better: 'low' },
    { label: t('seo.part.exact'), value: (d) => d.score.parts.competition.exactShare, show: (d) => f.pct(d.score.parts.competition.exactShare), better: 'low' },
    { label: t('seo.part.recent90'), value: (d) => d.score.parts.demand.recentShare, show: (d) => f.pct(d.score.parts.demand.recentShare), better: 'high' },
    {
      label: t('seo.part.myRank'),
      value: (d) => (d.score.parts.chance.myPositions[0] === undefined ? undefined : -d.score.parts.chance.myPositions[0]),
      show: (d) => (d.score.parts.chance.myPositions[0] === undefined ? '—' : `#${f.int(d.score.parts.chance.myPositions[0])}`),
      better: 'high',
    },
  ];
  const best = (r: Row): string | undefined => {
    const vals = loaded.map((k) => [k, r.value(data[k]!)] as const).filter((x): x is readonly [string, number] => x[1] !== undefined);
    if (vals.length < 2) return undefined;
    return [...vals].sort((a, b) => (r.better === 'high' ? b[1] - a[1] : a[1] - b[1]))[0]![0];
  };

  return (
    <div className="stack-l">
      <form
        className="seo-searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="search-wrap">
          <Icon name="plus" />
          <input className="input" dir="auto" aria-label={t('seo.compare.input')} placeholder={t('seo.compare.input')} value={input} onChange={(e) => setInput(e.target.value)} disabled={terms.length >= MAX_COMPARE} />
        </div>
        <Button type="submit" disabled={!input.trim() || terms.length >= MAX_COMPARE}>
          {t('seo.compare.addShort')}
        </Button>
        <Button variant="primary" disabled={!missing.length || loading || !canRead} onClick={() => void run()}>
          {loading ? t('common.loading') : t('seo.compare.run')}
        </Button>
      </form>
      <div className="row">
        {terms.map((k) => (
          <span key={k} className="chip" style={{ paddingInlineEnd: 4 }}>
            <bdi>{k}</bdi>
            <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={t('seo.compare.remove', { k })} onClick={() => setTerms(terms.filter((x) => x !== k))}>
              <Icon name="x" />
            </button>
          </span>
        ))}
        <span className="seo-cost">{missing.length ? t('seo.compare.cost', { n: missing.length * 102 }) : t('seo.compare.max', { n: MAX_COMPARE })}</span>
      </div>
      {Object.entries(errors).map(([k, e]) => (
        <ErrorNotice key={k} error={e} />
      ))}
      {!terms.length && (
        <Empty icon="sort" title={t('seo.compare.emptyTitle')}>
          {t('seo.compare.emptyHelp', { n: MAX_COMPARE })}
        </Empty>
      )}
      {loaded.length > 0 && (
        <div className="table-wrap card">
          <table className="table seo-compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">{t('research.keyword')}</span>
                </th>
                {loaded.map((k) => (
                  <th key={k} scope="col">
                    <button type="button" className="item-button" dir="auto" onClick={() => onExplore(k)}>
                      {k}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  {t('seo.score')} <span className="xsmall faint">({t('seo.estimate')})</span>
                </th>
                {loaded.map((k) => {
                  const d = data[k]!;
                  const b = band(d.score.score);
                  return (
                    <td key={k}>
                      <div className="stack-s" style={{ alignItems: 'center' }}>
                        <Score value={d.score.sampleSize ? d.score.score : null} label={`${t('seo.score')} ${k}`} />
                        {b && (
                          <span className="seo-band xsmall" data-band={b}>
                            {t(BAND_KEY[b])}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
              {rows.map((r) => {
                const win = best(r);
                return (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    {loaded.map((k) => (
                      <td key={k} data-best={win === k || undefined}>
                        {r.show(data[k]!)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="xsmall faint" style={{ padding: 8 }}>
            {t('seo.compare.note')}
          </p>
        </div>
      )}
    </div>
  );
}
