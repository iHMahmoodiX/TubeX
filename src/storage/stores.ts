// Working stores (IndexedDB v3): scheduled jobs, trackers, time-series snapshots and alerts.
// Shared by extension pages and the background service worker (same origin). Change events go over
// BroadcastChannel so open pages refresh when the background writes.
import { openDb, type WorkStore } from './db';

export interface Job {
  id: string;
  /** Handler name registered in src/background/jobs. */
  kind: string;
  /** ISO time to run at. */
  runAt: string;
  /** Free-form input for the handler; validated by the handler. */
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed' | 'canceled';
  label: string;
  channelId?: string;
  createdAt: string;
  finishedAt?: string;
  /** Short result or error text shown in the UI. */
  result?: string;
  /** Repeat interval in minutes for recurring jobs; absent for one-off jobs. */
  everyMinutes?: number;
  attempts?: number;
}

export interface Tracker {
  id: string;
  /** e.g. 'rank' (keyword → video position), 'brand' (term mentions), 'competitor' (channel), 'niche'. */
  kind: string;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
  lastCheckedAt?: string;
  enabled: boolean;
}

export interface Snapshot {
  /** `${ref}:${day}` so one snapshot per tracker/ref per day. */
  id: string;
  ref: string;
  at: string;
  data: Record<string, unknown>;
}

export interface Alert {
  id: string;
  at: string;
  kind: string;
  title: string;
  body: string;
  url?: string;
  read: boolean;
}

type Shapes = { jobs: Job; trackers: Tracker; snapshots: Snapshot; alerts: Alert };

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tubex-work') : null;
const listeners = new Set<(store: WorkStore) => void>();
channel?.addEventListener('message', (e: MessageEvent) => {
  const s = (e.data as { store?: WorkStore })?.store;
  if (s) listeners.forEach((l) => l(s));
});
function changed(store: WorkStore) {
  listeners.forEach((l) => l(store));
  channel?.postMessage({ store });
}
export function onWorkChanged(cb: (store: WorkStore) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function all<S extends WorkStore>(store: S): Promise<Shapes[S][]> {
  return (await (await openDb()).getAll(store)) as Shapes[S][];
}
export async function byIndex<S extends WorkStore>(store: S, index: string, value: string): Promise<Shapes[S][]> {
  return (await (await openDb()).getAllFromIndex(store, index, value)) as Shapes[S][];
}
export async function one<S extends WorkStore>(store: S, id: string): Promise<Shapes[S] | undefined> {
  return (await (await openDb()).get(store, id)) as Shapes[S] | undefined;
}
export async function put<S extends WorkStore>(store: S, rec: Shapes[S]): Promise<Shapes[S]> {
  await (await openDb()).put(store, rec);
  changed(store);
  return rec;
}
export async function del(store: WorkStore, id: string): Promise<void> {
  await (await openDb()).delete(store, id);
  changed(store);
}

export const newId = () => crypto.randomUUID();
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** Records one snapshot per ref per UTC day (later writes the same day replace earlier ones). */
export async function snapshot(ref: string, data: Record<string, unknown>, at = new Date()): Promise<Snapshot> {
  return put('snapshots', { id: `${ref}:${dayKey(at)}`, ref, at: at.toISOString(), data });
}
export async function history(ref: string): Promise<Snapshot[]> {
  return (await byIndex('snapshots', 'ref', ref)).sort((a, b) => a.at.localeCompare(b.at));
}

export async function addAlert(a: Omit<Alert, 'id' | 'at' | 'read'> & { id?: string }): Promise<Alert> {
  return put('alerts', { id: a.id ?? newId(), at: new Date().toISOString(), read: false, kind: a.kind, title: a.title, body: a.body, url: a.url });
}
