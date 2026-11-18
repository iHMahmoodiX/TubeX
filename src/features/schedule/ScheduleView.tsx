// Schedule: publish private/unlisted videos at a time (YouTube's own publishAt, works with the browser
// closed), schedule a metadata update with optional revert (TubeX job, browser must be open), and sunset
// old videos (make unlisted/private with a note, TubeX job, undoable). Lists the area's jobs.
import { useEffect, useMemo, useRef, useState } from 'react';
import { runSequential, type RunProgress } from '../../domain/engageRun';
import { changedSnippetFields, futureProblem, isoToLocalInput, localInputToIso, removeNote, restoreSnippet, VIDEO_UPDATE_COST, type Privacy, type SnippetValues } from '../../domain/engageSchedule';
import { parseTags } from '../../domain/metadata';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, Card, ConfirmButton, Empty, Field, Notice, PageHeader, Skeleton, Switch, Tabs, Thumb } from '../../components/ui';
import { useWork } from '../../components/useWork';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { updateVideo, type OwnVideo } from '../../integrations/google/own';
import { readStatuses, writeStatus, type LiveStatus, type StatusWrite } from '../../integrations/google/ownWrites';
import { rpc } from '../../platform/rpc';
import { put, type Job } from '../../storage/stores';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useFormat } from '../research/shared';
import { Cost, DiffLines, isFatal, RunStatus, SignInEmpty, Step, useOwnChannel, useOwnUploads, useUrlTab, VideoPicker } from '../bulk/engageKit';

const TABS = ['publish', 'update', 'sunset', 'jobs'] as const;
type Tab = (typeof TABS)[number];

const tomorrowAt10 = () => {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(10, 0, 0, 0);
  return isoToLocalInput(d);
};

