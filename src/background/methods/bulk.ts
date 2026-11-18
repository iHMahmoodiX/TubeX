// RPC methods for bulk find & replace jobs. Names are prefixed 'bulk.'. Every argument is validated: methods
// are reachable from content scripts, which run next to untrusted pages.
import { compileOp, type BulkField, type FrOp, type MatchOptions } from '../../domain/bulk';
import type { BlockMode } from '../../domain/engageBulk';
import { VIDEO_ID } from '../../domain/coppa';
import { loadGoogleState } from '../../integrations/google/auth';
import { command, listJobs, loadItems, startJob, undoOne, type Command } from '../jobs/bulk';

/** Most videos one job may hold (a channel's whole catalogue, written over several days). */
export const MAX_JOB_VIDEOS = 5000;
const JOB_ID = /^[\w-]{8,64}$/;
const FIELDS: readonly BulkField[] = ['title', 'description', 'tags'];
const COMMANDS: readonly Command[] = ['pause', 'resume', 'cancel', 'retry', 'undo', 'undoConflicts', 'forget'];

const bad = (): never => {
  throw new Error('bad argument');
};
const str = (v: unknown, max: number, empty = true): string => (typeof v === 'string' && v.length <= max && (empty || v.trim()) ? v : bad());
const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : bad());
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const tagList = (v: unknown): string[] => (Array.isArray(v) && v.length <= 200 ? v.map((x) => str(x, 200)) : bad());
const mode = (v: unknown): BlockMode => (v === 'append' || v === 'replace' || v === 'keep' ? v : bad());

function opts(v: unknown): MatchOptions {
  if (!isObj(v)) return bad();
  return { persian: bool(v.persian), matchCase: bool(v.matchCase), wholeWord: bool(v.wholeWord), regex: bool(v.regex) };
}

/** Rebuilds the operation from known fields only (nothing else from the caller is stored). */
export function parseOp(v: unknown): FrOp {
  if (!isObj(v)) return bad();
  let op: FrOp;
  switch (v.kind) {
    case 'replace': {
      const fields = Array.isArray(v.fields) ? [...new Set(v.fields)] : bad();
      if (!fields.length || !fields.every((f) => (FIELDS as readonly unknown[]).includes(f))) bad();
      op = { kind: 'replace', find: str(v.find, 5000), replace: str(v.replace, 5000), fields: fields as BulkField[], opts: opts(v.opts) };
      break;
    }
    case 'block':
      op = { kind: 'block', start: str(v.start, 500), end: str(v.end, 500), block: str(v.block, 5000), keepMarkers: bool(v.keepMarkers), opts: opts(v.opts) };
      break;
    case 'append':
      op = { kind: 'append', block: str(v.block, 5000), position: v.position === 'start' ? 'start' : v.position === 'end' ? 'end' : bad(), opts: opts(v.opts) };
      break;
    case 'removeLines':
      op = { kind: 'removeLines', find: str(v.find, 1000), opts: opts(v.opts) };
      break;
    case 'urls':
      op = { kind: 'urls', from: str(v.from, 500), to: str(v.to, 500) };
      break;
    case 'addTags':
    case 'removeTags':
      op = { kind: v.kind, tags: tagList(v.tags) };
      break;
    case 'profile':
      op = { kind: 'profile', description: str(v.description, 5000), tags: tagList(v.tags), descriptionMode: mode(v.descriptionMode), tagsMode: mode(v.tagsMode) };
      break;
    default:
      return bad();
  }
  if (!compileOp(op).ok) bad();
  return op;
}

function videos(v: unknown): { id: string; title: string }[] {
  if (!Array.isArray(v) || !v.length || v.length > MAX_JOB_VIDEOS) return bad();
  const seen = new Set<string>();
  const out: { id: string; title: string }[] = [];
  for (const x of v) {
    if (!isObj(x) || typeof x.id !== 'string' || !VIDEO_ID.test(x.id)) bad();
    const id = x.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title: typeof x.title === 'string' ? x.title.slice(0, 200) : '' });
  }
  return out;
}

const jobId = (v: unknown) => (typeof v === 'string' && JOB_ID.test(v) ? v : bad());

export const bulkMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  /** Starts a background job on the active channel's videos (51 units per changed video). */
  'bulk.start': async (input: unknown) => {
    if (!isObj(input)) bad();
    const i = input as Record<string, unknown>;
    const s = await loadGoogleState();
    const ch = s.channels.find((c) => c.channelId === s.activeChannelId);
    if (!ch) throw new Error('not signed in');
    return startJob({ channelId: ch.channelId, channelTitle: ch.title, label: str(i.label, 200, false), op: parseOp(i.op), videos: videos(i.videos), test: i.test === true });
  },
  'bulk.command': async (id: unknown, cmd: unknown) => {
    if (typeof cmd !== 'string' || !(COMMANDS as readonly string[]).includes(cmd)) bad();
    return command(jobId(id), cmd as Command);
  },
  /** Restores one video; `force` overwrites a video that was edited since (after the owner confirmed). */
  'bulk.undoOne': async (id: unknown, videoId: unknown, force: unknown) => {
    if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) bad();
    return undoOne(jobId(id), videoId as string, force === true);
  },
  'bulk.jobs': async () => listJobs(),
  'bulk.items': async (id: unknown) => loadItems(jobId(id)),
};
