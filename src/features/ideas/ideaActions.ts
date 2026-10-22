import { newBase, nowIso, type Draft, type Idea, type Lang, type SourceRef } from '../../domain/models';
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

export async function captureIdea(input: { text: string; ctx: PageContext | null; link: boolean; profileId?: string }): Promise<Idea | null> {
  const text = input.text.trim() || defaultIdeaText(input.ctx);
  if (!text) return null;
  const source = input.link && input.ctx ? sourceFromContext(input.ctx) : undefined;
  const idea: Idea = {
    ...newBase(),
    text,
    notes: '',
    status: 'inbox',
    ...(input.profileId && { profileId: input.profileId }),
    ...(source && { source }),
  };
  return create('ideas', idea);
}

export async function createDraft(init: { profileId?: string; language: Lang; idea?: Idea; source?: SourceRef }): Promise<Draft> {
  const draft: Draft = {
    ...newBase(),
    language: init.language,
    focusKeyword: '',
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
