// Thumbnail and title in the places viewers meet them (#13): desktop home grid, search results, mobile feed and
// the up-next sidebar, in dark or light theme, optionally next to real public results for a search (one search
// call, on click). A visual mockup only: it says nothing about future CTR.
import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Button, Notice } from '../../components/ui';
import { placeAmong } from '../../domain/experiments';
import { useI18n } from '../../i18n';
import { searchSample, type VideoInfo } from '../../integrations/youtube/api';
import { ErrorNotice } from '../connections/ErrorNotice';
import './context.css';

export interface Candidate {
  key: string;
  label: string;
  title: string;
  thumb?: string;
}

interface Card {
  key: string;
  own: boolean;
  label?: string;
  title: string;
  thumb?: string;
  channel: string;
  meta: string;
}

const CONTEXTS = ['home', 'search', 'mobile', 'sidebar'] as const;
type Ctx = (typeof CONTEXTS)[number];

export function ContextPreview({ candidates, language, channelName, defaultQuery = '' }: { candidates: Candidate[]; language: 'fa' | 'en'; channelName?: string; defaultQuery?: string }) {
  const { t } = useI18n();
  const [ctx, setCtx] = useState<Ctx>('home');
  const [dark, setDark] = useState(true);
  const [query, setQuery] = useState(defaultQuery);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [others, setOthers] = useState<VideoInfo[]>([]);

  const load = async () => {
    setAsking(false);
    setBusy(true);
    setError(null);
    try {
      const r = await searchSample(query, { max: 8 });
      setOthers(r.videos.filter((v) => v.thumbnail).slice(0, 7));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const own: Card[] = candidates.map((c) => ({ key: c.key, own: true, label: c.label, title: c.title || t('draft.untitled'), thumb: c.thumb, channel: channelName || t('tctx.you'), meta: t('tctx.meta.own') }));
  const rest: Card[] = others.map((v) => ({ key: v.id, own: false, title: v.title, thumb: v.thumbnail, channel: v.channelTitle, meta: '' }));
  const cards = rest.length ? placeAmong(own, rest, candidates.map((c) => c.key).join()) : own;

  return (
    <div className="stack-s" data-testid="context-preview">
      <div className="row">
        <div className="row" role="group" aria-label={t('tctx.where')}>
          {CONTEXTS.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={ctx === c} onClick={() => setCtx(c)}>
              {t(`tctx.${c}`)}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
          <span>{t('thumb.dark')}</span>
        </label>
      </div>
      <div className={`ctx ctx-${ctx}`} data-dark={dark} lang={language}>
        {cards.map((c) => (
          <figure key={c.key} className="ctx-card" data-own={c.own}>
            <div className="ctx-thumb">
              {c.thumb ? <img src={c.thumb} alt="" loading="lazy" /> : <span className="ctx-nothumb">{t('tctx.noThumb')}</span>}
              <span className="ctx-time" aria-hidden="true">
                12:34
              </span>
              {c.own && c.label && <span className="ctx-label">{c.label}</span>}
            </div>
            <figcaption>
              <span className="ctx-title" dir="auto">
                {c.title}
              </span>
              <span className="ctx-channel" dir="auto">
                {c.channel}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="row">
        <input className="input" dir="auto" style={{ maxWidth: 260 }} aria-label={t('tctx.query')} placeholder={t('tctx.query')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {asking ? (
          <>
            <span className="small">{t('tctx.cost')}</span>
            <Button size="s" variant="primary" onClick={() => void load()}>
              {t('tctx.load')}
            </Button>
            <Button size="s" variant="ghost" onClick={() => setAsking(false)}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <Button size="s" disabled={!query.trim() || busy} onClick={() => setAsking(true)}>
            <Icon name="search" />
            {busy ? t('common.loading') : t('tctx.compare')}
          </Button>
        )}
        {others.length > 0 && (
          <Button size="s" variant="ghost" onClick={() => setOthers([])}>
            {t('tctx.clear')}
          </Button>
        )}
      </div>
      <ErrorNotice error={error} />
      <Notice>{t('tctx.disclaimer')}</Notice>
    </div>
  );
}
