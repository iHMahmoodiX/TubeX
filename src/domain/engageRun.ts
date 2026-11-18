// Sequential runner for YouTube writes: one item at a time, progress after each, stops at the first error
// that would make the rest fail too (sign-in, quota, permission). Pure; the caller decides what is fatal.

export interface RunProgress<T> {
  done: number;
  total: number;
  ok: T[];
  failed: { item: T; error: unknown }[];
  /** Set when the run stopped early because of a fatal error. */
  stopped?: unknown;
  /** Set when the user pressed Stop. */
  aborted?: boolean;
}

export async function runSequential<T>(
  items: T[],
  work: (item: T, index: number) => Promise<void>,
  opts: { isFatal: (e: unknown) => boolean; onProgress?: (p: RunProgress<T>) => void; signal?: { aborted: boolean }; stopOnAnyError?: boolean },
): Promise<RunProgress<T>> {
  const p: RunProgress<T> = { done: 0, total: items.length, ok: [], failed: [] };
  opts.onProgress?.({ ...p });
  for (let i = 0; i < items.length; i++) {
    if (opts.signal?.aborted) {
      p.aborted = true;
      break;
    }
    const item = items[i]!;
    try {
      await work(item, i);
      p.ok.push(item);
    } catch (e) {
      p.failed.push({ item, error: e });
      if (opts.stopOnAnyError || opts.isFatal(e)) {
        p.stopped = e;
        p.done++;
        opts.onProgress?.({ ...p, ok: [...p.ok], failed: [...p.failed] });
        break;
      }
    }
    p.done++;
    opts.onProgress?.({ ...p, ok: [...p.ok], failed: [...p.failed] });
  }
  return p;
}
