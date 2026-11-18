import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOG_OUTPUT_FORMAT } from '../../src/domain/blog';
import { APARAT_OUTPUT_FORMAT } from '../../src/domain/aparat';
import { BUILTIN_ID, DEFAULT_PROMPT, coerceRepublish, emptyRepublish, instructionsFor, pickTemplate, sameSite, templatesOf, type PromptTemplate } from '../../src/domain/republish';

const tpl = (id: string, kind: 'blog' | 'aparat', sites: string[] = [], text = `prompt ${id}`): PromptTemplate => ({ id, kind, name: id, text, sites, updatedAt: '2026-11-18' });

describe('prompt templates', () => {
  it('always appends the fixed answer format after the owner prompt', () => {
    expect(instructionsFor({ kind: 'blog', text: 'بنویس انگار خودم نوشتم' })).toBe(`بنویس انگار خودم نوشتم\n\n${BLOG_OUTPUT_FORMAT}`);
    expect(instructionsFor({ kind: 'aparat', text: '   ' })).toBe(`${DEFAULT_PROMPT.aparat}\n\n${APARAT_OUTPUT_FORMAT}`);
    expect(APARAT_OUTPUT_FORMAT).toMatch(/at most 5 tags/);
  });

  it('picks the site template, then a template assigned to the site, then the default, then the built-in', () => {
    const s = emptyRepublish();
    expect(pickTemplate(s, 'blog', 'https://a.com/blog').id).toBe(BUILTIN_ID.blog);
    s.templates = [tpl('t1', 'blog'), tpl('t2', 'blog', ['https://learn.example/blog']), tpl('a1', 'aparat')];
    s.defaultTemplate = { blog: 't1', aparat: 'a1' };
    expect(pickTemplate(s, 'blog', 'https://other.com').id).toBe('t1');
    expect(pickTemplate(s, 'blog', 'https://www.learn.example/blog/').id).toBe('t2');
    s.blog.sites = [{ site: 'https://learn.example/blog', ctaUrl: '', category: '', templateId: 't1' }];
    expect(pickTemplate(s, 'blog', 'https://learn.example/blog').id).toBe('t1');
    expect(pickTemplate(s, 'aparat').id).toBe('a1');
  });

  it('lists the built-in template first, with the owner edits when saved', () => {
    const s = emptyRepublish();
    s.templates = [tpl('x', 'blog'), { ...tpl(BUILTIN_ID.blog, 'blog'), text: 'my default', name: '' }];
    const list = templatesOf(s, 'blog');
    expect(list.map((x) => x.id)).toEqual([BUILTIN_ID.blog, 'x']);
    expect(list[0]!.text).toBe('my default');
    expect(templatesOf(emptyRepublish(), 'aparat')[0]!.text).toBe(DEFAULT_PROMPT.aparat);
  });

  it('cleans stored settings: bad kinds, empty prompts, unknown defaults, http sites', () => {
    const s = coerceRepublish({
      templates: [tpl('ok', 'blog', ['https://a.com/', 'http://b.com']), { ...tpl('bad', 'blog'), kind: 'tiktok' }, { ...tpl('empty', 'aparat'), text: ' ' }, tpl('ok', 'blog')],
      defaultTemplate: { blog: 'ok', aparat: 'missing' },
      blog: { defaultSite: 'http://insecure.com', sites: [{ site: 'https://a.com/blog/', ctaUrl: 'javascript:x', category: 'UI', templateId: 'gone' }], autoWpDraft: false },
      aparat: { defaultCategory: 'آموزشی' },
    });
    expect(s.templates.map((x) => x.id)).toEqual(['ok']);
    expect(s.templates[0]!.sites).toEqual(['https://a.com']);
    expect(s.defaultTemplate).toEqual({ blog: 'ok' });
    expect(s.blog.defaultSite).toBe('');
    expect(s.blog.sites).toEqual([{ site: 'https://a.com/blog', ctaUrl: '', category: 'UI' }]);
    expect(s.blog.autoWpDraft).toBe(false);
    expect(s.blog.featuredImage).toBe(true);
    expect(s.aparat).toEqual({ defaultCategory: 'آموزشی', autoAi: true });
  });

  it('compares blog addresses typed in different ways', () => {
    expect(sameSite('https://www.ihm.example/blog/', 'ihm.example/blog')).toBe(true);
    expect(sameSite('https://ihm.example', 'https://ihm.example/blog')).toBe(true);
    expect(sameSite('https://a.example', 'https://b.example')).toBe(false);
  });
});

