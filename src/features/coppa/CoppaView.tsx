// COPPA Center (#3): review and bulk-set "made for kids" on own videos, with preview, confirmation and undo.
// Reads status.madeForKids (YouTube's designation) and status.selfDeclaredMadeForKids (the channel's declaration);
// writes only the declaration, re-reading each video's live status first (src/integrations/google/kidsWrites.ts).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { filterKids, isShortLength, KIDS_MAX_BATCH, KIDS_WRITE_COST, kidsCounts, kidsOverridden, kidsPlan, kidsState, parseSelection, type KidsBatch, type KidsFilter, type KidsVideo, type KindFilter } from '../../domain/coppa';
import { Icon } from '../../components/icons';
import { Button, ConfirmButton, Empty, Notice, PageHeader, SearchInput, Skeleton, Stat, Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { applyKidsBatch, listKidsBatches, listKidsVideos, undoKidsBatch, type ItemResult } from '../../integrations/google/kidsWrites';
import { ErrorNotice } from '../connections/ErrorNotice';
import { Cost, SignInEmpty, Step, useOwnChannel } from '../bulk/engageKit';
import { useAsync, useFormat } from '../research/shared';
import '../bulk/engage.css';
import './coppa.css';

export function CoppaView() {
  const { t } = useI18n();
  const { channel, loaded } = useOwnChannel();
  return (
    <div className="stack-l" data-testid="coppa-view">
      <PageHeader kicker={t('shell.group.manage')} title={t('sc.coppa.title')} desc={t('sc.coppa.desc')} />
      {!loaded ? (
        <Skeleton lines={3} />
      ) : !channel ? (
        <SignInEmpty icon="shield" why="sc.coppa.signIn" />
      ) : !channel.uploadsPlaylistId ? (
        <Empty icon="video" title={t('sc.coppa.noUploads')} />
      ) : (
        <Center key={channel.channelId} channelId={channel.channelId} uploads={channel.uploadsPlaylistId} />
      )}
    </div>
  );
}

function KidsBadge({ v }: { v: KidsVideo }) {
  const { t } = useI18n();
  const s = kidsState(v);
  return (
    <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <span className={`badge coppa-${s}`}>{t(`sc.kids.state.${s}` as MessageKey)}</span>
      {kidsOverridden(v) && (
        <span className="badge badge-warning" title={t('sc.coppa.overriddenHelp')}>
          {t('sc.coppa.overridden')}
        </span>
      )}
    </span>
  );
}

interface Run {
  value: boolean;
  done: number;
  total: number;
  results: ItemResult[];
  stopped?: boolean;
  undo?: boolean;
}

function Center({ channelId, uploads }: { channelId: string; uploads: string }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const pre = useMemo(() => parseSelection(location.hash), []);
  const load = useCallback((fresh: boolean) => listKidsVideos(channelId, uploads, 500, fresh), [channelId, uploads]);
  const list = useAsync(load);
  const [state, setState] = useState<KidsFilter>('all');
  const [kind, setKind] = useState<KindFilter>(pre.tab === 'shorts' ? 'shorts' : 'all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pre.ids));
  const [value, setValue] = useState<boolean | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [batches, setBatches] = useState<KidsBatch[]>([]);
  const [shown, setShown] = useState(100);

  const refreshBatches = useCallback(() => void listKidsBatches(channelId).then(setBatches).catch(() => {}), [channelId]);
  useEffect(() => {
    void list.run(false);
    refreshBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const videos = list.data;
  const counts = useMemo(() => kidsCounts(videos ?? []), [videos]);
  const filtered = useMemo(() => filterKids(videos ?? [], { state, kind, query }), [videos, state, kind, query]);
  const chosen = useMemo(() => (videos ?? []).filter((v) => selected.has(v.id)), [videos, selected]);
  const plan = value === null ? null : kidsPlan(chosen, value);
  const running = !!run && run.done < run.total && !run.stopped;
  const preMissing = videos ? pre.ids.filter((id) => !videos.some((v) => v.id === id)).length : 0;

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const apply = async () => {
    if (!plan || value === null) return;
    const ids = plan.change.slice(0, KIDS_MAX_BATCH).map((v) => v.id);
    const r: Run = { value, done: 0, total: ids.length, results: [] };
    setRun({ ...r });
    const out = await applyKidsBatch(channelId, ids, value, (item) => {
      r.results.push(item);
      r.done++;
      setRun({ ...r, results: [...r.results] });
    });
    setRun({ ...r, results: out.results, done: out.results.length, total: out.stopped ? out.results.length : r.total, stopped: out.stopped });
    refreshBatches();
    void list.run(true);
  };

  const undo = async (b: KidsBatch) => {
    setRun({ value: !b.value, done: 0, total: b.entries.length, results: [], undo: true });
    try {
      const out = await undoKidsBatch(channelId, b.id);
      setRun({ value: !b.value, done: out.results.length, total: out.results.length, results: out.results, stopped: out.stopped, undo: true });
    } catch (e) {
      setRun({ value: !b.value, done: 1, total: 1, results: [{ videoId: '', title: '', ok: false, changed: false, error: e }], undo: true });
    }
    refreshBatches();
    void list.run(true);
  };

  const titles = new Map((videos ?? []).map((v) => [v.id, v.title]));
  const stateChips: { id: KidsFilter; label: MessageKey }[] = [
    { id: 'all', label: 'sc.coppa.f.all' },
    { id: 'yes', label: 'sc.kids.state.yes' },
    { id: 'no', label: 'sc.kids.state.no' },
    { id: 'unknown', label: 'sc.kids.state.unknown' },
  ];
  const kindChips: { id: KindFilter; label: MessageKey }[] = [
    { id: 'all', label: 'sc.coppa.k.all' },
    { id: 'videos', label: 'sc.coppa.k.videos' },
    { id: 'shorts', label: 'sc.coppa.k.shorts' },
  ];

  return (
    <div className="stack-l">
      {pre.ids.length > 0 && (
        <Notice tone="info">
          {t('sc.coppa.fromStudio', { n: f.int(pre.ids.length) })}
          {preMissing > 0 && <> {t('sc.coppa.fromStudioMissing', { n: f.int(preMissing) })}</>}
        </Notice>
      )}
      <div className="stats">
        <Stat label={t('sc.coppa.stat.total')} value={videos ? f.int(counts.all) : '—'} />
        <Stat label={t('sc.kids.state.yes')} value={videos ? f.int(counts.yes) : '—'} />
        <Stat label={t('sc.kids.state.no')} value={videos ? f.int(counts.no) : '—'} />
        <Stat label={t('sc.kids.state.unknown')} value={videos ? f.int(counts.unknown) : '—'} hint={t('sc.coppa.unknownHelp')} />
      </div>

      <div className="engage-flow">
        <Step n={1} title={t('sc.coppa.step1')} sub={t('sc.coppa.step1Sub', { n: f.int(selected.size) })} done={selected.size > 0} actions={
          <Button size="s" variant="ghost" disabled={list.loading} onClick={() => void list.run(true)}>
            <Icon name="refresh" />
            {t('sc.coppa.reload')}
          </Button>
        }>
          <div className="row">
            <div className="grow" style={{ minWidth: 200, maxWidth: 360 }}>
              <SearchInput value={query} onChange={setQuery} label={t('engage.picker.search')} placeholder={t('engage.picker.search')} />
            </div>
            <div className="chips" role="group" aria-label={t('sc.coppa.f.label')}>
              {stateChips.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={state === c.id} onClick={() => setState(c.id)}>
                  {t(c.label)}
                  <small className="num-t">{videos ? f.int(counts[c.id]) : '—'}</small>
                </button>
              ))}
            </div>
            <div className="chips" role="group" aria-label={t('sc.coppa.k.label')}>
              {kindChips.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={kind === c.id} onClick={() => setKind(c.id)} title={c.id === 'all' ? undefined : t('sc.coppa.k.help')}>
                  {t(c.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <Button size="s" variant="ghost" disabled={!filtered.length} onClick={() => setSelected((s) => new Set([...s, ...filtered.map((v) => v.id)]))}>
              {t('engage.picker.selectShown', { n: f.int(filtered.length) })}
            </Button>
            <Button size="s" variant="ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>
              {t('engage.picker.clear')}
            </Button>
            <span className="xsmall muted">{t('sc.coppa.cost')}</span>
          </div>
          <ErrorNotice error={list.error} />
          {!videos && list.loading && <Skeleton lines={6} />}
          {videos &&
            (filtered.length === 0 ? (
              <Empty icon="shield" title={t('engage.picker.none')} />
            ) : (
              <div className="tracks engage-pick-list" aria-label={t('sc.coppa.step1')}>
                {filtered.slice(0, shown).map((v, i) => {
                  const on = selected.has(v.id);
                  return (
                    <label key={v.id} className="track engage-pick" data-selected={on}>
                      <span className="track-n">
                        <input type="checkbox" checked={on} onChange={(e) => toggle(v.id, e.target.checked)} aria-label={v.title} />
                        <span className="engage-idx" aria-hidden="true">
                          {f.int(i + 1)}
                        </span>
                      </span>
                      <span className="track-main">
                        <Thumb videoId={v.id} src={v.thumbnail} />
                        <span className="stack-s grow" style={{ gap: 0, minWidth: 0 }}>
                          <span className="track-title truncate" dir="auto">
                            {v.title}
                          </span>
                          <span className="track-sub truncate">
                            {v.privacy ? t(`mc.privacy.${v.privacy}` as MessageKey) : '—'} · {f.age(v.publishedAt)} · {isShortLength(v.durationSec) ? t('sc.kind.short') : t('sc.kind.video')}
                          </span>
                        </span>
                      </span>
                      <span className="track-end small">
                        <KidsBadge v={v} />
                      </span>
                    </label>
                  );
                })}
                {filtered.length > shown && (
                  <div className="row" style={{ justifyContent: 'center', paddingBlock: 8 }}>
                    <Button size="s" onClick={() => setShown((n) => n + 100)}>
                      {t('engage.picker.more', { n: f.int(filtered.length - shown) })}
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </Step>

        <Step n={2} title={t('sc.coppa.step2')} sub={t('sc.coppa.step2Sub')} done={value !== null}>
          <div className="engage-seg" role="group" aria-label={t('sc.coppa.step2')}>
            <button type="button" aria-pressed={value === true} onClick={() => setValue(true)}>
              {t('sc.kids.setYes')}
            </button>
            <button type="button" aria-pressed={value === false} onClick={() => setValue(false)}>
              {t('sc.kids.setNo')}
            </button>
          </div>
          {value === true && <Notice tone="warning">{t('sc.kids.yesEffects')}</Notice>}
          <p className="small muted">{t('sc.coppa.law')}</p>
        </Step>

        <Step n={3} title={plan ? t('sc.coppa.step3n', { change: f.int(plan.change.length), same: f.int(plan.same.length) }) : t('sc.coppa.step3')} sub={t('sc.coppa.step3Sub')}>
          {plan && plan.change.length > 0 && (
            <div className="tracks">
              {plan.change.slice(0, 50).map((v) => (
                <div key={v.id} className="track">
                  <span className="track-main">
                    <Thumb videoId={v.id} src={v.thumbnail} width={56} />
                    <span className="track-title truncate grow" dir="auto">
                      {v.title}
                    </span>
                  </span>
                  <span className="track-end small row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                    <span className={`badge coppa-${kidsState(v)}`}>{t(`sc.kids.state.${kidsState(v)}` as MessageKey)}</span>
                    <Icon name="chevron" className="icon coppa-arrow" />
                    <span className={`badge coppa-${value ? 'yes' : 'no'}`}>{t(value ? 'sc.kids.state.yes' : 'sc.kids.state.no')}</span>
                  </span>
                </div>
              ))}
              {plan.change.length > 50 && <p className="small muted">{t('sc.andMore', { n: f.int(plan.change.length - 50) })}</p>}
            </div>
          )}
          {plan && plan.change.length === 0 && selected.size > 0 && <Empty icon="check">{t('sc.coppa.nothing')}</Empty>}
          {plan && plan.change.length > KIDS_MAX_BATCH && <Notice tone="warning">{t('sc.coppa.tooMany', { n: f.int(KIDS_MAX_BATCH) })}</Notice>}
          {run && <RunNotice run={run} titles={titles} />}
        </Step>
      </div>

      {batches.length > 0 && (
        <section className="card stack-s" aria-labelledby="coppa-undo-h">
          <h2 id="coppa-undo-h">{t('sc.coppa.history')}</h2>
          <ul className="list">
            {batches.map((b) => (
              <li key={b.id} className="list-item row-between">
                <span className="small">
                  <span className="bold">{t(b.value ? 'sc.kids.state.yes' : 'sc.kids.state.no')}</span> · {t('bulk.videosCount', { n: f.int(b.entries.length) })} · {formatDate(b.at)}
                  {b.undoneAt && <> · {t('sc.coppa.undoneAt', { at: formatDate(b.undoneAt) })}</>}
                </span>
                {!b.undoneAt && (
                  <ConfirmButton
                    size="s"
                    danger={false}
                    label={t('common.undo')}
                    question={t('sc.coppa.undoConfirm', { n: f.int(b.entries.length), units: f.int(b.entries.length * KIDS_WRITE_COST + 1) })}
                    confirmLabel={t('common.undo')}
                    onConfirm={() => undo(b)}
                  />
                )}
              </li>
            ))}
          </ul>
          <p className="xsmall muted">{t('sc.coppa.undoHelp')}</p>
        </section>
      )}

      {plan && plan.change.length > 0 && value !== null && (
        <div className="engage-bar" role="region" aria-label={t('sc.coppa.bar')}>
          <span className="engage-bar-count">{t('engage.bulk2.selected', { n: f.int(selected.size) })}</span>
          <Cost units={Math.min(plan.change.length, KIDS_MAX_BATCH) * KIDS_WRITE_COST} />
          <span className="grow" />
          {!running && (
            <ConfirmButton
              danger={false}
              label={t(value ? 'sc.kids.applyYes' : 'sc.kids.applyNo', { n: f.int(Math.min(plan.change.length, KIDS_MAX_BATCH)) })}
              question={t(value ? 'sc.kids.confirmYes' : 'sc.kids.confirmNo', { n: f.int(Math.min(plan.change.length, KIDS_MAX_BATCH)) })}
              confirmLabel={t('sc.kids.confirmGo')}
              onConfirm={() => apply()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RunNotice({ run, titles }: { run: Run; titles: Map<string, string> }) {
  const { t } = useI18n();
  const f = useFormat();
  const changed = run.results.filter((r) => r.ok && r.changed).length;
  const failed = run.results.filter((r) => !r.ok);
  const kept = run.results.filter((r) => r.kept).length;
  const busy = run.done < run.total && !run.stopped;
  return (
    <Notice tone={failed.length || run.stopped ? 'warning' : busy ? 'info' : 'success'}>
      <p role="status" className="bold">
        {busy
          ? t('engage.run.progress', { done: f.int(run.done), total: f.int(run.total) })
          : t('sc.kids.done', { changed: f.int(changed), same: f.int(run.results.length - changed - failed.length), failed: f.int(failed.length) })}
      </p>
      {run.undo && !busy && kept > 0 && <p className="small">{t('sc.coppa.keptN', { n: f.int(kept) })}</p>}
      {failed.slice(0, 5).map((x, i) => (
        <div key={i} className="stack-s">
          <bdi className="small bold">{x.title || titles.get(x.videoId) || x.videoId}</bdi>
          <ErrorNotice error={x.error} />
        </div>
      ))}
      {run.stopped && <p className="small">{t('sc.kids.stopped')}</p>}
      {!busy && !run.undo && changed > 0 && <p className="small">{t('sc.coppa.undoHint')}</p>}
    </Notice>
  );
}

