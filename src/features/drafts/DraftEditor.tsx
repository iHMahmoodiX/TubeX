import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { checkCounts, readiness } from '../../domain/coreScore';
import { applyTemplate, checkDraft, extractHashtags, formatDraftAsText, LIMITS, sortTags, tagsCharCount } from '../../domain/metadata';
import { newBase, type Draft, type Lang } from '../../domain/models';
import { canonicalUrl, isCapturable, type PageContext } from '../../domain/pageContext';
import { sanitizeRecord } from '../../domain/records';
import { charCount, utf8Bytes } from '../../domain/text';
import { useCollection } from '../../components/hooks';
import { Icon, type IconName } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, Field, Notice, Score, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { copyText, downloadText, fileSlug } from '../../platform/files';
import { create, get, onDataChanged, put, remove, save } from '../../storage/db';
import { AiAssist } from '../ai/AiAssist';
import { ThumbnailCheck } from '../ai/ThumbnailCheck';
import { Cover, TagInput } from '../core/CoreUi';
import { Checks } from './Checks';
import { Preview } from './Preview';

type SaveState = 'saved' | 'dirty' | 'saving' | 'failed' | 'conflict';
const AUTOSAVE_MS = 500;

// Synchronous crash/close copy of unsaved edits. IndexedDB writes can be cut off when a panel closes;
// localStorage writes cannot. Cleared after a successful save.
const pendingKey = (id: string) => `tubex:pending-draft:${id}`;
function writePending(d: Draft) {
  try {
    localStorage.setItem(pendingKey(d.id), JSON.stringify(d));
  } catch {
    /* storage full or unavailable: autosave still runs */
  }
}
function readPending(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(pendingKey(id));
    return raw ? sanitizeRecord('drafts', JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function clearPending(id: string) {
  try {
    localStorage.removeItem(pendingKey(id));
  } catch {
    /* ignore */
  }
}
const sameContent = (a: Draft, b: Draft) =>
  a.title === b.title &&
  a.description === b.description &&
  a.focusKeyword === b.focusKeyword &&
  a.language === b.language &&
  a.profileId === b.profileId &&
  a.tags.join('\n') === b.tags.join('\n');

/** Collapsible side card with a round icon, used for the editor's secondary tools. */
function Fold({ icon, title, extra, open, children, testId }: { icon: IconName; title: string; extra?: ReactNode; open?: boolean; children: ReactNode; testId?: string }) {
  return (
    <details className="core-fold" open={open} data-testid={testId}>
      <summary>
        <span className="core-fold-icon">
          <Icon name={icon} />
        </span>
        <h2>{title}</h2>
        {extra}
      </summary>
      {children}
    </details>
  );
}

export function DraftEditor({
  draftId,
  compact = false,
  pageCtx,
  onDeleted,
  onBack,
}: {
  draftId: string;
  compact?: boolean;
  pageCtx?: PageContext | null;
  onDeleted?: () => void;
  /** Workspace only: back to the drafts list. */
  onBack?: () => void;
}) {
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const profiles = useCollection('profiles').items;
  const templates = useCollection('templates').items;

  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  // Remounts the tag input when tags are replaced from outside it (template, sort, AI, reload).
  const [tagKey, setTagKey] = useState(0);
  const [status, setStatusState] = useState<SaveState>('saved');
  const [conflict, setConflict] = useState<Draft | undefined>();
  const [tplName, setTplName] = useState<string | null>(null);

  const draftRef = useRef<Draft | null>(null);
  const statusRef = useRef<SaveState>('saved');
  const savingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setStatus = (s: SaveState) => {
    statusRef.current = s;
    setStatusState(s);
  };
  const setCurrent = (d: Draft | null, resetTags = false) => {
    draftRef.current = d;
    setDraft(d);
    if (resetTags && d) setTagKey((k) => k + 1);
  };

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const cur = draftRef.current;
    if (!cur || savingRef.current || (statusRef.current !== 'dirty' && statusRef.current !== 'failed')) return;
    savingRef.current = true;
    setStatus('saving');
    try {
      const res = await save('drafts', cur);
      if (res.ok) {
        const latest = draftRef.current ?? cur;
        const merged = { ...latest, rev: res.record.rev, updatedAt: res.record.updatedAt };
        setCurrent(merged);
        if (latest !== cur) {
          writePending(merged);
          setStatus('dirty');
          timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
        } else {
          clearPending(cur.id);
          setStatus('saved');
        }
      } else {
        setConflict(res.conflict);
        setStatus('conflict');
      }
    } catch {
      setStatus('failed');
    } finally {
      savingRef.current = false;
    }
  }, []);

  const update = useCallback(
    (patch: Partial<Draft>) => {
      const cur = draftRef.current;
      if (!cur || statusRef.current === 'conflict') return;
      const next = { ...cur, ...patch };
      setCurrent(next);
      writePending(next);
      setStatus('dirty');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );
  /** Update from outside the tag input (AI, templates, sort): the chips are rebuilt from the new tags. */
  const replace = useCallback(
    (patch: Partial<Draft>) => {
      update(patch);
      if (patch.tags) setTagKey((k) => k + 1);
    },
    [update],
  );

  // Load, with recovery of edits that were not yet saved when the page closed.
  useEffect(() => {
    let alive = true;
    setStatus('saved');
    setConflict(undefined);
    setDraft(undefined);
    get('drafts', draftId).then((stored) => {
      if (!alive) return;
      const pending = readPending(draftId);
      if (!stored) {
        setCurrent(null);
        return;
      }
      if (pending && !sameContent(pending, stored)) {
        setCurrent(pending, true);
        if (pending.rev === stored.rev) {
          setStatus('dirty');
          void flush();
        } else {
          setConflict(stored);
          setStatus('conflict');
        }
        return;
      }
      clearPending(draftId);
      setCurrent(stored, true);
    });
    return () => {
      alive = false;
    };
  }, [draftId, flush]);

  // Follow edits made in another TubeX window while this one has nothing unsaved.
  useEffect(
    () =>
      onDataChanged((name) => {
        if (name !== 'drafts' || statusRef.current !== 'saved') return;
        void get('drafts', draftId).then((rec) => {
          if (statusRef.current !== 'saved') return;
          if (!rec) setCurrent(null);
          else if (rec.rev !== draftRef.current?.rev) setCurrent(rec, true);
        });
      }),
    [draftId],
  );

  // Save before the page is hidden or the editor closes.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flush();
    };
  }, [flush]);

  const checks = useMemo(() => (draft ? checkDraft(draft) : []), [draft]);

  if (draft === undefined) return <Skeleton lines={6} />;
  if (draft === null) return <Notice tone="warning">{t('draft.notFound')}</Notice>;

  const profile = profiles.find((p) => p.id === draft.profileId);
  const visibleTemplates = templates.filter((tp) => !tp.profileId || tp.profileId === draft.profileId);
  const titleLen = charCount(draft.title);
  const descBytes = utf8Bytes(draft.description);
  const tagChars = tagsCharCount(draft.tags);
  const hashtags = extractHashtags(`${draft.title}\n${draft.description}`).length;
  const pageUrl = pageCtx && isCapturable(pageCtx.kind) ? canonicalUrl(pageCtx) : undefined;
  const contextDiffers = !!(compact && draft.source && pageUrl && pageUrl !== draft.source.url);
  const score = readiness(draft, checks);
  const counts = checkCounts(checks);

  const statusText = {
    saved: t('save.saved'),
    dirty: t('save.unsaved'),
    saving: t('save.saving'),
    failed: t('save.failed'),
    conflict: t('draft.conflict'),
  }[status];

  const copy = async (text: string) => toast((await copyText(text)) ? t('common.copied') : t('common.copyFailed'));

  const insertTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    const before = draftRef.current;
    if (!tpl || !before) return;
    const next = applyTemplate(before, tpl);
    replace({ description: next.description, tags: next.tags });
    toast(t('draft.templateInserted'), {
      label: t('common.undo'),
      run: () => replace({ description: before.description, tags: before.tags }),
    });
  };

  const saveAsTemplate = async () => {
    const name = tplName?.trim();
    if (!name) return;
    await create('templates', {
      ...newBase(),
      name,
      description: draft.description,
      tags: draft.tags,
      ...(draft.profileId && { profileId: draft.profileId }),
    });
    setTplName(null);
    toast(t('draft.templateSaved'));
  };

  const deleteDraft = async () => {
    clearTimeout(timer.current);
    const removed = await remove('drafts', draft.id);
    clearPending(draft.id);
    onDeleted?.();
    if (removed) toast(t('draft.deleted'), { label: t('common.undo'), run: () => void put('drafts', removed) });
  };

  const saveLine = (
    <span className="core-save" data-state={status} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      {status === 'saved' ? `${statusText} · ${t('draft.updated', { date: formatDate(draft.updatedAt) })}` : statusText}
      {status === 'failed' && (
        <Button size="s" variant="ghost" onClick={() => void flush()}>
          {t('common.retry')}
        </Button>
      )}
    </span>
  );

  const conflictNotice = status === 'conflict' && (
    <Notice tone="warning">
      <p>{t('draft.conflict')}</p>
      <div className="row">
        <Button
          size="s"
          onClick={async () => {
            const kept = await put('drafts', draftRef.current ?? draft);
            clearPending(kept.id);
            setConflict(undefined);
            setCurrent(kept, true);
            setStatus('saved');
          }}
        >
          {t('draft.keepMine')}
        </Button>
        {conflict && (
          <Button
            size="s"
            onClick={() => {
              clearPending(conflict.id);
              setCurrent(conflict, true);
              setConflict(undefined);
              setStatus('saved');
            }}
          >
            {t('draft.loadOther')}
          </Button>
        )}
      </div>
    </Notice>
  );

  const fields = (
    <div className="stack">
      <Field label={t('draft.title')} counter={t('draft.chars', { n: titleLen, max: LIMITS.titleChars })} over={titleLen > LIMITS.titleChars}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea core-title-input"
            rows={2}
            dir="auto"
            lang={draft.language}
            placeholder={t('core.draft.titlePlaceholder')}
            value={draft.title}
            onChange={(e) => update({ title: e.target.value.replace(/\n/g, ' ') })}
          />
        )}
      </Field>

      <Field
        label={t('draft.description')}
        help={t('core.draft.descStats', { chars: charCount(draft.description), hashtags })}
        counter={t('draft.bytes', { n: descBytes, max: LIMITS.descriptionBytes })}
        over={descBytes > LIMITS.descriptionBytes}
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            rows={compact ? 6 : 12}
            dir="auto"
            lang={draft.language}
            placeholder={t('core.draft.descPlaceholder')}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        )}
      </Field>

      <Field label={t('draft.tags')} help={t('core.draft.tagsHelp')} counter={t('draft.tagChars', { n: tagChars, max: LIMITS.tagsChars })} over={tagChars > LIMITS.tagsChars}>
        {({ id, describedBy }) => (
          <TagInput
            key={tagKey}
            id={id}
            describedBy={describedBy}
            tags={draft.tags}
            lang={draft.language}
            keyword={draft.focusKeyword}
            placeholder={t('core.draft.tagsPlaceholder')}
            onChange={(tags) => update({ tags })}
          />
        )}
      </Field>
      {draft.tags.length > 1 && (
        <div>
          <Button
            size="s"
            variant="ghost"
            onClick={() => {
              const before = draft.tags;
              replace({ tags: sortTags(before, draft.focusKeyword) });
              toast(t('draft.tagsSorted'), { label: t('common.undo'), run: () => replace({ tags: before }) });
            }}
          >
            <Icon name="sort" />
            {t('draft.sortTags')}
          </Button>
        </div>
      )}

      <Field label={t('draft.focusKeyword')} help={t('draft.focusKeywordHelp')}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            className="input"
            dir="auto"
            lang={draft.language}
            value={draft.focusKeyword}
            onChange={(e) => update({ focusKeyword: e.target.value })}
          />
        )}
      </Field>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
        <Field label={t('draft.channel')}>
          {({ id }) => (
            <select id={id} className="select" value={draft.profileId ?? ''} onChange={(e) => update({ profileId: e.target.value || undefined })}>
              <option value="">{t('draft.noChannel')}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('draft.language')}>
          {({ id }) => (
            <select id={id} className="select" value={draft.language} onChange={(e) => update({ language: e.target.value as Lang })}>
              <option value="fa">{t('lang.fa')}</option>
              <option value="en">{t('lang.en')}</option>
            </select>
          )}
        </Field>
      </div>
    </div>
  );

  const templatesPart = (
    <div className="stack-s">
      <Field label={t('draft.insertTemplate')} help={t('core.draft.templateHelp')}>
        {({ id, describedBy }) => (
          <select
            id={id}
            aria-describedby={describedBy}
            className="select"
            value=""
            disabled={visibleTemplates.length === 0}
            onChange={(e) => e.target.value && insertTemplate(e.target.value)}
          >
            <option value="">{visibleTemplates.length ? t('draft.chooseTemplate') : t('draft.noTemplates')}</option>
            {visibleTemplates.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {tplName === null ? (
        <div>
          <Button size="s" variant="ghost" onClick={() => setTplName('')} disabled={!draft.description.trim() && draft.tags.length === 0}>
            <Icon name="plus" />
            {t('draft.saveAsTemplate')}
          </Button>
        </div>
      ) : (
        <form
          className="row"
          style={{ alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault();
            void saveAsTemplate();
          }}
        >
          <div className="grow" style={{ minWidth: 160 }}>
            <Field label={t('draft.templateName')}>
              {({ id }) => <input id={id} className="input" dir="auto" autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} />}
            </Field>
          </div>
          <button type="submit" className="btn btn-primary btn-s" disabled={!tplName.trim()}>
            {t('common.save')}
          </button>
          <Button size="s" onClick={() => setTplName(null)}>
            {t('common.cancel')}
          </Button>
        </form>
      )}
    </div>
  );

  const scoreCard = (
    <div className="stack">
      <div className="core-score-row">
        <Score value={score} large={!compact} label={t('core.draft.readiness')} />
        <div className="stack-s grow" style={{ gap: 2 }}>
          <strong>{t('core.draft.readiness')}</strong>
          <span className="small muted">
            {counts.errors + counts.warnings === 0 && score !== null
              ? t('checks.allGood')
              : t('core.draft.toFix', { errors: counts.errors, warnings: counts.warnings })}
          </span>
        </div>
      </div>
      <Checks checks={checks} />
    </div>
  );

  const packageCard = (
    <div className="stack-s">
      <p className="small muted">{t('settings.writesState')}</p>
      <div className="core-pill-row">
        <Button size="s" onClick={() => void copy(draft.title)}>
          <Icon name="copy" />
          {t('draft.copyTitle')}
        </Button>
        <Button size="s" onClick={() => void copy(draft.description)}>
          <Icon name="copy" />
          {t('draft.copyDescription')}
        </Button>
        <Button size="s" onClick={() => void copy(draft.tags.join(', '))}>
          <Icon name="copy" />
          {t('draft.copyTags')}
        </Button>
      </div>
      <div className="core-pill-row">
        <Button size="s" variant="primary" onClick={() => void copy(formatDraftAsText(draft))}>
          <Icon name="copy" />
          {t('draft.copyAll')}
        </Button>
        <Button size="s" variant="ghost" onClick={() => downloadText(`tubex-${fileSlug(draft.title)}.txt`, formatDraftAsText(draft))}>
          <Icon name="download" />
          {t('draft.download')}
        </Button>
      </div>
    </div>
  );

  const ai = <AiAssist draft={draft} profile={profile} update={replace} />;
  const thumb = <ThumbnailCheck title={draft.title} language={draft.language} />;
  const preview = <Preview draft={draft} channelName={profile?.name} />;
  const sourceLink = draft.source && (
    <p className="small muted truncate">
      <a href={draft.source.url} target="_blank" rel="noreferrer noopener">
        <bdi>{t('draft.linkedTo', { title: draft.source.title ?? draft.source.searchQuery ?? draft.source.url })}</bdi>
      </a>
    </p>
  );

  if (compact)
    return (
      <div className="stack" data-testid="draft-editor">
        <div className="row-between">{saveLine}</div>
        {conflictNotice}
        {sourceLink}
        {contextDiffers && <Notice>{t('draft.contextDiffers')}</Notice>}
        {fields}
        <Fold icon="check" title={t('core.draft.readiness')} extra={<Score value={score} label={t('core.draft.readiness')} />} testId="checks-fold">
          {scoreCard}
        </Fold>
        <Fold icon="sparkle" title={t('ai.heading')} testId="ai-section">
          {ai}
        </Fold>
        <Fold icon="image" title={t('thumb.heading')}>
          {thumb}
        </Fold>
        <Fold icon="file" title={t('draft.package')}>
          {packageCard}
          <hr className="divider" style={{ marginBlock: 12 }} />
          {templatesPart}
        </Fold>
        <Fold icon="eye" title={t('preview.heading')} testId="preview-fold">
          {preview}
        </Fold>
        <div>
          <Button variant="danger" size="s" onClick={() => void deleteDraft()}>
            <Icon name="trash" />
            {t('common.delete')}
          </Button>
        </div>
      </div>
    );

  return (
    <div className="stack-l" data-testid="draft-editor">
      <header className="stack">
        <div className="row">
          {onBack && (
            <button type="button" className="btn btn-ghost btn-s" onClick={onBack}>
              <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
                <Icon name="chevron" />
              </span>
              {t('core.draft.allDrafts')}
            </button>
          )}
        </div>
        <div className="page-head">
          {draft.source?.videoId ? (
            <div className="core-cover core-cover-wide" aria-hidden="true">
              <img src={`https://i.ytimg.com/vi/${draft.source.videoId}/mqdefault.jpg`} alt="" referrerPolicy="no-referrer" />
            </div>
          ) : (
            <Cover icon="edit" size="s" />
          )}
          <div className="stack-s grow">
            <span className="page-kicker">{t('draft.heading')}</span>
            <h1 className="core-head-title" dir="auto">
              {draft.title.trim() || t('draft.untitled')}
            </h1>
            <div className="page-desc row">
              <span>{profile?.name ?? t('draft.noChannel')}</span>
              <span className="faint">·</span>
              <span>{t(`lang.${draft.language}`)}</span>
              <span className="faint">·</span>
              {saveLine}
            </div>
          </div>
        </div>
      </header>
      {conflictNotice}
      <div className="core-editor">
        <div className="stack">
          <section className="card" aria-label={t('core.draft.details')}>
            {sourceLink}
            {fields}
          </section>
          <section className="card" aria-labelledby={`tpl-${draft.id}`}>
            <h2 id={`tpl-${draft.id}`}>{t('nav.templates')}</h2>
            {templatesPart}
          </section>
          <section className="card" aria-labelledby={`pv-${draft.id}`}>
            <div className="card-head">
              <h2 id={`pv-${draft.id}`}>{t('preview.heading')}</h2>
            </div>
            {preview}
          </section>
          <div>
            <Button variant="danger" size="s" onClick={() => void deleteDraft()}>
              <Icon name="trash" />
              {t('core.draft.delete')}
            </Button>
          </div>
        </div>
        <div className="core-side">
          <section className="card" aria-label={t('core.draft.readiness')}>
            {scoreCard}
          </section>
          <section className="card" aria-labelledby={`ai-${draft.id}`} data-testid="ai-section">
            <div className="row" style={{ gap: 12 }}>
              <span className="core-section-icon" aria-hidden="true">
                <Icon name="sparkle" />
              </span>
              <h2 id={`ai-${draft.id}`}>{t('ai.heading')}</h2>
            </div>
            {ai}
          </section>
          <Fold icon="image" title={t('thumb.heading')}>
            {thumb}
          </Fold>
          <section className="card" aria-labelledby={`pkg-${draft.id}`}>
            <h2 id={`pkg-${draft.id}`}>{t('draft.package')}</h2>
            {packageCard}
          </section>
        </div>
      </div>
    </div>
  );
}
