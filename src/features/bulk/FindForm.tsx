// Step 1 form: what to find and what to put instead. Produces an FrOp (src/domain/bulk.ts) that the preview,
// the local apply and the background job all run unchanged.
import { useId } from 'react';
import { compileOp, regexError, type BulkField, type FrKind, type FrOp, type MatchOptions } from '../../domain/bulk';
import type { BlockMode } from '../../domain/engageBulk';
import { parseTags } from '../../domain/metadata';
import type { Template } from '../../domain/models';
import { Icon } from '../../components/icons';
import { Empty, Field, Tabs } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';

export interface FormState {
  kind: FrKind;
  find: string;
  replace: string;
  fields: BulkField[];
  start: string;
  end: string;
  block: string;
  keepMarkers: boolean;
  addText: string;
  position: 'start' | 'end';
  lineFind: string;
  urlFrom: string;
  urlTo: string;
  tagText: string;
  templateId: string;
  descMode: BlockMode;
  tagsMode: BlockMode;
  opts: MatchOptions;
}

export const INITIAL_FORM: FormState = {
  kind: 'replace',
  find: '',
  replace: '',
  fields: ['title', 'description', 'tags'],
  start: '',
  end: '',
  block: '',
  keepMarkers: true,
  addText: '',
  position: 'end',
  lineFind: '',
  urlFrom: '',
  urlTo: '',
  tagText: '',
  templateId: '',
  descMode: 'append',
  tagsMode: 'append',
  opts: { persian: true, matchCase: false, wholeWord: false, regex: false },
};

export function toOp(s: FormState, templates: Template[]): FrOp | null {
  switch (s.kind) {
    case 'replace':
      return { kind: 'replace', find: s.find, replace: s.replace, fields: s.fields, opts: s.opts };
    case 'block':
      return { kind: 'block', start: s.start, end: s.end, block: s.block, keepMarkers: s.keepMarkers, opts: { ...s.opts, regex: false, wholeWord: false } };
    case 'append':
      return { kind: 'append', block: s.addText, position: s.position, opts: { ...s.opts, regex: false, wholeWord: false } };
    case 'removeLines':
      return { kind: 'removeLines', find: s.lineFind, opts: s.opts };
    case 'urls':
      return { kind: 'urls', from: s.urlFrom, to: s.urlTo };
    case 'addTags':
    case 'removeTags':
      return { kind: s.kind, tags: parseTags(s.tagText) };
    case 'profile': {
      const tp = templates.find((x) => x.id === s.templateId);
      return tp ? { kind: 'profile', description: tp.description, tags: tp.tags, descriptionMode: s.descMode, tagsMode: s.tagsMode } : null;
    }
  }
}

/** Short label of an operation for job history and notifications. */
export function opLabel(op: FrOp, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  // First non-empty line, short; a multi-line block reads as "first line… (+N lines)".
  const cut = (x: string) => {
    const lines = x.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    const one = lines[0] ?? '';
    const short = one.length > 32 ? `${one.slice(0, 31)}…` : one;
    // First-strong isolate: a Persian text inside an English label (or the reverse) keeps its own direction.
    const iso = `\u2068${short}\u2069`;
    return lines.length > 1 ? `${iso} ${t('fr.label.more', { n: lines.length - 1 })}` : iso;
  };
  switch (op.kind) {
    case 'replace':
      return t('fr.label.pair', { a: cut(op.find), b: cut(op.replace) || t('fr.label.nothing') });
    case 'block':
      return t('fr.label.block', { start: cut(op.start), end: cut(op.end) });
    case 'append':
      return t('fr.label.append', { text: cut(op.block) });
    case 'removeLines':
      return t('fr.label.removeLines', { text: cut(op.find) });
    case 'urls':
      return t('fr.label.pair', { a: cut(op.from), b: cut(op.to) });
    case 'addTags':
      return `${t('bulk.op.addTags')}: ${cut(op.tags.join('، '))}`;
    case 'removeTags':
      return `${t('bulk.op.removeTags')}: ${cut(op.tags.join('، '))}`;
    case 'profile':
      return t('engage.bulk2.op.profile');
  }
}

