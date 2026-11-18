// Blog version of a video (WordPress): the same topic as a readable article with the YouTube and Aparat videos
// embedded, in the owner's post style (problem-first intro, question-style H2s, lists, FAQ, final checklist, one CTA).
// The model returns structure only; TubeX writes the HTML itself with escaping, so no model markup reaches WordPress.
import type { BlogPackage, Draft } from './models';
import { parseSubtitles } from './engageShorts';

export const BLOG_RULES = { titleMax: 65, metaMin: 120, metaMax: 160, minSections: 3 } as const;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function youtubeIdOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m?.[1];
}

export function aparatHashOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (!/(^|\.)aparat\.com$/.test(u.hostname)) return undefined;
    const m = u.pathname.match(/^\/v\/([A-Za-z0-9]{3,20})/);
    return m?.[1];
  } catch {
    return undefined;
  }
}

/** Gutenberg embed block for a YouTube video (WordPress turns the URL into the player). */
export function youtubeEmbedBlock(videoId: string): string {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  return `<!-- wp:embed {"url":"${url}","type":"video","providerNameSlug":"youtube","responsive":true,"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"} -->
<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">
${url}
</div></figure>
<!-- /wp:embed -->`;
}

/** Custom HTML block with Aparat's iframe player (Aparat is not a WordPress oEmbed provider). */
export function aparatEmbedBlock(hash: string, title: string): string {
  return `<!-- wp:html -->
<div class="h_iframe-aparat_embed_frame" style="position:relative;padding-top:56.25%"><iframe src="https://www.aparat.com/video/video/embed/videohash/${esc(hash)}/vt/frame" title="${esc(title)}" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe></div>
<!-- /wp:html -->`;
}

const para = (t: string) => `<!-- wp:paragraph -->\n<p>${inline(t)}</p>\n<!-- /wp:paragraph -->`;
const heading = (t: string, level: 2 | 3) => `<!-- wp:heading${level === 3 ? ' {"level":3}' : ''} -->\n<h${level} class="wp-block-heading">${esc(t)}</h${level}>\n<!-- /wp:heading -->`;
const list = (items: string[], ordered = false) => {
  const tag = ordered ? 'ol' : 'ul';
  const attrs = ordered ? ' {"ordered":true}' : '';
  return `<!-- wp:list${attrs} -->\n<${tag} class="wp-block-list">${items.map((i) => `<!-- wp:list-item -->\n<li>${inline(i)}</li>\n<!-- /wp:list-item -->`).join('\n')}</${tag}>\n<!-- /wp:list -->`;
};
/** Escapes text and allows **bold** only. */
function inline(t: string): string {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export interface BlogOutline {
  title: string;
  slug: string;
  metaDescription: string;
  focusKeyword: string;
  excerpt: string;
  category: string;
  tags: string[];
  intro: string[];
  sections: { heading: string; summary?: string; paragraphs: string[]; bullets?: string[]; steps?: string[] }[];
  faq: { q: string; a: string }[];
  checklist: string[];
  ctaText: string;
}

export interface BlogVideos {
  youtubeId?: string;
  aparatHash?: string;
}

/** WordPress block HTML from an outline: intro, the video(s), sections, FAQ, checklist, CTA. */
export function blogHtml(o: BlogOutline, videos: BlogVideos, ctaUrl: string): string {
  const out: string[] = [];
  o.intro.forEach((p) => out.push(para(p)));
  if (videos.youtubeId) out.push(youtubeEmbedBlock(videos.youtubeId));
  if (videos.aparatHash) {
    out.push(para('اگر یوتیوب برایتان باز نمی‌شود، همین ویدیو را در آپارات ببینید:'));
    out.push(aparatEmbedBlock(videos.aparatHash, o.title));
  }
  for (const s of o.sections) {
    out.push(heading(s.heading, 2));
    if (s.summary) out.push(para(`**${s.summary}**`));
    s.paragraphs.forEach((p) => out.push(para(p)));
    if (s.steps?.length) out.push(list(s.steps, true));
    if (s.bullets?.length) out.push(list(s.bullets));
  }
  if (o.faq.length) {
    out.push(heading('سؤالات متداول', 2));
    for (const f of o.faq) {
      out.push(heading(f.q, 3));
      out.push(para(f.a));
    }
  }
  if (o.checklist.length) {
    out.push(heading('چک‌لیست نهایی', 2));
    out.push(list(o.checklist));
  }
  if (o.ctaText) {
    const text = esc(o.ctaText);
    out.push(`<!-- wp:paragraph -->\n<p>${ctaUrl ? `<a href="${esc(ctaUrl)}"><strong>${text}</strong></a>` : `<strong>${text}</strong>`}</p>\n<!-- /wp:paragraph -->`);
  }
  return out.join('\n\n');
}

/** Latin slug from any text (Persian titles need the model's or owner's English slug). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const s = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v: unknown, max: number, len = 600) => (Array.isArray(v) ? v.map((x) => s(x, len)).filter(Boolean).slice(0, max) : []);

/** Validates a model answer; returns null when the essentials are missing. */
export function parseBlogOutline(o: Record<string, unknown>): BlogOutline | null {
  const title = s(o.title, 200);
  const sections = Array.isArray(o.sections)
    ? o.sections
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({ heading: s(x.heading, 200), summary: s(x.summary, 300) || undefined, paragraphs: arr(x.paragraphs, 6, 1500), bullets: arr(x.bullets, 12, 300), steps: arr(x.steps, 12, 300) }))
        .filter((x) => x.heading && (x.paragraphs.length || x.bullets.length || x.steps.length))
        .slice(0, 14)
    : [];
  if (!title || !sections.length) return null;
  const faq = Array.isArray(o.faq)
    ? o.faq
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({ q: s(x.q, 300), a: s(x.a, 1200) }))
        .filter((x) => x.q && x.a)
        .slice(0, 8)
    : [];
  return {
    title,
    slug: slugify(s(o.slug, 120)),
    metaDescription: s(o.metaDescription, 300),
    focusKeyword: s(o.focusKeyword, 120),
    excerpt: s(o.excerpt, 500),
    category: s(o.category, 100),
    tags: arr(o.tags, 10, 60),
    intro: arr(o.intro, 4, 1200),
    sections,
    faq,
    checklist: arr(o.checklist, 12, 300),
    ctaText: s(o.ctaText, 200),
  };
}

