// Republishing steps shared by the draft panels, the one-click button and the batch runner:
// captions → blog article → WordPress draft, and YouTube draft → Aparat package → Aparat AI rewrite.
// Nothing here publishes anything: WordPress gets drafts only, Aparat is never contacted.
import { aparatFromDraft, parseAparatAi, type AparatAiResult } from '../../domain/aparat';
import { aparatHashOf, blogFromDraft, blogHtml, parseBlogOutline, transcriptFromCaptions, BLOG_AI_TASK, type BlogVideos } from '../../domain/blog';
import { APARAT_AI_TASK } from '../../domain/aparat';
import { nowIso, type BlogPackage, type Draft } from '../../domain/models';
import { instructionsFor, pickTemplate, siteDefaults, type PromptTemplate, type RepublishSettings } from '../../domain/republish';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { downloadCaption, listCaptions } from '../../integrations/google/ownWrites';
import { loadGoogleState } from '../../integrations/google/auth';
import { saveWpDraft } from '../../integrations/wordpress';
import { get, save } from '../../storage/db';
import { loadWpSites, originOf, type WpSite } from '../../storage/wordpress';

export function videosOf(d: Draft): BlogVideos {
  return { youtubeId: d.source?.videoId, aparatHash: aparatHashOf(d.platforms?.aparat?.url) };
}

/** Applies a change to the latest stored version of a draft (retries once on an edit made elsewhere). */
export async function patchDraft(id: string, fn: (d: Draft) => Draft): Promise<Draft> {
  for (let i = 0; i < 3; i++) {
    const cur = await get('drafts', id);
    if (!cur) throw new Error('draft-missing');
    const r = await save('drafts', fn(cur));
    if (r.ok) return r.record;
  }
  throw new Error('draft-conflict');
}

export interface CaptionResult {
  text: string;
  language: string;
  auto: boolean;
}

/** The video's own captions as plain paragraphs (owner's videos only; captions.list 50 + download 200 units). */
export async function captionsFor(draft: Pick<Draft, 'source' | 'language'>, channelId?: string): Promise<CaptionResult | null> {
  const videoId = draft.source?.videoId;
  const ch = channelId ?? (await loadGoogleState()).activeChannelId;
  if (!videoId || !ch) return null;
  const tracks = (await listCaptions(ch, videoId)).filter((x) => !x.isDraft);
  const lang = draft.language;
  const pick = tracks.find((x) => x.kind !== 'asr' && x.language.startsWith(lang)) ?? tracks.find((x) => x.language.startsWith(lang)) ?? tracks.find((x) => x.kind !== 'asr') ?? tracks[0];
  if (!pick) return null;
  return { text: transcriptFromCaptions(await downloadCaption(ch, pick.id)), language: pick.language, auto: pick.kind === 'asr' };
}

export interface BlogWriteOptions {
  site: string;
  ctaUrl: string;
  template: PromptTemplate;
  transcript: string;
  /** Category kept from an existing package or the site's default. */
  category?: string;
  fresh?: boolean;
}

/** Writes the article with the chosen prompt template; TubeX renders the block HTML itself. */
export async function writeBlogPackage(draft: Draft, o: BlogWriteOptions): Promise<BlogPackage> {
  const p = draft.platforms?.blog;
  const r = await runAiJson({
    task: BLOG_AI_TASK,
    instructions: instructionsFor(o.template),
    data:
      dataBlock('Focus keyword', draft.focusKeyword, 120) +
      dataBlock('Video title', draft.title, 300) +
      dataBlock('Video description', draft.description, 5000) +
      dataBlock('Tags', draft.tags.join(', '), 1000) +
      dataBlock('Transcript', o.transcript, 14000),
    maxTokens: 7000,
    fresh: o.fresh,
  });
  const out = parseBlogOutline(r.output);
  if (!out) throw new Error('bad-output');
  return {
    site: o.site,
    ctaUrl: o.ctaUrl,
    title: out.title,
    slug: out.slug,
    metaDescription: out.metaDescription,
    focusKeyword: out.focusKeyword || draft.focusKeyword,
    excerpt: out.excerpt,
    category: o.category || out.category,
    tags: out.tags,
    html: blogHtml(out, videosOf(draft), o.ctaUrl),
    status: p?.status ?? 'prepared',
    statusAt: p?.statusAt ?? nowIso(),
    ...(p?.url && { url: p.url }),
    ...(p?.wp && { wp: p.wp }),
  };
}

