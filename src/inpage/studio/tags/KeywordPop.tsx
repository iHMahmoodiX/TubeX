// Keyword popover (TubeX's Keyword Explorer in miniature): opens on a double-clicked tag chip, a suggestion's
// research button or the Tag Tools bar. Shows the keyword score with its parts, this video's rank for it, related
// terms (add to the field or research them) and a link to the full Research page. Research costs about 102 units
// unless cached; the popover says so and waits for a click, and runs on its own only when the result is cached.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/icons';
import { Button, Score } from '../../../components/ui';
import { useToast } from '../../../components/toasts';
import { KEYWORD_SCORE_UNITS } from '../../../domain/inpage';
import { useI18n } from '../../../i18n';
import { rpc } from '../../../platform/rpc';
import { studioEditorRoot } from '../../../platform/youtubeDomInpage';
import { canReadYt, copyText, InError, SetupNeeded, useFmt, useStatus } from '../../common';
import { useInpageEnabled } from '../../InpageRoot';
import { addTags } from '../fields';
import { norm, rankLabel } from './logic';
import { closeKeywordPop, editorVideoId, useKeywordPop, useKnownScores, useRanks, type PopTarget } from './store';
import { refreshEditorValues, useEditorValues } from './useEditor';

export interface Research {
  keyword: string;
  score: number | null;
  parts: { competition?: number | null; demand?: number | null; chance?: number | null };
  sampleSize?: number;
  fetchedAt?: string;
  fromCache?: boolean;
  related: string[];
  topTags: { tag: string; count: number }[];
  ownPositions?: number[];
}

/** Keyword research through the background (one cached call per keyword per page). */
const memo = new Map<string, Promise<Research>>();
export function research(keyword: string): Promise<Research> {
  const k = norm(keyword);
  let p = memo.get(k);
  if (!p) {
    p = rpc<Research>('tagTools.research', keyword.trim());
    memo.set(k, p);
    p.catch(() => memo.delete(k));
  }
  return p;
}

export function KeywordPop() {
  const on = useInpageEnabled('studioTags');
  const target = useKeywordPop();
  if (!on || !target) return null;
  return <Pop key={target.seq} target={target} />;
}