const ai = vi.hoisted(() => ({ runAiJson: vi.fn() }));
vi.mock('../../src/integrations/ai/custom', () => ({ runAiJson: ai.runAiJson, dataBlock: (l: string, v?: string) => (v ? `\n${l}:\n<data>${v}</data>` : '') }));

describe('do it all', () => {
  beforeEach(async () => {
    const db = await import('../../src/storage/db');
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
    ai.runAiJson.mockReset();
  });

  it('Aparat: package with the default category, AI rewrite applied within Aparat limits, with the chosen prompt', async () => {
    const { videoToDraft } = await import('../../src/features/reports/data');
    const { autoAparat } = await import('../../src/features/republish/pipeline');
    const d = await videoToDraft({ id: 'vid00000001', title: 'Figma Auto Layout', description: 'desc\nhttps://youtu.be/x', tags: ['figma'] });
    ai.runAiJson.mockResolvedValue({ output: { title: 'آموزش اتولیوت فیگما', description: 'توضیح', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], category: 'سرگرمی', why: '' } });
    const s = emptyRepublish();
    s.aparat.defaultCategory = 'آموزشی';
    s.templates = [tpl('mine', 'aparat', [], 'لحن خودمانی')];
    s.defaultTemplate = { aparat: 'mine' };
    const steps: string[] = [];
    const r = await autoAparat(d, { settings: s, aiEnabled: true, imageAllowed: false, onStep: (x) => steps.push(`${x.step}:${x.state}`) });
    expect(steps).toEqual(['aparat:done', 'aparat-ai:done']);
    const p = r.draft.platforms!.aparat!;
    expect(p.title).toBe('آموزش اتولیوت فیگما');
    expect(p.tags).toHaveLength(5);
    expect(p.category).toBe('آموزشی');
    expect(ai.runAiJson.mock.calls[0]![0].instructions).toMatch(/^لحن خودمانی\n\n/);
  });

  it('Blog: without captions access, writes from the description and skips WordPress when the blog is not connected', async () => {
    const { videoToDraft } = await import('../../src/features/reports/data');
    const { autoBlog } = await import('../../src/features/republish/pipeline');
    const d = await videoToDraft({ id: 'vid00000002', title: 'Auto Layout', description: 'desc', tags: [] });
    ai.runAiJson.mockResolvedValue({
      output: { title: 'Auto Layout در فیگما', slug: 'figma-auto-layout', metaDescription: 'm', focusKeyword: 'Auto Layout', excerpt: 'e', category: 'UI', tags: ['figma'], intro: ['سلام'], sections: [{ heading: 'چیست؟', summary: 's', paragraphs: ['p'] }], faq: [], checklist: [], ctaText: '' },
    });
    const s = emptyRepublish();
    s.blog.sites = [{ site: 'https://blog.example', ctaUrl: 'https://blog.example/course', category: 'Design' }];
    const steps: string[] = [];
    const r = await autoBlog(d, { settings: s, aiEnabled: true, imageAllowed: false, onStep: (x) => steps.push(`${x.step}:${x.state}:${x.note ?? ''}`) });
    expect(steps[1]).toBe('article:done:');
    expect(steps[2]).toBe('wordpress:skipped:not-connected');
    const p = r.draft.platforms!.blog!;
    expect(p.site).toBe('https://blog.example');
    expect(p.ctaUrl).toBe('https://blog.example/course');
    expect(p.category).toBe('Design');
    expect(p.html).toContain('wp:embed');
  });
});
