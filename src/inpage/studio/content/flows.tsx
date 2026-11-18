// Flows opened from the Content page tools: the related-video queue setup for selected Shorts (Studio hand-off)
// and "made for kids" for selected rows (API write with preview, confirmation, per-item results and undo).
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { Icon } from '../../../components/icons';
import { Button } from '../../../components/ui';
import { isShortLength, KIDS_WRITE_COST, kidsPlan, kidsState, startQueue, studioEditUrl, type KidsBatch, type KidsState, type KidsVideo } from '../../../domain/coppa';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/en';
import { deserializeError, rpc, type SerializedError } from '../../../platform/rpc';
import { cachedRpc, forgetRpc, InError, Mark, useAsync, useFmt } from '../../common';
import type { RowRef } from './dom';

export const QUEUE_KEY = 'inpage.sc.relatedQueue';

/** A floating TubeX panel next to Studio's list. Esc closes it; it never covers Studio's Save. */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => (ref.current?.querySelector('button, input, [tabindex="0"]') as HTMLElement | null)?.focus());
  }, []);
  return (
    <div
      ref={ref}
      className={`sc-sheet${wide ? ' sc-sheet-wide' : ''}`}
      role="dialog"
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="sc-sheet-head">
        <Mark />
        <h2 id={id} className="sc-sheet-title">
          {title}
        </h2>
        <span className="grow" />
        <button type="button" className="icon-btn tx-toggle" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="sc-sheet-body">{children}</div>
    </div>
  );
}

