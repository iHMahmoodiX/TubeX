// Scheduling rules: the writable status block for videos.update, local date-time conversion, sunset notes and
// per-field restore. Pure functions, no browser APIs.

export type Privacy = 'public' | 'unlisted' | 'private';

/**
 * Writable fields of a video's status part. videos.update replaces the whole part, so every field that the
 * live video has is sent back; fields left out would be reset (Inferred from the API reference).
 */
export const STATUS_WRITABLE = ['privacyStatus', 'publishAt', 'embeddable', 'license', 'publicStatsViewable', 'selfDeclaredMadeForKids', 'containsSyntheticMedia'] as const;
export type StatusField = (typeof STATUS_WRITABLE)[number];
export type StatusBlock = Partial<Record<StatusField, string | boolean>>;

/** Copies the writable fields from the live status and applies `patch`; `publishAt: null` clears it. */
export function writableStatus(live: Record<string, unknown>, patch: { privacyStatus?: Privacy; publishAt?: string | null }): StatusBlock {
  const out: StatusBlock = {};
  for (const k of STATUS_WRITABLE) {
    const v = live[k];
    if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  if (patch.privacyStatus) out.privacyStatus = patch.privacyStatus;
  if (patch.publishAt === null) delete out.publishAt;
  else if (patch.publishAt) {
    out.publishAt = patch.publishAt;
    // YouTube publishes at publishAt only while the video is private.
    out.privacyStatus = 'private';
  }
  // publishAt may only exist on private videos.
  if (out.privacyStatus !== 'private') delete out.publishAt;
  return out;
}

/** `<input type="datetime-local">` value (local time) → ISO string, or null when empty/invalid. */
export function localInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const d = new Date(value); // parsed as local time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → `datetime-local` value in local time. */
export function isoToLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A scheduled time must be at least `minMinutes` in the future. */
export function futureProblem(iso: string | null, now = Date.now(), minMinutes = 5): 'missing' | 'past' | null {
  if (!iso) return 'missing';
  return Date.parse(iso) < now + minMinutes * 60_000 ? 'past' : null;
}

export interface SnippetValues {
  title: string;
  description: string;
  tags: string[];
}

const same = (a: SnippetValues, b: SnippetValues, k: keyof SnippetValues) => (k === 'tags' ? a.tags.join('\n') === b.tags.join('\n') : a[k] === b[k]);

export function changedSnippetFields(a: SnippetValues, b: SnippetValues): (keyof SnippetValues)[] {
  return (['title', 'description', 'tags'] as const).filter((k) => !same(a, b, k));
}

/**
 * Restores `before` field by field, but only where the video still holds what TubeX wrote (`wrote`);
 * fields edited by hand since then are kept.
 */
export function restoreSnippet(current: SnippetValues, before: SnippetValues, wrote: SnippetValues): SnippetValues {
  return {
    title: same(current, wrote, 'title') ? before.title : current.title,
    description: same(current, wrote, 'description') ? before.description : current.description,
    tags: same(current, wrote, 'tags') ? before.tags : current.tags,
  };
}

/** Adds the sunset note once, at the start (seen in the description preview) or the end. */
export function appendNote(description: string, note: string, position: 'start' | 'end' = 'start'): string {
  const add = note.trim();
  if (!add || description.includes(add)) return description;
  const base = description.trim();
  if (!base) return add;
  return position === 'start' ? `${add}\n\n${base}` : `${base}\n\n${add}`;
}

/** Removes a note TubeX added (undo), leaving the rest of the description as it is. */
export function removeNote(description: string, note: string): string {
  const add = note.trim();
  if (!add) return description;
  if (description === add) return '';
  if (description.startsWith(`${add}\n\n`)) return description.slice(add.length + 2);
  if (description.endsWith(`\n\n${add}`)) return description.slice(0, -(add.length + 2));
  return description;
}

export const VIDEO_UPDATE_COST = 51; // videos.list (1) + videos.update (50), Inferred
