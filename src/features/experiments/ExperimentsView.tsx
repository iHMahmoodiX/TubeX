// A/B test assistant (#12): variants (up to 3 titles/thumbnails) for one owned video → see them in feed/search
// contexts (#13) → hand off to Studio's Test & Compare with a checklist → record the result Studio shows →
// decision log. TubeX never starts a test, never changes the video and never reads hidden Studio data.
import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { Avatar, Button, ConfirmButton, Empty, Field, Notice, PageHeader, Thumb } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { checkResults, experimentIssues, HANDOFF_STEPS, MAX_VARIANTS, PREVIEW_SIZE, testCompareUrl, testKind, variantIssues } from '../../domain/experiments';
import { EXPERIMENT_STATUSES, newBase, newId, nowIso, type Experiment, type ExperimentStatus, type Variant } from '../../domain/models';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { create, put, remove } from '../../storage/db';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { useChannel, useOwnVideos } from '../reports/hooks';
import { SignedOut, TrackSkeleton } from '../reports/shared';
import { useFormat } from '../research/shared';
import { ContextPreview } from '../thumbs/ContextPreview';
import type { RVideo } from '../reports/data';
import './experiments.css';

/** Re-encodes an image to a small JPEG preview (the original file stays with the owner for Studio). */
async function preview(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, PREVIEW_SIZE.width / bmp.width, PREVIEW_SIZE.height / bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.8);
}

export function ExperimentsView({ id }: { id?: string }) {
  const { t } = useI18n();
  const { g, active } = useChannel();
  const vids = useOwnVideos(active);
  const exps = useCollection('experiments');
  const [sel, setSel] = useState<string | undefined>(id);
  useEffect(() => setSel(id), [id]);
  const mine = exps.items.filter((e) => e.channelId === active?.channelId);

  // #experiments/new:<videoId> creates a draft experiment for that video (from the Improve queue).
  useEffect(() => {
    if (!active || !vids.data || !sel?.startsWith('new:')) return;
    const videoId = sel.slice(4);
    const v = vids.data.find((x) => x.id === videoId);
    if (!v) return;
    const existing = mine.find((e) => e.videoId === videoId && (e.status === 'draft' || e.status === 'running'));
    if (existing) return void (location.hash = `experiments/${encodeURIComponent(existing.id)}`);
    void newExperiment(active.channelId, v).then((e) => (location.hash = `experiments/${encodeURIComponent(e.id)}`));
  }, [active, vids.data, sel, mine]);

  const current = mine.find((e) => e.id === sel);
  return (
    <div className="stack-l">
      <PageHeader
        kicker={active ? `${t('nav.experiments')} · ${active.title}` : t('nav.experiments')}
        title={current ? current.videoTitle : t('ab.title')}
        desc={t('ab.desc')}
        art={active ? <Avatar src={active.thumbnail} name={active.title} size="l" /> : undefined}
        actions={current ? <a className="btn btn-s" href="#experiments">{t('ab.all')}</a> : undefined}
      />
      {!g.loaded ? (
        <TrackSkeleton rows={3} />
      ) : !active ? (
        <SignedOut />
      ) : current ? (
        <Editor key={current.id} e={current} channelName={active.title} />
      ) : (
        <List exps={mine} videos={vids.data} loading={vids.loading} channelId={active.channelId} />
      )}
    </div>
  );
}

async function newExperiment(channelId: string, v: RVideo): Promise<Experiment> {
  const a: Variant = { id: newId(), title: v.title, thumbNote: '', rationale: '' };
  const b: Variant = { id: newId(), title: '', thumbNote: '', rationale: '' };
  return create('experiments', { ...newBase(), channelId, videoId: v.id, videoTitle: v.title, hypothesis: '', status: 'draft', variants: [a, b], results: [], decision: '' });
}

