// OpenAI-compatible chat client (Ollama, Gemini's OpenAI endpoint, or any compatible server).
// AI is optional and always user-triggered; model output is untrusted text, never instructions.
import type { AiSettings } from '../../storage/integrations';

export const AI_PRESETS = {
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', needsKey: false },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true },
} as const;
export type AiPreset = keyof typeof AI_PRESETS | 'custom';

export function presetOf(s: Pick<AiSettings, 'baseUrl'>): AiPreset {
  for (const [name, p] of Object.entries(AI_PRESETS)) if (p.baseUrl === s.baseUrl) return name as AiPreset;
  return 'custom';
}

export type AiErrorCode =
  | 'disabled'
  | 'budget'
  | 'permission'
  | 'unreachable'
  | 'timeout'
  | 'unauthorized'
  | 'not-found'
  | 'rate-limited'
  | 'server'
  | 'bad-output'
  | 'canceled';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    public detail?: string,
  ) {
    super(code);
  }
}

export interface ChatRequest {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** data: URL of an image for vision-capable models. */
  imageDataUrl?: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  model: string;
  usage: { input: number; output: number; reported: boolean };
}

const TIMEOUT_MS = 120_000; // local models can be slow on CPU

export async function chat(settings: AiSettings, req: ChatRequest, fetcher: typeof fetch = fetch): Promise<ChatResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new AiError('timeout')), TIMEOUT_MS);
  const onAbort = () => ctl.abort(new AiError('canceled'));
  req.signal?.addEventListener('abort', onAbort);
  const userContent = req.imageDataUrl
    ? [
        { type: 'text', text: req.user },
        { type: 'image_url', image_url: { url: req.imageDataUrl } },
      ]
    : req.user;
  const body = {
    model: settings.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: userContent },
    ],
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 1200,
    ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    stream: false,
  };
  let res: Response;
  try {
    res = await fetcher(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch (e) {
    const reason = ctl.signal.reason;
    if (reason instanceof AiError) throw reason;
    throw new AiError('unreachable', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onAbort);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const detail = String(((data?.error as Record<string, unknown> | undefined)?.message ?? data?.error ?? '') || res.statusText).slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new AiError('unauthorized', detail);
    if (res.status === 404) throw new AiError('not-found', detail);
    if (res.status === 429) throw new AiError('rate-limited', detail);
    throw new AiError('server', `${res.status} ${detail}`);
  }
  const choice = (data?.choices as Record<string, unknown>[] | undefined)?.[0];
  const text = (choice?.message as Record<string, unknown> | undefined)?.content;
  if (typeof text !== 'string') throw new AiError('bad-output', 'no message content');
  const usage = data?.usage as Record<string, unknown> | undefined;
  return {
    text,
    model: typeof data?.model === 'string' ? data.model : settings.model,
    usage: {
      input: Number(usage?.prompt_tokens ?? 0),
      output: Number(usage?.completion_tokens ?? 0),
      reported: typeof usage?.prompt_tokens === 'number',
    },
  };
}

/** Lists model ids the server offers (GET /models). Used by the connection test. */
export async function listModels(settings: AiSettings, fetcher: typeof fetch = fetch): Promise<string[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetcher(`${settings.baseUrl}/models`, {
      headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
      signal: ctl.signal,
    });
    if (res.status === 401 || res.status === 403) throw new AiError('unauthorized');
    if (!res.ok) throw new AiError('server', String(res.status));
    const data = (await res.json()) as { data?: { id?: unknown }[] };
    return (data.data ?? []).map((m) => (typeof m.id === 'string' ? m.id.replace(/^models\//, '') : '')).filter(Boolean);
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError(ctl.signal.aborted ? 'timeout' : 'unreachable', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

/** Extracts the first JSON object from model text (models sometimes wrap JSON in prose or code fences). */
export function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? cleaned;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AiError('bad-output', 'no JSON object');
  try {
    const v = JSON.parse(candidate.slice(start, end + 1));
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('not an object');
    return v as Record<string, unknown>;
  } catch (e) {
    throw new AiError('bad-output', e instanceof Error ? e.message : 'invalid JSON');
  }
}
