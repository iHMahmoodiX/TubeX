// Bulk edit in three steps: choose items (drafts, templates, published videos), define the change, review and
// apply. Local items save with an instant undo; YouTube videos are re-read and written one at a time with an
// undo log (D-015).
import { useEffect, useMemo, useState } from 'react';
import { applyBulk, changedFields, changedLines, countMatches, findPattern, type BulkField, type BulkOp } from '../../domain/bulk';
import { applyProfile, type BlockMode, type ProfileOp } from '../../domain/engageBulk';
import { parseSelection } from '../../domain/coppa';
import { checkDraft, LIMITS, parseTags, tagsCharCount } from '../../domain/metadata';
import type { Draft, Template } from '../../domain/models';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Field, Notice, PageHeader, Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { dropLiveUndo, listLiveUndo, pushLiveUndo, put, save, type LiveUndoBatch, type LiveUndoEntry } from '../../storage/db';
import { UPDATE_COST, updateVideo, type OwnVideo, type SnippetEdit } from '../../integrations/google/own';
import { AuthError } from '../../integrations/google/auth';
import { YtError } from '../../integrations/youtube/client';
import { ErrorNotice } from '../connections/ErrorNotice';
import { ReconnectBanner, ReconnectButton } from '../connections/Reconnect';
import { useFormat } from '../research/shared';
import { Cost, Step, useOwnChannel, useOwnUploads, VideoPicker } from './engageKit';

type Kind = BulkOp['kind'] | 'profile';
type Item = { col: 'drafts'; rec: Draft } | { col: 'templates'; rec: Template } | { col: 'live'; rec: OwnVideo };
type Editable = { title?: string; description: string; tags: string[] };

interface Change {
  key: string;
  item: Item;
  next: Draft | Template | OwnVideo;
  fields: BulkField[];
  matches: number;
  overLimit: boolean;
}

const nameOf = (i: Item) => (i.col === 'templates' ? i.rec.name : i.rec.title);
const breaksLimits = (e: SnippetEdit) => checkDraft({ ...e, focusKeyword: '' }).some((c) => c.severity === 'error');

interface LiveProgress {
  done: number;
  total: number;
  changed: number;
  skipped: number;
  failed: { title: string; error: unknown }[];
  stopped?: unknown;
}

function Diff({ before, after, label }: { before: string; after: string; label: string }) {
  const { t } = useI18n();
  const lines = before.length > 200 || after.length > 200 ? changedLines(before, after) : { before: [before], after: [after] };
  return (
    <div className="engage-diff">
      <span className="xsmall muted bold">{label}</span>
      {lines.before.map((l, i) => (
        <del key={`b${i}`} dir="auto">
          {l || t('engage.diff.empty')}
        </del>
      ))}
      {lines.after.map((l, i) => (
        <ins key={`a${i}`} dir="auto">
          {l || t('engage.diff.empty')}
        </ins>
      ))}
    </div>
  );
}

