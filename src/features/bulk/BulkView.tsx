// Bulk find & replace in three steps: Find (what, where) → Preview (exact diff per item, include/exclude) →
// Run. Drafts and templates save locally with an instant undo. Published videos are written by a persisted
// background job (src/background/jobs/bulk.ts): fresh read before every write, limits checked, sequential with
// backoff, waits for the daily quota reset and continues by itself, undo per job or per video (D-015).
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { changedFields, compileOp, isActive, nextPacificMidnight, planVideo, quotaPlan, PROJECT_QUOTA, UNITS_PER_VIDEO, type FrOp } from '../../domain/bulk';
import { parseSelection } from '../../domain/coppa';
import { checkDraft } from '../../domain/metadata';
import type { Draft, Template } from '../../domain/models';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Notice, PageHeader, Stat } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { ownVideos, type OwnVideo } from '../../integrations/google/own';
import { rpc } from '../../platform/rpc';
import { dropLiveUndo, listLiveUndo, put, save, type LiveUndoBatch } from '../../storage/db';
import { loadIntegrations, saveIntegrations } from '../../storage/integrations';
import { updateVideo } from '../../integrations/google/own';
import { ErrorNotice } from '../connections/ErrorNotice';
import { ReconnectBanner, ReconnectButton } from '../connections/Reconnect';
import { useAsync, useFormat } from '../research/shared';
import { Cost, Step, useOwnChannel } from './engageKit';
import { FindForm, INITIAL_FORM, opLabel, toOp, type FormState } from './FindForm';
import { JobsSection, useJobToasts } from './JobPanel';
import { applyFilters, LiveFilters, NO_FILTERS, type Filters } from './LiveFilters';
import { PreviewList, SkippedList, type PreviewRow } from './Preview';
import { useBulkJobs, useQuota } from './useBulk';
import './bulk.css';

type Scope = 'live' | 'drafts' | 'templates';

/** Every upload of the signed-in channel (not capped), cached 30 minutes by ownVideos. */
function useAllUploads(enabled: boolean) {
  const { channel } = useOwnChannel();
  const load = useCallback(
    (fresh: boolean) => (channel?.uploadsPlaylistId ? ownVideos(channel.channelId, channel.uploadsPlaylistId, Infinity, fresh) : Promise.resolve([] as OwnVideo[])),
    [channel?.channelId, channel?.uploadsPlaylistId],
  );
  const st = useAsync(load);
  useEffect(() => {
    if (enabled && channel) void st.run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channel?.channelId]);
  return { videos: st.data, loading: st.loading, error: st.error, refresh: () => st.run(true) };
}