function Pop({ target }: { target: PopTarget }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const status = useStatus();
  const values = useEditorValues();
  const videoId = editorVideoId(location.href);
  const [ranks] = useRanks(videoId);
  const [, addScores] = useKnownScores();
  const [kw, setKw] = useState(target.keyword);
  const [input, setInput] = useState(target.keyword);
  const [data, setData] = useState<Research | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const readable = canReadYt(status);
  const inField = new Set(values.tags.map(norm));
  const rank = ranks[norm(kw)];

  const run = async (k: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await research(k);
      setData(r);
      addScores([{ keyword: k, score: r.score }]);
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };

  // Is this keyword's research cached (free)? Then show it right away.
  useEffect(() => {
    setData(null);
    setCached(null);
    setError(undefined);
    if (!readable || !kw) return;
    let live = true;
    void rpc<boolean[]>('tagTools.cached', [kw])
      .then(([c]) => {
        if (!live) return;
        setCached(!!c);
        if (c) void run(kw);
      })
      .catch(() => live && setCached(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kw, readable]);

  useLayoutEffect(() => {
    const place = () => {
      const r = target.rect;
      const w = Math.min(380, window.innerWidth - 16);
      const h = box.current?.offsetHeight ?? 420;
      const below = r.bottom + 8 + h < window.innerHeight || r.top < h + 16;
      const top = below ? Math.min(r.bottom + 8, window.innerHeight - h - 8) : r.top - 8 - h;
      setPos({ top: Math.max(8, top), left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [target, data, busy]);

  useEffect(() => {
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('input')?.focus());
    const away = (e: PointerEvent) => {
      const host = (box.current?.getRootNode() as ShadowRoot | undefined)?.host;
      if (host && e.composedPath().includes(host)) return;
      // A double-click on another chip re-opens with that tag (handled by its own listener).
      closeKeywordPop();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeKeywordPop();
    // The page scrolled (Studio scrolls an inner container): the anchor moved, so close.
    const scroll = (e: Event) => {
      const host = (box.current?.getRootNode() as ShadowRoot | undefined)?.host;
      if (host && e.composedPath().includes(host)) return;
      closeKeywordPop();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('scroll', scroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', esc, true);
      window.removeEventListener('scroll', scroll, { capture: true });
    };
  }, []);

  const add = (tags: string[]) => {
    const root = studioEditorRoot(document);
    const r = root ? addTags(root, tags) : ({ ok: false } as const);
    refreshEditorValues();
    if (!r.ok) return toast(t('inpage.studio.noTags'));
    toast([t('inpage.studio.tagsAdded', { n: r.added.length }), r.overLimit.length ? t('inpage.studio.tagsOver', { n: r.overLimit.length }) : '', t('inpage.studio.reviewSave')].filter(Boolean).join(' '));
  };

  const part = (key: 'competition' | 'demand' | 'chance', label: string, hint: string) => {
    const v = data?.parts[key];
    return (
      <li title={hint}>
        <span className="xsmall muted">{label}</span>
        <b className="num-t small">{typeof v === 'number' ? f.num(v, 0) : '—'}</b>
      </li>
    );
  };

  return (
    <div
      ref={box}
      className="tx-pop tt-pop"
      role="dialog"
      aria-label={t('tt.popLabel', { k: kw })}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
    >
      <div className="tt-pop-head">
        <span className="tt-dot" aria-hidden="true">
          <Icon name="logo" />
        </span>
        <form
          className="tt-pop-form grow"
          onSubmit={(e) => {
            e.preventDefault();
            const v = input.trim();
            if (v && v !== kw) setKw(v);
          }}
        >
          <input className="input tx-input" dir="auto" value={input} maxLength={200} aria-label={t('tt.popInput')} onChange={(e) => setInput(e.target.value)} />
          <button type="submit" className="tt-icon" aria-label={t('tt.research')} title={t('tt.research')}>
            <Icon name="search" />
          </button>
        </form>
        <button type="button" className="tt-icon" aria-label={t('common.close')} title={t('common.close')} onClick={closeKeywordPop}>
          <Icon name="x" />
        </button>
      </div>

      {target.fromField && rank && (
        <p className="small tt-pop-rank">
          <Icon name="trophy" />
          {rank.rank === null ? t('tt.badgeOut', { tag: kw }) : t('tt.badgeIn', { tag: kw, n: rankLabel(rank, (n) => f.int(n)) ?? '—' })}
        </p>
      )}

      {status && !readable && <SetupNeeded />}
      {readable && !data && !busy && cached === false && (
        <div className="tx-confirm" role="group" aria-label={t('tt.research')}>
          <Icon name="info" />
          <p className="grow small">{t('tt.researchCost', { k: kw, units: f.int(KEYWORD_SCORE_UNITS + 1) })}</p>
          <Button size="s" variant="primary" onClick={() => void run(kw)}>
            {t('tt.research')}
          </Button>
        </div>
      )}
      {(busy || (readable && cached === null)) && <span className="skel tx-skel-line" aria-busy="true" />}
      {error !== undefined && <InError error={error} onRetry={() => void run(kw)} />}

      {data && (
        <>
          <div className="tt-pop-score">
            <Score value={data.score} label={t('tt.score')} />
            <span className="stack-s grow" style={{ gap: 0 }}>
              <strong className="small">{t('tt.score')}</strong>
              <span className="xsmall muted">
                {data.sampleSize !== undefined && t('inpage.search.sample', { n: data.sampleSize })}
                {data.fetchedAt && ` · ${f.date(data.fetchedAt)}`}
              </span>
            </span>
          </div>
          <ul className="tx-parts">
            {part('demand', t('tt.part.demand'), t('tt.part.demandHint'))}
            {part('competition', t('tt.part.competition'), t('tt.part.competitionHint'))}
            {part('chance', t('tt.part.chance'), t('tt.part.chanceHint'))}
          </ul>
          {data.related.length > 0 && (
            <>
              <span className="xsmall bold">{t('tt.related')}</span>
              <ul className="tt-sugg" aria-label={t('tt.related')}>
                {data.related.map((r) => (
                  <li key={r} className="tt-sugg-chip">
                    <button type="button" className="tt-sugg-add" dir="auto" disabled={inField.has(norm(r))} onClick={() => add([r])} aria-label={t('inpage.studio.addTag', { tag: r })} title={t('inpage.studio.addTag', { tag: r })}>
                      <Icon name={inField.has(norm(r)) ? 'check' : 'plus'} />
                      <bdi>{r}</bdi>
                    </button>
                    <button
                      type="button"
                      className="tt-sugg-research"
                      aria-label={t('tt.researchTag', { tag: r })}
                      title={t('tt.researchTag', { tag: r })}
                      onClick={() => {
                        setInput(r);
                        setKw(r);
                      }}
                    >
                      <Icon name="search" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="xsmall faint">{t('tt.scoreNote')}</p>
        </>
      )}

      <div className="row tt-pop-actions">
        {!inField.has(norm(kw)) && (
          <Button size="s" onClick={() => add([kw])}>
            <Icon name="plus" />
            {t('tt.addToField')}
          </Button>
        )}
        <Button size="s" variant="ghost" onClick={async () => toast((await copyText(kw)) ? t('common.copied') : t('common.copyFailed'))}>
          <Icon name="copy" />
          {t('common.copy')}
        </Button>
        <span className="grow" />
        <Button size="s" onClick={() => void rpc('ui.openWorkspace', 'research', kw)}>
          <Icon name="external" />
          {t('tt.fullResearch')}
        </Button>
      </div>
    </div>
  );
}
