// Settings → Aparat and Settings → Blog: the owner's prompt templates (edit, save, reset to TubeX's default,
// several per kind, per blog), per-blog defaults and what "Do it all" does automatically.
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Field, Switch } from '../../components/ui';
import { useI18n } from '../../i18n';
import { BUILTIN_ID, DEFAULT_PROMPT, OUTPUT_FORMAT, PROMPT_MAX, emptyRepublish, sameSite, templatesOf, type BlogSiteDefaults, type PromptKind, type PromptTemplate, type RepublishSettings } from '../../domain/republish';
import { loadRepublish, onRepublishChanged, saveRepublish } from '../../storage/republish';
import { loadWpSites, onWpSitesChanged, type WpSite } from '../../storage/wordpress';
import { lastBlogDefaults } from '../aparat/aparatActions';

function useRepublish(): [RepublishSettings, (fn: (s: RepublishSettings) => RepublishSettings) => Promise<void>] {
  const [s, setS] = useState<RepublishSettings>(emptyRepublish);
  useEffect(() => {
    void loadRepublish().then(setS);
    return onRepublishChanged(setS);
  }, []);
  const update = async (fn: (s: RepublishSettings) => RepublishSettings) => setS(await saveRepublish(fn(await loadRepublish())));
  return [s, update];
}

