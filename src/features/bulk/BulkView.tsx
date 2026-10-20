// Bulk find-and-replace and other batch edits across drafts and templates, with preview and undo.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyBulk, changedFields, changedLines, countMatches, findPattern, type BulkField, type BulkOp } from '../../domain/bulk';
import { checkDraft, LIMITS, parseTags, tagsCharCount } from '../../domain/metadata';
import type { Draft, Template } from '../../domain/models';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Button, Empty, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { dropLiveUndo, listLiveUndo, pushLiveUndo, put, save, type LiveUndoBatch, type LiveUndoEntry } from '../../storage/db';
import { ownVideos, UPDATE_COST, updateVideo, type OwnVideo, type SnippetEdit } from '../../integrations/google/own';
import { AuthError } from '../../integrations/google/auth';
import { YtError } from '../../integrations/youtube/client';
import { ConfirmButton } from '../../components/ui';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle } from '../connections/useConnections';
import { useAsync } from '../research/shared';

type Kind = BulkOp['kind'];
type Item = { col: 'drafts'; rec: Draft } | { col: 'templates'; rec: Template } | { col: 'live'; rec: OwnVideo };

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
  const lines = before.length > 200 || after.length > 200 ? changedLines(before, after) : { before: [before], after: [after] };
  return (
    <div className="stack-s">
      <span className="small muted">{label}</span>
      {lines.before.map((l, i) => (
        <del key={`b${i}`} className="small" dir="auto" style={{ color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>
          {l || '∅'}
        </del>
      ))}
      {lines.after.map((l, i) => (
        <ins key={`a${i}`} className="small" dir="auto" style={{ color: 'var(--success)', textDecoration: 'none', whiteSpace: 'pre-wrap' }}>
          {l || '∅'}
        </ins>
      ))}
    </div>
  );
}

export function BulkView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const drafts = useCollection('drafts');
  const templates = useCollection('templates');
  const profiles = useCollection('profiles').items;

  const [useDrafts, setUseDrafts] = useState(true);
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
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const g = useGoogle();
  const channel = g.channels.find((c) => c.channelId === g.activeChannelId);
  const [useLive, setUseLive] = useState(false);
  const live = useAsync(useCallback((chId: string, pl: string, fresh: boolean) => ownVideos(chId, pl, 500, fresh), []));
  const [progress, setProgress] = useState<LiveProgress | null>(null);
  const [undo, setUndo] = useState<LiveUndoBatch[]>([]);
  useEffect(() => {
    void listLiveUndo().then(setUndo);
  }, []);
  useEffect(() => {
    if (useLive && channel?.uploadsPlaylistId && !live.data && !live.loading) void live.run(channel.channelId, channel.uploadsPlaylistId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLive, channel?.channelId]);

  const op: BulkOp = useMemo(() => {
    switch (kind) {
      case 'replace':
        return { kind, find, replace, matchCase, wholeWord, fields };
      case 'addTags':
      case 'removeTags':
        return { kind, tags: parseTags(tagText) };
      case 'addText':
        return { kind, text, position };
    }
  }, [kind, find, replace, matchCase, wholeWord, fields, tagText, text, position]);

  const ready = kind === 'replace' ? !!find && fields.length > 0 : kind === 'addText' ? !!text.trim() : parseTags(tagText).length > 0;

  const changes: Change[] = useMemo(() => {
    if (!ready) return [];
    const local = [
      ...(useDrafts ? drafts.items.map((rec) => ({ col: 'drafts' as const, rec })) : []),
      ...(useTemplates ? templates.items.map((rec) => ({ col: 'templates' as const, rec })) : []),
    ].filter((i) => profileId === 'all' || (profileId === 'none' ? !i.rec.profileId : i.rec.profileId === profileId));
    const items: Item[] = [...local, ...(useLive && live.data ? live.data.map((rec) => ({ col: 'live' as const, rec })) : [])];
    const re = op.kind === 'replace' ? findPattern(op) : null;
    const out: Change[] = [];
    for (const item of items) {
      const next = applyBulk<Draft | Template | OwnVideo>(item.rec, op);
      const f = changedFields(item.rec, next);
      if (!f.length) continue;
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
      out.push({ key: `${item.col}:${item.rec.id}`, item, next, fields: f, matches, overLimit });
    }
    return out;
  }, [ready, op, useDrafts, useTemplates, drafts.items, templates.items, profileId, useLive, live.data]);

  const selected = changes.filter((c) => !excluded.has(c.key));
  const localSelected = selected.filter((c) => c.item.col !== 'live');
  const liveSelected = selected.filter((c) => c.item.col === 'live' && !c.overLimit);

  // Applies the operation to each video's live snippet (re-read just before writing), one at a time.
  const applyLive = async () => {
    if (!channel) return;
    const entries: LiveUndoEntry[] = [];
    const p: LiveProgress = { done: 0, total: liveSelected.length, changed: 0, skipped: 0, failed: [] };
    setProgress({ ...p });
    for (const c of liveSelected) {
      try {
        const r = await updateVideo(channel.channelId, c.item.rec.id, (cur) => {
          const next = applyBulk(cur, op);
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
      await pushLiveUndo({ at: new Date().toISOString(), label: kind === 'replace' ? `${find} → ${replace}` : t(`bulk.op.${kind}` as MessageKey), entries });
      setUndo(await listLiveUndo());
    }
    void live.run(channel.channelId, channel.uploadsPlaylistId!, true);
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
    if (channel?.uploadsPlaylistId) void live.run(channel.channelId, channel.uploadsPlaylistId, true);
  };
  const num = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US');

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

  const toggleField = (f: BulkField) => setFields((all) => (all.includes(f) ? all.filter((x) => x !== f) : [...all, f]));
  const ops: { k: Kind; label: MessageKey }[] = [
    { k: 'replace', label: 'bulk.op.replace' },
    { k: 'addTags', label: 'bulk.op.addTags' },
    { k: 'removeTags', label: 'bulk.op.removeTags' },
    { k: 'addText', label: 'bulk.op.addText' },
  ];

  return (
    <section className="stack" aria-labelledby="bulk-h" data-testid="bulk-view">
      <h1 id="bulk-h">{t('bulk.heading')}</h1>
      <Notice>{t('bulk.scopeNote')}</Notice>

      <div className="card stack">
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={useDrafts} onChange={(e) => setUseDrafts(e.target.checked)} />
            <span>{t('nav.drafts')}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={useTemplates} onChange={(e) => setUseTemplates(e.target.checked)} />
            <span>{t('nav.templates')}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={useLive} disabled={!channel} onChange={(e) => setUseLive(e.target.checked)} data-testid="bulk-live" />
            <span>{channel ? t('bulk.liveScope', { name: channel.title }) : t('bulk.liveNeedsSignIn')}</span>
          </label>
          <Field label={t('draft.channel')}>
            {({ id }) => (
              <select id={id} className="select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                <option value="all">{t('bulk.allChannels')}</option>
                <option value="none">{t('draft.noChannel')}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="tabs" role="tablist" aria-label={t('bulk.operation')}>
          {ops.map((o) => (
            <button key={o.k} type="button" role="tab" aria-selected={kind === o.k} onClick={() => setKind(o.k)}>
              {t(o.label)}
            </button>
          ))}
        </div>

        {kind === 'replace' && (
          <>
            <div className="row">
              <div className="grow">
                <Field label={t('bulk.find')}>{({ id }) => <input id={id} className="input" dir="auto" value={find} onChange={(e) => setFind(e.target.value)} data-testid="bulk-find" />}</Field>
              </div>
              <div className="grow">
                <Field label={t('bulk.replaceWith')} help={t('bulk.replaceHelp')}>
                  {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input" dir="auto" value={replace} onChange={(e) => setReplace(e.target.value)} data-testid="bulk-replace" />}
                </Field>
              </div>
            </div>
            <div className="row">
              {(['title', 'description', 'tags'] as BulkField[]).map((f) => (
                <label key={f} className="check">
                  <input type="checkbox" checked={fields.includes(f)} onChange={() => toggleField(f)} />
                  <span>{t(`draft.${f}` as MessageKey)}</span>
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
            <div className="row">
              <label className="check">
                <input type="radio" name="bulk-pos" checked={position === 'start'} onChange={() => setPosition('start')} />
                <span>{t('bulk.atStart')}</span>
              </label>
              <label className="check">
                <input type="radio" name="bulk-pos" checked={position === 'end'} onChange={() => setPosition('end')} />
                <span>{t('bulk.atEnd')}</span>
              </label>
            </div>
          </>
        )}
      </div>

      {useLive && live.loading && <p className="muted">{t('bulk.loadingLive')}</p>}
      <ErrorNotice error={live.error} />
      {progress && (
        <Notice tone={progress.failed.length ? 'warning' : progress.done === progress.total ? 'success' : 'info'}>
          <p role="status">{t('bulk.liveProgress', { done: num.format(progress.done), total: num.format(progress.total), changed: num.format(progress.changed), skipped: num.format(progress.skipped), failed: num.format(progress.failed.length) })}</p>
          {progress.failed.slice(0, 5).map((f, i) => (
            <div key={i} className="small">
              <bdi>{f.title}</bdi>
              <ErrorNotice error={f.error} />
            </div>
          ))}
          {!!progress.stopped && <p className="small">{t('bulk.liveStopped')}</p>}
        </Notice>
      )}
      {undo.length > 0 && (
        <div className="card stack-s">
          <h2>{t('bulk.liveHistory')}</h2>
          <ul className="list">
            {undo.map((b) => (
              <li key={b.at} className="list-item row-between">
                <span className="small">
                  <bdi>{b.label}</bdi> · {t('bulk.videosCount', { n: num.format(b.entries.length) })} · {new Date(b.at).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-GB')}
                </span>
                <ConfirmButton
                  size="s"
                  danger={false}
                  label={t('bulk.undoLive')}
                  question={t('bulk.undoLiveConfirm', { n: num.format(b.entries.length) })}
                  confirmLabel={t('bulk.undoLive')}
                  onConfirm={() => undoLive(b)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {ready && (
        <div className="card stack-s" data-testid="bulk-preview">
          <div className="row-between">
            <h2>{t('bulk.preview', { n: num.format(changes.length) })}</h2>
            <div className="row">
              {localSelected.length > 0 && (
                <Button variant="primary" disabled={applying} onClick={() => void apply()} data-testid="bulk-apply">
                  {t('bulk.apply', { n: num.format(localSelected.length) })}
                </Button>
              )}
              {liveSelected.length > 0 && !(progress && progress.done < progress.total) && (
                <ConfirmButton
                  danger={false}
                  label={t('bulk.applyLive', { n: num.format(liveSelected.length) })}
                  question={t('bulk.applyLiveConfirm', { n: num.format(liveSelected.length), units: num.format(liveSelected.length * UPDATE_COST + 1) })}
                  confirmLabel={t('bulk.applyLiveGo')}
                  onConfirm={() => applyLive()}
                />
              )}
            </div>
          </div>
          {changes.length === 0 ? (
            <Empty>{t('bulk.noChanges')}</Empty>
          ) : (
            <ul className="list">
              {changes.map((c) => (
                <li key={c.key} className="list-item">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!excluded.has(c.key)}
                      onChange={(e) =>
                        setExcluded((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.delete(c.key);
                          else n.add(c.key);
                          return n;
                        })
                      }
                    />
                    <span dir="auto" style={{ fontWeight: 600 }}>
                      {nameOf(c.item) || t('draft.untitled')}
                    </span>
                    <span className={`badge ${c.item.col === 'live' ? 'badge-accent' : ''}`}>
                      {c.item.col === 'drafts' ? t('bulk.kind.draft') : c.item.col === 'live' ? t('bulk.kind.video') : t('bulk.kind.template')}
                    </span>
                    {c.matches > 0 && <span className="badge">{t('bulk.matches', { n: num.format(c.matches) })}</span>}
                  </label>
                  {c.overLimit && <Notice tone="warning">{t(c.item.col === 'live' ? 'bulk.overLimitLive' : 'bulk.overLimit')}</Notice>}
                  {c.fields.includes('title') && <Diff label={t('draft.title')} before={(c.item.rec as Draft).title} after={(c.next as Draft).title} />}
                  {c.fields.includes('description') && <Diff label={t('draft.description')} before={c.item.rec.description} after={c.next.description} />}
                  {c.fields.includes('tags') && <Diff label={t('draft.tags')} before={c.item.rec.tags.join(', ')} after={c.next.tags.join(', ')} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
