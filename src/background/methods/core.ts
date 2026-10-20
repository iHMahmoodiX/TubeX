// Core RPC methods available to content scripts and pages. Each method validates its own arguments:
// callers are TubeX's own scripts, but content scripts run next to an untrusted page.
import { browser } from 'wxt/browser';
import { parsePageUrl } from '../../domain/pageContext';
import { captureIdea } from '../../features/ideas/ideaActions';
import { addWatched } from '../../features/competitors/watchActions';
import { runAiJson, type JsonAiRequest } from '../../integrations/ai/custom';
import { runAiTask } from '../../integrations/ai/run';
import type { AiTask, TaskContext } from '../../integrations/ai/tasks';
import { loadGoogleState } from '../../integrations/google/auth';
import { ownVideos, report, updateVideo, type SnippetEdit } from '../../integrations/google/own';
import { getChannel, getVideos, searchSample, channelUploads, videoComments } from '../../integrations/youtube/api';
import { list, pushLiveUndo } from '../../storage/db';
import { loadIntegrations, loadUsage } from '../../storage/integrations';
import { all, del, put, type Job } from '../../storage/stores';
import type { WorkspaceRoute } from '../../platform/navigation';
import { scheduleJob, cancelJob } from '../scheduler';

const str = (v: unknown, max = 2000): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error('bad argument');
  return v;
};
const strs = (v: unknown, n = 50): string[] => {
  if (!Array.isArray(v) || v.length > n) throw new Error('bad argument');
  return v.map((x) => str(x, 200));
};
const obj = (v: unknown): Record<string, any> => {
  if (typeof v !== 'object' || v === null) throw new Error('bad argument');
  return v as Record<string, any>;
};

async function activeChannel(): Promise<{ channelId: string; uploadsPlaylistId?: string; title: string } | null> {
  const s = await loadGoogleState();
  return s.channels.find((c) => c.channelId === s.activeChannelId) ?? null;
}

export const coreMethods: Record<string, (...args: any[]) => Promise<unknown>> = {
  // ---- status ----
  'status.get': async () => {
    const [i, g, u] = await Promise.all([loadIntegrations(), loadGoogleState(), loadUsage()]);
    return {
      hasKey: !!i.youtube.apiKey,
      ai: i.ai.enabled,
      channels: g.channels.map((c) => ({ channelId: c.channelId, title: c.title, handle: c.handle, thumbnail: c.thumbnail })),
      activeChannelId: g.activeChannelId,
      ytUnits: u.ytUnits,
      dailyCap: i.youtube.dailyUnitCap,
    };
  },

  // ---- public YouTube data ----
  'yt.videos': async (ids: unknown, fresh?: unknown) => (await getVideos(strs(ids), fresh === true)).data,
  'yt.channel': async (ref: unknown) => {
    const r = obj(ref);
    return (await getChannel({ id: r.id ? str(r.id, 64) : undefined, handle: r.handle ? str(r.handle, 120) : undefined })).data;
  },
  'yt.search': async (q: unknown, opts?: unknown) => searchSample(str(q, 200), opts ? (obj(opts) as Parameters<typeof searchSample>[1]) : {}),
  'yt.uploads': async (playlistId: unknown, max?: unknown) => (await channelUploads(str(playlistId, 64), typeof max === 'number' ? max : 15)).data,
  'yt.comments': async (videoId: unknown, max?: unknown) => videoComments(str(videoId, 20), typeof max === 'number' ? Math.min(max, 500) : 100),

  // ---- own channel ----
  'own.active': async () => activeChannel(),
  'own.videos': async (max?: unknown, fresh?: unknown) => {
    const ch = await activeChannel();
    if (!ch?.uploadsPlaylistId) return [];
    return ownVideos(ch.channelId, ch.uploadsPlaylistId, typeof max === 'number' ? max : 500, fresh === true);
  },
  'own.report': async (q: unknown) => {
    const ch = await activeChannel();
    if (!ch) throw new Error('not signed in');
    return report(ch.channelId, obj(q) as Parameters<typeof report>[1]);
  },
  /** Replaces title/description/tags of one own video (the in-page editor). Recorded in the live undo log. */
  'own.updateSnippet': async (videoId: unknown, edit: unknown, label?: unknown) => {
    const ch = await activeChannel();
    if (!ch) throw new Error('not signed in');
    const e = obj(edit);
    const next: SnippetEdit = { title: str(e.title, 200), description: str(e.description, 6000), tags: strs(e.tags, 200) };
    const r = await updateVideo(ch.channelId, str(videoId, 20), () => next);
    if (r) await pushLiveUndo({ at: new Date().toISOString(), label: typeof label === 'string' ? label.slice(0, 120) : 'TubeX', entries: [{ channelId: ch.channelId, videoId: r.videoId, before: r.before, after: r.after }] });
    return r;
  },

  // ---- AI ----
  'ai.task': async (task: unknown, ctx: unknown, extra?: unknown) => (await runAiTask(str(task, 20) as AiTask, obj(ctx) as TaskContext, extra ? obj(extra) : {})).output,
  'ai.json': async (req: unknown) => runAiJson(obj(req) as JsonAiRequest),

  // ---- local library ----
  'ideas.capture': async (text: unknown, url: unknown, title?: unknown) => {
    const ctx = { ...parsePageUrl(str(url, 2000)), title: typeof title === 'string' ? title.slice(0, 300) : undefined };
    return captureIdea({ text: str(text, 5000), ctx, link: true });
  },
  'templates.list': async () => (await list('templates')).items,
  'drafts.list': async () => (await list('drafts')).items,
  'watch.add': async (channelId: unknown) => {
    const ch = (await getChannel({ id: str(channelId, 64) })).data;
    if (!ch) throw new Error('channel not found');
    return (await addWatched(ch)).existed;
  },

  // ---- jobs ----
  'jobs.schedule': async (job: unknown) => scheduleJob(obj(job) as Omit<Job, 'id' | 'status' | 'createdAt'>),
  'jobs.cancel': async (id: unknown) => cancelJob(str(id, 64)),
  'jobs.list': async () => all('jobs'),

  // ---- alerts ----
  'alerts.markRead': async (id: unknown) => {
    const a = (await all('alerts')).find((x) => x.id === str(id, 64));
    if (a) await put('alerts', { ...a, read: true });
  },
  'alerts.delete': async (id: unknown) => del('alerts', str(id, 64)),

  // ---- navigation ----
  'ui.openWorkspace': async (route: unknown, id?: unknown) => {
    const r = str(route, 40) as WorkspaceRoute;
    const hash = typeof id === 'string' && id ? `${r}/${encodeURIComponent(id.slice(0, 200))}` : r;
    await browser.tabs.create({ url: browser.runtime.getURL(`/workspace.html#${hash}` as '/workspace.html') });
  },
};
