import { useState } from 'react';
import { newBase, type Lang, type Profile } from '../../domain/models';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { useToast } from '../../components/toasts';
import { Button, Empty, Field } from '../../components/ui';
import { useI18n } from '../../i18n';
import { create, put, remove, save } from '../../storage/db';

type Form = { id?: string; name: string; handle: string; contentLanguage: Lang; notes: string };

/** Active-channel selector shown in page headers. */
export function ProfileSelect() {
  const { t } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const profiles = useCollection('profiles').items;
  const exists = profiles.some((p) => p.id === prefs.activeProfileId);
  return (
    <div className="row">
      <label className="sr-only" htmlFor="active-profile">
        {t('profiles.active')}
      </label>
      <select
        id="active-profile"
        className="select"
        style={{ width: 'auto', maxWidth: 180, minHeight: 28, paddingBlock: 2 }}
        value={exists ? prefs.activeProfileId : ''}
        onChange={(e) => void setPrefs({ activeProfileId: e.target.value || undefined })}
      >
        <option value="">{t('profiles.none')}</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="badge" title={t('profiles.help')}>
        <span className="dot" aria-hidden="true" />
        {t('profiles.notConnected')}
      </span>
    </div>
  );
}

export function ProfilesView() {
  const { t } = useI18n();
  const toast = useToast();
  const { prefs, setPrefs } = usePrefs();
  const { items, loading } = useCollection('profiles');
  const [form, setForm] = useState<Form | null>(null);

  const submit = async (f: Form) => {
    const fields = { name: f.name.trim(), handle: f.handle.trim(), contentLanguage: f.contentLanguage, notes: f.notes };
    const existing = f.id ? items.find((x) => x.id === f.id) : undefined;
    if (existing) {
      const res = await save('profiles', { ...existing, ...fields });
      if (!res.ok) return toast(t('draft.conflict'));
    } else {
      const p = await create('profiles', { ...newBase(), ...fields, connection: 'unconnected' } as Profile);
      if (!prefs.activeProfileId) await setPrefs({ activeProfileId: p.id });
    }
    setForm(null);
    toast(t('profiles.saved'));
  };

  const del = async (id: string) => {
    const removed = await remove('profiles', id);
    if (prefs.activeProfileId === id) await setPrefs({ activeProfileId: undefined });
    if (removed) toast(t('profiles.deleted'), { label: t('common.undo'), run: () => void put('profiles', removed) });
  };

  return (
    <section className="stack" aria-labelledby="prof-h" style={{ maxWidth: 820 }}>
      <div className="row-between">
        <h1 id="prof-h">{t('profiles.heading')}</h1>
        {!form && (
          <Button variant="primary" onClick={() => setForm({ name: '', handle: '', contentLanguage: 'fa', notes: '' })}>
            {t('profiles.new')}
          </Button>
        )}
      </div>
      <p className="muted">{t('profiles.help')}</p>
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
          <Field label={t('profiles.handle')}>
            {({ id }) => <input id={id} className="input ltr" dir="ltr" placeholder="@handle" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} />}
          </Field>
          <Field label={t('profiles.contentLanguage')}>
            {({ id }) => (
              <select id={id} className="select" value={form.contentLanguage} onChange={(e) => setForm({ ...form, contentLanguage: e.target.value as Lang })}>
                <option value="fa">{t('lang.fa')}</option>
                <option value="en">{t('lang.en')}</option>
              </select>
            )}
          </Field>
          <Field label={t('common.notes')}>
            {({ id }) => <textarea id={id} className="textarea" dir="auto" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}
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
        <Empty>{t('profiles.empty')}</Empty>
      ) : (
        <ul className="list">
          {items.map((p) => (
            <li key={p.id} className="list-item" data-active={p.id === prefs.activeProfileId}>
              <div className="row-between">
                <strong dir="auto">{p.name}</strong>
                <div className="row">
                  {p.id === prefs.activeProfileId && <span className="badge badge-accent">{t('profiles.active')}</span>}
                  <span className="badge">
                    <span className="dot" aria-hidden="true" />
                    {t('profiles.notConnected')}
                  </span>
                </div>
              </div>
              <p className="small muted">
                {p.handle && <bdi className="ltr">{p.handle}</bdi>} {p.handle && '·'} {t(`lang.${p.contentLanguage}`)}
              </p>
              {p.notes && (
                <p className="small" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                  {p.notes}
                </p>
              )}
              <div className="row">
                {p.id !== prefs.activeProfileId && (
                  <Button size="s" onClick={() => void setPrefs({ activeProfileId: p.id })}>
                    {t('profiles.active')}
                  </Button>
                )}
                <Button size="s" onClick={() => setForm({ id: p.id, name: p.name, handle: p.handle, contentLanguage: p.contentLanguage, notes: p.notes })}>
                  {t('common.edit')}
                </Button>
                <Button size="s" variant="ghost" className="btn-danger" onClick={() => void del(p.id)}>
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
