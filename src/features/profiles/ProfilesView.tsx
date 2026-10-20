import { useState } from 'react';
import { newBase, type Lang, type Profile } from '../../domain/models';
import { usePrefs } from '../../components/AppShell';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Avatar, Button, Empty, Field, PageHeader, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { setActiveChannel } from '../../integrations/google/auth';
import { create, put, remove, save } from '../../storage/db';
import { useGoogle } from '../connections/useConnections';
import { Cover, Segmented } from '../core/CoreUi';

type Form = { id?: string; name: string; handle: string; contentLanguage: Lang; notes: string };

/** Active local channel profile as a compact pill select. */
export function ProfileSelect() {
  const { t } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const profiles = useCollection('profiles').items;
  const exists = profiles.some((p) => p.id === prefs.activeProfileId);
  if (profiles.length === 0) return null;
  return (
    <select
      className="select core-select-pill"
      style={{ maxWidth: 170 }}
      aria-label={t('profiles.active')}
      title={t('core.profiles.selectHelp')}
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
  );
}

function ProfileForm({ form, setForm, onSubmit }: { form: Form; setForm: (f: Form | null) => void; onSubmit: (f: Form) => void }) {
  const { t } = useI18n();
  return (
    <form
      className="card stack"
      aria-labelledby="prof-form-h"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <h2 id="prof-form-h">{form.id ? t('core.profiles.edit') : t('profiles.new')}</h2>
      <div className="grid-2">
        <Field label={t('common.name')}>
          {({ id }) => <input id={id} className="input" dir="auto" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label={t('profiles.handle')}>
          {({ id }) => <input id={id} className="input ltr" dir="ltr" placeholder="@handle" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} />}
        </Field>
      </div>
      <div className="stack-s">
        <span className="field-label">{t('profiles.contentLanguage')}</span>
        <div>
          <Segmented
            label={t('profiles.contentLanguage')}
            value={form.contentLanguage}
            onChange={(v) => setForm({ ...form, contentLanguage: v })}
            items={[
              { id: 'fa', label: t('lang.fa') },
              { id: 'en', label: t('lang.en') },
            ]}
          />
        </div>
      </div>
      <Field label={t('common.notes')} help={t('core.profiles.notesHelp')}>
        {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="auto" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}
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

export function ProfilesView() {
  const { t } = useI18n();
  const toast = useToast();
  const { prefs, setPrefs } = usePrefs();
  const { items, loading } = useCollection('profiles');
  const ideas = useCollection('ideas').items;
  const drafts = useCollection('drafts').items;
  const google = useGoogle();
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
    <section className="stack-l" aria-labelledby="prof-h">
      <PageHeader
        kicker={t('shell.library')}
        title={t('profiles.heading')}
        desc={t('profiles.help')}
        art={<Cover icon="users" />}
        actions={
          !form && (
            <Button variant="primary" onClick={() => setForm({ name: '', handle: '', contentLanguage: 'fa', notes: '' })}>
              <Icon name="plus" />
              {t('profiles.new')}
            </Button>
          )
        }
      />

      <section className="stack" aria-labelledby="g-ch-h">
        <div className="section-title">
          <h2 id="g-ch-h">{t('core.profiles.google')}</h2>
          <a className="btn btn-ghost btn-s" href="#settings">
            {t('core.profiles.manageGoogle')}
          </a>
        </div>
        {!google.loaded ? (
          <Skeleton lines={2} />
        ) : google.channels.length === 0 ? (
          <div className="card row-between">
            <p className="muted small grow">{t('core.profiles.googleEmpty')}</p>
            <a className="btn btn-s" href="#settings">
              {t('auth.signIn')}
            </a>
          </div>
        ) : (
          <div className="core-artists">
            {google.channels.map((c) => {
              const active = c.channelId === google.activeChannelId;
              return (
                <div key={c.channelId} className="core-artist">
                  <Avatar src={c.thumbnail} name={c.title} size="l" />
                  <strong className="truncate" dir="auto" style={{ maxWidth: '100%', color: active ? 'var(--accent-text)' : undefined }}>
                    {c.title}
                  </strong>
                  <span className="xsmall muted ltr truncate" style={{ maxWidth: '100%' }}>
                    {c.handle}
                  </span>
                  {active ? (
                    <span className="badge badge-accent">{t('auth.active')}</span>
                  ) : (
                    <Button size="s" onClick={() => void setActiveChannel(c.channelId)}>
                      {t('auth.makeActive')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby="local-h">
        <div className="section-title">
          <h2 id="local-h">{t('core.profiles.local')}</h2>
        </div>
        {form && <ProfileForm form={form} setForm={setForm} onSubmit={(f) => void submit(f)} />}
        {loading ? (
          <Skeleton lines={3} />
        ) : items.length === 0 ? (
          !form && (
            <Empty icon="users" title={t('core.profiles.emptyTitle')}>
              {t('profiles.empty')}
            </Empty>
          )
        ) : (
          <div className="core-cards">
            {items.map((p) => {
              const active = p.id === prefs.activeProfileId;
              return (
                <article key={p.id} className="core-card" data-active={active} aria-labelledby={`pf-${p.id}`}>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
                    <Avatar name={p.name} size="l" />
                    <div className="stack-s grow" style={{ gap: 0 }}>
                      <h3 id={`pf-${p.id}`} className="truncate" dir="auto">
                        {p.name}
                      </h3>
                      <span className="small muted truncate">
                        {p.handle && <bdi className="ltr">{p.handle}</bdi>} {p.handle && '·'} {t(`lang.${p.contentLanguage}`)}
                      </span>
                    </div>
                  </div>
                  <div className="core-pill-row">
                    {active && <span className="badge badge-accent">{t('profiles.active')}</span>}
                    <span className="badge" title={t('core.profiles.localOnly')}>
                      <span className="dot" aria-hidden="true" />
                      {t('profiles.notConnected')}
                    </span>
                    <span className="badge">{t('core.profiles.counts', { ideas: ideas.filter((i) => i.profileId === p.id).length, drafts: drafts.filter((d) => d.profileId === p.id).length })}</span>
                  </div>
                  {p.notes && (
                    <p className="small muted clamp-2" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                      {p.notes}
                    </p>
                  )}
                  <div className="row" style={{ marginBlockStart: 'auto' }}>
                    {!active && (
                      <Button size="s" variant="primary" onClick={() => void setPrefs({ activeProfileId: p.id })}>
                        {t('core.profiles.makeActive')}
                      </Button>
                    )}
                    <Button size="s" onClick={() => setForm({ id: p.id, name: p.name, handle: p.handle, contentLanguage: p.contentLanguage, notes: p.notes })}>
                      {t('common.edit')}
                    </Button>
                    <Button size="s" variant="ghost" className="btn-danger" onClick={() => void del(p.id)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
