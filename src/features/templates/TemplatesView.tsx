import { useState } from 'react';
import { parseTags } from '../../domain/metadata';
import { newBase, type Template } from '../../domain/models';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Button, Empty, Field } from '../../components/ui';
import { useI18n } from '../../i18n';
import { create, put, remove, save } from '../../storage/db';

type Form = { id?: string; rev?: number; name: string; description: string; tags: string; profileId: string };
const blank: Form = { name: '', description: '', tags: '', profileId: '' };

export function TemplatesView() {
  const { t } = useI18n();
  const toast = useToast();
  const { items, loading } = useCollection('templates');
  const profiles = useCollection('profiles').items;
  const [form, setForm] = useState<Form | null>(null);

  const submit = async (f: Form) => {
    const fields = { name: f.name.trim(), description: f.description, tags: parseTags(f.tags), profileId: f.profileId || undefined };
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

  return (
    <section className="stack" aria-labelledby="tpl-h" style={{ maxWidth: 820 }}>
      <div className="row-between">
        <h1 id="tpl-h">{t('templates.heading')}</h1>
        {!form && (
          <Button variant="primary" onClick={() => setForm(blank)}>
            {t('templates.new')}
          </Button>
        )}
      </div>
      <p className="muted">{t('templates.help')}</p>
      {form && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(form);
          }}
        >
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
          <Field label={t('draft.description')}>
            {({ id }) => <textarea id={id} className="textarea" rows={6} dir="auto" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </Field>
          <Field label={t('draft.tags')} help={t('draft.tagsHelp')}>
            {({ id, describedBy }) => (
              <textarea id={id} aria-describedby={describedBy} className="textarea" rows={2} dir="auto" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            )}
          </Field>
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={!form.name.trim()}>
              {t('common.save')}
            </button>
            <Button onClick={() => setForm(null)}>{t('common.cancel')}</Button>
          </div>
        </form>
      )}
      {loading ? (
        <p className="muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <Empty>{t('templates.empty')}</Empty>
      ) : (
        <ul className="list">
          {items.map((tp) => (
            <li key={tp.id} className="list-item">
              <div className="row-between">
                <strong dir="auto">{tp.name}</strong>
                <span className="badge">{profiles.find((p) => p.id === tp.profileId)?.name ?? t('templates.anyChannel')}</span>
              </div>
              {tp.description && (
                <p className="small muted" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                  {tp.description.length > 240 ? `${tp.description.slice(0, 240)}…` : tp.description}
                </p>
              )}
              {tp.tags.length > 0 && (
                <p className="small" dir="auto">
                  {tp.tags.join('، ')}
                </p>
              )}
              <div className="row">
                <Button
                  size="s"
                  onClick={() => setForm({ id: tp.id, rev: tp.rev, name: tp.name, description: tp.description, tags: tp.tags.join(', '), profileId: tp.profileId ?? '' })}
                >
                  {t('common.edit')}
                </Button>
                <Button size="s" variant="ghost" className="btn-danger" onClick={() => void del(tp.id)}>
                  {t('common.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
