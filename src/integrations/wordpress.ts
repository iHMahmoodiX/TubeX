// WordPress REST API with an Application Password (Basic auth over HTTPS), D-028. TubeX only creates or updates
// DRAFT posts: it never publishes, never edits a post that is no longer a draft, never deletes. Categories are matched
// by name, never created; missing tags are created. Requests go only to the connected site's own origin.
import type { BlogPackage } from '../domain/models';
import type { WpSite } from '../storage/wordpress';

export type WpErrorCode = 'auth' | 'forbidden' | 'no-rest' | 'unreachable' | 'not-draft' | 'http' | 'permission';
export class WpError extends Error {
  constructor(
    public code: WpErrorCode,
    public detail = '',
  ) {
    super(`wordpress:${code}${detail ? ` ${detail}` : ''}`);
  }
}

type Fetch = typeof fetch;

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export function restUrl(origin: string, style: WpSite['restStyle'], route: string, params: Record<string, string | number> = {}): string {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  if (style === 'query') {
    q.set('rest_route', route);
    return `${origin}/?${q.toString()}`;
  }
  const qs = q.toString();
  return `${origin}/wp-json${route}${qs ? `?${qs}` : ''}`;
}

async function call<T>(site: Pick<WpSite, 'origin' | 'user' | 'appPassword' | 'restStyle'>, route: string, init: { method?: string; params?: Record<string, string | number>; json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {}, f: Fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await f(restUrl(site.origin, site.restStyle, route, init.params), {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Basic ${b64(`${site.user}:${site.appPassword.replace(/\s+/g, '')}`)}`,
        Accept: 'application/json',
        ...(init.json !== undefined && { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new WpError('unreachable', e instanceof Error ? e.message : String(e));
  }
  const data = (await res.json().catch(() => null)) as { code?: string; message?: string; data?: { term_id?: number } } | null;
  if (res.status === 401) throw new WpError('auth', data?.code ?? '');
  if (res.status === 403) throw new WpError('forbidden', data?.code ?? '');
  if (res.status === 404 && (!data || data.code === 'rest_no_route')) throw new WpError('no-rest', data?.code ?? '');
  if (!res.ok) throw new WpError('http', `${res.status} ${data?.code ?? ''}${data?.data?.term_id ? ` ${data.data.term_id}` : ''}`.trim());
  if (data === null) throw new WpError('no-rest', 'not json');
  return data as T;
}

/** Checks the login and finds the REST style that works. Returns the site with displayName and restStyle filled. */
export async function testWpSite(site: Omit<WpSite, 'restStyle' | 'displayName'>, f: Fetch = fetch): Promise<WpSite> {
  let lastErr: unknown;
  for (const restStyle of ['pretty', 'query'] as const) {
    try {
      const me = await call<{ name?: string; capabilities?: Record<string, boolean> }>({ ...site, restStyle }, '/wp/v2/users/me', { params: { context: 'edit' } }, f);
      if (me.capabilities && !me.capabilities.edit_posts) throw new WpError('forbidden', 'edit_posts');
      return { ...site, restStyle, ...(me.name && { displayName: me.name }) };
    } catch (e) {
      lastErr = e;
      if (!(e instanceof WpError && e.code === 'no-rest')) throw e;
    }
  }
  throw lastErr;
}

interface Term {
  id: number;
  name: string;
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
const same = (a: string, b: string) => decode(a).trim().toLowerCase() === b.trim().toLowerCase();

async function findTerm(site: WpSite, tax: 'tags' | 'categories', name: string, f: Fetch): Promise<number | undefined> {
  const found = await call<Term[]>(site, `/wp/v2/${tax}`, { params: { search: name, per_page: 20 } }, f);
  return found.find((t) => same(t.name, name))?.id;
}

async function tagIds(site: WpSite, names: string[], f: Fetch): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names.slice(0, 15)) {
    let id = await findTerm(site, 'tags', name, f);
    if (id === undefined) {
      try {
        id = (await call<Term>(site, '/wp/v2/tags', { method: 'POST', json: { name } }, f)).id;
      } catch (e) {
        // A tag that already exists under another spelling comes back as term_exists with its id.
        const m = e instanceof WpError ? e.detail.match(/term_exists (\d+)/) : null;
        if (!m) throw e;
        id = Number(m[1]);
      }
    }
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export interface DraftResult {
  id: number;
  editUrl: string;
  previewUrl?: string;
  categoryFound: boolean;
  featured: boolean;
}

/** Uploads an image as media and returns its id. */
async function uploadImage(site: WpSite, image: Blob, filename: string, alt: string, f: Fetch): Promise<number> {
  const m = await call<{ id: number }>(site, '/wp/v2/media', { method: 'POST', body: image, headers: { 'Content-Type': image.type || 'image/jpeg', 'Content-Disposition': `attachment; filename="${filename}"` } }, f);
  await call(site, `/wp/v2/media/${m.id}`, { method: 'POST', json: { alt_text: alt } }, f).catch(() => undefined);
  return m.id;
}

/**
 * Creates a draft post from a blog package, or updates the draft created earlier (postId) if it is still a draft.
 * Meta description goes to Yoast and Rank Math meta keys; WordPress ignores keys a site has not registered.
 */
export async function saveWpDraft(site: WpSite, p: BlogPackage, opts: { postId?: number; image?: { blob: Blob; filename: string } } = {}, f: Fetch = fetch): Promise<DraftResult> {
  if (opts.postId) {
    const cur = await call<{ status?: string }>(site, `/wp/v2/posts/${opts.postId}`, { params: { context: 'edit' } }, f).catch((e) => {
      if (e instanceof WpError && e.code === 'http' && e.detail.startsWith('404')) return null;
      throw e;
    });
    if (cur && cur.status !== 'draft' && cur.status !== 'auto-draft' && cur.status !== 'pending') throw new WpError('not-draft', cur.status ?? '');
    if (!cur) opts = { ...opts, postId: undefined };
  }
  const tags = p.tags.length ? await tagIds(site, p.tags, f) : [];
  const cat = p.category.trim() ? await findTerm(site, 'categories', p.category.trim(), f) : undefined;
  const featured = opts.image ? await uploadImage(site, opts.image.blob, opts.image.filename, p.title, f).catch(() => undefined) : undefined;
  const body = {
    title: p.title,
    content: p.html,
    excerpt: p.excerpt,
    ...(p.slug && { slug: p.slug }),
    status: 'draft',
    ...(tags.length && { tags }),
    ...(cat !== undefined && { categories: [cat] }),
    ...(featured !== undefined && { featured_media: featured }),
    ...(p.metaDescription && { meta: { _yoast_wpseo_metadesc: p.metaDescription, rank_math_description: p.metaDescription } }),
  };
  const post = await call<{ id: number; link?: string }>(site, opts.postId ? `/wp/v2/posts/${opts.postId}` : '/wp/v2/posts', { method: 'POST', json: body }, f).catch(async (e) => {
    // Some sites reject unregistered meta keys: retry once without them.
    if (e instanceof WpError && e.code === 'http' && /rest_invalid_param|meta/.test(e.detail)) {
      const { meta: _m, ...rest } = body as typeof body & { meta?: unknown };
      return call<{ id: number; link?: string }>(site, opts.postId ? `/wp/v2/posts/${opts.postId}` : '/wp/v2/posts', { method: 'POST', json: rest }, f);
    }
    throw e;
  });
  return { id: post.id, editUrl: `${site.origin}/wp-admin/post.php?post=${post.id}&action=edit`, previewUrl: post.link, categoryFound: cat !== undefined || !p.category.trim(), featured: featured !== undefined };
}
