import { describe, expect, it } from 'vitest';
import { aparatHashOf, blogFromDraft, blogHtml, checkBlog, parseBlogOutline, slugify, wpNewPostUrl, youtubeIdOf } from '../../src/domain/blog';
import { fitLines, parseAparatAi, pickTags } from '../../src/domain/aparat';
import { sanitizeRecord } from '../../src/domain/records';

const outline = {
  title: 'آموزش Auto Layout در فیگما',
  slug: 'Figma Auto Layout!!',
  metaDescription: 'x'.repeat(130),
  focusKeyword: 'Auto Layout',
  excerpt: 'چکیده',
  category: 'فیگما',
  tags: ['فیگما', 'Auto Layout'],
  intro: ['مقدمه <script>alert(1)</script>'],
  sections: [
    { heading: 'Auto Layout چیست؟', summary: 'یک خلاصه', paragraphs: ['متن **مهم**'], bullets: ['الف'] },
    { heading: 'چگونه فعال کنیم؟', paragraphs: [], steps: ['قدم ۱', 'قدم ۲'] },
    { heading: 'اشتباهات رایج', paragraphs: ['متن'] },
    { heading: '', paragraphs: ['dropped'] },
  ],
  faq: [{ q: 'رایگان است؟', a: 'بله.' }, { q: '', a: 'x' }],
  checklist: ['مورد'],
  ctaText: 'دورهٔ فیگما را ببینید',
};

describe('blog version', () => {
  it('validates the model outline and never passes model HTML through', () => {
    const o = parseBlogOutline(outline)!;
    expect(o.slug).toBe('figma-auto-layout');
    expect(o.sections).toHaveLength(3);
    expect(o.faq).toHaveLength(1);
    const html = blogHtml(o, { youtubeId: 'dQw4w9WgXcQ', aparatHash: 'abC12' }, 'https://example.com/course');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>مهم</strong>');
    expect(html).toContain('<!-- wp:embed {"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(html).toContain('https://www.aparat.com/video/video/embed/videohash/abC12/vt/frame');
    expect(html).toContain('<ol class="wp-block-list">');
    expect(html).toContain('<h3 class="wp-block-heading">رایگان است؟</h3>');
    expect(html).toContain('<a href="https://example.com/course"><strong>دورهٔ فیگما را ببینید</strong></a>');
    expect(parseBlogOutline({ title: 'x', sections: [] })).toBeNull();
  });

  it('checks SEO fields of a package', () => {
    const o = parseBlogOutline(outline)!;
    const p = { site: 'https://example.com/blog', title: o.title, slug: o.slug, metaDescription: `Auto Layout ${'x'.repeat(120)}`, focusKeyword: o.focusKeyword, excerpt: '', category: '', tags: [], html: blogHtml(o, { youtubeId: 'dQw4w9WgXcQ' }, ''), ctaUrl: '', status: 'prepared' as const, statusAt: '2026-11-18' };
    expect(checkBlog(p)).toEqual([]);
    const bad = checkBlog({ ...p, site: '', slug: '', metaDescription: 'short', html: '<p>x</p>' }).map((i) => i.id);
    expect(bad).toEqual(['site-missing', 'meta-length', 'slug-missing', 'keyword-not-in-meta', 'no-video', 'few-sections']);
  });

  it('builds a plain version from the description without AI', () => {
    const p = blogFromDraft({ title: 'Figma tips', description: 'اول\n00:00 مقدمه\n۰۱:۲۰ شروع\nhttps://x.ir\n#figma', tags: ['a'], focusKeyword: '' }, { youtubeId: 'dQw4w9WgXcQ' }, { site: 'https://example.com/blog', ctaUrl: '' });
    expect(p.slug).toBe('figma-tips');
    expect(p.html).toContain('<li>00:00 مقدمه</li>');
    expect(p.html).toContain('<li>۰۱:۲۰ شروع</li>');
    expect(p.html).not.toContain('https://x.ir');
  });

  it('reads video ids and WordPress links', () => {
    expect(youtubeIdOf('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(aparatHashOf('https://www.aparat.com/v/abC12')).toBe('abC12');
    expect(aparatHashOf('https://evil.com/v/abC12')).toBeUndefined();
    expect(wpNewPostUrl('https://example.com/blog')).toBe('https://example.com/wp-admin/post-new.php');
    expect(wpNewPostUrl('http://example.com')).toBeUndefined();
    expect(slugify('آموزش فیگما')).toBe('');
  });

  it('keeps the blog package through record validation', () => {
    const rec = { id: 'd1', createdAt: '2026-11-18T00:00:00Z', updatedAt: '2026-11-18T00:00:00Z', title: 't', description: '', tags: [], focusKeyword: '', language: 'fa', status: 'draft', platforms: { blog: { site: 'javascript:alert(1)', title: 't', slug: 'A b', html: '<p>x</p>', ctaUrl: 'https://e.com/c', status: 'published', url: 'https://e.com/p' } } };
    const r = sanitizeRecord('drafts', rec);
    expect(r?.platforms?.blog?.site).toBe('');
    expect(r?.platforms?.blog?.slug).toBe('a-b');
    expect(r?.platforms?.blog?.status).toBe('published');
    expect(r?.platforms?.aparat).toBeUndefined();
  });
});

describe('aparat fitting', () => {
  it('keeps at most 5 tags that fit 23 characters, in order', () => {
    expect(pickTags(['#a', 'b', 'A', 'x'.repeat(24), 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('cuts long text at a line', () => {
    const t = `${'a'.repeat(1500)}\n${'b'.repeat(800)}`;
    expect(fitLines(t, 2000)).toBe('a'.repeat(1500));
  });
  it('fits an AI answer to Aparat rules', () => {
    const r = parseAparatAi({ title: 'عنوان', description: 'متن https://youtu.be/abc\nادامه', tags: ['یک', 'دو', 'سه', 'چهار', 'پنج', 'شش'], category: 'آموزشی', why: 'چون' })!;
    expect(r.tags).toHaveLength(5);
    expect(r.description).not.toContain('youtu.be');
    expect(parseAparatAi({ title: '' })).toBeNull();
  });
});
