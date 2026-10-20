import { useCallback, useEffect, useState } from 'react';
import type { CollectionName, Collections } from '../domain/models';
import type { PageContext } from '../domain/pageContext';
import { list, onDataChanged } from '../storage/db';
import { getActivePageContext, onActivePageChanged } from '../platform/pageContext';

export function useCollection<K extends CollectionName>(name: K) {
  const [state, setState] = useState<{ items: Collections[K][]; corrupt: number; loading: boolean; error?: string }>({
    items: [],
    corrupt: 0,
    loading: true,
  });
  const reload = useCallback(() => {
    list(name)
      .then((r) => setState({ items: r.items, corrupt: r.corrupt, loading: false }))
      .catch((e: unknown) => setState((s) => ({ ...s, loading: false, error: String(e) })));
  }, [name]);
  useEffect(() => {
    reload();
    return onDataChanged((changed) => changed === name && reload());
  }, [name, reload]);
  return { ...state, reload };
}

export function useActivePage() {
  const [ctx, setCtx] = useState<PageContext | null>(null);
  const refresh = useCallback(() => {
    getActivePageContext()
      .then(setCtx)
      .catch(() => setCtx({ kind: 'unknown', origin: 'url' }));
  }, []);
  useEffect(() => {
    refresh();
    return onActivePageChanged(refresh);
  }, [refresh]);
  return { ctx, refresh };
}