function RunPanel({ selected, op, busy, channelTitle }: { selected: PreviewRow[]; op: FrOp; busy: boolean; channelTitle: string }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const { usage, integrations } = useQuota();
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState(false);
  const cap = integrations?.youtube.dailyUnitCap ?? 0;
  const used = usage?.ytUnits ?? 0;
  const n = selected.length;
  const plan = quotaPlan(n, cap, used);
  const resetAt = new Date(nextPacificMidnight(Date.now())).toISOString();
  const start = async (test: boolean) => {
    setError(null);
    setStarting(true);
    try {
      const videos = (test ? selected.slice(0, 1) : selected).map((r) => ({ id: r.id, title: r.title }));
      await rpc('bulk.start', { label: opLabel(op, t), op, videos, test });
      toast(t(test ? 'fr.startedTest' : 'fr.started', { n: f.int(videos.length) }));
      requestAnimationFrame(() => document.getElementById('fr-jobs-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      setError(e instanceof Error && e.message === 'busy' ? new Error(t('fr.busy')) : e);
    } finally {
      setStarting(false);
    }
  };
  const raise = async () => {
    const i = await loadIntegrations();
    await saveIntegrations({ ...i, youtube: { ...i.youtube, dailyUnitCap: PROJECT_QUOTA } });
    toast(t('fr.capRaised', { n: f.int(PROJECT_QUOTA) }));
  };
  return (
    <div className="stack" data-testid="bulk-run">
      <div className="fr-plan">
        <div className="stack-s grow" style={{ minWidth: 0 }}>
          <p className="bold">
            {t('fr.runSummary', { n: f.int(n), name: channelTitle })} <Cost units={n * UNITS_PER_VIDEO} />
          </p>
          <p className="small">
            {plan.later === 0
              ? t('fr.plan.allToday', { n: f.int(n) })
              : plan.today === 0
                ? t('fr.plan.noneToday', { n: f.int(n), time: formatDate(resetAt), days: f.int(plan.days - 1) })
                : t('fr.plan.split', { today: f.int(plan.today), later: f.int(plan.later), time: formatDate(resetAt), days: f.int(plan.days) })}
          </p>
          <p className="xsmall muted">
            {cap > 0 ? t('fr.cap', { cap: f.int(cap), used: f.int(used) }) : t('fr.capNone', { used: f.int(used) })} {t('fr.capWhy')}
          </p>
        </div>
        {cap > 0 && cap < PROJECT_QUOTA && (
          <Button size="s" onClick={() => void raise()}>
            <Icon name="arrowUp" />
            {t('fr.raiseCap', { n: f.int(PROJECT_QUOTA) })}
          </Button>
        )}
      </div>
      <p className="xsmall muted">{t('fr.bgNote')}</p>
      {busy && <Notice tone="info">{t('fr.busy')}</Notice>}
      <div className="row">
        <Button disabled={busy || starting || n === 0} onClick={() => void start(true)} data-testid="bulk-test-one">
          <Icon name="target" />
          {t('fr.testOne')}
        </Button>
        {!busy && n > 0 && !asking && (
          <Button variant="primary" disabled={starting} onClick={() => setAsking(true)} data-testid="bulk-run-all">
            <Icon name="play" />
            {t('bulk.applyLive', { n: f.int(n) })}
          </Button>
        )}
      </div>
      {asking && (
        <div className="notice notice-warning" role="group" aria-label={t('bulk.applyLive', { n: f.int(n) })}>
          <div className="grow stack-s">
            <p>{t('fr.runConfirm', { n: f.int(n), units: f.int(n * UNITS_PER_VIDEO), today: f.int(plan.today), later: f.int(plan.later) })}</p>
            <div className="row">
              <Button
                variant="primary"
                autoFocus
                onClick={() => {
                  setAsking(false);
                  void start(false);
                }}
              >
                {t('bulk.applyLiveGo')}
              </Button>
              <Button onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        </div>
      )}
      <ErrorNotice error={error} />
    </div>
  );
}

/** Older single-video and pre-0.5.2 batch changes (in-page editor, scheduled updates): undo as before. */
function LegacyUndo() {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const [undo, setUndo] = useState<LiveUndoBatch[]>([]);
  const [msg, setMsg] = useState<{ ok: number; kept: number; failed: unknown[] } | null>(null);
  useEffect(() => {
    void listLiveUndo().then(setUndo);
  }, []);
  if (!undo.length) return null;
  const run = async (batch: LiveUndoBatch) => {
    const r = { ok: 0, kept: 0, failed: [] as unknown[] };
    for (const e of batch.entries) {
      try {
        // Restore only when the video still has what TubeX wrote; later manual edits are kept.
        const w = await updateVideo(e.channelId, e.videoId, (cur) =>
          cur.title === e.after.title && cur.description === e.after.description && cur.tags.join('\n') === e.after.tags.join('\n') ? e.before : cur,
        );
        if (w) r.ok++;
        else r.kept++;
      } catch (err) {
        r.failed.push(err);
      }
    }
    setMsg(r);
    if (!r.failed.length) await dropLiveUndo(batch.at);
    setUndo(await listLiveUndo());
  };
  return (
    <details className="card stack-s fr-legacy">
      <summary className="bold">{t('bulk.liveHistory')}</summary>
      <ul className="list">
        {undo.map((b) => (
          <li key={b.at} className="list-item row-between">
            <span className="small">
              <bdi className="bold">{b.label}</bdi> · {t('bulk.videosCount', { n: f.int(b.entries.length) })} · {formatDate(b.at)}
            </span>
            <ConfirmButton size="s" danger={false} label={t('bulk.undoLive')} question={t('bulk.undoLiveConfirm', { n: f.int(b.entries.length) })} confirmLabel={t('bulk.undoLive')} onConfirm={() => run(b)} />
          </li>
        ))}
      </ul>
      {msg && (
        <Notice tone={msg.failed.length ? 'warning' : 'success'}>
          <p role="status">{t('fr.legacyDone', { ok: f.int(msg.ok), kept: f.int(msg.kept), failed: f.int(msg.failed.length) })}</p>
          {msg.failed.slice(0, 3).map((e, i) => (
            <ErrorNotice key={i} error={e} />
          ))}
        </Notice>
      )}
    </details>
  );
}

export function BulkView() {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const drafts = useCollection('drafts');
  const templates = useCollection('templates');
  const profiles = useCollection('profiles').items;
  const jobs = useBulkJobs() ?? [];

  // Videos selected on Studio's Content page arrive as `#bulk/ids=...` (studioContent.open).
  const [pre] = useState(() => parseSelection(location.hash.startsWith('#bulk/') ? location.hash : ''));
  const { channel, loaded } = useOwnChannel();
  const [scope, setScopeRaw] = useState<Scope>(pre.ids.length ? 'live' : 'drafts');
  const [touched, setTouched] = useState(false);
  const setScope = (s: Scope) => {
    setTouched(true);
    setScopeRaw(s);
  };
  // Signed in: published videos are the default scope (drafts stay one click away).
  useEffect(() => {
    if (loaded && channel && !touched) setScopeRaw('live');
  }, [loaded, channel, touched]);

  const [form, setFormRaw] = useState<FormState>(INITIAL_FORM);
  const setForm = (p: Partial<FormState>) => setFormRaw((s) => ({ ...s, ...p }));
  const deferred = useDeferredValue(form);
  const [profileId, setProfileId] = useState('all');
  const [filters, setFiltersRaw] = useState<Filters>(NO_FILTERS);
  const setFilters = (p: Partial<Filters>) => setFiltersRaw((s) => ({ ...s, ...p }));
  const [playlistIds, setPlaylistIds] = useState<Set<string> | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const live = useAllUploads(scope === 'live');
  const scoped = useMemo(() => (scope === 'live' && live.videos ? applyFilters(live.videos, filters, pre.ids, playlistIds) : []), [scope, live.videos, filters, pre.ids, playlistIds]);
  const localItems = useMemo(() => {
    const keep = (p?: string) => profileId === 'all' || (profileId === 'none' ? !p : p === profileId);
    if (scope === 'drafts') return drafts.items.filter((d) => keep(d.profileId)).map((rec) => ({ col: 'drafts' as const, rec }));
    if (scope === 'templates') return templates.items.filter((d) => keep(d.profileId)).map((rec) => ({ col: 'templates' as const, rec }));
    return [];
  }, [scope, drafts.items, templates.items, profileId]);

  const op = useMemo(() => toOp(deferred, templates.items), [deferred, templates.items]);
  const compiled = useMemo(() => (op ? compileOp(op) : null), [op]);
  const ready = !!compiled?.ok;

  const rows: PreviewRow[] = useMemo(() => {
    if (!compiled?.ok) return [];
    const out: PreviewRow[] = [];
    if (scope === 'live') {
      for (const v of scoped) {
        const p = planVideo({ title: v.title, description: v.description, tags: v.tags }, compiled.run);
        if (p.status === 'none') continue;
        out.push({ key: `live:${v.id}`, kind: 'video', id: v.id, title: v.title, thumbnail: v.thumbnail, privacy: v.privacy, before: v, next: p.next, count: p.count, fields: p.fields, status: p.status, problems: p.problems, localizations: v.localizations });
      }
    } else {
      for (const it of localItems) {
        // A template applied to itself is not a change.
        if (op?.kind === 'profile' && it.col === 'templates' && it.rec.id === deferred.templateId) continue;
        const r = compiled.run<Draft | Template>(it.rec);
        const fields = changedFields(it.rec, r.next);
        if (!fields.length) continue;
        const warn = it.col === 'drafts' && checkDraft(r.next as Draft).some((c) => c.severity === 'error' && c.id !== 'title-missing');
        const title = it.col === 'templates' ? it.rec.name : it.rec.title;
        out.push({ key: `${it.col}:${it.rec.id}`, kind: it.col === 'drafts' ? 'draft' : 'template', id: it.rec.id, title, before: it.rec, next: r.next, count: r.count, fields, status: 'change', problems: [], warn });
      }
    }
    return out;
  }, [compiled, scope, scoped, localItems, op?.kind, deferred.templateId]);

  const changeRows = rows.filter((r) => r.status === 'change');
  const skippedRows = rows.filter((r) => r.status === 'invalid' || r.status === 'end-missing');
  const selected = changeRows.filter((r) => !excluded.has(r.key));
  const occurrences = changeRows.reduce((n, r) => n + r.count, 0);
  const scopeCount = scope === 'live' ? scoped.length : localItems.length;
  const activeJob = jobs.find(isActive);
  useJobToasts(jobs, () => void live.refresh());

  const applyLocal = async () => {
    setApplying(true);
    const done: ({ col: 'drafts'; rec: Draft } | { col: 'templates'; rec: Template })[] = [];
    let conflicts = 0;
    for (const r of selected) {
      const it = localItems.find((x) => `${x.col}:${x.rec.id}` === r.key);
      if (!it) continue;
      const res = it.col === 'drafts' ? await save('drafts', r.next as Draft) : await save('templates', r.next as Template);
      if (res.ok) done.push(it);
      else conflicts++;
    }
    setApplying(false);
    setExcluded(new Set());
    toast(conflicts ? t('bulk.applied', { n: done.length, c: conflicts }) : t('bulk.appliedAll', { n: done.length }), {
      label: t('common.undo'),
      run: async () => {
        for (const i of done) {
          if (i.col === 'drafts') await put('drafts', i.rec);
          else await put('templates', i.rec);
        }
        toast(t('bulk.undone'));
      },
    });
  };

  const scopes: { id: Scope; label: string; icon: 'video' | 'edit' | 'file'; n?: number; disabled?: boolean; testId?: string }[] = [
    { id: 'live', label: channel ? t('fr.scope.live') : t('bulk.liveNeedsSignIn'), icon: 'video', n: live.videos?.length, disabled: !channel, testId: 'bulk-live' },
    { id: 'drafts', label: t('nav.drafts'), icon: 'edit', n: drafts.items.length },
    { id: 'templates', label: t('nav.templates'), icon: 'file', n: templates.items.length },
  ];
  const compileError = compiled && !compiled.ok && compiled.error !== 'empty' ? compiled : null;

  return (
    <div className="stack-l" data-testid="bulk-view">
      <PageHeader kicker={t('shell.group.manage')} title={t('fr.heading')} desc={t('fr.desc')} />
      <ReconnectBanner />
      {activeJob && <JobsSection jobs={jobs} />}

      <div className="engage-flow">
        <Step n={1} title={t('fr.step1')} sub={t('fr.step1Sub', { n: f.int(scopeCount) })} done={ready}>
          <div className="fr-scope" role="group" aria-label={t('fr.scope')}>
            {scopes.map((s) => (
              <button key={s.id} type="button" className="fr-scope-btn" aria-pressed={scope === s.id} disabled={s.disabled} onClick={() => setScope(s.id)} data-testid={s.testId}>
                <Icon name={s.icon} />
                <span className="truncate">{s.label}</span>
                {s.n !== undefined && !s.disabled && <small className="num-t">{f.int(s.n)}</small>}
              </button>
            ))}
          </div>
          {(scope === 'live' || pre.ids.length > 0) && loaded && !channel && (
            <div data-testid="bulk-needs-google">
              <Notice tone="info">
                <p className="bold">{t('bulk.needsGoogleTitle')}</p>
                <p>{t('bulk.needsGoogle')}</p>
                <div>
                  <ReconnectButton />
                </div>
              </Notice>
            </div>
          )}
          {scope === 'live' && channel && (
            <>
              <ErrorNotice error={live.error} />
              {live.loading && !live.videos && <p className="small muted">{t('fr.loadingAll')}</p>}
              {live.videos && (
                <>
                  <LiveFilters videos={live.videos} filters={filters} set={setFilters} preIds={pre.ids} channelId={channel.channelId} onPlaylist={setPlaylistIds} />
                  <p className="small muted">
                    {t('fr.searching', { n: f.int(scoped.length), total: f.int(live.videos.length) })}{' '}
                    <button type="button" className="link-btn" onClick={() => void live.refresh()} disabled={live.loading}>
                      {live.loading ? t('fr.loading') : t('fr.reload')}
                    </button>
                  </p>
                </>
              )}
            </>
          )}
          {scope !== 'live' && profiles.length > 0 && (
            <select className="select" style={{ width: 'auto' }} aria-label={t('draft.channel')} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="all">{t('bulk.allChannels')}</option>
              <option value="none">{t('draft.noChannel')}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <hr className="fr-sep" />
          <FindForm s={form} set={setForm} templates={templates.items} live={scope === 'live'} />
          {compileError && compileError.error !== 'regex' && !compileError.error.startsWith('url-') && <p className="small fr-bad">{t(`fr.err.${compileError.error}` as MessageKey)}</p>}
        </Step>

        <Step n={2} title={ready ? t('bulk.preview', { n: f.int(changeRows.length) }) : t('fr.step2')} sub={ready ? t('fr.step2Sub') : t('engage.bulk2.step3Wait')} done={ready && selected.length > 0}>
          {ready && (
            <div className="stack" data-testid="bulk-preview">
              <div className="stats fr-stats">
                <Stat label={scope === 'live' ? t('fr.tot.videos') : t('fr.tot.items')} value={f.int(changeRows.length)} />
                <Stat label={t('fr.tot.occurrences')} value={f.int(occurrences)} />
                <Stat label={t('fr.tot.unchanged')} value={f.int(scopeCount - rows.length)} />
                {skippedRows.length > 0 && <Stat label={t('fr.tot.skipped')} value={f.int(skippedRows.length)} />}
              </div>
              {changeRows.length === 0 ? <Empty icon="search">{t('bulk.noChanges')}</Empty> : <PreviewList rows={changeRows} excluded={excluded} setExcluded={setExcluded} />}
              <SkippedList rows={skippedRows} />
            </div>
          )}
        </Step>

        <Step n={3} title={scope === 'live' ? t('fr.step3') : t('fr.step3Local')} sub={ready && selected.length ? t('engage.bulk2.selected', { n: f.int(selected.length) }) : t('fr.step3Wait')}>
          {ready && selected.length > 0 && op && (
            <>
              {scope === 'live' && channel ? (
                <RunPanel selected={selected} op={op} busy={!!activeJob} channelTitle={channel.title} />
              ) : scope !== 'live' ? (
                <div className="row">
                  <Button variant="primary" disabled={applying} onClick={() => void applyLocal()} data-testid="bulk-apply">
                    {t('bulk.apply', { n: f.int(selected.length) })}
                  </Button>
                  <span className="small muted">{t('fr.localUndo')}</span>
                </div>
              ) : null}
            </>
          )}
        </Step>
      </div>

      {!activeJob && <JobsSection jobs={jobs} />}
      {scope === 'live' && channel && <LegacyUndo />}
    </div>
  );
}