function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[]; label: string }) {
  return (
    <div className="engage-seg" role="group" aria-label={label}>
      {items.map((i) => (
        <button key={i.id} type="button" aria-pressed={value === i.id} onClick={() => onChange(i.id)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function BulkView() {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const drafts = useCollection('drafts');
  const templates = useCollection('templates');
  const profiles = useCollection('profiles').items;

  // Videos selected on Studio's Content page arrive as `#bulk/ids=...` (studioContent.open).
  const [pre] = useState(() => parseSelection(location.hash.startsWith('#bulk/') ? location.hash : ''));
  const [useDrafts, setUseDrafts] = useState(pre.ids.length === 0);
  const [useTemplates, setUseTemplates] = useState(false);
  const [profileId, setProfileId] = useState('all');
  const [kind, setKind] = useState<Kind>('replace');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [fields, setFields] = useState<BulkField[]>(['title', 'description', 'tags']);
  const [tagText, setTagText] = useState('');
  const [text, setText] = useState('');
  const [position, setPosition] = useState<'start' | 'end'>('end');
  const [templateId, setTemplateId] = useState('');
  const [descMode, setDescMode] = useState<BlockMode>('append');
  const [tagsMode, setTagsMode] = useState<BlockMode>('append');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const { channel, loaded } = useOwnChannel();
  const [useLive, setUseLive] = useState(pre.ids.length > 0);
  const live = useOwnUploads(useLive);
  const [liveIds, setLiveIds] = useState<string[]>(pre.ids);
  const [progress, setProgress] = useState<LiveProgress | null>(null);
  const [undo, setUndo] = useState<LiveUndoBatch[]>([]);
  useEffect(() => {
    void listLiveUndo().then(setUndo);
  }, []);

  const template = templates.items.find((x) => x.id === templateId);
  const op: BulkOp | ({ kind: 'profile' } & ProfileOp) | null = useMemo(() => {
    switch (kind) {
      case 'replace':
        return { kind, find, replace, matchCase, wholeWord, fields };
      case 'addTags':
      case 'removeTags':
        return { kind, tags: parseTags(tagText) };
      case 'addText':
        return { kind, text, position };
      case 'profile':
        return template ? { kind, description: template.description, tags: template.tags, descriptionMode: descMode, tagsMode } : null;
    }
  }, [kind, find, replace, matchCase, wholeWord, fields, tagText, text, position, template, descMode, tagsMode]);

  const applyOp = <T extends Editable>(rec: T): T => (!op ? rec : op.kind === 'profile' ? applyProfile(rec, op) : applyBulk(rec, op));

  const ready =
    kind === 'replace'
      ? !!find && fields.length > 0
      : kind === 'addText'
        ? !!text.trim()
        : kind === 'profile'
          ? !!template && (descMode !== 'keep' || tagsMode !== 'keep')
          : parseTags(tagText).length > 0;

  const localItems = useMemo(
    () =>
      [
        ...(useDrafts ? drafts.items.map((rec) => ({ col: 'drafts' as const, rec })) : []),
        ...(useTemplates ? templates.items.map((rec) => ({ col: 'templates' as const, rec })) : []),
      ].filter((i) => profileId === 'all' || (profileId === 'none' ? !i.rec.profileId : i.rec.profileId === profileId)),
    [useDrafts, useTemplates, drafts.items, templates.items, profileId],
  );
  const liveChosen = useMemo(() => (useLive && live.videos ? live.videos.filter((v) => liveIds.includes(v.id)) : []), [useLive, live.videos, liveIds]);

  const changes: Change[] = useMemo(() => {
    if (!ready || !op) return [];
    const items: Item[] = [...localItems, ...liveChosen.map((rec) => ({ col: 'live' as const, rec }))];
    const re = op.kind === 'replace' ? findPattern(op) : null;
    const out: Change[] = [];
    for (const item of items) {
      // A template applied to itself is not a change.
      if (op.kind === 'profile' && item.col === 'templates' && item.rec.id === templateId) continue;
      const next = applyOp<Draft | Template | OwnVideo>(item.rec);
      const fl = changedFields(item.rec, next);
      if (!fl.length) continue;
      const matches =
        op.kind === 'replace'
          ? (op.fields.includes('title') && item.col !== 'templates' ? countMatches(item.rec.title, re) : 0) +
            (op.fields.includes('description') ? countMatches(item.rec.description, re) : 0) +
            (op.fields.includes('tags') ? item.rec.tags.reduce((n, tg) => n + countMatches(tg, re), 0) : 0)
          : 0;
      const overLimit =
        item.col === 'live'
          ? breaksLimits(next as OwnVideo)
          : item.col === 'drafts'
            ? checkDraft(next as Draft).some((c) => c.severity === 'error' && c.id !== 'title-missing')
            : tagsCharCount(next.tags) > LIMITS.tagsChars;
      out.push({ key: `${item.col}:${item.rec.id}`, item, next, fields: fl, matches, overLimit });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, op, localItems, liveChosen, templateId]);

  const selected = changes.filter((c) => !excluded.has(c.key));
  const localSelected = selected.filter((c) => c.item.col !== 'live');
  const liveSelected = selected.filter((c) => c.item.col === 'live' && !c.overLimit);
  const liveRunning = !!progress && progress.done < progress.total && !progress.stopped;
  const opLabel = kind === 'replace' ? `${find} → ${replace}` : kind === 'profile' ? t('engage.bulk2.profileLabel', { name: template?.name ?? '' }) : t(`bulk.op.${kind}` as MessageKey);

  // Applies the operation to each video's live snippet (re-read just before writing), one at a time.
  const applyLive = async () => {
    if (!channel) return;
    const entries: LiveUndoEntry[] = [];
    const p: LiveProgress = { done: 0, total: liveSelected.length, changed: 0, skipped: 0, failed: [] };
    setProgress({ ...p });
    for (const c of liveSelected) {
      try {
        const r = await updateVideo(channel.channelId, c.item.rec.id, (cur) => {
          const next = applyOp(cur);
          return breaksLimits(next) ? cur : next;
        });
        if (r) {
          p.changed++;
          entries.push({ channelId: channel.channelId, videoId: r.videoId, before: r.before, after: r.after });
        } else p.skipped++;
      } catch (e) {
        p.failed.push({ title: nameOf(c.item), error: e });
        if (e instanceof AuthError || (e instanceof YtError && (e.code === 'quota' || e.code === 'budget' || e.code === 'permission'))) {
          p.stopped = e;
          p.done++;
          setProgress({ ...p });
          break;
        }
      }
      p.done++;
      setProgress({ ...p });
    }
    if (entries.length) {
      await pushLiveUndo({ at: new Date().toISOString(), label: opLabel, entries });
      setUndo(await listLiveUndo());
    }
    void live.refresh();
  };

  const undoLive = async (batch: LiveUndoBatch) => {
    const p: LiveProgress = { done: 0, total: batch.entries.length, changed: 0, skipped: 0, failed: [] };
    setProgress({ ...p });
    for (const e of batch.entries) {
      try {
        // Restore only when the video still has what TubeX wrote; later manual edits are kept.
        const r = await updateVideo(e.channelId, e.videoId, (cur) =>
          cur.title === e.after.title && cur.description === e.after.description && cur.tags.join('\n') === e.after.tags.join('\n') ? e.before : cur,
        );
        if (r) p.changed++;
        else p.skipped++;
      } catch (err) {
        p.failed.push({ title: e.after.title, error: err });
      }
      p.done++;
      setProgress({ ...p });
    }
    if (!p.failed.length) {
      await dropLiveUndo(batch.at);
      setUndo(await listLiveUndo());
    }
    if (useLive) void live.refresh();
  };

  const apply = async () => {
    setApplying(true);
    const done: ({ col: 'drafts'; rec: Draft } | { col: 'templates'; rec: Template })[] = [];
    let conflicts = 0;
    for (const c of localSelected) {
      const r = c.item.col === 'drafts' ? await save('drafts', c.next as Draft) : await save('templates', c.next as Template);
      if (r.ok) done.push(c.item as (typeof done)[number]);
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

  const toggleField = (fl: BulkField) => setFields((all) => (all.includes(fl) ? all.filter((x) => x !== fl) : [...all, fl]));
  const ops: { k: Kind; label: MessageKey }[] = [
    { k: 'replace', label: 'bulk.op.replace' },
    { k: 'addTags', label: 'bulk.op.addTags' },
    { k: 'removeTags', label: 'bulk.op.removeTags' },
    { k: 'addText', label: 'bulk.op.addText' },
    { k: 'profile', label: 'engage.bulk2.op.profile' },
  ];
  const scopeCount = localItems.length + liveChosen.length;
  const modes = (k: 'desc' | 'tags'): { id: BlockMode; label: string }[] => [
    { id: 'append', label: t(k === 'desc' ? 'engage.bulk2.mode.appendDesc' : 'engage.bulk2.mode.appendTags') },
    { id: 'replace', label: t('engage.bulk2.mode.replace') },
    { id: 'keep', label: t('engage.bulk2.mode.keep') },
  ];

  return (
    <div className="stack-l" data-testid="bulk-view">
      <PageHeader kicker={t('shell.group.manage')} title={t('bulk.heading')} desc={t('bulk.scopeNote')} />
      <ReconnectBanner />

      <div className="engage-flow">
        <Step n={1} title={t('engage.bulk2.step1')} sub={t('engage.bulk2.step1Sub', { n: f.int(scopeCount) })} done={scopeCount > 0}>
          <div className="row" style={{ gap: 'var(--space-4)' }}>
            <label className="check">
              <input type="checkbox" checked={useDrafts} onChange={(e) => setUseDrafts(e.target.checked)} />
              <span>
                {t('nav.drafts')} <small className="faint num-t">{f.int(drafts.items.length)}</small>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={useTemplates} onChange={(e) => setUseTemplates(e.target.checked)} />
              <span>
                {t('nav.templates')} <small className="faint num-t">{f.int(templates.items.length)}</small>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={useLive} disabled={!channel} onChange={(e) => setUseLive(e.target.checked)} data-testid="bulk-live" />
              <span>{channel ? t('bulk.liveScope', { name: channel.title }) : t('bulk.liveNeedsSignIn')}</span>
            </label>
            {(useDrafts || useTemplates) && profiles.length > 0 && (
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
          </div>
          {(useLive || pre.ids.length > 0) && loaded && !channel && (
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
          {useLive && channel && (
            <>
              {pre.ids.length > 0 && <Notice tone="info">{t('sc.preselected', { n: f.int(pre.ids.length) })}</Notice>}
              <ErrorNotice error={live.error} />
              {live.loading && !live.videos && <p className="small muted">{t('bulk.loadingLive')}</p>}
              <VideoPicker videos={live.videos} selected={liveIds} onChange={setLiveIds} label={t('engage.bulk2.pickVideos')} limit={40} />
            </>
          )}
        </Step>

        <Step n={2} title={t('engage.bulk2.step2')} sub={t('engage.bulk2.step2Sub')} done={ready}>
          <div className="tabs" role="tablist" aria-label={t('bulk.operation')}>
            {ops.map((o) => (
              <button key={o.k} type="button" role="tab" aria-selected={kind === o.k} onClick={() => setKind(o.k)}>
                {t(o.label)}
              </button>
            ))}
          </div>

          {kind === 'replace' && (
            <>
              <div className="grid-2">
                <Field label={t('bulk.find')}>{({ id }) => <input id={id} className="input" dir="auto" value={find} onChange={(e) => setFind(e.target.value)} data-testid="bulk-find" />}</Field>
                <Field label={t('bulk.replaceWith')} help={t('bulk.replaceHelp')}>
                  {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input" dir="auto" value={replace} onChange={(e) => setReplace(e.target.value)} data-testid="bulk-replace" />}
                </Field>
              </div>
              <div className="row" style={{ gap: 'var(--space-4)' }}>
                {(['title', 'description', 'tags'] as BulkField[]).map((fl) => (
                  <label key={fl} className="check">
                    <input type="checkbox" checked={fields.includes(fl)} onChange={() => toggleField(fl)} />
                    <span>{t(`draft.${fl}` as MessageKey)}</span>
                  </label>
                ))}
                <label className="check">
                  <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
                  <span>{t('bulk.matchCase')}</span>
                </label>
                <label className="check">
                  <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
                  <span>{t('bulk.wholeWord')}</span>
                </label>
              </div>
            </>
          )}
          {(kind === 'addTags' || kind === 'removeTags') && (
            <Field label={t('draft.tags')} help={t('draft.tagsHelp')}>
              {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" rows={2} dir="auto" value={tagText} onChange={(e) => setTagText(e.target.value)} />}
            </Field>
          )}
          {kind === 'addText' && (
            <>
              <Field label={t('bulk.text')} help={t('bulk.textHelp')}>
                {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" rows={4} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}
              </Field>
              <Seg
                label={t('engage.bulk2.position')}
                value={position}
                onChange={setPosition}
                items={[
                  { id: 'start', label: t('bulk.atStart') },
                  { id: 'end', label: t('bulk.atEnd') },
                ]}
              />
            </>
          )}
          {kind === 'profile' && (
            <div className="stack">
              <p className="small muted">{t('engage.bulk2.profileHelp')}</p>
              {templates.items.length === 0 ? (
                <Empty icon="file" title={t('engage.bulk2.noTemplates')} action={<a className="btn btn-s" href="#templates">{t('nav.templates')}</a>} />
              ) : (
                <>
                  <Field label={t('engage.bulk2.template')}>
                    {({ id }) => (
                      <select id={id} className="select" style={{ maxWidth: 420 }} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                        <option value="">{t('engage.bulk2.pickTemplate')}</option>
                        {templates.items.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  {template && (
                    <div className="grid-2">
                      <div className="card card-2 stack-s">
                        <span className="small bold">{t('draft.description')}</span>
                        <Seg label={t('draft.description')} value={descMode} onChange={setDescMode} items={modes('desc')} />
                        <p className="small muted clamp-2" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                          {template.description || t('engage.diff.empty')}
                        </p>
                      </div>
                      <div className="card card-2 stack-s">
                        <span className="small bold">{t('draft.tags')}</span>
                        <Seg label={t('draft.tags')} value={tagsMode} onChange={setTagsMode} items={modes('tags')} />
                        <p className="small muted clamp-2" dir="auto">
                          {template.tags.join('، ') || t('engage.diff.empty')}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Step>

        <Step n={3} title={ready ? t('bulk.preview', { n: f.int(changes.length) }) : t('engage.bulk2.step3')} sub={ready ? t('engage.bulk2.step3Sub') : t('engage.bulk2.step3Wait')}>
          {ready && (
            <div data-testid="bulk-preview">
              {changes.length === 0 ? (
                <Empty icon="search">{t('bulk.noChanges')}</Empty>
              ) : (
                <div className="engage-review">
                  {changes.map((c) => {
                    const off = excluded.has(c.key);
                    return (
                      <div key={c.key} className="engage-review-row" data-off={off}>
                        <input
                          type="checkbox"
                          checked={!off}
                          aria-label={nameOf(c.item) || t('draft.untitled')}
                          onChange={(e) =>
                            setExcluded((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.delete(c.key);
                              else n.add(c.key);
                              return n;
                            })
                          }
                        />
                        <div className="stack-s" style={{ minWidth: 0 }}>
                          <div className="row-nowrap">
                            {c.item.col === 'live' ? (
                              <Thumb videoId={c.item.rec.id} src={c.item.rec.thumbnail} width={64} />
                            ) : (
                              <span className="thumb" style={{ width: 64, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
                                <Icon name={c.item.col === 'drafts' ? 'edit' : 'file'} />
                              </span>
                            )}
                            <span className="stack-s grow" style={{ gap: 2, minWidth: 0 }}>
                              <span className="truncate bold" dir="auto">
                                {nameOf(c.item) || t('draft.untitled')}
                              </span>
                              <span className="row" style={{ gap: 6 }}>
                                <span className={`badge ${c.item.col === 'live' ? 'badge-accent' : ''}`}>
                                  {c.item.col === 'drafts' ? t('bulk.kind.draft') : c.item.col === 'live' ? t('bulk.kind.video') : t('bulk.kind.template')}
                                </span>
                                {c.matches > 0 && <span className="badge">{t('bulk.matches', { n: f.int(c.matches) })}</span>}
                              </span>
                            </span>
                          </div>
                          {c.overLimit && <Notice tone="warning">{t(c.item.col === 'live' ? 'bulk.overLimitLive' : 'bulk.overLimit')}</Notice>}
                          {c.fields.includes('title') && <Diff label={t('draft.title')} before={(c.item.rec as Draft).title} after={(c.next as Draft).title} />}
                          {c.fields.includes('description') && <Diff label={t('draft.description')} before={c.item.rec.description} after={c.next.description} />}
                          {c.fields.includes('tags') && <Diff label={t('draft.tags')} before={c.item.rec.tags.join(', ')} after={c.next.tags.join(', ')} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Step>
      </div>

      {progress && (
        <Notice tone={progress.failed.length ? 'warning' : progress.done === progress.total ? 'success' : 'info'}>
          <p role="status">
            {t('bulk.liveProgress', { done: f.int(progress.done), total: f.int(progress.total), changed: f.int(progress.changed), skipped: f.int(progress.skipped), failed: f.int(progress.failed.length) })}
          </p>
          {progress.failed.slice(0, 5).map((x, i) => (
            <div key={i} className="small">
              <bdi>{x.title}</bdi>
              <ErrorNotice error={x.error} />
            </div>
          ))}
          {!!progress.stopped && <p className="small">{t('bulk.liveStopped')}</p>}
        </Notice>
      )}

      {undo.length > 0 && (
        <section className="card stack-s" aria-labelledby="bulk-undo-h">
          <h2 id="bulk-undo-h">{t('bulk.liveHistory')}</h2>
          <ul className="list">
            {undo.map((b) => (
              <li key={b.at} className="list-item row-between">
                <span className="small">
                  <bdi className="bold">{b.label}</bdi> · {t('bulk.videosCount', { n: f.int(b.entries.length) })} · {formatDate(b.at)}
                </span>
                <ConfirmButton
                  size="s"
                  danger={false}
                  label={t('bulk.undoLive')}
                  question={t('bulk.undoLiveConfirm', { n: f.int(b.entries.length) })}
                  confirmLabel={t('bulk.undoLive')}
                  onConfirm={() => undoLive(b)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ready && selected.length > 0 && (
        <div className="engage-bar" role="region" aria-label={t('engage.bulk2.bar')}>
          <span className="engage-bar-count">{t('engage.bulk2.selected', { n: f.int(selected.length) })}</span>
          {liveSelected.length > 0 && <Cost units={liveSelected.length * UPDATE_COST} />}
          <span className="grow" />
          {localSelected.length > 0 && (
            <Button variant="primary" disabled={applying} onClick={() => void apply()} data-testid="bulk-apply">
              {t('bulk.apply', { n: f.int(localSelected.length) })}
            </Button>
          )}
          {liveSelected.length > 0 && !liveRunning && (
            <ConfirmButton
              danger={false}
              label={t('bulk.applyLive', { n: f.int(liveSelected.length) })}
              question={t('bulk.applyLiveConfirm', { n: f.int(liveSelected.length), units: f.int(liveSelected.length * UPDATE_COST) })}
              confirmLabel={t('bulk.applyLiveGo')}
              onConfirm={() => applyLive()}
            />
          )}
        </div>
      )}
    </div>
  );
}
