import { newBase, nowIso, type KeywordList, type WatchedChannel } from '../../domain/models';
import { normalizeForSearch } from '../../domain/text';
import type { ChannelInfo } from '../../integrations/youtube/api';
import { create, get, list, save } from '../../storage/db';

/** Accepts @handle, a channel URL (/@handle or /channel/UC…) or a bare UC… id. */
export function parseChannelInput(input: string): { id?: string; handle?: string } | null {
  const s = input.trim();
  if (!s) return null;
  const id = s.match(/(?:^|\/channel\/)(UC[A-Za-z0-9_-]{22})(?:[/?#]|$)/)?.[1];
  if (id) return { id };
  const handle = s.match(/(?:^|youtube\.com\/)(@[\p{L}\p{N}._-]{3,100})/u)?.[1];
  if (handle) return { handle: decodeURIComponent(handle) };
  if (/^[\p{L}\p{N}._-]{3,100}$/u.test(s)) return { handle: `@${s}` };
  return null;
}

export async function addWatched(ch: ChannelInfo): Promise<{ record: WatchedChannel; existed: boolean }> {
  const existing = (await list('watchlist')).items.find((w) => w.channelId === ch.id);
  if (existing) return { record: existing, existed: true };
  const record = await create('watchlist', { ...newBase(), channelId: ch.id, title: ch.title, handle: ch.handle, notes: '', seenVideoIds: [] });
  return { record, existed: false };
}

export async function markSeen(id: string, videoIds: string[]): Promise<void> {
  const w = await get('watchlist', id);
  if (!w) return;
  await save('watchlist', { ...w, seenVideoIds: videoIds.slice(0, 50), lastCheckedAt: nowIso() });
}

export async function addKeyword(listId: string, text: string, note = ''): Promise<'added' | 'exists' | 'missing'> {
  const l = await get('keywordLists', listId);
  if (!l) return 'missing';
  const key = normalizeForSearch(text);
  if (l.keywords.some((k) => normalizeForSearch(k.text) === key)) return 'exists';
  const next: KeywordList = { ...l, keywords: [...l.keywords, { text: text.trim(), note, addedAt: nowIso() }] };
  const r = await save('keywordLists', next);
  return r.ok ? 'added' : 'missing';
}
