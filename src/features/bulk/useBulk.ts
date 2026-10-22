// Live views of bulk jobs (written by the background service worker) and of the quota counters.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BulkItem, BulkJob } from '../../domain/bulk';
import { loadIntegrations, loadUsage, onIntegrationsChanged, onUsageChanged, type Integrations, type Usage } from '../../storage/integrations';
import { byIndex, onWorkChanged } from '../../storage/stores';

const JOB_REF = 'bulk.job';
const itemRef = (id: string) => `bulk.item:${id}`;

/** Calls `load` now and again (throttled) whenever the snapshots store changes. */
function useSnapshots<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  useEffect(() => {
    let alive = true;
    const go = () => void run().then((d) => alive && setData(d)).catch(() => undefined);
    go();
    const off = onWorkChanged((s) => {
      if (s !== 'snapshots' || timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        go();
      }, 400);
    });
    return () => {
      alive = false;
      off();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [run]);
  return { data, reload: () => void run().then(setData) };
}

export function useBulkJobs(): BulkJob[] | undefined {
  return useSnapshots(async () => (await byIndex('snapshots', 'ref', JOB_REF)).map((s) => s.data as unknown as BulkJob).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), []).data;
}

export function useBulkItems(jobId: string | undefined): BulkItem[] | undefined {
  return useSnapshots(async () => (jobId ? (await byIndex('snapshots', 'ref', itemRef(jobId))).map((s) => s.data as unknown as BulkItem).sort((a, b) => a.n - b.n) : []), [jobId]).data;
}

/** Today's YouTube units and the local daily cap, kept live. */
export function useQuota(): { usage?: Usage; integrations?: Integrations } {
  const [usage, setUsage] = useState<Usage>();
  const [integrations, setIntegrations] = useState<Integrations>();
  useEffect(() => {
    void loadUsage().then(setUsage);
    void loadIntegrations().then(setIntegrations);
    const a = onUsageChanged(setUsage);
    const b = onIntegrationsChanged(setIntegrations);
    return () => {
      a();
      b();
    };
  }, []);
  return { usage, integrations };
}
