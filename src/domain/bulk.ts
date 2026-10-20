// Bulk edits over drafts and templates. Pure functions: the UI previews every change before saving.
import { dedupeTags } from './metadata';
import { normalizeForSearch } from './text';

export type BulkField = 'title' | 'description' | 'tags';

export type BulkOp =
  | { kind: 'replace'; find: string; replace: string; matchCase: boolean; wholeWord: boolean; fields: BulkField[] }
  | { kind: 'addTags'; tags: string[] }
  | { kind: 'removeTags'; tags: string[] }
  | { kind: 'addText'; text: string; position: 'start' | 'end' };

export interface Editable {
  title?: string;
  description: string;
  tags: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Literal (not regex) search pattern; whole-word matching is Unicode-aware so Persian words work. */
export function findPattern(op: Extract<BulkOp, { kind: 'replace' }>): RegExp | null {
  if (!op.find) return null;
  const body = escapeRe(op.find);
  const src = op.wholeWord ? `(?<![\\p{L}\\p{N}_\\u200c])${body}(?![\\p{L}\\p{N}_\\u200c])` : body;
  return new RegExp(src, `gu${op.matchCase ? '' : 'i'}`);
}

export function countMatches(text: string, re: RegExp | null): number {
  if (!re) return 0;
  re.lastIndex = 0;
  return text.match(re)?.length ?? 0;
}

export function applyBulk<T extends Editable>(rec: T, op: BulkOp): T {
  switch (op.kind) {
    case 'replace': {
      const re = findPattern(op);
      if (!re) return rec;
      // A function replacement keeps "$" in the user's text literal.
      const rep = (s: string) => s.replace(re, () => op.replace);
      const next = { ...rec };
      if (op.fields.includes('title') && typeof rec.title === 'string') next.title = rep(rec.title);
      if (op.fields.includes('description')) next.description = rep(rec.description);
      if (op.fields.includes('tags')) next.tags = dedupeTags(rec.tags.map(rep));
      return next;
    }
    case 'addTags':
      return { ...rec, tags: dedupeTags([...rec.tags, ...op.tags]) };
    case 'removeTags': {
      const drop = new Set(op.tags.map(normalizeForSearch));
      return { ...rec, tags: rec.tags.filter((t) => !drop.has(normalizeForSearch(t))) };
    }
    case 'addText': {
      const add = op.text.trim();
      if (!add) return rec;
      if (rec.description.includes(add)) return rec; // already there: running twice changes nothing
      const base = rec.description.trim();
      const description = !base ? add : op.position === 'start' ? `${add}\n\n${base}` : `${base}\n\n${add}`;
      return { ...rec, description };
    }
  }
}

export function changedFields(a: Editable, b: Editable): BulkField[] {
  const out: BulkField[] = [];
  if ((a.title ?? '') !== (b.title ?? '')) out.push('title');
  if (a.description !== b.description) out.push('description');
  if (a.tags.join('\n') !== b.tags.join('\n')) out.push('tags');
  return out;
}

/** Lines of `after` that differ from `before`, for a compact preview of long descriptions. */
export function changedLines(before: string, after: string): { before: string[]; after: string[] } {
  const a = before.split('\n');
  const b = after.split('\n');
  const setA = new Set(a);
  const setB = new Set(b);
  return { before: a.filter((l) => !setB.has(l)), after: b.filter((l) => !setA.has(l)) };
}
