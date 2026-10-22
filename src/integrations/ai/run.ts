// Runs one AI task with permission, budget, cache and usage accounting.
import { addUsage, loadIntegrations, loadUsage } from '../../storage/integrations';
import { cacheGet, cacheSet, hashKey } from '../../storage/cache';
import { hasOrigin } from '../../platform/permissions';
import { AiError, chat } from './provider';
import { buildPrompt, parseOutput, PROMPT_VERSION, type AiTask, type TaskContext, type TaskOutput } from './tasks';

const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;

export interface AiRun<T extends TaskOutput = TaskOutput> {
  output: T;
  fromCache: boolean;
  model: string;
  usage?: { input: number; output: number; reported: boolean };
}

export async function runAiTask<K extends AiTask>(
  task: K,
  context: TaskContext,
  extra: Parameters<typeof buildPrompt>[2] = {},
  opts: { signal?: AbortSignal; imageDataUrl?: string; fresh?: boolean } = {},
): Promise<AiRun<Extract<TaskOutput, { task: K }>>> {
  const { ai } = await loadIntegrations();
  if (!ai.enabled || !ai.baseUrl || !ai.model) throw new AiError('disabled');
  if (!(await hasOrigin(ai.baseUrl))) throw new AiError('permission');

  const prompt = buildPrompt(task, context, extra);
  const key = await hashKey(['ai', PROMPT_VERSION, ai.baseUrl, ai.model, task, prompt.user, opts.imageDataUrl?.length ?? 0, opts.imageDataUrl?.slice(-64)]);
  if (!opts.fresh) {
    const hit = await cacheGet<TaskOutput>(key);
    if (hit) return { output: hit.value as Extract<TaskOutput, { task: K }>, fromCache: true, model: ai.model };
  }

  const usage = await loadUsage();
  if (ai.monthlyRequestCap > 0 && usage.aiRequests >= ai.monthlyRequestCap) throw new AiError('budget');

  // Count the attempt before sending: retries and failures also spend budget.
  await addUsage({ aiRequests: 1 });
  const res = await chat(ai, { ...prompt, signal: opts.signal, imageDataUrl: opts.imageDataUrl });
  await addUsage({ aiInputTokens: res.usage.input, aiOutputTokens: res.usage.output });
  const output = parseOutput(task, res.text) as Extract<TaskOutput, { task: K }>;
  await cacheSet(key, output, CACHE_TTL_MS);
  return { output, fromCache: false, model: res.model, usage: res.usage };
}
