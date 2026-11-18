// Gemini model lifecycle for the Gemini preset (OpenAI-compatible endpoint). Pure rules, no browser APIs.
// Source: Google's Gemini API deprecations notice as reported 2026-11 (secondary source checked 2026-11-18,
// the official page was not reachable from the build environment): on 2026-12-01 calls to gemini-2.5-flash route
// to gemini-3.5-flash-lite and gemini-2.5-pro to gemini-3.8-flash; gemini-2.5-flash-lite stays available.
// Status: Inferred. The owner's own /models list (connection test) is the authority for what his key can use.

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

/** Default for new Gemini setups: low cost, JSON and image input (Inferred). */
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/** Preference order when choosing a replacement from the owner's /models list. */
export const GEMINI_PREFERRED = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-2.5-flash-lite'] as const;

export interface ModelRetirement {
  /** YYYY-MM-DD when Google reroutes or shuts the model down. */
  date: string;
  /** What calls route to (or the suggested replacement). */
  to: string;
  kind: 'reroute' | 'shutdown';
}

export const GEMINI_RETIREMENTS: Record<string, ModelRetirement> = {
  'gemini-2.5-flash': { date: '2026-12-01', to: 'gemini-3.5-flash-lite', kind: 'reroute' },
  'gemini-2.5-pro': { date: '2026-12-01', to: 'gemini-3.8-flash', kind: 'reroute' },
  'gemini-1.5-flash': { date: '2025-09-24', to: 'gemini-3.5-flash-lite', kind: 'shutdown' },
  'gemini-1.5-pro': { date: '2025-09-24', to: 'gemini-3.8-flash', kind: 'shutdown' },
};

export const isGeminiUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '') === GEMINI_BASE_URL;

/** Strips "models/" and version suffixes like "-001" or "-preview-05-20" to find the family id. */
export function geminiFamily(model: string): string {
  return model
    .trim()
    .replace(/^models\//, '')
    .replace(/-(?:\d{3}|latest|preview(?:-[\w-]+)?|exp(?:-[\w-]+)?)$/, '');
}

export interface ModelNotice {
  model: string;
  retirement: ModelRetirement;
  /** true once the date has passed. */
  past: boolean;
  /** Days until the date (negative when past). */
  days: number;
}

/** A notice when the saved Gemini model is scheduled to be rerouted or shut down; null otherwise. */
export function geminiModelNotice(baseUrl: string, model: string, now = new Date()): ModelNotice | null {
  if (!isGeminiUrl(baseUrl)) return null;
  const r = GEMINI_RETIREMENTS[geminiFamily(model)];
  if (!r) return null;
  const days = Math.ceil((Date.parse(`${r.date}T00:00:00Z`) - now.getTime()) / 86_400_000);
  return { model, retirement: r, past: days <= 0, days };
}

/**
 * Picks the model to suggest from the ids the owner's key can use: the retirement target when available, then the
 * preference list, skipping preview/experimental ids. Without a list, falls back to the retirement target/default.
 */
export function suggestGeminiModel(current: string, available: readonly string[] = []): string {
  const target = GEMINI_RETIREMENTS[geminiFamily(current)]?.to;
  const ids = available.map((m) => m.replace(/^models\//, ''));
  const stable = ids.filter((m) => !/preview|exp|tts|image|embedding|live|audio/i.test(m));
  if (!ids.length) return target ?? GEMINI_DEFAULT_MODEL;
  for (const want of [target, ...GEMINI_PREFERRED]) if (want && stable.includes(want)) return want;
  const flash = stable.find((m) => /^gemini-\d+(?:\.\d+)?-flash(?:-lite)?$/.test(m) && !GEMINI_RETIREMENTS[m]);
  return flash ?? target ?? GEMINI_DEFAULT_MODEL;
}