/** Plain article from the description, no AI. */
export function plainBlogPackage(draft: Draft, site: string, ctaUrl: string): BlogPackage {
  const p = draft.platforms?.blog;
  return { ...blogFromDraft(draft, videosOf(draft), { site, ctaUrl }), ...(p && { status: p.status, statusAt: p.statusAt, category: p.category, ...(p.url && { url: p.url }), ...(p.wp && { wp: p.wp }) }) };
}

export async function wpSiteFor(site: string): Promise<WpSite | undefined> {
  const o = originOf(site);
  return o ? (await loadWpSites()).find((s) => s.origin === o) : undefined;
}

/** Video thumbnail for the featured image; the i.ytimg.com permission must already be granted (asked from a click). */
export async function thumbnailFor(videoId: string | undefined, name: string): Promise<{ blob: Blob; filename: string } | undefined> {
  if (!videoId) return undefined;
  for (const size of ['maxresdefault', 'hqdefault']) {
    const r = await fetch(`https://i.ytimg.com/vi/${videoId}/${size}.jpg`).catch(() => null);
    if (r?.ok) return { blob: await r.blob(), filename: `${name || videoId}.jpg` };
  }
  return undefined;
}

export interface WpSendResult {
  pkg: BlogPackage;
  updated: boolean;
  categoryFound: boolean;
  imageMissing: boolean;
}

/** Creates or updates the post as a WordPress draft and records it on the package. */
export async function sendBlogToWp(pkg: BlogPackage, site: WpSite, videoId: string | undefined, withImage: boolean): Promise<WpSendResult> {
  const image = withImage ? await thumbnailFor(videoId, pkg.slug) : undefined;
  const updated = pkg.wp?.origin === site.origin;
  const res = await saveWpDraft(site, pkg, { postId: updated ? pkg.wp!.postId : undefined, image });
  return {
    pkg: { ...pkg, wp: { origin: site.origin, postId: res.id, savedAt: nowIso() }, status: pkg.status === 'prepared' ? 'uploaded' : pkg.status, statusAt: nowIso() },
    updated,
    categoryFound: res.categoryFound,
    imageMissing: !!image && !res.featured,
  };
}

/** Aparat rewrite from the YouTube draft (never from an earlier rewrite). */
export async function rewriteForAparat(draft: Draft, template: PromptTemplate, fresh = false): Promise<AparatAiResult> {
  const r = await runAiJson({
    task: APARAT_AI_TASK,
    instructions: instructionsFor(template),
    data: dataBlock('Focus keyword', draft.focusKeyword, 120) + dataBlock('YouTube title', draft.title, 300) + dataBlock('YouTube description', draft.description, 5000) + dataBlock('YouTube tags', draft.tags.join(', '), 1500),
    maxTokens: 2500,
    fresh,
  });
  const out = parseAparatAi(r.output);
  if (!out) throw new Error('bad-output');
  return out;
}

// ------------------------------------------------------------------ one click / batch

export type StepId = 'draft' | 'captions' | 'article' | 'wordpress' | 'aparat' | 'aparat-ai';
export interface StepReport {
  step: StepId;
  state: 'done' | 'skipped' | 'failed';
  /** Message key suffix or error, for the UI. */
  note?: string;
  error?: unknown;
}

export interface AutoContext {
  settings: RepublishSettings;
  aiEnabled: boolean;
  /** Result of asking for https://i.ytimg.com/* from the click. */
  imageAllowed: boolean;
  onStep?: (r: StepReport) => void;
}

