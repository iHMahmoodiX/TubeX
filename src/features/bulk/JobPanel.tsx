// Background find & replace jobs: live progress, pause/resume/cancel, the per-video result list (written /
// skipped why / failed why), CSV export, and undo of the whole job or single videos with a conflict check.
import { useEffect, useMemo, useRef, useState } from 'react';
import { countItems, isActive, quotaPlan, toCsv, UNITS_PER_VIDEO, type BulkItem, type BulkJob, type JobError } from '../../domain/bulk';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Meter, Notice, Stat } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { deserializeError, rpc, type SerializedError } from '../../platform/rpc';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useFormat } from '../research/shared';
import { SnippetDiff } from './Diff';
import { problemText } from './Preview';
import { useBulkItems, useQuota } from './useBulk';

const STALE_MS = 3 * 60_000;
type Filter = 'all' | 'written' | 'skipped' | 'failed' | 'conflict' | 'pending';

const err = (e: JobError | undefined) => (e ? deserializeError(e as SerializedError) : null);
export const studioUrl = (id: string) => `https://studio.youtube.com/video/${id}/edit`;

function useJobText() {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  return (job: BulkJob, items: BulkItem[] | undefined) => {
    const c = items ? countItems(items) : null;
    const total = job.phase === 'apply' ? job.total : (c?.undoPending ?? 0) + (c?.restored ?? 0) + (c?.conflict ?? 0) + (c?.undoFailed ?? 0);
    const done = c ? (job.phase === 'apply' ? c.written + c.skipped + c.failed : c.restored + c.conflict + c.undoFailed) : 0;
    const stale = job.status === 'running' && (!job.heartbeatAt || Date.now() - Date.parse(job.heartbeatAt) > STALE_MS);
    let line: string;
    switch (job.status) {
      case 'running':
        line = stale ? t('fr.st.stale') : t(job.phase === 'apply' ? 'fr.st.running' : 'fr.st.undoing', { done: f.int(done), total: f.int(total) });
        break;
      case 'waiting':
        line = t('fr.st.waiting', { left: f.int(c ? (job.phase === 'apply' ? c.pending : c.undoPending) : undefined), time: job.nextRunAt ? formatDate(job.nextRunAt) : '—' });
        break;
      case 'done':
        line =
          job.phase === 'apply'
            ? t('fr.st.done', { written: f.int(c?.written), skipped: f.int(c?.skipped), failed: f.int(c?.failed) })
            : t('fr.st.undone', { restored: f.int(c?.restored), conflict: f.int(c?.conflict), failed: f.int(c?.undoFailed) });
        break;
      default:
        line = t(`fr.st.${job.status}` as MessageKey, { done: f.int(done), total: f.int(total) });
    }
    return { line, done, total, stale, c };
  };
}

function reasonText(i: BulkItem, t: (k: MessageKey, v?: Record<string, string | number>) => string, int: (n: number) => string): string {
  if (i.state === 'skipped') {
    if (i.reason === 'limit' && i.problems?.length) return i.problems.map((p) => problemText(p, t, int)).join(' · ');
    return t(`fr.reason.${i.reason ?? 'no-match'}` as MessageKey);
  }
  if (i.state === 'written') return i.count ? t('bulk.matches', { n: int(i.count) }) : t('fr.res.written');
  if (i.state === 'pending') return t('fr.res.pending');
  return '';
}

