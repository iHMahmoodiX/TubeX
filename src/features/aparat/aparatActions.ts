// "Send to Aparat" from a published YouTube video: reuse the video's linked draft (or copy the video into a new
// one) and give it an Aparat package, in one click. Nothing is sent to Aparat.
import { aparatFromDraft } from '../../domain/aparat';
import type { Draft } from '../../domain/models';
import { list, save } from '../../storage/db';
import { videoToDraft } from '../reports/data';

export const FOCUS_KEY = 'tubex.focus';

export async function draftsByVideo(): Promise<Map<string, Draft>> {
  const { items } = await list('drafts');
  const m = new Map<string, Draft>();
  // Prefer a draft that already has an Aparat package, then the most recently edited one.
  for (const d of [...items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))) {
    const id = d.source?.videoId;
    if (!id) continue;
    const prev = m.get(id);
    if (!prev || (!prev.platforms?.aparat && d.platforms?.aparat)) m.set(id, d);
  }
  return m;
}

export async function prepareForAparat(v: { id: string; title: string; description: string; tags: string[] }, existing?: Draft): Promise<Draft> {
  const d = existing ?? (await draftsByVideo()).get(v.id) ?? (await videoToDraft(v));
  if (d.platforms?.aparat) return d;
  const category = await lastCategory();
  const next: Draft = { ...d, platforms: { ...d.platforms, aparat: { ...aparatFromDraft(d), category } } };
  const r = await save('drafts', next);
  if (r.ok) return r.record;
  // Edited elsewhere meanwhile: add the package to the stored version instead of overwriting it.
  const cur = r.conflict;
  if (!cur) return d;
  if (cur.platforms?.aparat) return cur;
  const again = await save('drafts', { ...cur, platforms: { ...cur.platforms, aparat: aparatFromDraft(cur) } });
  return again.ok ? again.record : cur;
}

/** The category of the most recently edited Aparat package, so it is typed once, not per video. */
export async function lastCategory(): Promise<string> {
  const { items } = await list('drafts');
  const withCat = items.filter((d) => d.platforms?.aparat?.category.trim()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return withCat[0]?.platforms?.aparat?.category.trim() ?? '';
}

/** Opens a draft with its Aparat card in view. */
export function openAparatDraft(id: string): void {
  try {
    sessionStorage.setItem(FOCUS_KEY, 'aparat');
  } catch {
    // Focus is a convenience only.
  }
  location.hash = `drafts/${encodeURIComponent(id)}`;
}