function List({ exps, videos, loading, channelId }: { exps: Experiment[]; videos?: RVideo[]; loading: boolean; channelId: string }) {
  const { t } = useI18n();
  const f = useFormat();
  const [pick, setPick] = useState('');
  const pub = (videos ?? []).filter((v) => v.privacy === 'public');
  return (
    <div className="stack-l">
      <form
        className="row"
        onSubmit={(ev) => {
          ev.preventDefault();
          const v = pub.find((x) => x.id === pick);
          if (v) void newExperiment(channelId, v).then((e) => (location.hash = `experiments/${encodeURIComponent(e.id)}`));
        }}
      >
        <select className="select" aria-label={t('ab.pickVideo')} value={pick} onChange={(e) => setPick(e.target.value)} disabled={!pub.length} style={{ maxWidth: 420 }}>
          <option value="">{loading ? t('common.loading') : t('ab.pickVideo')}</option>
          {pub.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
        <Button variant="primary" type="submit" disabled={!pick}>
          <Icon name="plus" />
          {t('ab.new')}
        </Button>
      </form>
      {!exps.length ? (
        <Empty icon="layers" title={t('ab.emptyTitle')}>
          {t('ab.empty')}
        </Empty>
      ) : (
        <ul className="ab-list">
          {exps.map((e) => (
            <li key={e.id}>
              <a href={`#experiments/${encodeURIComponent(e.id)}`} className="ab-row">
                <Thumb videoId={e.videoId} width={96} />
                <span className="stack-s" style={{ minWidth: 0 }}>
                  <b dir="auto" className="clamp-2">
                    {e.videoTitle}
                  </b>
                  <span className="xsmall muted">
                    {t(`ab.status.${e.status}` as MessageKey)} · {t('ab.variantsN', { n: f.int(e.variants.length) })} · {f.date(e.updatedAt)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="xsmall faint">{t('ab.studioFacts')}</p>
    </div>
  );
}

function Editor({ e, channelName }: { e: Experiment; channelName: string }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<Experiment>(e);
  useEffect(() => setDraft(e), [e]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(e);
  const issues = experimentIssues(draft);
  const kind = testKind(draft);
  const res = checkResults(draft);
  const language: 'fa' | 'en' = /[؀-ۿ]/.test(draft.videoTitle) ? 'fa' : 'en';
  const save = async (next: Experiment = draft) => {
    await put('experiments', next);
    toast(t('ab.saved'));
  };
  // Autosave edits after a short pause so nothing is lost on navigation.
  useEffect(() => {
    if (!dirty) return;
    const h = setTimeout(() => void put('experiments', draft), 800);
    return () => clearTimeout(h);
  }, [draft, dirty]);

  const setVariant = (id: string, patch: Partial<Variant>) => setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  const setStatus = (s: ExperimentStatus) =>
    void save({ ...draft, status: s, ...(s === 'running' && !draft.startedAt && { startedAt: nowIso() }), ...((s === 'finished' || s === 'abandoned') && { endedAt: nowIso() }) });
  const letter = (i: number) => String.fromCharCode(65 + i);
  const candidates = useMemo(() => draft.variants.map((v, i) => ({ key: v.id, label: letter(i), title: v.title, thumb: v.thumb })), [draft.variants]);

  return (
    <div className="stack-l">
      <div className="row">
        <span className="badge badge-accent">{t(`ab.status.${draft.status}` as MessageKey)}</span>
        <select className="select" aria-label={t('ab.statusLabel')} value={draft.status} onChange={(ev) => setStatus(ev.target.value as ExperimentStatus)} style={{ maxWidth: 200 }}>
          {EXPERIMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`ab.status.${s}` as MessageKey)}
            </option>
          ))}
        </select>
        <span className="grow" />
        <ConfirmButton
          label={t('common.delete')}
          question={t('ab.deleteQ')}
          confirmLabel={t('common.delete')}
          onConfirm={async () => {
            await remove('experiments', e.id);
            location.hash = 'experiments';
          }}
        />
      </div>

      <Field label={t('ab.hypothesis')} help={t('ab.hypothesisHelp')}>
        {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="auto" rows={2} value={draft.hypothesis} onChange={(ev) => setDraft({ ...draft, hypothesis: ev.target.value })} />}
      </Field>

      <section className="stack" aria-labelledby="ab-v">
        <h2 id="ab-v" className="h3">
          {t('ab.variants')}
        </h2>
        <div className="ab-variants">
          {draft.variants.map((v, i) => {
            const vi = variantIssues(v, draft.variants, { title: draft.videoTitle });
            return (
              <article key={v.id} className="ab-variant" data-testid="ab-variant">
                <div className="row-between">
                  <b>
                    {t('ab.variant', { l: letter(i) })} {i === 0 && <span className="xsmall muted">· {t('ab.current')}</span>}
                  </b>
                  {i > 0 && (
                    <button type="button" className="icon-btn" aria-label={t('ab.removeVariant')} onClick={() => setDraft({ ...draft, variants: draft.variants.filter((x) => x.id !== v.id), results: draft.results.filter((r) => r.variantId !== v.id) })}>
                      <Icon name="x" />
                    </button>
                  )}
                </div>
                <div className="ab-thumb">
                  {v.thumb ? <img src={v.thumb} alt={t('ab.thumbAlt', { l: letter(i) })} /> : i === 0 ? <Thumb videoId={draft.videoId} width={320} /> : <span className="muted small">{t('ab.noThumb')}</span>}
                </div>
                <label className="btn btn-s">
                  <Icon name="image" />
                  {v.thumb ? t('ab.replaceThumb') : t('ab.addThumb')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={async (ev) => {
                      const file = ev.target.files?.[0];
                      ev.target.value = '';
                      if (!file) return;
                      try {
                        setVariant(v.id, { thumb: await preview(file) });
                      } catch {
                        toast(t('thumb.loadError'));
                      }
                    }}
                  />
                </label>
                <Field label={t('ab.titleLabel')}>
                  {({ id }) => <input id={id} className="input" dir="auto" value={v.title} maxLength={140} onChange={(ev) => setVariant(v.id, { title: ev.target.value })} />}
                </Field>
                <Field label={t('ab.rationale')}>
                  {({ id }) => <textarea id={id} className="textarea" dir="auto" rows={2} value={v.rationale} onChange={(ev) => setVariant(v.id, { rationale: ev.target.value })} />}
                </Field>
                <Field label={t('ab.thumbNote')}>
                  {({ id }) => <input id={id} className="input" dir="auto" value={v.thumbNote} onChange={(ev) => setVariant(v.id, { thumbNote: ev.target.value })} />}
                </Field>
                {vi.map((x) => (
                  <p key={x} className="xsmall ab-issue">
                    <Icon name="alert" /> {t(`ab.issue.${x}` as MessageKey)}
                  </p>
                ))}
              </article>
            );
          })}
        </div>
        <div className="row">
          {draft.variants.length < MAX_VARIANTS && (
            <Button size="s" onClick={() => setDraft({ ...draft, variants: [...draft.variants, { id: newId(), title: '', thumbNote: '', rationale: '' }] })}>
              <Icon name="plus" />
              {t('ab.addVariant')}
            </Button>
          )}
          <AiVariants e={draft} onUse={(title, rationale) => {
            const empty = draft.variants.find((v, i) => i > 0 && !v.title.trim());
            if (empty) setVariant(empty.id, { title, rationale });
            else if (draft.variants.length < MAX_VARIANTS) setDraft({ ...draft, variants: [...draft.variants, { id: newId(), title, rationale, thumbNote: '' }] });
            else toast(t('ab.full'));
          }} />
          {dirty && (
            <Button size="s" variant="primary" onClick={() => void save()}>
              {t('common.save')}
            </Button>
          )}
        </div>
        {issues.map((x) => (
          <Notice key={x} tone="warning">
            {t(`ab.eissue.${x}` as MessageKey)}
          </Notice>
        ))}
      </section>

      <section className="stack" aria-labelledby="ab-ctx">
        <h2 id="ab-ctx" className="h3">
          {t('ab.contexts')}
        </h2>
        <ContextPreview candidates={candidates.map((c, i) => (i === 0 && !c.thumb ? { ...c, thumb: `https://i.ytimg.com/vi/${encodeURIComponent(draft.videoId)}/mqdefault.jpg` } : c))} language={language} channelName={channelName} defaultQuery={draft.videoTitle} />
      </section>

      <section className="stack" aria-labelledby="ab-h">
        <h2 id="ab-h" className="h3">
          {t('ab.handoff')}
        </h2>
        <p className="small">{t('ab.handoffTests', { what: [kind.thumbnails && t('ab.kind.thumbnails'), kind.titles && t('ab.kind.titles')].filter(Boolean).join(' + ') || '—' })}</p>
        <ol className="ab-steps">
          {HANDOFF_STEPS.map((s) => (
            <li key={s} className="small">
              {t(`ab.step.${s}` as MessageKey)}
            </li>
          ))}
        </ol>
        <div className="row">
          <a className="btn btn-primary" href={testCompareUrl(draft.videoId)} target="_blank" rel="noreferrer noopener" aria-disabled={issues.length > 0} onClick={() => draft.status === 'draft' && !issues.length && setStatus('running')}>
            <Icon name="external" />
            {t('ab.openStudio')}
          </a>
          <Button
            size="s"
            onClick={async () => {
              const text = draft.variants.map((v, i) => `${letter(i)}: ${v.title}`).join('\n');
              try {
                await navigator.clipboard.writeText(text);
                toast(t('common.copied'));
              } catch {
                toast(t('common.copyFailed'));
              }
            }}
          >
            <Icon name="copy" />
            {t('ab.copyTitles')}
          </Button>
        </div>
        <p className="xsmall faint">{t('ab.studioFacts')}</p>
      </section>

      <section className="stack" aria-labelledby="ab-r">
        <h2 id="ab-r" className="h3">
          {t('ab.results')}
        </h2>
        <p className="small muted">{t('ab.resultsHelp')}</p>
        <div className="ab-results">
          {draft.variants.map((v, i) => {
            const r = draft.results.find((x) => x.variantId === v.id);
            const setR = (patch: { share?: number; note?: string }) =>
              setDraft((d) => {
                const others = d.results.filter((x) => x.variantId !== v.id);
                const cur = d.results.find((x) => x.variantId === v.id) ?? { variantId: v.id, note: '' };
                const next = { ...cur, ...patch };
                if (next.share === undefined) delete next.share;
                return { ...d, results: [...others, next] };
              });
            return (
              <div key={v.id} className="row ab-result">
                <b>{letter(i)}</b>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  aria-label={t('ab.share', { l: letter(i) })}
                  placeholder={t('ab.sharePh')}
                  style={{ maxWidth: 120 }}
                  value={r?.share ?? ''}
                  onChange={(ev) => setR({ share: ev.target.value === '' ? undefined : Math.max(0, Math.min(100, Number(ev.target.value))) })}
                />
                <span className="small">%</span>
                <input className="input" dir="auto" aria-label={t('ab.resultNote', { l: letter(i) })} placeholder={t('ab.resultNotePh')} value={r?.note ?? ''} onChange={(ev) => setR({ note: ev.target.value })} />
              </div>
            );
          })}
        </div>
        {res.total !== null && !res.sumOk && <Notice tone="warning">{t('ab.sumOff', { n: String(res.total) })}</Notice>}
        {res.leader && (
          <p className="small">
            {t('ab.leader', { l: letter(draft.variants.findIndex((v) => v.id === res.leader)) })}{' '}
            <Button size="s" variant="ghost" onClick={() => setDraft({ ...draft, winnerId: res.leader! })} disabled={draft.winnerId === res.leader}>
              {t('ab.setWinner')}
            </Button>
          </p>
        )}
        <Field label={t('ab.decision')} help={t('ab.decisionHelp')}>
          {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="auto" rows={3} value={draft.decision} onChange={(ev) => setDraft({ ...draft, decision: ev.target.value })} />}
        </Field>
        <p className="xsmall faint">{t('ab.resultsNote')}</p>
      </section>
    </div>
  );
}

const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null).slice(0, n) : []);

/** Optional AI title variants for the experiment (explicit click, existing provider and limits). */
function AiVariants({ e, onUse }: { e: Experiment; onUse: (title: string, rationale: string) => void }) {
  const { t } = useI18n();
  const { ai } = useIntegrations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [out, setOut] = useState<{ title: string; why: string }[] | null>(null);
  if (!ai.enabled) return null;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await runAiJson({
        task: 'ab.titles.v1',
        instructions:
          'Propose 3 alternative titles for an A/B test of this existing YouTube video, in the language of the current title. Each must test a different angle (benefit, curiosity, specificity), stay honest to the content and be under 100 characters. ' +
          'Return {"variants":[{"title": string, "why": one sentence naming the angle being tested}]}.',
        data: dataBlock('Current title', e.videoTitle, 300) + dataBlock('Hypothesis', e.hypothesis, 600),
        maxTokens: 600,
        fresh: !!out,
      });
      setOut(strs(r.output.variants, 3).map((x) => ({ title: String(x.title ?? '').slice(0, 140), why: String(x.why ?? '').slice(0, 300) })).filter((x) => x.title.trim()));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button size="s" variant="ghost" disabled={busy} onClick={() => void run()}>
        <Icon name="sparkle" />
        {busy ? t('common.loading') : t('ab.aiTitles')}
      </Button>
      <ErrorNotice error={error} />
      {out && (
        <ul className="ab-ai">
          {out.map((x, i) => (
            <li key={i} className="row-between">
              <span className="small" dir="auto">
                <b>{x.title}</b> <span className="muted">{x.why}</span>
              </span>
              <Button size="s" onClick={() => onUse(x.title, x.why)}>
                {t('ab.use')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