const newId = () => `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Editor for one kind's prompt templates. */
export function PromptTemplates({ kind, sites = [] }: { kind: PromptKind; sites?: string[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [s, update] = useRepublish();
  const list = templatesOf(s, kind);
  const [sel, setSel] = useState(BUILTIN_ID[kind]);
  const cur = list.find((x) => x.id === sel) ?? list[0]!;
  const [name, setName] = useState(cur.name);
  const [text, setText] = useState(cur.text);
  const [tsites, setTsites] = useState<string[]>(cur.sites);
  useEffect(() => {
    setName(cur.name);
    setText(cur.text);
    setTsites(cur.sites);
  }, [cur.id, cur.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const builtin = cur.id === BUILTIN_ID[kind];
  const dirty = name !== cur.name || text !== cur.text || tsites.join('|') !== cur.sites.join('|');
  const isDefault = (s.defaultTemplate[kind] ?? BUILTIN_ID[kind]) === cur.id;
  const label = (x: PromptTemplate) => x.name || t('prompt.builtinName');

  const store = async (tpl: PromptTemplate) =>
    update((st) => {
      const others = st.templates.filter((x) => x.id !== tpl.id);
      // The built-in template is stored only while it differs from TubeX's text.
      const keep = !(tpl.id === BUILTIN_ID[kind] && tpl.text.trim() === DEFAULT_PROMPT[kind].trim());
      return { ...st, templates: keep ? [...others, tpl] : others };
    });
  const saveCur = async () => {
    if (!text.trim()) return toast(t('prompt.empty'));
    await store({ ...cur, name: builtin ? '' : name.trim() || t('prompt.untitled'), text, sites: kind === 'blog' ? tsites : [], updatedAt: new Date().toISOString() });
    toast(t('prompt.saved'));
  };
  const add = async (copy: boolean) => {
    const id = newId();
    await store({ id, kind, name: copy ? `${label(cur)} (${t('prompt.copy')})` : t('prompt.newName'), text: copy ? text : DEFAULT_PROMPT[kind], sites: [], updatedAt: new Date().toISOString() });
    setSel(id);
  };

  return (
    <div className="stack" data-testid={`prompts-${kind}`}>
      <p className="small muted">{t(kind === 'blog' ? 'prompt.helpBlog' : 'prompt.helpAparat')}</p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="chips" role="tablist" aria-label={t('prompt.list')}>
          {list.map((x) => (
            <button key={x.id} type="button" role="tab" className="chip" aria-selected={x.id === cur.id} aria-pressed={x.id === cur.id} onClick={() => setSel(x.id)}>
              {label(x)}
              {(s.defaultTemplate[kind] ?? BUILTIN_ID[kind]) === x.id && ` · ${t('prompt.isDefault')}`}
            </button>
          ))}
        </div>
        <Button size="s" variant="ghost" onClick={() => void add(false)} data-testid={`prompt-new-${kind}`}>
          <Icon name="plus" />
          {t('prompt.new')}
        </Button>
      </div>
      {!builtin && (
        <Field label={t('prompt.name')}>{({ id }) => <input id={id} className="input" dir="auto" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      )}
      <Field label={t('prompt.text')} help={t('prompt.textHelp')} counter={`${[...text].length} / ${PROMPT_MAX}`} over={[...text].length > PROMPT_MAX}>
        {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="auto" rows={14} value={text} onChange={(e) => setText(e.target.value)} data-testid={`prompt-text-${kind}`} />}
      </Field>
      {kind === 'blog' && sites.length > 0 && !builtin && (
        <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small">
            <strong>{t('prompt.forSites')}</strong>
          </legend>
          {sites.map((site) => (
            <label key={site} className="check">
              <input type="checkbox" checked={tsites.some((x) => sameSite(x, site))} onChange={(e) => setTsites((cur) => (e.target.checked ? [...cur, site] : cur.filter((x) => !sameSite(x, site))))} />
              <span className="small ltr">{site.replace(/^https:\/\//, '')}</span>
            </label>
          ))}
        </fieldset>
      )}
      <details className="core-fold">
        <summary className="small">{t('prompt.fixed')}</summary>
        <p className="xsmall muted ltr mono" dir="ltr" style={{ whiteSpace: 'pre-wrap' }}>
          {OUTPUT_FORMAT[kind]}
        </p>
      </details>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="s" variant="primary" disabled={!dirty} onClick={() => void saveCur()} data-testid={`prompt-save-${kind}`}>
          <Icon name="check" />
          {dirty ? t('prompt.save') : t('prompt.savedShort')}
        </Button>
        <Button size="s" disabled={text.trim() === DEFAULT_PROMPT[kind].trim()} onClick={() => setText(DEFAULT_PROMPT[kind])} data-testid={`prompt-reset-${kind}`}>
          <Icon name="refresh" />
          {t('prompt.reset')}
        </Button>
        <Button size="s" variant="ghost" onClick={() => void add(true)}>
          <Icon name="copy" />
          {t('prompt.duplicate')}
        </Button>
        {!isDefault && (
          <Button size="s" variant="ghost" onClick={() => void update((st) => ({ ...st, defaultTemplate: { ...st.defaultTemplate, [kind]: cur.id } }))}>
            <Icon name="star" />
            {t('prompt.makeDefault')}
          </Button>
        )}
        {!builtin && (
          <ConfirmButton
            size="s"
            label={t('prompt.delete')}
            question={t('prompt.deleteQ', { name: label(cur) })}
            confirmLabel={t('prompt.delete')}
            onConfirm={async () => {
              await update((st) => ({
                ...st,
                templates: st.templates.filter((x) => x.id !== cur.id),
                defaultTemplate: st.defaultTemplate[kind] === cur.id ? { ...st.defaultTemplate, [kind]: undefined } : st.defaultTemplate,
                blog: { ...st.blog, sites: st.blog.sites.map((x) => (x.templateId === cur.id ? { ...x, templateId: undefined } : x)) },
              }));
              setSel(BUILTIN_ID[kind]);
            }}
          />
        )}
      </div>
      {dirty && <p className="xsmall muted">{t('prompt.unsaved')}</p>}
    </div>
  );
}

/** Text input that saves on blur, so typing does not write on every key. */
function LazyInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input {...rest} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v.trim())} />;
}

export function AparatSettings() {
  const { t } = useI18n();
  const [s, update] = useRepublish();
  return (
    <div className="stack" data-testid="aparat-settings">
      <div className="grid-2">
        <Field label={t('auto.aparatCategory')} help={t('auto.aparatCategoryHelp')}>
          {({ id, describedBy }) => <LazyInput id={id} aria-describedby={describedBy} className="input" dir="auto" maxLength={60} placeholder="آموزشی" value={s.aparat.defaultCategory} onCommit={(v) => void update((st) => ({ ...st, aparat: { ...st.aparat, defaultCategory: v } }))} />}
        </Field>
      </div>
      <Switch checked={s.aparat.autoAi} onChange={(v) => void update((st) => ({ ...st, aparat: { ...st.aparat, autoAi: v } }))} label={<strong>{t('auto.aparatAi')}</strong>} />
      <span className="small muted">{t('auto.aparatAiHelp')}</span>
      <hr className="divider" />
      <h3>{t('prompt.titleAparat')}</h3>
      <PromptTemplates kind="aparat" />
    </div>
  );
}

export function BlogSettings({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n();
  const [s, update] = useRepublish();
  const [wp, setWp] = useState<WpSite[]>([]);
  const [used, setUsed] = useState<string[]>([]);
  const [newSite, setNewSite] = useState('');
  useEffect(() => {
    void loadWpSites().then(setWp);
    void lastBlogDefaults().then((d) => setUsed(d.sites)).catch(() => undefined);
    return onWpSitesChanged(setWp);
  }, []);
  // Every blog the owner uses: configured, connected to WordPress, or used in an earlier package.
  const sites = useMemo(() => {
    const out: string[] = [];
    for (const x of [...s.blog.sites.map((b) => b.site), ...wp.map((w) => w.origin), ...used]) if (x && !out.some((o) => sameSite(o, x))) out.push(x);
    return out;
  }, [s.blog.sites, wp, used]);
  const rowOf = (site: string): BlogSiteDefaults => s.blog.sites.find((b) => sameSite(b.site, site)) ?? { site, ctaUrl: '', category: '' };
  const setRow = (site: string, patch: Partial<BlogSiteDefaults>) =>
    void update((st) => {
      const cur = st.blog.sites.find((b) => sameSite(b.site, site)) ?? { site, ctaUrl: '', category: '' };
      return { ...st, blog: { ...st.blog, sites: [...st.blog.sites.filter((b) => !sameSite(b.site, site)), { ...cur, ...patch }] } };
    });
  const templates = templatesOf(s, 'blog');
  const defaultSite = s.blog.defaultSite || sites[0] || '';

  return (
    <div className="stack" data-testid="blog-settings">
      <h3>{t('wp.title')}</h3>
      {children}
      <hr className="divider" />
      <h3>{t('auto.blogs')}</h3>
      <p className="small muted">{t('auto.blogsHelp')}</p>
      {sites.map((site) => {
        const r = rowOf(site);
        const connected = wp.some((w) => sameSite(w.origin, site));
        return (
          <div key={site} className="card stack-s" style={{ padding: 12 }} data-testid="blog-site-row">
            <div className="row-between">
              <label className="check">
                <input type="radio" name="blog-default-site" checked={sameSite(defaultSite, site)} onChange={() => void update((st) => ({ ...st, blog: { ...st.blog, defaultSite: site } }))} />
                <strong className="ltr">{site.replace(/^https:\/\//, '')}</strong>
              </label>
              <span className={`badge ${connected ? 'badge-accent' : ''}`}>{connected ? t('auto.connected') : t('auto.notConnected')}</span>
            </div>
            <div className="grid-2">
              <Field label={t('blog.f.cta')}>{({ id }) => <LazyInput id={id} className="input" dir="ltr" inputMode="url" placeholder="https://…" value={r.ctaUrl} onCommit={(v) => setRow(site, { ctaUrl: v })} />}</Field>
              <Field label={t('auto.siteCategory')}>{({ id }) => <LazyInput id={id} className="input" dir="auto" maxLength={100} value={r.category} onCommit={(v) => setRow(site, { category: v })} />}</Field>
            </div>
            <Field label={t('prompt.use')}>
              {({ id }) => (
                <select id={id} className="select" value={r.templateId ?? ''} onChange={(e) => setRow(site, { templateId: e.target.value || undefined })}>
                  <option value="">{t('auto.siteTemplateDefault')}</option>
                  {templates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name || t('prompt.builtinName')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        );
      })}
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <input className="input" dir="ltr" inputMode="url" placeholder="https://example.com/blog" aria-label={t('auto.addBlog')} value={newSite} onChange={(e) => setNewSite(e.target.value)} />
        <Button
          size="s"
          disabled={!/^https:\/\/[^/]+\.[^/]+/.test(newSite.trim())}
          onClick={() => {
            setRow(newSite.trim().replace(/\/+$/, ''), {});
            setNewSite('');
          }}
        >
          <Icon name="plus" />
          {t('auto.addBlog')}
        </Button>
      </div>
      <hr className="divider" />
      <Switch checked={s.blog.autoWpDraft} onChange={(v) => void update((st) => ({ ...st, blog: { ...st.blog, autoWpDraft: v } }))} label={<strong>{t('auto.wpAuto')}</strong>} />
      <span className="small muted">{t('auto.wpAutoHelp')}</span>
      <Switch checked={s.blog.featuredImage} onChange={(v) => void update((st) => ({ ...st, blog: { ...st.blog, featuredImage: v } }))} label={<strong>{t('wp.featured')}</strong>} />
      <hr className="divider" />
      <h3>{t('prompt.titleBlog')}</h3>
      <PromptTemplates kind="blog" sites={sites} />
    </div>
  );
}
