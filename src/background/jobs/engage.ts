// Scheduled job handlers for the engage area. Job kinds are prefixed 'engage.'.
// - engage.update: writes a scheduled title/description/tags (or restores them for a "revert after N days" job).
// - engage.sunset: makes videos unlisted/private and optionally adds a note to their descriptions.
// Handlers store the before-state in job.payload (mutated in place: the scheduler saves the same payload
// object with the job's result), so the Schedule page can undo.
import { restoreSnippet, appendNote, type Privacy, type SnippetValues } from '../../domain/engageSchedule';
import { en, type MessageKey } from '../../i18n/en';
import { fa } from '../../i18n/fa';
import { updateVideo } from '../../integrations/google/own';
import { writeStatus } from '../../integrations/google/ownWrites';
import { loadPrefs } from '../../storage/prefs';
import { pushLiveUndo } from '../../storage/db';
import { one, put } from '../../storage/stores';
import type { JobHandler, Tick } from './index';

async function tr(key: MessageKey, vars: Record<string, string | number> = {}): Promise<string> {
  const lang = (await loadPrefs()).uiLanguage;
  const tpl = (lang === 'fa' ? fa : en)[key] ?? en[key];
  const num = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { useGrouping: false });
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : typeof vars[k] === 'number' ? num.format(vars[k] as number) : String(vars[k])));
}

const str = (v: unknown, max = 6000): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error('bad job payload');
  return v;
};
const snippet = (v: unknown): SnippetValues => {
  const o = (v ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.tags)) throw new Error('bad job payload');
  return { title: str(o.title, 200), description: str(o.description, 6000), tags: (o.tags as unknown[]).map((x) => str(x, 200)) };
};

const update: JobHandler = async (job) => {
  const p = job.payload;
  const channelId = str(p.channelId, 64);
  const videoId = str(p.videoId, 20);
  if (p.restore) {
    const r = p.restore as Record<string, unknown>;
    const before = snippet(r.before);
    const wrote = snippet(r.wrote);
    const res = await updateVideo(channelId, videoId, (cur) => restoreSnippet(cur, before, wrote));
    if (res) await pushLiveUndo({ at: new Date().toISOString(), label: job.label, entries: [{ channelId, videoId, before: res.before, after: res.after }] });
    return tr(res ? 'engage.job.reverted' : 'engage.job.nothingChanged');
  }
  const next = snippet(p);
  const res = await updateVideo(channelId, videoId, () => next);
  if (!res) return tr('engage.job.nothingChanged');
  p.before = res.before;
  p.after = res.after;
  await pushLiveUndo({ at: new Date().toISOString(), label: job.label, entries: [{ channelId, videoId, before: res.before, after: res.after }] });
  // The revert job restores what the video really held right before this update.
  if (typeof p.revertJobId === 'string') {
    const rj = await one('jobs', p.revertJobId);
    if (rj && rj.status === 'pending') await put('jobs', { ...rj, payload: { ...rj.payload, restore: { before: res.before, wrote: res.after } } });
  }
  return tr('engage.job.updated', { title: res.after.title });
};

const sunset: JobHandler = async (job) => {
  const p = job.payload;
  const channelId = str(p.channelId, 64);
  const action = p.action === 'private' ? 'private' : 'unlisted';
  const note = typeof p.note === 'string' ? p.note.slice(0, 1000) : '';
  const position = p.position === 'end' ? 'end' : 'start';
  const videos = Array.isArray(p.videos) ? (p.videos as { id: unknown; title?: unknown }[]).slice(0, 200) : [];
  const before = (p.before ?? {}) as Record<string, { privacy: Privacy; note?: string; wroteDescription?: string }>;
  p.before = before;
  let done = 0;
  for (const v of videos) {
    const id = str(v.id, 20);
    if (before[id]) {
      done++;
      continue; // already handled on an earlier attempt
    }
    const w = await writeStatus(channelId, id, { privacyStatus: action });
    before[id] = { privacy: (w.before.privacyStatus as Privacy) ?? 'public' };
    if (note) {
      const r = await updateVideo(channelId, id, (cur) => ({ ...cur, description: appendNote(cur.description, note, position) }));
      if (r) before[id] = { ...before[id]!, note, wroteDescription: r.after.description };
    }
    done++;
  }
  return tr('engage.job.sunset', { n: done, action: await tr(`mc.privacy.${action}` as MessageKey) });
};

export const engageJobs: Record<string, JobHandler> = { 'engage.update': update, 'engage.sunset': sunset };
export const engageTicks: Tick[] = [];