function Toggle({ on, onChange, label, help }: { on: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  return (
    <button type="button" className="chip fr-toggle" aria-pressed={on} title={help} onClick={() => onChange(!on)}>
      {on && <Icon name="check" />}
      {label}
    </button>
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

const rowsFor = (s: string, min = 2) => Math.min(10, Math.max(min, s.split('\n').length + 1));

export function FindForm({ s, set, templates, live }: { s: FormState; set: (p: Partial<FormState>) => void; templates: Template[]; live: boolean }) {
  const { t } = useI18n();
  const helpId = useId();
  const opts = s.opts;
  const setOpts = (p: Partial<MatchOptions>) => set({ opts: { ...opts, ...p } });
  const kinds: { id: FrKind; label: string }[] = [
    { id: 'replace', label: t('fr.op.replace') },
    { id: 'block', label: t('fr.op.block') },
    { id: 'append', label: t('fr.op.append') },
    { id: 'removeLines', label: t('fr.op.removeLines') },
    { id: 'urls', label: t('fr.op.urls') },
    { id: 'addTags', label: t('bulk.op.addTags') },
    { id: 'removeTags', label: t('bulk.op.removeTags') },
    { id: 'profile', label: t('engage.bulk2.op.profile') },
  ];
  const textual = s.kind === 'replace' || s.kind === 'removeLines' || s.kind === 'block';
  const reErr = opts.regex && (s.kind === 'replace' || s.kind === 'removeLines') ? regexError(s.kind === 'replace' ? s.find : s.lineFind, opts) : null;
  const op = toOp(s, templates);
  const compiled = op ? compileOp(op) : null;
  const urlErr = s.kind === 'urls' && compiled && !compiled.ok && compiled.error.startsWith('url-') && s.urlFrom.trim() && s.urlTo.trim() ? compiled.error : null;
  const toggleField = (fl: BulkField) => set({ fields: s.fields.includes(fl) ? s.fields.filter((x) => x !== fl) : [...s.fields, fl] });
  const modes = (k: 'desc' | 'tags'): { id: BlockMode; label: string }[] => [
    { id: 'append', label: t(k === 'desc' ? 'engage.bulk2.mode.appendDesc' : 'engage.bulk2.mode.appendTags') },
    { id: 'replace', label: t('engage.bulk2.mode.replace') },
    { id: 'keep', label: t('engage.bulk2.mode.keep') },
  ];
  const template = templates.find((x) => x.id === s.templateId);

  return (
    <div className="stack">
      <Tabs value={s.kind} onChange={(kind) => set({ kind })} items={kinds} label={t('bulk.operation')} />
      <p className="small muted">{t(`fr.opHelp.${s.kind}` as MessageKey)}</p>

      {s.kind === 'replace' && (
        <>
          <div className="grid-2">
            <Field label={t('bulk.find')} help={t('fr.findHelp')}>
              {({ id, describedBy }) => (
                <textarea id={id} aria-describedby={describedBy} className="textarea fr-mono" dir="auto" rows={rowsFor(s.find)} value={s.find} onChange={(e) => set({ find: e.target.value })} data-testid="bulk-find" />
              )}
            </Field>
            <Field label={t('bulk.replaceWith')} help={opts.regex ? t('fr.replaceHelpRegex') : t('bulk.replaceHelp')}>
              {({ id, describedBy }) => (
                <textarea id={id} aria-describedby={describedBy} className="textarea fr-mono" dir="auto" rows={rowsFor(s.replace)} value={s.replace} onChange={(e) => set({ replace: e.target.value })} data-testid="bulk-replace" />
              )}
            </Field>
          </div>
          <div className="row" role="group" aria-label={t('fr.fieldsLabel')}>
            <span className="small muted">{t('fr.fieldsLabel')}</span>
            {(['title', 'description', 'tags'] as BulkField[]).map((fl) => (
              <label key={fl} className="check">
                <input type="checkbox" checked={s.fields.includes(fl)} onChange={() => toggleField(fl)} />
                <span>{t(`draft.${fl}` as MessageKey)}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {s.kind === 'block' && (
        <>
          <div className="grid-2">
            <Field label={t('fr.start')} help={t('fr.startHelp')}>
              {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input" dir="auto" value={s.start} onChange={(e) => set({ start: e.target.value })} />}
            </Field>
            <Field label={t('fr.end')}>{({ id }) => <input id={id} className="input" dir="auto" value={s.end} onChange={(e) => set({ end: e.target.value })} />}</Field>
          </div>
          <Field label={t('fr.newBlock')} help={t('fr.newBlockHelp')}>
            {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="auto" rows={rowsFor(s.block, 4)} value={s.block} onChange={(e) => set({ block: e.target.value })} />}
          </Field>
          <Seg
            label={t('fr.markers')}
            value={s.keepMarkers ? 'keep' : 'drop'}
            onChange={(v) => set({ keepMarkers: v === 'keep' })}
            items={[
              { id: 'keep', label: t('fr.keepMarkers') },
              { id: 'drop', label: t('fr.dropMarkers') },
            ]}
          />
        </>
      )}

      {s.kind === 'append' && (
        <>
          <Field label={t('bulk.text')} help={t('fr.appendHelp')}>
            {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="auto" rows={rowsFor(s.addText, 4)} value={s.addText} onChange={(e) => set({ addText: e.target.value })} />}
          </Field>
          <Seg
            label={t('engage.bulk2.position')}
            value={s.position}
            onChange={(position) => set({ position })}
            items={[
              { id: 'start', label: t('bulk.atStart') },
              { id: 'end', label: t('bulk.atEnd') },
            ]}
          />
        </>
      )}

      {s.kind === 'removeLines' && (
        <Field label={t('fr.lineFind')} help={t('fr.lineFindHelp')}>
          {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input fr-mono" dir="auto" value={s.lineFind} onChange={(e) => set({ lineFind: e.target.value })} />}
        </Field>
      )}

      {s.kind === 'urls' && (
        <>
          <div className="grid-2">
            <Field label={t('fr.urlFrom')} help={t('fr.urlFromHelp')}>
              {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input ltr" dir="ltr" placeholder="old-site.com" value={s.urlFrom} onChange={(e) => set({ urlFrom: e.target.value })} />}
            </Field>
            <Field label={t('fr.urlTo')} help={t('fr.urlToHelp')}>
              {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input ltr" dir="ltr" placeholder="https://new-site.com" value={s.urlTo} onChange={(e) => set({ urlTo: e.target.value })} />}
            </Field>
          </div>
          {urlErr && (
            <p className="small fr-bad" role="alert">
              {t(`fr.err.${urlErr}` as MessageKey)}
            </p>
          )}
        </>
      )}

      {(s.kind === 'addTags' || s.kind === 'removeTags') && (
        <Field label={t('draft.tags')} help={t('draft.tagsHelp')}>
          {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" rows={2} dir="auto" value={s.tagText} onChange={(e) => set({ tagText: e.target.value })} />}
        </Field>
      )}

      {s.kind === 'profile' &&
        (templates.length === 0 ? (
          <Empty icon="file" title={t('engage.bulk2.noTemplates')} action={<a className="btn btn-s" href="#templates">{t('nav.templates')}</a>} />
        ) : (
          <div className="stack">
            <Field label={t('engage.bulk2.template')}>
              {({ id }) => (
                <select id={id} className="select" style={{ maxWidth: 420 }} value={s.templateId} onChange={(e) => set({ templateId: e.target.value })}>
                  <option value="">{t('engage.bulk2.pickTemplate')}</option>
                  {templates.map((x) => (
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
                  <Seg label={t('draft.description')} value={s.descMode} onChange={(descMode) => set({ descMode })} items={modes('desc')} />
                  <p className="small muted clamp-2" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                    {template.description || t('engage.diff.empty')}
                  </p>
                </div>
                <div className="card card-2 stack-s">
                  <span className="small bold">{t('draft.tags')}</span>
                  <Seg label={t('draft.tags')} value={s.tagsMode} onChange={(tagsMode) => set({ tagsMode })} items={modes('tags')} />
                  <p className="small muted clamp-2" dir="auto">
                    {template.tags.join('، ') || t('engage.diff.empty')}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}

      {(textual || s.kind === 'append') && (
        <div className="stack-s">
          <div className="chips" role="group" aria-label={t('fr.options')} aria-describedby={helpId}>
            <Toggle on={opts.persian} onChange={(persian) => setOpts({ persian })} label={t('fr.opt.persian')} help={t('fr.opt.persianHelp')} />
            {s.kind !== 'append' && <Toggle on={opts.matchCase} onChange={(matchCase) => setOpts({ matchCase })} label={t('bulk.matchCase')} />}
            {(s.kind === 'replace' || s.kind === 'removeLines') && (
              <>
                <Toggle on={opts.wholeWord} onChange={(wholeWord) => setOpts({ wholeWord })} label={t('bulk.wholeWord')} />
                <Toggle on={opts.regex} onChange={(regex) => setOpts({ regex })} label={t('fr.opt.regex')} help={t('fr.opt.regexHelp')} />
              </>
            )}
          </div>
          <p id={helpId} className="xsmall muted">
            {opts.persian ? t('fr.opt.persianOn') : t('fr.opt.persianOff')}
          </p>
          {opts.regex && (s.kind === 'replace' || s.kind === 'removeLines') && (s.kind === 'replace' ? s.find : s.lineFind) && (
            <p className={`small ${reErr ? 'fr-bad' : 'fr-good'}`} role="status" aria-live="polite">
              <Icon name={reErr ? 'alert' : 'check'} /> {reErr ? t('fr.regexBad', { error: reErr }) : t('fr.regexOk')}
            </p>
          )}
        </div>
      )}
      {live && s.kind !== 'replace' && s.kind !== 'addTags' && s.kind !== 'removeTags' && s.kind !== 'profile' && <p className="xsmall muted">{t('fr.descOnly')}</p>}
    </div>
  );
}
