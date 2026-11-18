// Republishing settings (Aparat and blog): the owner's own prompt templates and per-site blog defaults.
// Prompts are the editable "how to write" part; TubeX always appends the fixed output format so answers stay parseable.
import { APARAT_DEFAULT_PROMPT, APARAT_OUTPUT_FORMAT } from './aparat';
import { BLOG_DEFAULT_PROMPT, BLOG_OUTPUT_FORMAT } from './blog';

export type PromptKind = 'blog' | 'aparat';
export const PROMPT_KINDS: PromptKind[] = ['blog', 'aparat'];

export interface PromptTemplate {
  id: string;
  kind: PromptKind;
  name: string;
  text: string;
  /** Blog only: sites (addresses) this template is used for by default. */
  sites: string[];
  updatedAt: string;
}

export interface BlogSiteDefaults {
  /** Address the owner uses for the blog, e.g. https://example.com/blog */
  site: string;
  ctaUrl: string;
  category: string;
  templateId?: string;
}

export interface RepublishSettings {
  templates: PromptTemplate[];
  /** Template used when no site-specific one applies; missing = the built-in default. */
  defaultTemplate: Partial<Record<PromptKind, string>>;
  blog: {
    defaultSite: string;
    sites: BlogSiteDefaults[];
    /** One-click/batch: send the article to WordPress as a draft when the site is connected. */
    autoWpDraft: boolean;
    featuredImage: boolean;
  };
  aparat: {
    defaultCategory: string;
    /** One-click/batch: rewrite with AI and use the result (the package stays editable; nothing is published). */
    autoAi: boolean;
  };
}

export const BUILTIN_ID: Record<PromptKind, string> = { blog: 'builtin-blog', aparat: 'builtin-aparat' };
export const DEFAULT_PROMPT: Record<PromptKind, string> = { blog: BLOG_DEFAULT_PROMPT, aparat: APARAT_DEFAULT_PROMPT };
export const OUTPUT_FORMAT: Record<PromptKind, string> = { blog: BLOG_OUTPUT_FORMAT, aparat: APARAT_OUTPUT_FORMAT };
export const PROMPT_MAX = 12000;

export function emptyRepublish(): RepublishSettings {
  return { templates: [], defaultTemplate: {}, blog: { defaultSite: '', sites: [], autoWpDraft: true, featuredImage: true }, aparat: { defaultCategory: '', autoAi: true } };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const https = (v: unknown) => {
  const s = str(v, 500).trim();
  try {
    return s && new URL(s).protocol === 'https:' ? s.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
};

/** The built-in template for a kind; its text can be overridden by a stored copy with the same id. */
export function builtin(kind: PromptKind): PromptTemplate {
  return { id: BUILTIN_ID[kind], kind, name: '', text: DEFAULT_PROMPT[kind], sites: [], updatedAt: '' };
}

export function coerceRepublish(raw: unknown): RepublishSettings {
  const out = emptyRepublish();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  for (const x of Array.isArray(r.templates) ? r.templates : []) {
    if (typeof x !== 'object' || x === null) continue;
    const t = x as Record<string, unknown>;
    const kind = t.kind === 'aparat' ? 'aparat' : t.kind === 'blog' ? 'blog' : null;
    const id = str(t.id, 80);
    const text = str(t.text, PROMPT_MAX);
    if (!kind || !id || seen.has(id) || !text.trim()) continue;
    seen.add(id);
    out.templates.push({
      id,
      kind,
      name: str(t.name, 80).trim(),
      text,
      sites: kind === 'blog' && Array.isArray(t.sites) ? [...new Set(t.sites.map(https).filter(Boolean))].slice(0, 20) : [],
      updatedAt: str(t.updatedAt, 40),
    });
  }
  const dt = (r.defaultTemplate ?? {}) as Record<string, unknown>;
  for (const k of PROMPT_KINDS) {
    const id = str(dt[k], 80);
    if (id && (id === BUILTIN_ID[k] || out.templates.some((t) => t.id === id && t.kind === k))) out.defaultTemplate[k] = id;
  }
  const b = (r.blog ?? {}) as Record<string, unknown>;
  out.blog.defaultSite = https(b.defaultSite);
  out.blog.autoWpDraft = b.autoWpDraft !== false;
  out.blog.featuredImage = b.featuredImage !== false;
  const sites = new Set<string>();
  for (const x of Array.isArray(b.sites) ? b.sites : []) {
    if (typeof x !== 'object' || x === null) continue;
    const s = x as Record<string, unknown>;
    const site = https(s.site);
    if (!site || sites.has(site)) continue;
    sites.add(site);
    const templateId = str(s.templateId, 80);
    out.blog.sites.push({
      site,
      ctaUrl: https(s.ctaUrl),
      category: str(s.category, 100).trim(),
      ...(templateId && out.templates.some((t) => t.id === templateId && t.kind === 'blog') && { templateId }),
    });
  }
  const a = (r.aparat ?? {}) as Record<string, unknown>;
  out.aparat.defaultCategory = str(a.defaultCategory, 60).trim();
  out.aparat.autoAi = a.autoAi !== false;
  return out;
}

/** Host + path without protocol or trailing slash, for comparing blog addresses typed in different ways. */
export function siteKey(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

export function sameSite(a: string, b: string): boolean {
  const x = siteKey(a);
  const y = siteKey(b);
  return !!x && !!y && (x === y || x.split('/')[0] === y.split('/')[0]);
}

/** Every template of a kind, the built-in one first (with the owner's edits if any). */
export function templatesOf(s: RepublishSettings, kind: PromptKind): PromptTemplate[] {
  const own = s.templates.filter((t) => t.kind === kind);
  const base = own.find((t) => t.id === BUILTIN_ID[kind]) ?? builtin(kind);
  return [base, ...own.filter((t) => t.id !== BUILTIN_ID[kind])];
}

export function siteDefaults(s: RepublishSettings, site: string): BlogSiteDefaults | undefined {
  return s.blog.sites.find((x) => sameSite(x.site, site));
}

/** Which template to use: the site's own, then a template assigned to the site, then the default, then built-in. */
export function pickTemplate(s: RepublishSettings, kind: PromptKind, site = ''): PromptTemplate {
  const all = templatesOf(s, kind);
  if (kind === 'blog' && site) {
    const own = siteDefaults(s, site)?.templateId;
    const bySite = all.find((t) => t.id === own) ?? all.find((t) => t.sites.some((x) => sameSite(x, site)));
    if (bySite) return bySite;
  }
  return all.find((t) => t.id === s.defaultTemplate[kind]) ?? all[0]!;
}

/** Full instructions sent to the model: the owner's prompt, then the fixed output contract. */
export function instructionsFor(t: Pick<PromptTemplate, 'kind' | 'text'>): string {
  const text = t.text.trim() || DEFAULT_PROMPT[t.kind];
  return `${text}\n\n${OUTPUT_FORMAT[t.kind]}`;
}

export function isEdited(t: PromptTemplate): boolean {
  return t.text.trim() !== DEFAULT_PROMPT[t.kind].trim();
}