/**
 * Caption file (SRT/VTT) → plain transcript: cue text in order, with the rolling repeats of auto-generated captions
 * removed and a paragraph break at long pauses (≥ 2.5 s).
 */
export function transcriptFromCaptions(text: string): string {
  const cues = parseSubtitles(text);
  if (!cues.length) return text.trim();
  const out: string[] = [];
  let prevEnd = 0;
  let last = '';
  for (const c of cues) {
    let t = c.text.trim();
    // Auto captions repeat the previous line at the start of the next cue.
    if (last && t.startsWith(last)) t = t.slice(last.length).trim();
    if (!t) continue;
    out.push(c.start - prevEnd >= 2.5 && out.length ? `\n\n${t}` : t);
    prevEnd = c.end;
    last = c.text.trim();
  }
  return out.join(' ').replace(/ \n\n/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
}

export const BLOG_AI_TASK = 'blog-article-v3';
/** The owner-editable part of the article prompt (Settings → Blog → prompt templates). */
export const BLOG_DEFAULT_PROMPT = `این ویدیو را به یک مقالهٔ فارسی برای وبلاگ وردپرسی خودم تبدیل کن؛ نسخهٔ نوشتاری همین ویدیو. متن کپشن (اگر هست) منبع اصلی است و عنوان، توضیحات، فصل‌ها و برچسب‌ها فقط زمینه را کامل می‌کنند.

لحن و صدا:
- طوری بنویس که انگار خودم نوشته‌ام: اول‌شخص (من/ما هر جا طبیعی است)، با توضیح‌ها و مثال‌های خود ویدیو، لحن گرم، مستقیم و متخصص، و خواننده را «شما» خطاب کن.
- باید مثل یک مقالهٔ انسانیِ دقیق خوانده شود، نه متن پیاده‌شده و نه متن هوش مصنوعی: حشو، تکرار، سلام و خداحافظی، «در این ویدیو»، «سابسکرایب کنید» و حرف‌های جلوی دوربین را حذف کن؛ جمله‌های گفتاری را نوشتاری و روشن کن؛ از کلیشه، اغراق و پرکردن بی‌مورد پرهیز کن.

ساختار (سبک پست‌های من):
- مقدمهٔ کوتاه که با مسئلهٔ خواننده شروع می‌شود (۲ تا ۳ پاراگراف کوتاه).
- بخش‌هایی که تیتر H2 آن‌ها همان سؤال‌هایی است که مردم جستجو می‌کنند (مثل «X چیست؟»، «چگونه ...؟»)؛ هر بخش با یک جملهٔ خلاصهٔ پررنگ شروع شود، بعد پاراگراف‌های کوتاه، مراحل شماره‌دار برای روش‌ها و فهرست نقطه‌ای برای گزینه‌ها.
- ترتیب بخش‌ها از فصل‌های ویدیو پیروی کند.
- ۳ تا ۵ سؤال متداول (سؤال + جواب یک یا دو جمله‌ای)، یک چک‌لیست پایانی ۴ تا ۸ موردی و یک جملهٔ دعوت به اقدام در پایان (دعوت به دوره یا دیدن ویدیوهای بیشتر، بدون لینک).

دقت:
- فقط چیزی را بگو که محتوای ویدیو پشتیبانی می‌کند؛ هیچ عدد، قیمت، تاریخ یا قابلیتی از خودت نساز.
- نام محصولات و بخش‌های رابط کاربری انگلیسی را انگلیسی بنویس.

سئو:
- عنوان حداکثر ۶۰ کاراکتر با کلمهٔ کلیدی اصلی نزدیک ابتدای آن.
- توضیحات متا ۱۲۰ تا ۱۵۵ کاراکتر و شامل کلمهٔ کلیدی.
- نامک (slug) با چند کلمهٔ کوتاه انگلیسی و خط تیره.
- خلاصه (excerpt) یک یا دو جمله، ۳ تا ۸ برچسب و یک نام دسته.`;

/** Fixed output contract TubeX parses; always appended after the (possibly edited) prompt. */
export const BLOG_OUTPUT_FORMAT =
  'Return {"title","slug","metaDescription","focusKeyword","excerpt","category","tags":[],"intro":[],"sections":[{"heading","summary","paragraphs":[],"steps":[],"bullets":[]}],"faq":[{"q","a"}],"checklist":[],"ctaText"}. Plain text only inside strings (you may use **bold**), no HTML.';

export const BLOG_AI_INSTRUCTIONS = `${BLOG_DEFAULT_PROMPT}\n\n${BLOG_OUTPUT_FORMAT}`;

export type BlogIssueId = 'site-missing' | 'title-long' | 'meta-length' | 'slug-missing' | 'keyword-missing' | 'keyword-not-in-title' | 'keyword-not-in-meta' | 'no-video' | 'few-sections' | 'body-empty';
export interface BlogIssue {
  id: BlogIssueId;
  severity: 'error' | 'warning';
  values?: Record<string, string | number>;
}

export function checkBlog(p: BlogPackage): BlogIssue[] {
  const out: BlogIssue[] = [];
  const len = (x: string) => [...x.trim()].length;
  if (!p.site) out.push({ id: 'site-missing', severity: 'warning' });
  if (!p.html.trim()) out.push({ id: 'body-empty', severity: 'error' });
  if (len(p.title) > BLOG_RULES.titleMax) out.push({ id: 'title-long', severity: 'warning', values: { n: len(p.title), max: BLOG_RULES.titleMax } });
  const m = len(p.metaDescription);
  if (m < BLOG_RULES.metaMin || m > BLOG_RULES.metaMax) out.push({ id: 'meta-length', severity: 'warning', values: { n: m, min: BLOG_RULES.metaMin, max: BLOG_RULES.metaMax } });
  if (!p.slug) out.push({ id: 'slug-missing', severity: 'error' });
  const k = p.focusKeyword.trim().toLowerCase();
  if (!k) out.push({ id: 'keyword-missing', severity: 'warning' });
  else {
    if (!p.title.toLowerCase().includes(k)) out.push({ id: 'keyword-not-in-title', severity: 'warning' });
    if (!p.metaDescription.toLowerCase().includes(k)) out.push({ id: 'keyword-not-in-meta', severity: 'warning' });
  }
  if (p.html.trim() && !/wp:embed|aparat\.com\/video\/video\/embed/.test(p.html)) out.push({ id: 'no-video', severity: 'warning' });
  const h2 = (p.html.match(/<h2[\s>]/g) ?? []).length;
  if (p.html.trim() && h2 < BLOG_RULES.minSections) out.push({ id: 'few-sections', severity: 'warning', values: { n: h2, min: BLOG_RULES.minSections } });
  return out;
}

/** Without AI: a plain article from the video's own description (intro, embeds, chapters as a list). */
export function blogFromDraft(d: Pick<Draft, 'title' | 'description' | 'tags' | 'focusKeyword'>, videos: BlogVideos, opts: { site: string; ctaUrl: string; at?: string }): BlogPackage {
  const lines = d.description.split('\n').map((l) => l.trim());
  const chapters = lines.filter((l) => /^\(?\d{1,2}:\d{2}/.test(l.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))));
  const prose = lines.filter((l) => l && !chapters.includes(l) && !/https?:\/\//.test(l) && !/^#/.test(l));
  const outline: BlogOutline = {
    title: d.title,
    slug: slugify(d.title),
    metaDescription: prose.join(' ').slice(0, 155),
    focusKeyword: d.focusKeyword,
    excerpt: prose[0] ?? '',
    category: '',
    tags: d.tags.slice(0, 8),
    intro: prose.slice(0, 3),
    sections: chapters.length ? [{ heading: 'در این ویدیو چه می‌بینید؟', paragraphs: [], bullets: chapters }] : [],
    faq: [],
    checklist: [],
    ctaText: '',
  };
  return {
    site: opts.site,
    title: outline.title,
    slug: outline.slug,
    metaDescription: outline.metaDescription,
    focusKeyword: outline.focusKeyword,
    excerpt: outline.excerpt,
    category: '',
    tags: outline.tags,
    html: blogHtml(outline, videos, opts.ctaUrl),
    ctaUrl: opts.ctaUrl,
    status: 'prepared',
    statusAt: opts.at ?? new Date().toISOString(),
  };
}

/** WordPress "new post" screen of a site address like https://example.com/blog. */
export function wpNewPostUrl(site: string): string | undefined {
  try {
    const u = new URL(site);
    if (u.protocol !== 'https:') return undefined;
    return `${u.origin}/wp-admin/post-new.php`;
  } catch {
    return undefined;
  }
}