function ItemRow({ job, item, busy }: { job: BulkJob; item: BulkItem; busy: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [working, setWorking] = useState(false);
  const undoOne = async (force: boolean) => {
    setError(null);
    setWorking(true);
    try {
      await rpc('bulk.undoOne', job.id, item.videoId, force);
    } catch (e) {
      setError(e);
    } finally {
      setWorking(false);
    }
  };
  const state = item.undo === 'conflict' ? 'conflict' : item.undo === 'restored' || item.undo === 'same' ? 'restored' : item.state;
  const icon = state === 'written' || state === 'restored' ? 'check' : state === 'failed' || state === 'conflict' ? 'alert' : state === 'pending' ? 'clock' : 'info';
  const canUndo = item.state === 'written' && (item.undo === undefined || item.undo === 'failed') && !busy;
  const e1 = err(item.error) ?? err(item.undoError);
  const hasDetail = !!(item.before && item.after) || !!e1 || item.undo === 'conflict';
  return (
    <li className="fr-res" data-state={state}>
      <div className="fr-res-head">
        <span className="track-n num-t">{f.int(item.n + 1)}</span>
        <span className={`fr-res-icon fr-res-${state}`} aria-hidden="true">
          <Icon name={icon} />
        </span>
        <span className="stack-s grow" style={{ gap: 0, minWidth: 0 }}>
          <a className="truncate fr-res-title" href={studioUrl(item.videoId)} target="_blank" rel="noreferrer" title={t('fr.openStudio')}>
            <bdi>{item.title || item.videoId}</bdi>
          </a>
          <span className="xsmall muted">
            <b>{t(`fr.res.${state}` as MessageKey)}</b>
            {reasonText(item, t, f.int) && item.state !== 'pending' ? ` · ${reasonText(item, t, f.int)}` : ''}
            {item.localizations?.length ? ` · ${t('fr.localizedShort', { langs: item.localizations.join('، ') })}` : ''}
          </span>
        </span>
        <span className="row" style={{ gap: 4 }}>
          {canUndo && (
            <Button size="s" variant="ghost" disabled={working} onClick={() => void undoOne(false)}>
              <Icon name="undo" />
              {t('fr.undoOne')}
            </Button>
          )}
          {hasDetail && (
            <button type="button" className="icon-btn fr-expand" aria-expanded={open} aria-label={open ? t('fr.collapse') : t('fr.expand')} onClick={() => setOpen(!open)}>
              <Icon name="chevron" />
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className="fr-res-body stack-s">
          {item.undo === 'conflict' && item.current && item.after && (
            <>
              <Notice tone="warning">
                <p>{t('fr.conflict')}</p>
              </Notice>
              <SnippetDiff before={item.after} after={item.current} />
              {!busy && (
                <ConfirmButton
                  size="s"
                  label={t('fr.overwrite')}
                  question={t('fr.overwriteConfirm')}
                  confirmLabel={t('fr.overwriteGo')}
                  onConfirm={() => undoOne(true)}
                />
              )}
            </>
          )}
          {item.undo !== 'conflict' && item.before && item.after && <SnippetDiff before={item.before} after={item.after} />}
          {e1 && <ErrorNotice error={e1} />}
        </div>
      )}
      {!!error && <ErrorNotice error={error} />}
    </li>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function JobCard({ job, initiallyOpen, otherActive }: { job: BulkJob; initiallyOpen: boolean; otherActive: boolean }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [open, setOpen] = useState(initiallyOpen);
  const items = useBulkItems(open ? job.id : undefined);
  const text = useJobText();
  const { line, done, total, stale, c } = text(job, open ? items : undefined);
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(50);
  const [error, setError] = useState<unknown>(null);
  const { usage, integrations } = useQuota();
  const cmd = async (name: string) => {
    setError(null);
    try {
      await rpc('bulk.command', job.id, name);
    } catch (e) {
      setError(e);
    }
  };
  const active = isActive(job) && !stale;
  const list = useMemo(() => {
    const all = items ?? [];
    switch (filter) {
      case 'all':
        return all;
      case 'conflict':
        return all.filter((i) => i.undo === 'conflict');
      default:
        return all.filter((i) => i.state === filter);
    }
  }, [items, filter]);
  const exportCsv = () => {
    if (!items) return;
    const rows = items.map((i) => [
      i.n + 1,
      i.videoId,
      `https://youtu.be/${i.videoId}`,
      i.title,
      i.state,
      i.state === 'skipped' ? (i.reason === 'limit' ? (i.problems ?? []).map((p) => p.code).join(' ') : (i.reason ?? '')) : '',
      i.count,
      i.at,
      i.undo ?? '',
      (i.error ?? i.undoError) ? `${(i.error ?? i.undoError)!.code} ${(i.error ?? i.undoError)!.detail ?? ''}`.trim() : '',
    ]);
    download(`tubex-find-replace-${job.createdAt.slice(0, 10)}.csv`, toCsv([['#', 'video_id', 'url', 'title', 'status', 'reason', 'matches', 'time', 'undo', 'error'], ...rows]));
    toast(t('fr.csvDone'));
  };
  const undoPlan = c ? quotaPlan(c.written - c.restored, integrations?.youtube.dailyUnitCap ?? 0, usage?.ytUnits ?? 0) : null;
  const chip = (id: Filter, n: number | undefined) =>
    (id === 'all' || (n ?? 0) > 0) && (
      <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
        {t(`fr.filter.${id}` as MessageKey)}
        <small className="num-t">{f.int(n)}</small>
      </button>
    );
  const tone = job.status === 'stopped' || stale ? 'warning' : job.status === 'done' && (c?.failed || c?.undoFailed) ? 'warning' : job.status === 'done' ? 'success' : 'info';
  return (
    <article className="fr-job" data-status={job.status} aria-labelledby={`job-${job.id}`}>
      <header className="fr-job-head">
        <span className={`fr-dot fr-dot-${stale ? 'stopped' : job.status}`} aria-hidden="true" />
        <span className="stack-s grow" style={{ gap: 2, minWidth: 0 }}>
          <h3 id={`job-${job.id}`} className="truncate">
            {job.label}
          </h3>
          <span className="xsmall muted">
            {job.test ? `${t('fr.testBadge')} · ` : ''}
            {t('bulk.videosCount', { n: f.int(job.total) })} · {formatDate(job.createdAt)}
            {job.phase === 'undo' ? ` · ${t('fr.phaseUndo')}` : ''}
          </span>
        </span>
        <span className={`badge ${job.status === 'done' ? 'badge-accent' : job.status === 'stopped' ? 'badge-warning' : job.status === 'waiting' ? 'badge-info' : ''}`}>{t(`fr.status.${stale ? 'stale' : job.status}` as MessageKey)}</span>
        <button type="button" className="icon-btn fr-expand" aria-expanded={open} aria-label={open ? t('fr.collapse') : t('fr.expand')} onClick={() => setOpen(!open)}>
          <Icon name="chevron" />
        </button>
      </header>
      {open && (
        <div className="stack">
          <Notice tone={tone}>
            <div className="stack-s grow">
              <p role="status" aria-live="polite" className="bold">
                {line}
              </p>
              {items && (job.status === 'running' || job.status === 'waiting' || job.status === 'paused') && <Meter value={total ? (done / total) * 100 : 0} label={t('engage.run.meter')} />}
              {job.status === 'waiting' && <p className="small">{t(job.waitReason === 'budget' ? 'fr.waitBudget' : 'fr.waitQuota')}</p>}
            </div>
          </Notice>
          {job.status === 'stopped' && job.error && <ErrorNotice error={err(job.error)} />}
          {job.status === 'waiting' && job.waitReason === 'quota' && job.error && (
            <details className="small muted">
              <summary>{t('fr.rawError')}</summary>
              <p className="ltr mono" dir="ltr">
                {job.error.detail ?? job.error.code}
              </p>
            </details>
          )}
          {c && (
            <div className="stats">
              <Stat label={t('fr.res.written')} value={f.int(c.written)} />
              <Stat label={t('fr.res.skipped')} value={f.int(c.skipped)} />
              <Stat label={t('fr.res.failed')} value={f.int(c.failed)} />
              {c.pending > 0 && <Stat label={t('fr.res.pending')} value={f.int(c.pending)} />}
              {(c.restored > 0 || c.conflict > 0 || job.phase === 'undo') && <Stat label={t('fr.res.restored')} value={f.int(c.restored)} />}
              {c.conflict > 0 && <Stat label={t('fr.res.conflict')} value={f.int(c.conflict)} />}
            </div>
          )}
          <div className="row">
            {job.status === 'running' && !stale && (
              <>
                <Button onClick={() => void cmd('pause')}>{t('fr.pause')}</Button>
                <ConfirmButton size="s" label={t('fr.cancel')} question={t('fr.cancelConfirm')} confirmLabel={t('fr.cancelGo')} onConfirm={() => cmd('cancel')} />
              </>
            )}
            {(job.status === 'paused' || job.status === 'stopped' || job.status === 'waiting' || stale) && !(otherActive && job.status !== 'waiting') && (
              <Button variant="primary" onClick={() => void cmd('resume')}>
                <Icon name="play" />
                {job.status === 'waiting' ? t('fr.continueNow') : t('fr.resume')}
              </Button>
            )}
            {(job.status === 'waiting' || job.status === 'paused' || job.status === 'stopped') && (
              <>
                {job.status === 'waiting' && <Button onClick={() => void cmd('pause')}>{t('fr.pause')}</Button>}
                <ConfirmButton size="s" label={t('fr.cancel')} question={t('fr.cancelConfirm')} confirmLabel={t('fr.cancelGo')} onConfirm={() => cmd('cancel')} />
              </>
            )}
            {!active && !otherActive && c && (job.phase === 'apply' ? c.failed : c.undoFailed) > 0 && (
              <Button onClick={() => void cmd('retry')}>
                <Icon name="refresh" />
                {t('fr.retry', { n: f.int(job.phase === 'apply' ? c.failed : c.undoFailed) })}
              </Button>
            )}
            {!active && !otherActive && c && c.written - c.restored - c.conflict > 0 && (
              <ConfirmButton
                size="s"
                danger={false}
                label={t('fr.undoAll', { n: f.int(c.written - c.restored - c.conflict) })}
                question={t('fr.undoAllConfirm', { n: f.int(c.written - c.restored - c.conflict), units: f.int((c.written - c.restored - c.conflict) * UNITS_PER_VIDEO), today: f.int(undoPlan?.today) })}
                confirmLabel={t('fr.undoAllGo')}
                onConfirm={() => cmd('undo')}
              />
            )}
            {!active && !otherActive && c && c.conflict > 0 && (
              <ConfirmButton size="s" label={t('fr.overwriteAll', { n: f.int(c.conflict) })} question={t('fr.overwriteAllConfirm', { n: f.int(c.conflict) })} confirmLabel={t('fr.overwriteGo')} onConfirm={() => cmd('undoConflicts')} />
            )}
            <span className="grow" />
            {items && items.length > 0 && (
              <Button size="s" variant="ghost" onClick={exportCsv}>
                <Icon name="download" />
                {t('fr.csv')}
              </Button>
            )}
            {!active && (
              <ConfirmButton size="s" label={t('fr.forget')} question={t('fr.forgetConfirm')} confirmLabel={t('fr.forgetGo')} onConfirm={() => cmd('forget')} />
            )}
          </div>
          {!!error && <ErrorNotice error={error} />}
          {job.test && job.status === 'done' && c && c.written > 0 && <Notice tone="info">{t('fr.testDone')}</Notice>}
          {items && items.length > 0 && (
            <>
              <div className="chips" role="group" aria-label={t('fr.filterLabel')}>
                {chip('all', items.length)}
                {chip('written', c?.written)}
                {chip('skipped', c?.skipped)}
                {chip('failed', c?.failed)}
                {chip('pending', c?.pending)}
                {chip('conflict', c?.conflict)}
              </div>
              <ul className="fr-results" aria-label={t('fr.resultsLabel')}>
                {list.slice(0, shown).map((i) => (
                  <ItemRow key={i.videoId} job={job} item={i} busy={active || otherActive} />
                ))}
              </ul>
              {list.length > shown && (
                <div className="row" style={{ justifyContent: 'center' }}>
                  <Button size="s" onClick={() => setShown((n) => n + 50)}>
                    {t('engage.picker.more', { n: f.int(list.length - shown) })}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** Toasts (and calls `onFinished`) when a job stops running while the page is open. */
export function useJobToasts(jobs: BulkJob[], onFinished: () => void) {
  const { t } = useI18n();
  const toast = useToast();
  const prev = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    for (const j of jobs) {
      const before = prev.current.get(j.id);
      if (before === 'running' && j.status !== 'running') {
        toast(t(`fr.toast.${j.status}` as MessageKey, { label: j.label }));
        onFinished();
      }
      prev.current.set(j.id, j.status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);
}

/** Jobs, newest first; the active or newest one opens. */
export function JobsSection({ jobs }: { jobs: BulkJob[] }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  if (!jobs.length) return null;
  const activeJob = jobs.find((j) => isActive(j));
  const visible = all ? jobs : jobs.slice(0, 5);
  return (
    <section className="stack-s" aria-labelledby="fr-jobs-h" data-testid="bulk-jobs">
      <h2 id="fr-jobs-h">{t('fr.jobs')}</h2>
      {visible.map((j, i) => (
        <JobCard key={j.id} job={j} initiallyOpen={activeJob ? j.id === activeJob.id : i === 0} otherActive={!!activeJob && activeJob.id !== j.id} />
      ))}
      {jobs.length > visible.length && (
        <Button size="s" variant="ghost" onClick={() => setAll(true)}>
          {t('fr.olderJobs', { n: jobs.length - visible.length })}
        </Button>
      )}
    </section>
  );
}
