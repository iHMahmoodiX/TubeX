import { useCallback, useEffect, useRef, useState } from 'react';
import { runAiTask, type AiRun } from '../../integrations/ai/run';
import type { AiTask, TaskContext, TaskOutput } from '../../integrations/ai/tasks';

type Extra = Parameters<typeof runAiTask>[2];

/** Runs one AI task at a time with cancel; the latest result per task is kept. */
export function useAiTask() {
  const [running, setRunning] = useState<AiTask | null>(null);
  const [results, setResults] = useState<Partial<Record<AiTask, AiRun>>>({});
  const [error, setError] = useState<unknown>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);

  const run = useCallback(async (task: AiTask, ctx: TaskContext, extra: Extra = {}, opts: { imageDataUrl?: string; fresh?: boolean } = {}) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setRunning(task);
    setError(null);
    try {
      const r = await runAiTask(task, ctx, extra, { ...opts, signal: c.signal });
      if (!c.signal.aborted) setResults((all) => ({ ...all, [task]: r }));
      return r.output as TaskOutput;
    } catch (e) {
      if (!c.signal.aborted || (e as { code?: string }).code === 'canceled') setError(e);
      return null;
    } finally {
      if (ctl.current === c) {
        ctl.current = null;
        setRunning(null);
      }
    }
  }, []);

  const cancel = useCallback(() => ctl.current?.abort(), []);
  const clear = useCallback((task: AiTask) => setResults(({ [task]: _, ...rest }) => rest), []);
  return { run, cancel, clear, running, results, error, setError };
}
