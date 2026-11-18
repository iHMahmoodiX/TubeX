import { newBase, nowIso, type Draft, type Idea, type Lang, type ResearchRef, type SourceRef } from '../../domain/models';
import { draftSeed } from '../../domain/workflow';
import { canonicalUrl, isCapturable, type PageContext } from '../../domain/pageContext';
import { create } from '../../storage/db';

export function sourceFromContext(ctx: PageContext): SourceRef | undefined {
  const url = canonicalUrl(ctx);
  if (!isCapturable(ctx.kind) || !url) return undefined;
  return {
    kind: ctx.kind,
    url,
    capturedAt: nowIso(),
    origin: ctx.origin,
    ...(ctx.videoId && { videoId: ctx.videoId }),
    ...(ctx.title && { title: ctx.title }),
    ...(ctx.channelName && { channelName: ctx.channelName }),
    ...(ctx.searchQuery && { searchQuery: ctx.searchQuery }),
  };
}

/** Text used when the user saves without typing: the page title or search query. */
export function defaultIdeaText(ctx: PageContext | null): string {
  return (ctx?.title ?? ctx?.searchQuery ?? '').trim();
}

export async function captureIdea(input: { text: string; ctx: PageContext | null; link: boolean; profileId?: string; research?: ResearchRef; source?: SourceRef }): Promise<Idea | null> {
  const text = input.text.trim() || defaultIdeaText(input.ctx);
  if (!text) return null;
  const source = input.source ?? (input.link && input.ctx ? sourceFromContext(input.ctx) : undefined);
  const idea: Idea = {
    ...newBase(),
    text,
    notes: '',
    status: 'inbox',
    ...(input.profileId && { profileId: input.profileId }),
    ...(source && { source }),
    ...(input.research && { research: input.research }),
  };
  return create('ideas', idea);
}

export async function createDraft(init: { profileId?: string; language: Lang; idea?: Idea; source?: SourceRef }): Promise<Draft> {
  const seed = init.idea ? draftSeed(init.idea, init.language) : { focusKeyword: '', language: init.language };
  const draft: Draft = {
    ...newBase(),
    ...seed,
    // Seed the title with the idea so the draft starts from it; the user rewrites it.
    title: init.idea ? Array.from(init.idea.text.split('\n')[0] ?? '').slice(0, 100).join('') : '',
    description: '',
    tags: [],
    ...(init.profileId && { profileId: init.profileId }),
    ...(init.idea && { ideaId: init.idea.id }),
    ...((init.idea?.source ?? init.source) && { source: init.idea?.source ?? init.source }),
  };
  return create('drafts', draft);
}

/**
 * Research → Idea → Draft in one deliberate action: saves the idea with its provenance and opens a draft that
 * already carries the keyword, language and research record.
 */
export async function ideaAndDraft(input: { text: string; research: ResearchRef; source?: SourceRef; profileId?: string; language: Lang }): Promise<{ idea: Idea; draft: Draft } | null> {
  const idea = await captureIdea({ text: input.text, ctx: null, link: false, research: input.research, source: input.source, profileId: input.profileId });
  if (!idea) return null;
  const draft = await createDraft({ profileId: input.profileId, language: input.language, idea });
  return { idea, draft };
}