function When({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { t, formatDate } = useI18n();
  const iso = localInputToIso(value);
  const problem = futureProblem(iso);
  return (
    <Field label={label} help={iso && !problem ? t('engage.sch.whenLocal', { when: formatDate(iso) }) : problem === 'past' ? t('engage.sch.past') : t('engage.sch.pickTime')}>
      {({ id, describedBy }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={!!problem} type="datetime-local" className="input ltr" dir="ltr" style={{ maxWidth: 260 }} value={value} min={isoToLocalInput(new Date())} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

// ------------------------------------------------------------------ publish

function PublishTab({ channelId, videos, refresh }: { channelId: string; videos: OwnVideo[] | undefined; refresh: () => void }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [statuses, setStatuses] = useState<Map<string, LiveStatus> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [when, setWhen] = useState(tomorrowAt10);
  const [progress, setProgress] = useState<RunProgress<OwnVideo> | null>(null);
  const stop = useRef({ aborted: false });
  const notPublic = useMemo(() => (videos ?? []).filter((v) => v.privacy !== 'public'), [videos]);
  const loadStatuses = async (fresh = false) => {
    setError(null);
    try {
      setStatuses(await readStatuses(channelId, notPublic.map((v) => v.id), fresh));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    if (videos) void loadStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, channelId]);
  const scheduled = notPublic.filter((v) => statuses?.get(v.id)?.publishAt);
  const iso = localInputToIso(when);
  const problem = futureProblem(iso);
  const picked = notPublic.filter((v) => chosen.includes(v.id));

  const run = async () => {
    if (!iso) return;
    stop.current = { aborted: false };
    const writes: StatusWrite[] = [];
    const p = await runSequential(picked, async (v) => void writes.push(await writeStatus(channelId, v.id, { publishAt: iso })), { isFatal, onProgress: setProgress, signal: stop.current });
    setChosen([]);
    void loadStatuses(true);
    refresh();
    if (writes.length)
      toast(t('engage.sch.publishSet', { n: f.int(writes.length) }), {
        label: t('common.undo'),
        run: async () => {
          for (const w of writes) await writeStatus(channelId, w.videoId, { privacyStatus: w.before.privacyStatus as Privacy, publishAt: (w.before.publishAt as string | undefined) ?? null }).catch(setError);
          void loadStatuses(true);
          refresh();
        },
      });
    return p;
  };

  return (
    <div className="stack-l">
      <Notice tone="success">
        <p className="bold">{t('engage.sch.publishByYoutube')}</p>
        <p className="small">{t('engage.sch.publishRules')}</p>
      </Notice>
      <section className="stack" aria-labelledby="sch-pub-h">
        <div className="row-between">
          <h2 id="sch-pub-h">{t('engage.sch.scheduledOnYt', { n: f.int(scheduled.length) })}</h2>
          <Button size="s" variant="ghost" onClick={() => void loadStatuses(true)}>
            <Icon name="refresh" />
            {t('engage.inbox.refresh')}
          </Button>
        </div>
        <ErrorNotice error={error} />
        {!statuses ? (
          <Skeleton lines={2} />
        ) : scheduled.length === 0 ? (
          <p className="small muted">{t('engage.sch.noneScheduled')}</p>
        ) : (
          <div className="tracks">
            {scheduled.map((v, i) => (
              <div key={v.id} className="track">
                <span className="track-n">{f.int(i + 1)}</span>
                <span className="track-main">
                  <Thumb videoId={v.id} src={v.thumbnail} />
                  <span className="stack-s" style={{ gap: 0, minWidth: 0 }}>
                    <span className="track-title truncate" dir="auto">
                      {v.title}
                    </span>
                    <span className="track-sub">
                      <Icon name="clock" /> {t('engage.sch.publishesAt', { when: formatDate(String(statuses.get(v.id)?.publishAt)) })}
                    </span>
                  </span>
                </span>
                <span className="track-end">
                  <ConfirmButton
                    size="s"
                    label={t('engage.sch.cancelPublish')}
                    question={t('engage.sch.cancelPublishConfirm', { units: f.int(VIDEO_UPDATE_COST) })}
                    confirmLabel={t('engage.sch.cancelPublishGo')}
                    onConfirm={async () => {
                      try {
                        await writeStatus(channelId, v.id, { publishAt: null });
                        toast(t('engage.sch.publishCanceled'));
                        void loadStatuses(true);
                      } catch (e) {
                        setError(e);
                      }
                    }}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="engage-flow">
        <Step n={1} title={t('engage.sch.pickPrivate')} sub={t('engage.sch.pickPrivateSub')} done={chosen.length > 0}>
          <VideoPicker videos={notPublic} selected={chosen} onChange={setChosen} label={t('engage.sch.pickPrivate')} extra={(v) => (statuses?.get(v.id)?.publishAt ? <span className="badge badge-info">{t('engage.sch.hasSchedule')}</span> : null)} />
        </Step>
        <Step n={2} title={t('engage.sch.publishWhen')} done={!problem}>
          <When value={when} onChange={setWhen} label={t('engage.sch.publishTime')} />
        </Step>
        <Step n={3} title={t('engage.sch.review')} sub={picked.length ? t('engage.sch.publishReview', { n: f.int(picked.length), when: iso ? formatDate(iso) : '—' }) : t('engage.sch.pickFirst')}>
          {picked.length > 0 && (
            <>
              <ul className="list">
                {picked.map((v) => (
                  <li key={v.id} className="list-item">
                    <span className="small">
                      <bdi className="bold">{v.title}</bdi> · {t(`mc.privacy.${v.privacy}` as MessageKey)} → {t('mc.privacy.private')} → <span className="pos bold">{t('mc.privacy.public')}</span> {iso ? formatDate(iso) : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {picked.some((v) => v.privacy === 'unlisted') && <Notice tone="warning">{t('engage.sch.unlistedWarn')}</Notice>}
              <div className="row">
                <ConfirmButton
                  danger={false}
                  label={t('engage.sch.publishGo', { n: f.int(picked.length) })}
                  question={t('engage.sch.publishConfirm', { n: f.int(picked.length), when: iso ? formatDate(iso) : '—', units: f.int(picked.length * VIDEO_UPDATE_COST) })}
                  confirmLabel={t('engage.sch.publishConfirmGo')}
                  onConfirm={() => (problem ? undefined : void run())}
                />
                <Cost units={picked.length * VIDEO_UPDATE_COST} />
              </div>
            </>
          )}
          <RunStatus p={progress} name={(v: OwnVideo) => v.title} onStop={() => (stop.current.aborted = true)} />
        </Step>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ jobs list

function JobsList({ kinds, channelId, empty }: { kinds: string[]; channelId: string; empty: MessageKey }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const jobs = useWork('jobs');
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState<RunProgress<string> | null>(null);
  const list = jobs.items
    .filter((j) => kinds.includes(j.kind))
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || (a.status === 'pending' ? a.runAt.localeCompare(b.runAt) : b.runAt.localeCompare(a.runAt)));

  const undoSunset = async (j: Job) => {
    const before = (j.payload.before ?? {}) as Record<string, { privacy: Privacy; note?: string; wroteDescription?: string }>;
    const ids = Object.keys(before);
    const p = await runSequential(
      ids,
      async (id) => {
        const b = before[id]!;
        await writeStatus(channelId, id, { privacyStatus: b.privacy });
        if (b.note) await updateVideo(channelId, id, (cur) => (b.wroteDescription === undefined || cur.description === b.wroteDescription ? { ...cur, description: removeNote(cur.description, b.note!) } : cur));
      },
      { isFatal, onProgress: setProgress },
    );
    if (!p.failed.length) {
      await put('jobs', { ...j, payload: { ...j.payload, undone: true } });
      toast(t('engage.sch.sunsetUndone'));
    }
  };

  const undoUpdate = async (j: Job) => {
    const b = j.payload.before as SnippetValues | undefined;
    const a = j.payload.after as SnippetValues | undefined;
    if (!b || !a) return;
    try {
      const r = await updateVideo(channelId, String(j.payload.videoId), (cur) => restoreSnippet(cur, b, a));
      await put('jobs', { ...j, payload: { ...j.payload, undone: true } });
      toast(r ? t('engage.sch.updateUndone') : t('engage.sch.nothingToUndo'));
    } catch (e) {
      setError(e);
    }
  };

  if (!jobs.loaded) return <Skeleton lines={2} />;
  return (
    <div className="stack">
      <Notice>{t('jobs.browserOpen')}</Notice>
      <ErrorNotice error={error} />
      <RunStatus p={progress} name={(id: string) => id} />
      {list.length === 0 ? (
        <Empty icon="calendar" title={t(empty)} />
      ) : (
        <div className="engage-jobs">
          {list.map((j) => {
            const undone = j.payload.undone === true;
            const n = Array.isArray(j.payload.videos) ? j.payload.videos.length : 1;
            return (
              <div key={j.id} className="track">
                <span className="track-n">
                  <Icon name={j.kind === 'engage.sunset' ? 'sunset' : 'clock'} />
                </span>
                <span className="track-main">
                  {typeof j.payload.videoId === 'string' && <Thumb videoId={j.payload.videoId} />}
                  <span className="stack-s" style={{ gap: 0, minWidth: 0 }}>
                    <span className="truncate" dir="auto">
                      {j.label}
                    </span>
                    <span className="track-sub engage-when">
                      {j.status === 'pending' ? t('jobs.runAt', { when: formatDate(j.runAt) }) : j.finishedAt ? formatDate(j.finishedAt) : formatDate(j.runAt)}
                      {j.kind === 'engage.sunset' && <> · {t('bulk.videosCount', { n: f.int(n) })}</>}
                    </span>
                    {j.result && (
                      <span className="xsmall faint" dir="auto">
                        {j.result}
                      </span>
                    )}
                  </span>
                </span>
                <span className="track-end">
                  <span className={`badge ${j.status === 'failed' ? 'badge-danger' : j.status === 'pending' ? 'badge-info' : j.status === 'done' ? 'badge-accent' : ''}`}>{undone ? t('engage.bulk.undoneBadge') : t(`jobs.status.${j.status}` as MessageKey)}</span>
                  {(j.status === 'pending' || j.status === 'failed') && (
                    <Button size="s" variant="ghost" onClick={() => void rpc('jobs.cancel', j.id).catch(setError)}>
                      {t('jobs.cancel')}
                    </Button>
                  )}
                  {!undone && j.kind === 'engage.sunset' && !!j.payload.before && Object.keys(j.payload.before as object).length > 0 && (
                    <ConfirmButton size="s" danger={false} label={t('common.undo')} question={t('engage.sch.undoSunsetConfirm', { units: f.int(Object.keys(j.payload.before as object).length * VIDEO_UPDATE_COST * 2) })} confirmLabel={t('common.undo')} onConfirm={() => undoSunset(j)} />
                  )}
                  {!undone && j.kind === 'engage.update' && j.status === 'done' && !!j.payload.before && !!j.payload.after && !j.payload.restore && (
                    <ConfirmButton size="s" danger={false} label={t('common.undo')} question={t('engage.sch.undoUpdateConfirm', { units: f.int(VIDEO_UPDATE_COST) })} confirmLabel={t('common.undo')} onConfirm={() => undoUpdate(j)} />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ update

function UpdateTab({ channelId, videos }: { channelId: string; videos: OwnVideo[] | undefined }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [chosen, setChosen] = useState<string[]>([]);
  const video = videos?.find((v) => v.id === chosen[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [when, setWhen] = useState(tomorrowAt10);
  const [revert, setRevert] = useState(false);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!video) return;
    setTitle(video.title);
    setDescription(video.description);
    setTags(video.tags.join(', '));
  }, [video]);
  const iso = localInputToIso(when);
  const problem = futureProblem(iso);
  const before: SnippetValues | null = video ? { title: video.title, description: video.description, tags: video.tags } : null;
  const after: SnippetValues = { title: title.trim(), description, tags: parseTags(tags) };
  const changed = before ? changedSnippetFields(before, after) : [];
  const revertAt = iso ? new Date(Date.parse(iso) + days * 86_400_000).toISOString() : null;

  const schedule = async () => {
    if (!video || !iso || !before) return;
    setBusy(true);
    setError(null);
    try {
      const first = await rpc<Job>('jobs.schedule', {
        kind: 'engage.update',
        runAt: iso,
        channelId,
        label: t('engage.sch.updateLabel', { title: video.title.slice(0, 80) }),
        payload: { channelId, videoId: video.id, title: after.title, description: after.description, tags: after.tags },
      });
      if (revert && revertAt) {
        const second = await rpc<Job>('jobs.schedule', {
          kind: 'engage.update',
          runAt: revertAt,
          channelId,
          label: t('engage.sch.revertLabel', { title: video.title.slice(0, 80) }),
          payload: { channelId, videoId: video.id, revertOf: first.id, restore: { before, wrote: after } },
        });
        await rpc('engage.linkRevert', first.id, second.id);
      }
      toast(t('engage.sch.updateScheduled', { when: formatDate(iso) }));
      setChosen([]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-l">
      <Notice tone="warning">
        <p>{t('jobs.browserOpen')}</p>
      </Notice>
      <div className="engage-flow">
        <Step n={1} title={t('engage.sch.pickVideo')} done={!!video}>
          <VideoPicker videos={videos} selected={chosen} onChange={setChosen} single label={t('engage.sch.pickVideo')} limit={20} />
        </Step>
        <Step n={2} title={t('engage.sch.newValues')} sub={t('engage.sch.newValuesSub')} done={!!video && changed.length > 0}>
          {!video ? (
            <p className="small muted">{t('engage.sch.pickFirst')}</p>
          ) : (
            <>
              <Field label={t('draft.title')} counter={`${[...title].length}/100`} over={[...title].length > 100}>
                {({ id }) => <input id={id} className="input" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />}
              </Field>
              <Field label={t('draft.description')} counter={`${[...description].length}/5000`} over={[...description].length > 5000}>
                {({ id }) => <textarea id={id} className="textarea" rows={6} dir="auto" value={description} onChange={(e) => setDescription(e.target.value)} />}
              </Field>
              <Field label={t('draft.tags')} help={t('draft.tagsHelp')}>
                {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" rows={2} dir="auto" value={tags} onChange={(e) => setTags(e.target.value)} />}
              </Field>
            </>
          )}
        </Step>
        <Step n={3} title={t('engage.sch.whenAndRevert')} done={!problem}>
          <When value={when} onChange={setWhen} label={t('engage.sch.updateTime')} />
          <Switch checked={revert} onChange={setRevert} label={t('engage.sch.revertAfter')} />
          {revert && (
            <div className="row">
              <input type="number" className="input" style={{ maxWidth: 100 }} min={1} max={365} value={days} aria-label={t('engage.sch.revertDays')} onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} />
              <span className="small muted">{t('engage.sch.revertDaysHelp', { when: revertAt ? formatDate(revertAt) : '—' })}</span>
            </div>
          )}
        </Step>
        <Step n={4} title={t('engage.sch.review')}>
          {!video || !before ? (
            <p className="small muted">{t('engage.sch.pickFirst')}</p>
          ) : changed.length === 0 ? (
            <p className="small muted">{t('engage.sch.noChanges')}</p>
          ) : (
            <>
              {changed.includes('title') && <DiffLines label={t('draft.title')} before={before.title} after={after.title} />}
              {changed.includes('description') && <DiffLines label={t('draft.description')} before={before.description} after={after.description} />}
              {changed.includes('tags') && <DiffLines label={t('draft.tags')} before={before.tags.join(', ')} after={after.tags.join(', ')} />}
              <p className="small muted">{t('engage.sch.reReadNote')}</p>
              <div className="row">
                <Button variant="primary" disabled={busy || !!problem || !after.title} onClick={() => void schedule()}>
                  <Icon name="calendar" />
                  {t('engage.sch.scheduleUpdate')}
                </Button>
                <Cost units={VIDEO_UPDATE_COST * (revert ? 2 : 1)} />
              </div>
            </>
          )}
          <ErrorNotice error={error} />
        </Step>
      </div>
      <section className="stack" aria-labelledby="sch-upd-jobs">
        <h2 id="sch-upd-jobs">{t('engage.sch.updateJobs')}</h2>
        <JobsList kinds={['engage.update']} channelId={channelId} empty="engage.sch.noUpdateJobs" />
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ sunset

function SunsetTab({ channelId, videos }: { channelId: string; videos: OwnVideo[] | undefined }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [chosen, setChosen] = useState<string[]>([]);
  const [when, setWhen] = useState(tomorrowAt10);
  const [action, setAction] = useState<'unlisted' | 'private'>('unlisted');
  const [withNote, setWithNote] = useState(true);
  const [note, setNote] = useState(() => t('engage.sch.sunsetNoteDefault'));
  const [position, setPosition] = useState<'start' | 'end'>('start');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const picked = (videos ?? []).filter((v) => chosen.includes(v.id));
  const iso = localInputToIso(when);
  const problem = futureProblem(iso);
  const units = picked.length * VIDEO_UPDATE_COST * (withNote && note.trim() ? 2 : 1);
  const schedule = async () => {
    if (!iso || !picked.length) return;
    setBusy(true);
    setError(null);
    try {
      await rpc('jobs.schedule', {
        kind: 'engage.sunset',
        runAt: iso,
        channelId,
        label: t('engage.sch.sunsetLabel', { n: f.int(picked.length), action: t(`mc.privacy.${action}` as MessageKey) }),
        payload: { channelId, action, note: withNote ? note.trim() : '', position, videos: picked.map((v) => ({ id: v.id, title: v.title.slice(0, 200) })) },
      });
      toast(t('engage.sch.sunsetScheduled', { when: formatDate(iso) }));
      setChosen([]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack-l">
      <Notice tone="warning">
        <p>{t('jobs.browserOpen')}</p>
      </Notice>
      <div className="engage-flow">
        <Step n={1} title={t('engage.sch.pickSunset')} sub={t('engage.sch.pickSunsetSub')} done={picked.length > 0}>
          <VideoPicker videos={videos} selected={chosen} onChange={setChosen} label={t('engage.sch.pickSunset')} allow={(v) => (v.privacy === 'private' ? 'engage.sch.alreadyPrivate' : null)} />
        </Step>
        <Step n={2} title={t('engage.sch.sunsetHow')} done={!problem}>
          <When value={when} onChange={setWhen} label={t('engage.sch.sunsetTime')} />
          <div className="stack-s">
            <span className="field-label">{t('engage.sch.sunsetAction')}</span>
            <div className="engage-seg" role="group" aria-label={t('engage.sch.sunsetAction')}>
              {(['unlisted', 'private'] as const).map((a) => (
                <button key={a} type="button" aria-pressed={action === a} onClick={() => setAction(a)}>
                  {t(`engage.sch.make.${a}` as MessageKey)}
                </button>
              ))}
            </div>
            <p className="xsmall muted">{t(action === 'unlisted' ? 'engage.sch.unlistedMeans' : 'engage.sch.privateMeans')}</p>
          </div>
          <Switch checked={withNote} onChange={setWithNote} label={t('engage.sch.addNote')} />
          {withNote && (
            <>
              <Field label={t('engage.sch.note')}>{({ id }) => <textarea id={id} className="textarea" rows={2} dir="auto" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
              <div className="engage-seg" role="group" aria-label={t('engage.bulk2.position')}>
                <button type="button" aria-pressed={position === 'start'} onClick={() => setPosition('start')}>
                  {t('bulk.atStart')}
                </button>
                <button type="button" aria-pressed={position === 'end'} onClick={() => setPosition('end')}>
                  {t('bulk.atEnd')}
                </button>
              </div>
            </>
          )}
        </Step>
        <Step n={3} title={t('engage.sch.review')} sub={picked.length ? t('engage.sch.sunsetReview', { n: f.int(picked.length), when: iso ? formatDate(iso) : '—', action: t(`mc.privacy.${action}` as MessageKey) }) : t('engage.sch.pickFirst')}>
          {picked.length > 0 && (
            <>
              <ul className="list">
                {picked.map((v) => (
                  <li key={v.id} className="list-item">
                    <span className="small">
                      <bdi className="bold">{v.title}</bdi> · {t(`mc.privacy.${v.privacy}` as MessageKey)} → <span className="bold">{t(`mc.privacy.${action}` as MessageKey)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {withNote && note.trim() && <DiffLines label={t('engage.sch.noteAdded')} before="" after={note.trim()} />}
              <p className="small muted">{t('engage.sch.sunsetUndoNote')}</p>
              <div className="row">
                <Button variant="primary" disabled={busy || !!problem} onClick={() => void schedule()}>
                  <Icon name="sunset" />
                  {t('engage.sch.scheduleSunset', { n: f.int(picked.length) })}
                </Button>
                <Cost units={units} />
              </div>
            </>
          )}
          <ErrorNotice error={error} />
        </Step>
      </div>
      <section className="stack" aria-labelledby="sch-sun-jobs">
        <h2 id="sch-sun-jobs">{t('engage.sch.sunsetJobs')}</h2>
        <JobsList kinds={['engage.sunset']} channelId={channelId} empty="engage.sch.noSunsetJobs" />
      </section>
    </div>
  );
}

export function ScheduleView({ tab }: { tab?: string }) {
  const { t } = useI18n();
  const { channel, loaded } = useOwnChannel();
  const [view, setView] = useUrlTab<Tab>('schedule', TABS, tab, 'publish');
  const uploads = useOwnUploads(!!channel);
  const jobs = useWork('jobs').items.filter((j) => j.kind.startsWith('engage.') && j.status === 'pending').length;
  return (
    <div className="stack-l">
      <PageHeader kicker={t('shell.group.manage')} title={t('engage.sch.heading')} desc={t('engage.sch.desc')} />
      {!loaded ? null : !channel ? (
        <SignInEmpty icon="calendar" why="engage.signIn.schedule" />
      ) : (
        <>
          <Tabs
            label={t('engage.sch.heading')}
            value={view}
            onChange={setView}
            items={[
              { id: 'publish', label: t('engage.sch.tab.publish'), icon: 'rocket' },
              { id: 'update', label: t('engage.sch.tab.update'), icon: 'edit' },
              { id: 'sunset', label: t('engage.sch.tab.sunset'), icon: 'sunset' },
              { id: 'jobs', label: t('engage.sch.tab.jobs'), icon: 'clock', count: jobs || undefined },
            ]}
          />
          <ErrorNotice error={uploads.error} />
          {view === 'publish' && <PublishTab channelId={channel.channelId} videos={uploads.videos} refresh={() => void uploads.refresh()} />}
          {view === 'update' && <UpdateTab channelId={channel.channelId} videos={uploads.videos} />}
          {view === 'sunset' && <SunsetTab channelId={channel.channelId} videos={uploads.videos} />}
          {view === 'jobs' && (
            <Card title={t('engage.sch.allJobs')}>
              <JobsList kinds={['engage.update', 'engage.sunset']} channelId={channel.channelId} empty="jobs.empty" />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
