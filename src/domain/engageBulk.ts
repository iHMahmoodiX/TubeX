// "Default upload profile" bulk operation: applies a template's description block and tags to videos, with
// append or replace per field. Pure functions; the Bulk edit page previews every change first.
import { dedupeTags } from './metadata';

export type BlockMode = 'append' | 'replace' | 'keep';

export interface ProfileOp {
  description: string;
  tags: string[];
  descriptionMode: BlockMode;
  tagsMode: BlockMode;
}

export interface Editable {
  title?: string;
  description: string;
  tags: string[];
}

/** Applies a template; appending a description block that is already there changes nothing. */
export function applyProfile<T extends Editable>(rec: T, op: ProfileOp): T {
  let description = rec.description;
  const block = op.description.trim();
  if (op.descriptionMode === 'replace' && block) description = block;
  else if (op.descriptionMode === 'append' && block && !rec.description.includes(block)) {
    const base = rec.description.trimEnd();
    description = base ? `${base}\n\n${block}` : block;
  }
  let tags = rec.tags;
  if (op.tagsMode === 'replace' && op.tags.length) tags = dedupeTags(op.tags);
  else if (op.tagsMode === 'append' && op.tags.length) tags = dedupeTags([...rec.tags, ...op.tags]);
  if (description === rec.description && tags.join('\n') === rec.tags.join('\n')) return rec;
  return { ...rec, description, tags };
}
