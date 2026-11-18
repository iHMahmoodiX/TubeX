import { describe, expect, it, vi } from 'vitest';
import { restUrl, saveWpDraft, testWpSite, WpError } from '../../src/integrations/wordpress';
import { transcriptFromCaptions } from '../../src/domain/blog';
import type { BlogPackage } from '../../src/domain/models';

const site = { origin: 'https://blog.example', user: 'editor', appPassword: 'abcd efgh ijkl mnop qrst uvwx', restStyle: 'pretty' as const, addedAt: '2026-11-18' };
const pkg: BlogPackage = { site: 'https://blog.example/blog', title: 'عنوان', slug: 'figma-guide', metaDescription: 'متا', focusKeyword: 'k', excerpt: 'چکیده', category: 'فیگما', tags: ['فیگما', 'UI'], html: '<p>x</p>', ctaUrl: '', status: 'prepared', statusAt: '2026-11-18' };

type Call = { url: string; method: string; body?: unknown; auth?: string };
function fakeWp(routes: (c: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const c: Call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body, auth: (init.headers as Record<string, string>).Authorization };
    calls.push(c);
    const r = routes(c);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe('wordpress', () => {
  it('builds pretty and query REST urls', () => {
    expect(restUrl('https://a.b', 'pretty', '/wp/v2/posts', { per_page: 5 })).toBe('https://a.b/wp-json/wp/v2/posts?per_page=5');
    expect(restUrl('https://a.b', 'query', '/wp/v2/posts', { per_page: 5 })).toBe('https://a.b/?per_page=5&rest_route=%2Fwp%2Fv2%2Fposts');
  });

  it('tests the login with Basic auth (spaces removed) and falls back to ?rest_route', async () => {
    const { f, calls } = fakeWp((c) => (c.url.includes('/wp-json/') ? { status: 404, json: { code: 'rest_no_route' } } : { json: { name: 'Hossein', capabilities: { edit_posts: true } } }));
    const s = await testWpSite(site, f);
    expect(s.restStyle).toBe('query');
    expect(s.displayName).toBe('Hossein');
    expect(calls[0]!.auth).toBe(`Basic ${btoa('editor:abcdefghijklmnopqrstuvwx')}`);
  });

  it('maps a rejected login to auth', async () => {
    const { f } = fakeWp(() => ({ status: 401, json: { code: 'incorrect_password' } }));
    await expect(testWpSite(site, f)).rejects.toMatchObject({ code: 'auth' });
  });

  it('creates a draft with existing tags, new tags and a found category, never published', async () => {
    const { f, calls } = fakeWp((c) => {
      if (c.url.includes('/wp/v2/tags') && c.method === 'GET') return { json: c.url.includes(encodeURIComponent('فیگما')) ? [{ id: 7, name: 'فیگما' }] : [] };
      if (c.url.includes('/wp/v2/tags') && c.method === 'POST') return { status: 201, json: { id: 9, name: 'UI' } };
      if (c.url.includes('/wp/v2/categories')) return { json: [{ id: 3, name: 'فیگما' }] };
      if (c.url.endsWith('/wp/v2/posts') && c.method === 'POST') return { status: 201, json: { id: 42, link: 'https://blog.example/?p=42' } };
      return { status: 500, json: {} };
    });
    const r = await saveWpDraft(site, pkg, {}, f);
    expect(r.id).toBe(42);
    expect(r.editUrl).toBe('https://blog.example/wp-admin/post.php?post=42&action=edit');
    const post = calls.find((c) => c.url.endsWith('/wp/v2/posts'))!.body as Record<string, unknown>;
    expect(post).toMatchObject({ status: 'draft', tags: [7, 9], categories: [3], slug: 'figma-guide', title: 'عنوان' });
    expect(calls.every((c) => c.url.startsWith('https://blog.example/'))).toBe(true);
  });

  it('refuses to update a post that is no longer a draft', async () => {
    const { f, calls } = fakeWp((c) => (c.url.includes('/wp/v2/posts/42') && c.method === 'GET' ? { json: { status: 'publish' } } : { json: {} }));
    await expect(saveWpDraft(site, pkg, { postId: 42 }, f)).rejects.toBeInstanceOf(WpError);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('updates the same draft when it is still a draft', async () => {
    const { f, calls } = fakeWp((c) => {
      if (c.url.includes('/wp/v2/posts/42') && c.method === 'GET') return { json: { status: 'draft' } };
      if (c.url.includes('/wp/v2/posts/42') && c.method === 'POST') return { json: { id: 42 } };
      if (c.url.includes('/tags')) return c.method === 'GET' ? { json: [{ id: 1, name: 'فیگما' }, { id: 2, name: 'UI' }] } : { json: {} };
      return { json: [] };
    });
    const r = await saveWpDraft(site, { ...pkg, category: '' }, { postId: 42 }, f);
    expect(r.id).toBe(42);
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual(['https://blog.example/wp-json/wp/v2/posts/42']);
  });
});

describe('captions to transcript', () => {
  it('drops rolling repeats and breaks paragraphs at pauses', () => {
    const srt = '1\n00:00:00,000 --> 00:00:02,000\nسلام به همه\n\n2\n00:00:02,000 --> 00:00:04,000\nسلام به همه امروز فیگما\n\n3\n00:00:08,000 --> 00:00:10,000\nبخش دوم';
    expect(transcriptFromCaptions(srt)).toBe('سلام به همه امروز فیگما\n\nبخش دوم');
  });
});