/** Captions → article (site template) → WordPress draft when the site is connected. */
export async function autoBlog(draft: Draft, ctx: AutoContext): Promise<{ draft: Draft; steps: StepReport[] }> {
  const steps: StepReport[] = [];
  const report = (r: StepReport) => {
    steps.push(r);
    ctx.onStep?.(r);
  };
  const s = ctx.settings;
  const prev = draft.platforms?.blog;
  const site = prev?.site || s.blog.defaultSite || s.blog.sites[0]?.site || (await loadWpSites())[0]?.origin || '';
  const sd = siteDefaults(s, site);
  const ctaUrl = prev?.ctaUrl || sd?.ctaUrl || '';
  let pkg: BlogPackage;
  if (!ctx.aiEnabled) {
    report({ step: 'captions', state: 'skipped', note: 'no-ai' });
    pkg = plainBlogPackage(draft, site, ctaUrl);
    report({ step: 'article', state: 'done', note: 'plain' });
  } else {
    let transcript = '';
    try {
      const c = await captionsFor(draft);
      transcript = c?.text ?? '';
      report({ step: 'captions', state: c ? 'done' : 'skipped', note: c ? undefined : 'no-captions' });
    } catch (e) {
      report({ step: 'captions', state: 'failed', error: e });
    }
    try {
      pkg = await writeBlogPackage(draft, { site, ctaUrl, template: pickTemplate(s, 'blog', site), transcript, category: prev?.category || sd?.category, fresh: !!prev });
      report({ step: 'article', state: 'done' });
    } catch (e) {
      report({ step: 'article', state: 'failed', error: e });
      return { draft, steps };
    }
  }
  let saved = await patchDraft(draft.id, (d) => ({ ...d, platforms: { ...d.platforms, blog: pkg } }));
  const wp = s.blog.autoWpDraft ? await wpSiteFor(site) : undefined;
  if (!wp) {
    report({ step: 'wordpress', state: 'skipped', note: s.blog.autoWpDraft ? 'not-connected' : 'off' });
    return { draft: saved, steps };
  }
  try {
    const r = await sendBlogToWp(pkg, wp, draft.source?.videoId, s.blog.featuredImage && ctx.imageAllowed);
    saved = await patchDraft(draft.id, (d) => ({ ...d, platforms: { ...d.platforms, blog: r.pkg } }));
    report({ step: 'wordpress', state: 'done', note: !r.categoryFound ? 'no-category' : r.imageMissing ? 'no-image' : r.updated ? 'updated' : 'created' });
  } catch (e) {
    report({ step: 'wordpress', state: 'failed', error: e });
  }
  return { draft: saved, steps };
}

/** Aparat package (Aparat's limits) → AI rewrite applied when AI is on. Category: package, then default. */
export async function autoAparat(draft: Draft, ctx: AutoContext): Promise<{ draft: Draft; steps: StepReport[] }> {
  const steps: StepReport[] = [];
  const report = (r: StepReport) => {
    steps.push(r);
    ctx.onStep?.(r);
  };
  const s = ctx.settings;
  const prev = draft.platforms?.aparat;
  const base = aparatFromDraft(draft);
  let pkg = prev ? { ...prev } : { ...base, category: s.aparat.defaultCategory };
  report({ step: 'aparat', state: 'done', note: prev ? 'kept' : 'created' });
  if (ctx.aiEnabled && s.aparat.autoAi) {
    try {
      const out = await rewriteForAparat(draft, pickTemplate(s, 'aparat'), !!prev);
      pkg = { ...pkg, title: out.title, description: out.description, tags: out.tags, category: pkg.category.trim() || s.aparat.defaultCategory || out.category };
      report({ step: 'aparat-ai', state: 'done' });
    } catch (e) {
      report({ step: 'aparat-ai', state: 'failed', error: e });
    }
  } else {
    report({ step: 'aparat-ai', state: 'skipped', note: ctx.aiEnabled ? 'off' : 'no-ai' });
  }
  const saved = await patchDraft(draft.id, (d) => ({ ...d, platforms: { ...d.platforms, aparat: pkg } }));
  return { draft: saved, steps };
}
