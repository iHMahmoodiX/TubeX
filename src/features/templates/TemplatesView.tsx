// Templates are the "default upload profiles": reusable description blocks and tag sets. They are used in
// drafts here, in YouTube Studio's editor and upload dialog (in-page tools) and in Bulk edit.
import { useState } from 'react';
import { applyTemplate } from '../../domain/metadata';
import { newBase, type Template } from '../../domain/models';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { Icon, type IconName } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, Empty, Field, Notice, PageHeader, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { create, put, remove, save } from '../../storage/db';
import { Cover, TagInput } from '../core/CoreUi';
import { createDraft } from '../ideas/ideaActions';

type Form = { id?: string; rev?: number; name: string; description: string; tags: string[]; profileId: string };
const blank: Form = { name: '', description: '', tags: [], profileId: '' };

const WHERE: { icon: IconName; title: MessageKey; text: MessageKey }[] = [
  { icon: 'edit', title: 'core.tpl.where.drafts', text: 'core.tpl.where.draftsText' },
  { icon: 'video', title: 'core.tpl.where.studio', text: 'core.tpl.where.studioText' },
  { icon: 'layers', title: 'core.tpl.where.bulk', text: 'core.tpl.where.bulkText' },
];

function TemplateForm({ form, setForm, onSubmit }: { form: Form; setForm: (f: Form | null) => void; onSubmit: (f: Form) => void }) {
  const { t } = useI18n();
  const profiles = useCollection('profiles').items;
  return (
    <form
      className="card stack"
      aria-labelledby="tpl-form-h"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <h2 id="tpl-form-h">{form.id ? t('core.tpl.edit') : t('templates.new')}</h2>
      <div className="grid-2">
        <Field label={t('common.name')}>
          {({ id }) => <input id={id} className="input" dir="auto" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label={t('draft.channel')}>
          {({ id }) => (
            <select id={id} className="select" value={form.profileId} onChange={(e) => setForm({ ...form, profileId: e.target.value })}>
              <option value="">{t('templates.anyChannel')}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label={t('draft.description')} help={t('core.tpl.descHelp')}>
        {({ id, describedBy }) => (
          <textarea id={id} aria-describedby={describedBy} className="textarea" rows={7} dir="auto" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        )}
      </Field>
      <Field label={t('draft.tags')} help={t('core.draft.tagsHelp')}>
        {({ id, describedBy }) => <TagInput id={id} describedBy={describedBy} tags={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder={t('core.draft.tagsPlaceholder')} />}
      </Field>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={!form.name.trim()}>
          {t('common.save')}
        </button>
        <Button onClick={() => setForm(null)}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

export function TemplatesView() {
  const { t } = useI18n();
  const toast = useToast();
  const { prefs } = usePrefs();
  const { items, loading } = useCollection('templates');
  const profiles = useCollection('profiles').items;
  const [form, setForm] = useState<Form | null>(null);

  const submit = async (f: Form) => {
    const fields = { name: f.name.trim(), description: f.description, tags: f.tags, profileId: f.profileId || undefined };
    const existing = f.id ? items.find((x) => x.id === f.id) : undefined;
    if (existing) {
      const res = await save('templates', { ...existing, ...fields, rev: f.rev ?? existing.rev });
      if (!res.ok) return toast(t('draft.conflict'));
    } else {
      await create('templates', { ...newBase(), ...fields } as Template);
    }
    setForm(null);
    toast(t('templates.saved'));
  };

  const del = async (id: string) => {
    const removed = await remove('templates', id);
    if (removed) toast(t('templates.deleted'), { label: t('common.undo'), run: () => void put('templates', removed) });
  };

  const startFromTemplate = async (tp: Template) => {
    const d = await createDraft({ profileId: tp.profileId ?? prefs.activeProfileId, language: prefs.uiLanguage });
    const filled = applyTemplate(d, tp);
    await save('drafts', { ...d, description: filled.description, tags: filled.tags });
    location.hash = `drafts/${encodeURIComponent(d.id)}`;
  };

  return (
    <section className="stack-l" aria-labelledby="tpl-h">
      <PageHeader
        kicker={t('core.tpl.kicker')}
        title={t('templates.heading')}
        desc={t('core.tpl.desc')}
        art={<Cover icon="file" />}
        actions={
          !form && (
            <Button variant="primary" onClick={() => setForm(blank)}>
              <Icon name="plus" />
              {t('templates.new')}
            </Button>
          )
        }
      />
      <div className="core-where" aria-label={t('core.tpl.whereLabel')} role="list">
        {WHERE.map((w) => (
          <div key={w.title} role="listitem">
            <span className="core-where-icon" aria-hidden="true">
              <Icon name={w.icon} />
            </span>
            <span className="stack-s" style={{ gap: 2 }}>
              <strong className="small">{t(w.title)}</strong>
              <span className="xsmall muted">{t(w.text)}</span>
            </span>
          </div>
        ))}
      </div>
      {form && <TemplateForm form={form} setForm={setForm} onSubmit={(f) => void submit(f)} />}
      {loading ? (
        <Skeleton lines={4} />
      ) : items.length === 0 ? (
        !form && (
          <Empty
            icon="file"
            title={t('core.tpl.emptyTitle')}
            action={
              <Button variant="primary" onClick={() => setForm(blank)}>
                {t('templates.new')}
              </Button>
            }
          >
            {t('templates.empty')}
          </Empty>
        )
      ) : (
        <div className="core-cards" data-testid="templates-list">
          {items.map((tp) => (
            <article key={tp.id} className="core-card" aria-labelledby={`tp-${tp.id}`}>
              <div className="row-between" style={{ flexWrap: 'nowrap' }}>
                <h3 id={`tp-${tp.id}`} className="truncate" dir="auto">
                  {tp.name}
                </h3>
                <span className="badge">{profiles.find((p) => p.id === tp.profileId)?.name ?? t('templates.anyChannel')}</span>
              </div>
              <div className="core-desc-box" dir="auto">
                {tp.description.trim() || <span className="faint">{t('core.tpl.noDesc')}</span>}
              </div>
              {tp.tags.length > 0 ? (
                <div className="core-pill-row">
                  {tp.tags.slice(0, 8).map((tag) => (
                    <span key={tag} className="core-chip-static">
                      <bdi dir="auto">{tag}</bdi>
                    </span>
                  ))}
                  {tp.tags.length > 8 && <span className="core-chip-static faint">
                      <bdi>+{tp.tags.length - 8}</bdi>
                    </span>}
                </div>
              ) : (
                <span className="xsmall faint">{t('core.tpl.noTags')}</span>
              )}
              <div className="row" style={{ marginBlockStart: 'auto' }}>
                <Button size="s" className="btn-dark" onClick={() => void startFromTemplate(tp)}>
                  <Icon name="play" />
                  {t('core.tpl.use')}
                </Button>
                <Button size="s" onClick={() => setForm({ id: tp.id, rev: tp.rev, name: tp.name, description: tp.description, tags: tp.tags, profileId: tp.profileId ?? '' })}>
                  {t('common.edit')}
                </Button>
                <Button size="s" variant="ghost" className="btn-danger" onClick={() => void del(tp.id)}>
                  {t('common.delete')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {items.length > 0 && <Notice>{t('core.tpl.tip')}</Notice>}
    </section>
  );
}
