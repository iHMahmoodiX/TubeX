// Playlist planning: sorting and the minimal sequence of position updates that turns the current order into
// the target order. Each move is one playlistItems.update (50 units, Inferred), so fewer moves cost less.
// Pure functions, no browser APIs.

export interface Move {
  /** playlistItem id. */
  id: string;
  /** Zero-based position the item takes, counted in the list as it is right after the move. */
  to: number;
}

/** Indexes (into `seq`) of one longest strictly increasing subsequence. O(n log n). */
export function longestIncreasing(seq: number[]): Set<number> {
  const tails: number[] = []; // index into seq of the smallest tail for each length
  const prev = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]!]! < seq[i]!) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    tails[lo] = i;
  }
  const keep = new Set<number>();
  let k = tails.length ? tails[tails.length - 1]! : -1;
  while (k >= 0) {
    keep.add(k);
    k = prev[k]!;
  }
  return keep;
}

/** Applies moves to a list of ids (what YouTube does for each playlistItems.update). */
export function applyMoves(list: string[], moves: Move[]): string[] {
  const out = [...list];
  for (const m of moves) {
    const from = out.indexOf(m.id);
    if (from < 0) continue;
    out.splice(from, 1);
    out.splice(Math.max(0, Math.min(m.to, out.length)), 0, m.id);
  }
  return out;
}

/**
 * The fewest moves (n − longest already-ordered run) that reorder `current` into `target`.
 * Items that already sit in the right relative order stay put; the others are moved, in target order, to
 * just after their target predecessor.
 */
export function planReorder(current: string[], target: string[]): Move[] {
  if (current.length !== target.length || new Set(current).size !== current.length) throw new Error('lists differ');
  const rank = new Map(target.map((id, i) => [id, i]));
  const seq = current.map((id) => {
    const r = rank.get(id);
    if (r === undefined) throw new Error('lists differ');
    return r;
  });
  const keepIdx = longestIncreasing(seq);
  const fixed = new Set([...keepIdx].map((i) => current[i]!));
  const sim = [...current];
  const moves: Move[] = [];
  for (let i = 0; i < target.length; i++) {
    const id = target[i]!;
    if (fixed.has(id)) continue;
    const from = sim.indexOf(id);
    sim.splice(from, 1);
    const to = i === 0 ? 0 : sim.indexOf(target[i - 1]!) + 1;
    sim.splice(to, 0, id);
    moves.push({ id, to });
  }
  return moves;
}

export type SortKey = 'date' | 'views' | 'title';
export type SortDir = 'asc' | 'desc';

export interface Sortable {
  id: string;
  title: string;
  /** Video publish date (ISO). */
  publishedAt?: string;
  views?: number;
}

/**
 * Sorted copy. Items missing the sort value (private video, hidden counts) keep their relative order at the
 * end. Ties keep the current order (stable), so re-sorting a sorted list plans no moves.
 */
export function sortItems<T extends Sortable>(items: T[], key: SortKey, dir: SortDir, lang: 'fa' | 'en' = 'fa'): T[] {
  const coll = new Intl.Collator(lang === 'fa' ? 'fa' : 'en', { numeric: true, sensitivity: 'base' });
  const val = (x: T): string | number | undefined => (key === 'title' ? x.title || undefined : key === 'views' ? x.views : x.publishedAt || undefined);
  const known = items.map((x, i) => ({ x, i })).filter(({ x }) => val(x) !== undefined);
  const unknown = items.filter((x) => val(x) === undefined);
  known.sort((a, b) => {
    const va = val(a.x)!;
    const vb = val(b.x)!;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : key === 'title' ? coll.compare(String(va), String(vb)) : String(va).localeCompare(String(vb));
    return (dir === 'asc' ? c : -c) || a.i - b.i;
  });
  return [...known.map((k) => k.x), ...unknown];
}

/** One move for the up / down / top buttons; null when the item is already there. */
export function moveOne(list: string[], id: string, where: 'up' | 'down' | 'top' | 'bottom'): Move | null {
  const i = list.indexOf(id);
  if (i < 0) return null;
  const to = where === 'up' ? i - 1 : where === 'down' ? i + 1 : where === 'top' ? 0 : list.length - 1;
  if (to < 0 || to >= list.length || to === i) return null;
  return { id, to };
}

/** Videos to add that are not in the playlist yet, in the chosen order. */
export function videosToAdd(existingVideoIds: string[], chosen: string[]): string[] {
  const have = new Set(existingVideoIds);
  const out: string[] = [];
  for (const v of chosen) if (!have.has(v) && !out.includes(v)) out.push(v);
  return out;
}

export const PLAYLIST_WRITE_COST = 50; // playlists / playlistItems insert, update, delete (Inferred)
