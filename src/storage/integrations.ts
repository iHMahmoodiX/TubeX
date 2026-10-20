// Connection settings for optional services. Stored in chrome.storage.local, which is NOT encrypted:
// anyone with access to this browser profile can read these keys. Never included in backups.
import { browser } from 'wxt/browser';

export interface AiSettings {
  enabled: boolean;
  /** OpenAI-compatible base URL, e.g. http://localhost:11434/v1 for Ollama. */
  baseUrl: string;
  model: string;
  /** Optional; local servers usually need none. */
  apiKey: string;
  /** Hard stop for AI requests per calendar month. 0 = no limit. */
  monthlyRequestCap: number;
}

export interface YouTubeSettings {
  /** YouTube Data API v3 key (public data only). */
  apiKey: string;
  /** ISO 3166-1 alpha-2 region for research, e.g. US, DE. */
  region: string;
  /** Relevance language for search, e.g. fa, en. */
  language: string;
  /** Local stop before the project's daily quota (units, approximate). */
  dailyUnitCap: number;
}

export interface Integrations {
  ai: AiSettings;
  youtube: YouTubeSettings;
}

export const DEFAULT_INTEGRATIONS: Integrations = {
  ai: { enabled: false, baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', apiKey: '', monthlyRequestCap: 1000 },
  youtube: { apiKey: '', region: 'US', language: 'fa', dailyUnitCap: 8000 },
};

const KEY = 'integrations';

const str = (v: unknown, fallback: string, max = 500) => (typeof v === 'string' && v.length <= max ? v.trim() : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);

export function coerceIntegrations(raw: unknown): Integrations {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const ai = r.ai ?? {};
  const yt = r.youtube ?? {};
  const d = DEFAULT_INTEGRATIONS;
  return {
    ai: {
      enabled: ai.enabled === true,
      baseUrl: str(ai.baseUrl, d.ai.baseUrl).replace(/\/+$/, ''),
      model: str(ai.model, d.ai.model, 200),
      apiKey: str(ai.apiKey, ''),
      monthlyRequestCap: num(ai.monthlyRequestCap, d.ai.monthlyRequestCap),
    },
    youtube: {
      apiKey: str(yt.apiKey, ''),
      region: /^[A-Z]{2}$/.test(String(yt.region)) ? String(yt.region) : d.youtube.region,
      language: /^[a-z]{2,3}$/.test(String(yt.language)) ? String(yt.language) : d.youtube.language,
      dailyUnitCap: num(yt.dailyUnitCap, d.youtube.dailyUnitCap),
    },
  };
}

export async function loadIntegrations(): Promise<Integrations> {
  return coerceIntegrations((await browser.storage.local.get(KEY))[KEY]);
}

export async function saveIntegrations(next: Integrations): Promise<Integrations> {
  const clean = coerceIntegrations(next);
  await browser.storage.local.set({ [KEY]: clean });
  return clean;
}

export function onIntegrationsChanged(cb: (i: Integrations) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(coerceIntegrations(changes[KEY].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

// ---- usage counters ----
export interface Usage {
  month: string; // YYYY-MM (local time)
  aiRequests: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  /** YouTube quota resets at midnight Pacific time. */
  ytDay: string; // YYYY-MM-DD in America/Los_Angeles
  ytUnits: number;
}
const USAGE_KEY = 'usage';

export function currentMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function pacificDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function rollUsage(raw: unknown, now = new Date()): Usage {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const month = currentMonth(now);
  const day = pacificDay(now);
  const sameMonth = r.month === month;
  const sameDay = r.ytDay === day;
  return {
    month,
    aiRequests: sameMonth ? num(r.aiRequests, 0) : 0,
    aiInputTokens: sameMonth ? num(r.aiInputTokens, 0) : 0,
    aiOutputTokens: sameMonth ? num(r.aiOutputTokens, 0) : 0,
    ytDay: day,
    ytUnits: sameDay ? num(r.ytUnits, 0) : 0,
  };
}

export async function loadUsage(): Promise<Usage> {
  return rollUsage((await browser.storage.local.get(USAGE_KEY))[USAGE_KEY]);
}

export async function addUsage(delta: Partial<Pick<Usage, 'aiRequests' | 'aiInputTokens' | 'aiOutputTokens' | 'ytUnits'>>): Promise<Usage> {
  const u = await loadUsage();
  const next: Usage = {
    ...u,
    aiRequests: u.aiRequests + (delta.aiRequests ?? 0),
    aiInputTokens: u.aiInputTokens + (delta.aiInputTokens ?? 0),
    aiOutputTokens: u.aiOutputTokens + (delta.aiOutputTokens ?? 0),
    ytUnits: u.ytUnits + (delta.ytUnits ?? 0),
  };
  await browser.storage.local.set({ [USAGE_KEY]: next });
  return next;
}

export function onUsageChanged(cb: (u: Usage) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[USAGE_KEY]) cb(rollUsage(changes[USAGE_KEY].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