function SelectedList({ rows, max = 6 }: { rows: { id: string; title: string }[]; max?: number }) {
  const { t } = useI18n();
  const f = useFmt();
  return (
    <ul className="sc-mini">
      {rows.slice(0, max).map((r) => (
        <li key={r.id}>
          <img src={`https://i.ytimg.com/vi/${r.id}/default.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" />
          <bdi className="truncate">{r.title}</bdi>
        </li>
      ))}
      {rows.length > max && <li className="xsmall muted">{t('sc.andMore', { n: f.int(rows.length - max) })}</li>}
    </ul>
  );
}

/** The honest limitation, stated where the flow starts and on each Short's page. */
export function RelatedLimit() {
  const { t } = useI18n();
  return (
    <div className="tx-note tx-note-warn">
      <Icon name="info" />
      <span className="grow small">{t('sc.rel.limit')}</span>
    </div>
  );
}

// ---------------------------------------------------------------- related video (Shorts)

export function RelatedSetup({ shorts, tabIsShorts, initialMode = 'add', onClose }: { shorts: RowRef[]; tabIsShorts: boolean; initialMode?: 'add' | 'clear'; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const [mode, setMode] = useState<'add' | 'clear'>(initialMode);
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  const qid = useId();
  const own = useAsync(mode === 'add' && shorts.length ? 'sc.myVideos' : null, () => cachedRpc<KidsVideo[]>(10 * 60_000, 'studioContent.myVideos'));
  const picks = useMemo(() => {
    const skip = new Set(shorts.map((s) => s.id));
    const needle = q.trim().toLowerCase();
    return (own.data ?? []).filter((v) => !skip.has(v.id) && (!needle || v.title.toLowerCase().includes(needle) || v.id === q.trim())).slice(0, 40);
  }, [own.data, q, shorts]);

  const start = async () => {
    const queue = startQueue(mode, shorts, target ?? undefined, new Date(), location.href);
    if (!queue.items.length) return;
    await browser.storage.local.set({ [QUEUE_KEY]: queue });
    location.assign(studioEditUrl(queue.items[0]!.id));
  };

  return (
    <Sheet title={t('sc.rel.title')} onClose={onClose} wide>
      {!shorts.length ? (
        <div className="tx-empty">
          <Icon name="video" />
          <p>{t(tabIsShorts ? 'sc.rel.selectFirst' : 'sc.rel.shortsTab')}</p>
        </div>
      ) : (
        <div className="stack-s">
          <div className="sc-seg" role="group" aria-label={t('sc.rel.mode')}>
            <button type="button" aria-pressed={mode === 'add'} onClick={() => setMode('add')}>
              {t('sc.rel.add')}
            </button>
            <button type="button" aria-pressed={mode === 'clear'} onClick={() => setMode('clear')}>
              {t('sc.rel.clear')}
            </button>
          </div>
          <RelatedLimit />
          <p className="small bold">{t('sc.rel.queue', { n: f.int(shorts.length) })}</p>
          <SelectedList rows={shorts} />
          {mode === 'add' && (
            <div className="stack-s">
              <label className="small bold" htmlFor={qid}>
                {t('sc.rel.pickTarget')}
              </label>
              <input id={qid} className="input tx-input" type="search" dir="auto" value={q} placeholder={t('sc.rel.searchPh')} onChange={(e) => setQ(e.target.value)} />
              <p className="xsmall faint">{t('sc.rel.cost')}</p>
              {own.error !== undefined && <InError error={own.error} onRetry={own.reload} />}
              {own.loading && !own.data && <span className="skel tx-skel-line" aria-busy="true" />}
              {own.data && (
                <div className="sc-picks" role="radiogroup" aria-label={t('sc.rel.pickTarget')}>
                  {picks.length === 0 && <p className="small muted">{t('sc.rel.noMatch')}</p>}
                  {picks.map((v) => (
                    <button key={v.id} type="button" role="radio" aria-checked={target?.id === v.id} className="sc-pick" onClick={() => setTarget({ id: v.id, title: v.title })}>
                      <img src={v.thumbnail ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      <span className="stack-s grow" style={{ gap: 0, minWidth: 0 }}>
                        <bdi className="truncate bold small">{v.title}</bdi>
                        <span className="xsmall muted">
                          {isShortLength(v.durationSec) ? t('sc.kind.short') : t('sc.kind.video')} · {v.privacy ? t(`mc.privacy.${v.privacy}` as MessageKey) : '—'}
                        </span>
                      </span>
                      {target?.id === v.id && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="row">
            <Button variant="primary" size="s" disabled={mode === 'add' && !target} onClick={() => void start()}>
              <Icon name="play" />
              {t('sc.rel.start')}
            </Button>
            <Button size="s" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          </div>
          <p className="xsmall muted">{mode === 'add' && target ? t('sc.rel.startHelpAdd', { title: target.title }) : t('sc.rel.startHelpClear')}</p>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- made for kids

interface ApplyOut {
  results: { videoId: string; title: string; ok: boolean; changed: boolean; kept?: boolean; error?: SerializedError }[];
  batch?: KidsBatch;
  stopped: boolean;
}

export function StateChip({ state }: { state: KidsState }) {
  const { t } = useI18n();
  return <span className={`tx-badge sc-kids-${state}`}>{t(`sc.kids.state.${state}` as MessageKey)}</span>;
}

/** Per-item outcome list for a write or an undo. */
export function Results({ out, titles }: { out: ApplyOut; titles: Map<string, string> }) {
  const { t } = useI18n();
  const f = useFmt();
  const changed = out.results.filter((r) => r.ok && r.changed).length;
  const failed = out.results.filter((r) => !r.ok).length;
  return (
    <div className="stack-s" role="status">
      <p className="small bold">{t('sc.kids.done', { changed: f.int(changed), same: f.int(out.results.length - changed - failed), failed: f.int(failed) })}</p>
      <ul className="sc-results">
        {out.results.map((r) => (
          <li key={r.videoId} data-ok={r.ok}>
            <span className="sc-res-mark" aria-hidden="true">
              {!r.ok ? '×' : r.changed ? '✓' : '='}
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <bdi className="truncate small">{r.title || titles.get(r.videoId) || r.videoId}</bdi>
              <span className="sr-only">{!r.ok ? t('checks.error') : r.changed ? t('sc.kids.changed') : t('sc.kids.unchanged')}</span>
              {r.kept && <span className="xsmall muted tx-detail">{t('sc.kids.kept')}</span>}
              {r.error && <InError error={deserializeError(r.error)} />}
            </span>
          </li>
        ))}
      </ul>
      {out.stopped && <p className="small tx-warn">{t('sc.kids.stopped')}</p>}
    </div>
  );
}

export function KidsFlow({ rows, initialValue = null, onClose }: { rows: RowRef[]; initialValue?: boolean | null; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const [value, setValue] = useState<boolean | null>(initialValue);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<ApplyOut | null>(null);
  const [undoOut, setUndoOut] = useState<ApplyOut | null>(null);
  const [error, setError] = useState<unknown>();
  const ids = rows.map((r) => r.id);
  // Fresh read of the live status: the preview (1 unit per 50 videos).
  const live = useAsync(value === null ? null : `kids:${ids.join(',')}`, () => rpc<KidsVideo[]>('studioContent.kidsStatus', ids));
  const plan = live.data && value !== null ? kidsPlan(live.data, value) : null;
  const missing = live.data ? rows.filter((r) => !live.data!.some((v) => v.id === r.id)) : [];
  const titles = new Map(rows.map((r) => [r.id, r.title]));

  const apply = async () => {
    if (!plan || value === null) return;
    setConfirm(false);
    setBusy(true);
    setError(undefined);
    try {
      setOut(await rpc<ApplyOut>('studioContent.kidsApply', plan.change.map((v) => v.id), value));
      forgetRpc('studioContent.myVideos');
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };
  const undo = async () => {
    if (!out?.batch) return;
    setBusy(true);
    setError(undefined);
    try {
      setUndoOut(await rpc<ApplyOut>('studioContent.kidsUndo', out.batch.id));
      forgetRpc('studioContent.myVideos');
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };

  return (
    <Sheet title={t('sc.kids.title')} onClose={onClose} wide>
      <div className="stack-s">
        <p className="small muted">{t('sc.kids.intro', { n: f.int(rows.length) })}</p>
        {!out && (
          <div className="sc-seg" role="group" aria-label={t('sc.kids.title')}>
            <button type="button" aria-pressed={value === true} disabled={busy} onClick={() => (setValue(true), setConfirm(false))}>
              {t('sc.kids.setYes')}
            </button>
            <button type="button" aria-pressed={value === false} disabled={busy} onClick={() => (setValue(false), setConfirm(false))}>
              {t('sc.kids.setNo')}
            </button>
          </div>
        )}
        {value === true && !out && (
          <div className="tx-note tx-note-warn">
            <Icon name="alert" />
            <span className="grow small">{t('sc.kids.yesEffects')}</span>
          </div>
        )}
        {live.error !== undefined && <InError error={live.error} onRetry={live.reload} />}
        {live.loading && <span className="skel tx-skel-line" aria-busy="true" />}
        {plan && !out && (
          <>
            <p className="small bold">{t('sc.kids.preview', { change: f.int(plan.change.length), same: f.int(plan.same.length) })}</p>
            <ul className="sc-results">
              {live.data!.map((v) => {
                const willChange = plan.change.includes(v);
                return (
                  <li key={v.id} data-off={!willChange}>
                    <bdi className="truncate small grow">{v.title}</bdi>
                    <StateChip state={kidsState(v)} />
                    <Icon name="chevron" className="icon sc-arrow" />
                    <StateChip state={willChange ? (value ? 'yes' : 'no') : kidsState(v)} />
                  </li>
                );
              })}
            </ul>
            {missing.length > 0 && <p className="xsmall tx-warn">{t('sc.kids.missing', { n: f.int(missing.length) })}</p>}
            {plan.change.length > 0 && (
              <div className="row">
                <span className="tx-badge" title={t('engage.cost.help')}>
                  <Icon name="pulse" />
                  {t('engage.cost.units', { n: f.int(plan.change.length * KIDS_WRITE_COST) })}
                </span>
                {!confirm && (
                  <Button size="s" variant="primary" disabled={busy} onClick={() => setConfirm(true)}>
                    {t(value ? 'sc.kids.applyYes' : 'sc.kids.applyNo', { n: f.int(plan.change.length) })}
                  </Button>
                )}
              </div>
            )}
            {confirm && (
              <div className="tx-confirm" role="group" aria-label={t('sc.kids.title')}>
                <Icon name="alert" />
                <p className="grow small">{t(value ? 'sc.kids.confirmYes' : 'sc.kids.confirmNo', { n: f.int(plan.change.length) })}</p>
                <Button size="s" variant="primary" autoFocus onClick={() => void apply()}>
                  {t('sc.kids.confirmGo')}
                </Button>
                <Button size="s" variant="ghost" onClick={() => setConfirm(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </>
        )}
        {busy && <span className="skel tx-skel-line" aria-busy="true" />}
        {error !== undefined && <InError error={error} />}
        {out && <Results out={out} titles={titles} />}
        {out?.batch && !undoOut && (
          <div className="row">
            <Button size="s" disabled={busy} onClick={() => void undo()}>
              <Icon name="undo" />
              {t('sc.kids.undo', { n: f.int(out.batch.entries.length) })}
            </Button>
          </div>
        )}
        {undoOut && (
          <>
            <p className="small bold">{t('sc.kids.undone')}</p>
            <Results out={undoOut} titles={titles} />
          </>
        )}
        {out && <p className="xsmall muted">{t('sc.kids.refresh')}</p>}
      </div>
    </Sheet>
  );
}
