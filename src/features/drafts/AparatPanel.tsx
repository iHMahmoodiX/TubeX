// Aparat package (A1, #17): one finished video, a second editable package for Aparat. Checked against Aparat's own
// rules (never YouTube's), copied or downloaded, then published by the owner on Aparat's upload page. TubeX does not
// upload, sign in to Aparat or call any Aparat endpoint; the owner records the status and URL afterwards.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Field, Notice } from '../../components/ui';
import { APARAT_AI_INSTRUCTIONS, APARAT_AI_TASK, APARAT_UPLOAD_URL, aparatFromDraft, aparatPackageText, checkAparat, parseAparatAi, parseTags, type AparatAiResult } from '../../domain/aparat';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { PUBLISH_STATUSES, nowIso, type AparatPackage, type Draft, type PublishStatus } from '../../domain/models';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { copyText, downloadText, fileSlug } from '../../platform/files';

export function AparatPanel({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const p = draft.platforms?.aparat;
  const [tagText, setTagText] = useState(p?.tags.join('، ') ?? '');
  useEffect(() => setTagText(p?.tags.join('، ') ?? ''), [draft.id, !!p]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened from the Aparat page: bring this card into view once.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('tubex.focus') !== 'aparat') return;
      sessionStorage.removeItem('tubex.focus');
    } catch {
      return;
    }
    const el = ref.current;
    if (el && el.offsetParent) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
  }, [draft.id]);

  const { ai } = useIntegrations();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<unknown>(null);
  const [aiOut, setAiOut] = useState<AparatAiResult | null>(null);
  const optimize = async (fresh = false) => {
    setAiBusy(true);
    setAiError(null);
    try {
      // The YouTube draft is the source, so a second run never compounds an earlier rewrite.
      const r = await runAiJson({
        task: APARAT_AI_TASK,
        instructions: APARAT_AI_INSTRUCTIONS,
        data: dataBlock('Focus keyword', draft.focusKeyword, 120) + dataBlock('YouTube title', draft.title, 300) + dataBlock('YouTube description', draft.description, 5000) + dataBlock('YouTube tags', draft.tags.join(', '), 1500),
        maxTokens: 2500,
        fresh,
      });
      const out = parseAparatAi(r.output);
      if (!out) throw new Error('bad-output');
      setAiOut(out);
    } catch (e) {
      setAiError(e);
    } finally {
      setAiBusy(false);
    }
  };
  const applyAi = () => {
    if (!aiOut || !p) return;
    setTagText(aiOut.tags.join('، '));
    set({ title: aiOut.title, description: aiOut.description, tags: aiOut.tags, ...(aiOut.category && !p.category.trim() && { category: aiOut.category }) });
    setAiOut(null);
  };
  const set = (patch: Partial<AparatPackage>) => p && update({ platforms: { ...draft.platforms, aparat: { ...p, ...patch } } });
  const prepare = () => {
    const next = aparatFromDraft(draft);
    setTagText(next.tags.join('، '));
    // A refill only replaces the text taken from the YouTube draft; Aparat-only fields and the status stay.
    const keep = p && { category: p.category, playlist: p.playlist, coverNote: p.coverNote, scheduleNote: p.scheduleNote, status: p.status, statusAt: p.statusAt, ...(p.url && { url: p.url }) };
    update({ platforms: { ...draft.platforms, aparat: { ...next, ...keep } } });
  };

  if (!p)
    return (
      <div className="stack-s" data-testid="aparat-panel" ref={ref}>
        <p className="small muted">{t('aparat.intro')}</p>
        <div>
          <Button size="s" variant="primary" onClick={prepare} data-testid="aparat-prepare">
            <Icon name="copy" />
            {t('aparat.prepare')}
          </Button>
        </div>
      </div>
    );

  const issues = checkAparat(p);
  const labels = { title: t('aparat.f.title'), description: t('aparat.f.description'), tags: t('aparat.f.tags'), category: t('aparat.f.category'), playlist: t('aparat.f.playlist'), cover: t('aparat.f.cover'), schedule: t('aparat.f.schedule') };
  const text = () => aparatPackageText(p, labels);

  return (
    <div className="stack" data-testid="aparat-panel" ref={ref}>
      <p className="small muted">{t('aparat.separate')}</p>
      <div className="card stack-s" style={{ background: 'var(--surface-2)' }} data-testid="aparat-ai">
        <div className="row-between" style={{ gap: 8 }}>
          <div className="stack-s" style={{ gap: 2 }}>
            <strong>{t('aparat.ai.title')}</strong>
            <span className="xsmall muted">{t('aparat.ai.help')}</span>
          </div>
          {ai.enabled ? (
            <Button size="s" variant="primary" disabled={aiBusy} onClick={() => void optimize(!!aiOut)} data-testid="aparat-ai-run">
              <Icon name="sparkle" />
              {aiBusy ? t('common.loading') : aiOut ? t('aparat.ai.again') : t('aparat.ai.run')}
            </Button>
          ) : (
            <a className="btn btn-s" href="#settings">
              {t('aparat.ai.setup')}
            </a>
          )}
        </div>
        <ErrorNotice error={aiError} />
        {aiOut && (
          <div className="stack-s small" data-testid="aparat-ai-out">
            {aiOut.why && <p className="muted">{aiOut.why}</p>}
            <p>
              <b>{t('aparat.f.title')}:</b> <bdi>{aiOut.title}</bdi>
            </p>
            <p>
              <b>{t('aparat.f.tags')}:</b> <bdi>{aiOut.tags.join('، ')}</bdi>
            </p>
            {aiOut.category && (
              <p>
                <b>{t('aparat.f.category')}:</b> <bdi>{aiOut.category}</bdi>
              </p>
            )}
            <details>
              <summary>{t('aparat.f.description')}</summary>
              <p dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                {aiOut.description}
              </p>
            </details>
            <div className="row" style={{ gap: 8 }}>
              <Button size="s" variant="primary" onClick={applyAi} data-testid="aparat-ai-apply">
                <Icon name="check" />
                {t('aparat.ai.apply')}
              </Button>
              <Button size="s" variant="ghost" onClick={() => setAiOut(null)}>
                {t('aparat.ai.discard')}
              </Button>
            </div>
          </div>
        )}
      </div>
      <Field label={labels.title} counter={`${[...p.title].length}`}>
        {({ id }) => <input id={id} className="input" dir="auto" value={p.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} />}
      </Field>
      <Field label={labels.category} help={t('aparat.categoryHelp')}>
        {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input" dir="auto" value={p.category} maxLength={100} onChange={(e) => set({ category: e.target.value })} />}
      </Field>
      <Field label={labels.tags} help={t('aparat.tagsHelp')} counter={`${p.tags.length}`}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            className="input"
            dir="auto"
            value={tagText}
            onChange={(e) => {
              setTagText(e.target.value);
              set({ tags: parseTags(e.target.value).slice(0, 50) });
            }}
          />
        )}
      </Field>
      <Field label={labels.description} counter={`${[...p.description].length}`}>
        {({ id }) => <textarea id={id} className="textarea" dir="auto" rows={6} value={p.description} onChange={(e) => set({ description: e.target.value })} />}
      </Field>
      <div className="grid-2">
        <Field label={labels.playlist}>
          {({ id }) => <input id={id} className="input" dir="auto" value={p.playlist} maxLength={200} onChange={(e) => set({ playlist: e.target.value })} />}
        </Field>
        <Field label={labels.schedule}>
          {({ id }) => <input id={id} className="input" dir="auto" value={p.scheduleNote} maxLength={200} placeholder={t('aparat.schedulePh')} onChange={(e) => set({ scheduleNote: e.target.value })} />}
        </Field>
      </div>
      <Field label={labels.cover} help={t('aparat.coverHelp')}>
        {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input" dir="auto" value={p.coverNote} maxLength={200} onChange={(e) => set({ coverNote: e.target.value })} />}
      </Field>

      <div className="stack-s" aria-live="polite" data-testid="aparat-checks">
        {issues.length === 0 ? (
          <Notice tone="success">{t('aparat.ready')}</Notice>
        ) : (
          <ul className="stack-s small" style={{ margin: 0, paddingInlineStart: 18 }}>
            {issues.map((i) => (
              <li key={i.id} data-severity={i.severity}>
                <strong>{t(i.severity === 'error' ? 'aparat.sev.error' : 'aparat.sev.warning')}</strong> {t(`aparat.issue.${i.id}` as MessageKey, i.values)}
                {i.source === 'inferred' && <span className="faint"> · {t('aparat.inferred')}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Button size="s" variant="primary" onClick={() => void copyText(text()).then((ok) => toast(ok ? t('aparat.copied') : t('error.generic')))} data-testid="aparat-copy">
          <Icon name="copy" />
          {t('aparat.copy')}
        </Button>
        <Button size="s" onClick={() => downloadText(`${fileSlug(p.title || 'aparat')}-aparat.txt`, text())}>
          <Icon name="download" />
          {t('aparat.download')}
        </Button>
        <a className="btn btn-s" href={APARAT_UPLOAD_URL} target="_blank" rel="noreferrer noopener" data-testid="aparat-open">
          <Icon name="external" />
          {t('aparat.open')}
        </a>
      </div>
      <p className="xsmall faint">{t('aparat.handoff')}</p>

      <hr className="divider" />
      <div className="grid-2">
        <Field label={t('aparat.status')}>
          {({ id }) => (
            <select id={id} className="select" value={p.status} onChange={(e) => set({ status: e.target.value as PublishStatus, statusAt: nowIso() })}>
              {PUBLISH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`aparat.st.${s}` as MessageKey)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('aparat.url')} help={t('aparat.urlHelp')}>
          {({ id, describedBy }) => (
            <input id={id} aria-describedby={describedBy} className="input" dir="ltr" inputMode="url" placeholder="https://www.aparat.com/v/…" value={p.url ?? ''} maxLength={300} onChange={(e) => set({ url: e.target.value.trim() || undefined, statusAt: nowIso() })} />
          )}
        </Field>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <ConfirmButton size="s" danger={false} label={t('aparat.refill')} question={t('aparat.refillQ')} confirmLabel={t('aparat.refill')} onConfirm={prepare} />
        <ConfirmButton
          size="s"
          label={t('aparat.remove')}
          question={t('aparat.removeQ')}
          confirmLabel={t('aparat.remove')}
          onConfirm={() => {
            const { aparat: _drop, ...rest } = draft.platforms ?? {};
            update({ platforms: Object.keys(rest).length ? rest : undefined });
          }}
        />
      </div>
    </div>
  );
}
