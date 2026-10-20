import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyTemplate, checkDraft, formatDraftAsText, LIMITS, parseTags, tagsCharCount } from '../../domain/metadata';
import { newBase, type Draft, type Lang } from '../../domain/models';
import { canonicalUrl, isCapturable, type PageContext } from '../../domain/pageContext';
import { sanitizeRecord } from '../../domain/records';
import { charCount, utf8Bytes } from '../../domain/text';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Button, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { copyText, downloadText, fileSlug } from '../../platform/files';
import { create, get, onDataChanged, put, remove, save } from '../../storage/db';
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

export function DraftEditor({
  draftId,
  compact = false,
  pageCtx,
  onDeleted,
}: {
  draftId: string;
  compact?: boolean;
  pageCtx?: PageContext | null;
  onDeleted?: () => void;
}) {
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const profiles = useCollection('profiles').items;
  const templates = useCollection('templates').items;

  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  const [tagsText, setTagsText] = useState('');
  const [status, setStatusState] = useState<SaveState>('saved');
  const [conflict, setConflict] = useState<Draft | undefined>();
  const [showPreview, setShowPreview] = useState(!compact);
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
    if (resetTags && d) setTagsText(d.tags.join(', '));
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

  if (draft === undefined) return <p className="muted">{t('common.loading')}</p>;
  if (draft === null) return <Notice tone="warning">{t('draft.notFound')}</Notice>;

  const profile = profiles.find((p) => p.id === draft.profileId);
  const visibleTemplates = templates.filter((tp) => !tp.profileId || tp.profileId === draft.profileId);
  const titleLen = charCount(draft.title);
  const descBytes = utf8Bytes(draft.description);
  const tagChars = tagsCharCount(draft.tags);
  const pageUrl = pageCtx && isCapturable(pageCtx.kind) ? canonicalUrl(pageCtx) : undefined;
  const contextDiffers = !!(compact && draft.source && pageUrl && pageUrl !== draft.source.url);

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
    update({ description: next.description, tags: next.tags });
    setTagsText(next.tags.join(', '));
    toast(t('draft.templateInserted'), {
      label: t('common.undo'),
      run: () => {
        update({ description: before.description, tags: before.tags });
        setTagsText(before.tags.join(', '));
      },
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

  const editor = (
    <div className="stack">
      <div className="row-between">
        <span className="small muted" role="status" aria-live="polite">
          {status === 'saved' ? `${statusText} · ${t('draft.updated', { date: formatDate(draft.updatedAt) })}` : statusText}
        </span>
        {status === 'failed' && (
          <Button size="s" onClick={() => void flush()}>
            {t('common.retry')}
          </Button>
        )}
      </div>

      {status === 'conflict' && (
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
      )}

      {draft.source && (
        <p className="small muted truncate">
          <a href={draft.source.url} target="_blank" rel="noreferrer noopener">
            <bdi>{t('draft.linkedTo', { title: draft.source.title ?? draft.source.searchQuery ?? draft.source.url })}</bdi>
          </a>
        </p>
      )}
      {contextDiffers && <Notice>{t('draft.contextDiffers')}</Notice>}

      <div className="row">
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

      <Field label={t('draft.title')} counter={t('draft.chars', { n: titleLen, max: LIMITS.titleChars })} over={titleLen > LIMITS.titleChars}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            style={{ minHeight: 0 }}
            rows={2}
            dir="auto"
            lang={draft.language}
            value={draft.title}
            onChange={(e) => update({ title: e.target.value.replace(/\n/g, ' ') })}
          />
        )}
      </Field>

      <Field
        label={t('draft.description')}
        counter={t('draft.bytes', { n: descBytes, max: LIMITS.descriptionBytes })}
        over={descBytes > LIMITS.descriptionBytes}
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            rows={compact ? 6 : 10}
            dir="auto"
            lang={draft.language}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        )}
      </Field>

      <Field
        label={t('draft.tags')}
        help={t('draft.tagsHelp')}
        counter={t('draft.tagChars', { n: tagChars, max: LIMITS.tagsChars })}
        over={tagChars > LIMITS.tagsChars}
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            style={{ minHeight: 0 }}
            rows={2}
            dir="auto"
            lang={draft.language}
            value={tagsText}
            onChange={(e) => {
              setTagsText(e.target.value);
              update({ tags: parseTags(e.target.value) });
            }}
            onBlur={() => setTagsText(draft.tags.join(', '))}
          />
        )}
      </Field>

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

      <div className="row">
        <Field label={t('draft.insertTemplate')}>
          {({ id }) => (
            <select
              id={id}
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
      </div>
      {tplName === null ? (
        <div>
          <Button size="s" variant="ghost" onClick={() => setTplName('')} disabled={!draft.description.trim() && draft.tags.length === 0}>
            {t('draft.saveAsTemplate')}
          </Button>
        </div>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void saveAsTemplate();
          }}
        >
          <Field label={t('draft.templateName')}>
            {({ id }) => <input id={id} className="input" dir="auto" autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} />}
          </Field>
          <div className="row" style={{ alignSelf: 'flex-end' }}>
            <button type="submit" className="btn btn-primary btn-s" disabled={!tplName.trim()}>
              {t('common.save')}
            </button>
            <Button size="s" onClick={() => setTplName(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );

  const side = (
    <div className="stack">
      <section className="card stack-s" aria-labelledby={`checks-${draft.id}`}>
        <h2 id={`checks-${draft.id}`}>{t('checks.heading')}</h2>
        <Checks checks={checks} />
      </section>
      <section className="card stack-s" aria-labelledby={`pkg-${draft.id}`}>
        <h2 id={`pkg-${draft.id}`}>{t('draft.package')}</h2>
        <p className="small muted">{t('settings.writesState')}</p>
        <div className="row">
          <Button size="s" onClick={() => void copy(draft.title)}>
            {t('draft.copyTitle')}
          </Button>
          <Button size="s" onClick={() => void copy(draft.description)}>
            {t('draft.copyDescription')}
          </Button>
          <Button size="s" onClick={() => void copy(draft.tags.join(', '))}>
            {t('draft.copyTags')}
          </Button>
          <Button size="s" onClick={() => void copy(formatDraftAsText(draft))}>
            {t('draft.copyAll')}
          </Button>
          <Button size="s" onClick={() => downloadText(`tubex-${fileSlug(draft.title)}.txt`, formatDraftAsText(draft))}>
            {t('draft.download')}
          </Button>
        </div>
      </section>
      <section className="card stack-s" aria-labelledby={`pv-${draft.id}`}>
        <div className="row-between">
          <h2 id={`pv-${draft.id}`}>{t('preview.heading')}</h2>
          {compact && (
            <Button size="s" variant="ghost" aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? t('common.close') : t('common.open')}
            </Button>
          )}
        </div>
        {showPreview && <Preview draft={draft} channelName={profile?.name} />}
      </section>
      <div>
        <Button variant="danger" size="s" onClick={() => void deleteDraft()}>
          {t('common.delete')}
        </Button>
      </div>
    </div>
  );

  return compact ? (
    <div className="stack">
      {editor}
      {side}
    </div>
  ) : (
    <div className="editor-grid">
      {editor}
      {side}
    </div>
  );
}
