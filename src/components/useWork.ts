import { useEffect, useState } from 'react';
import type { WorkStore } from '../storage/db';
import { all, onWorkChanged, type Alert, type Job, type Snapshot, type Tracker } from '../storage/stores';

type Shapes = { jobs: Job; trackers: Tracker; snapshots: Snapshot; alerts: Alert };

/** Live list of a working store (jobs, trackers, snapshots, alerts); refreshes when any context writes. */
export function useWork<S extends WorkStore>(store: S): { items: Shapes[S][]; loaded: boolean; reload: () => void } {
  const [state, setState] = useState<{ items: Shapes[S][]; loaded: boolean }>({ items: [], loaded: false });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => void all(store).then((items) => alive && setState({ items, loaded: true }));
    load();
    const off = onWorkChanged((s) => s === store && load());
    return () => {
      alive = false;
      off();
    };
  }, [store, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}
