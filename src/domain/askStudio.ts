// Ask Studio (YouTube Studio's built-in assistant) from TubeX, three ways chosen in Settings (D-030):
//  - copy:   copy the question and open Studio (no automation),
//  - page:   type the question into Ask Studio in a Studio tab and read the answer from the page,
//  - direct: replay Studio's own request with the new question (learned once from a real question).
// The owner explicitly opted in to the last two; they use his own signed-in Studio session.

export type AskMode = 'copy' | 'page' | 'direct';
export const ASK_MODES: AskMode[] = ['copy', 'page', 'direct'];
export type AskScope = 'channel' | 'video';

export interface AskPreset {
  id: string;
  name: string;
  text: string;
  scope: AskScope;
}

/** What "direct" mode learned from one real Ask Studio request. Never holds cookies or the Authorization header. */
export interface LearnedRequest {
  /** Same-origin path with query, e.g. /youtubei/v1/... */
  path: string;
  /** Request body with the question replaced by QUESTION_TOKEN. */
  body: string;
  /** Safe Studio client headers (x-youtube-client-*, x-goog-authuser, x-goog-visitor-id, content-type). */
  headers: Record<string, string>;
  /** Pattern of the JSON path(s) where the answer text was, e.g. "a.*.text". */
  answerPath?: string;
  videoId?: string;
  channelId?: string;
  learnedAt: string;
}

export interface AskSettings {
  mode: AskMode;
  /** Show the ready-made questions inside Studio's own Ask Studio panel. */
  showInStudio: boolean;
  presets: AskPreset[];
  learned?: LearnedRequest;
}

export interface AskHistoryItem {
  id: string;
  at: string;
  question: string;
  answer: string;
  mode: AskMode;
  videoId?: string;
  videoTitle?: string;
}

export const QUESTION_TOKEN = '__TUBEX_QUESTION__';
export const SAFE_HEADERS = ['content-type', 'x-goog-authuser', 'x-goog-visitor-id', 'x-youtube-client-name', 'x-youtube-client-version', 'x-youtube-page-label', 'x-youtube-page-cl', 'x-youtube-utc-offset', 'x-youtube-time-zone', 'x-origin'];

export const DEFAULT_PRESETS: AskPreset[] = [
  { id: 'p-week', scope: 'channel', name: 'خلاصهٔ عملکرد این هفته', text: 'عملکرد کانالم را در ۷ روز گذشته با ۷ روز قبلش مقایسه کن. بازدید، زمان تماشا، مشترک جدید و CTR را بگو، بگو کدام ویدیوها بیشترین سهم را داشتند و چه چیزی بهتر یا بدتر شده. در آخر سه کار مشخص برای هفتهٔ بعد پیشنهاد بده.' },
  { id: 'p-next', scope: 'channel', name: 'ایدهٔ ویدیوی بعدی', text: 'بر اساس ویدیوهایی که در کانال من بهترین عملکرد را داشته‌اند و جستجوهای مخاطبانم، ۱۰ ایدهٔ ویدیوی بعدی پیشنهاد بده. برای هر ایده یک عنوان پیشنهادی و دلیلش را بنویس.' },
  { id: 'p-audience', scope: 'channel', name: 'مخاطبانم چه می‌خواهند؟', text: 'مخاطبان کانال من چه کسانی هستند، چه چیزهایی جستجو می‌کنند و چه ویدیوهای دیگری می‌بینند؟ بگو چه موضوعاتی را پوشش نداده‌ام که برایشان جذاب است.' },
  { id: 'p-besttime', scope: 'channel', name: 'بهترین زمان انتشار', text: 'مخاطبان من چه روزها و ساعت‌هایی بیشتر روی یوتیوب هستند؟ بهترین زمان انتشار ویدیو و Short برای کانالم را پیشنهاد بده.' },
  { id: 'p-subs', scope: 'channel', name: 'چه چیزی مشترک می‌آورد؟', text: 'کدام ویدیوهای من بیشترین مشترک جدید را آورده‌اند و چه ویژگی مشترکی دارند؟ چطور می‌توانم این را در ویدیوهای بعدی تکرار کنم؟' },
  { id: 'p-shorts', scope: 'channel', name: 'Shorts و ویدیوهای بلند', text: 'عملکرد Shortsهای من را با ویدیوهای بلند مقایسه کن. آیا Shorts باعث جذب مشترک و بازدید برای ویدیوهای بلند شده است؟ چه پیشنهادی برای ترکیب این دو داری؟' },
  { id: 'p-search', scope: 'channel', name: 'عبارت‌های جستجوی پرترافیک', text: 'مردم با چه عبارت‌هایی در جستجوی یوتیوب به کانال من می‌رسند؟ کدام عبارت‌ها ترافیک زیادی دارند ولی ویدیوی اختصاصی برایشان ندارم؟' },
  { id: 'v-why', scope: 'video', name: 'چرا این ویدیو این‌طور عمل کرد؟', text: 'عملکرد این ویدیو را با ویدیوهای معمول کانالم مقایسه کن و بگو چرا بهتر یا ضعیف‌تر بوده است. منابع ترافیک، CTR و نگهداشت مخاطب را بررسی کن.' },
  { id: 'v-title', scope: 'video', name: 'عنوان و تامبنیل بهتر', text: 'برای این ویدیو ۵ عنوان بهتر پیشنهاد بده که CTR را بالا ببرد و با جستجوهای مخاطبانم هماهنگ باشد. برای تامبنیل هم سه ایدهٔ مشخص بده.' },
  { id: 'v-retention', scope: 'video', name: 'کجا مخاطب را از دست دادم؟', text: 'نمودار نگهداشت مخاطب این ویدیو را بررسی کن. در کدام لحظه‌ها بیشترین ریزش هست و احتمالاً چرا؟ برای ویدیوهای بعدی چه چیزی را تغییر دهم؟' },
  { id: 'v-traffic', scope: 'video', name: 'بیننده‌ها از کجا آمدند؟', text: 'منابع ترافیک این ویدیو را توضیح بده (جستجو، پیشنهادی، صفحهٔ اصلی، خارجی). کدام منبع رشد دارد و چطور می‌توانم آن را تقویت کنم؟' },
  { id: 'v-desc', scope: 'video', name: 'توضیحات و برچسب‌های بهتر', text: 'برای این ویدیو یک توضیحات بهتر بنویس که دو خط اولش جذاب باشد و کلمات کلیدی مهم را داشته باشد، به همراه ۱۰ برچسب پیشنهادی.' },
  { id: 'v-comments', scope: 'video', name: 'خلاصهٔ نظرها', text: 'نظرهای این ویدیو را خلاصه کن: مخاطبان از چه چیزی راضی بودند، چه سؤال‌هایی پرسیدند و چه موضوعی را برای ویدیوی بعدی خواستند؟' },
  { id: 'v-shorts', scope: 'video', name: 'ایدهٔ Short از این ویدیو', text: 'از این ویدیو چه بخش‌هایی برای ساختن Short مناسب است؟ ۵ ایدهٔ Short با زمان تقریبی و یک عنوان کوتاه برای هرکدام پیشنهاد بده.' },
];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function defaultAskSettings(): AskSettings {
  return { mode: 'page', showInStudio: true, presets: DEFAULT_PRESETS.map((p) => ({ ...p })) };
}

export function coerceAskSettings(raw: unknown): AskSettings {
  const out = defaultAskSettings();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (ASK_MODES.includes(r.mode as AskMode)) out.mode = r.mode as AskMode;
  out.showInStudio = r.showInStudio !== false;
  if (Array.isArray(r.presets)) {
    const seen = new Set<string>();
    out.presets = [];
    for (const x of r.presets) {
      if (typeof x !== 'object' || x === null) continue;
      const p = x as Record<string, unknown>;
      const id = str(p.id, 80);
      const text = str(p.text, 4000);
      if (!id || seen.has(id) || !text.trim()) continue;
      seen.add(id);
      out.presets.push({ id, name: str(p.name, 100).trim() || text.slice(0, 40), text, scope: p.scope === 'video' ? 'video' : 'channel' });
    }
  }
  const l = r.learned as Record<string, unknown> | undefined;
  if (l && typeof l === 'object') {
    const path = str(l.path, 2000);
    const body = str(l.body, 200_000);
    if (path.startsWith('/') && !path.startsWith('//') && body.includes(QUESTION_TOKEN)) {
      const headers: Record<string, string> = {};
      const h = (l.headers ?? {}) as Record<string, unknown>;
      for (const k of SAFE_HEADERS) if (typeof h[k] === 'string') headers[k] = (h[k] as string).slice(0, 500);
      out.learned = {
        path,
        body,
        headers,
        ...(typeof l.answerPath === 'string' && { answerPath: l.answerPath.slice(0, 300) }),
        ...(typeof l.videoId === 'string' && /^[\w-]{11}$/.test(l.videoId) && { videoId: l.videoId }),
        ...(typeof l.channelId === 'string' && /^UC[\w-]{22}$/.test(l.channelId) && { channelId: l.channelId }),
        learnedAt: str(l.learnedAt, 40),
      };
    }
  }
  return out;
}

/** Fills {title} and other {placeholders} the owner can use in presets. */
export function fillPreset(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

// ---------------------------------------------------------------- learning and replay (pure)

/** JSON string escaping as it appears inside a JSON body (without the quotes). */
export function jsonInner(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

/** Turns a captured request body into a template, or null when the question is not in it. */
export function bodyTemplate(body: string, question: string): string | null {
  const q = jsonInner(question);
  if (!q || !body.includes(q)) return null;
  return body.split(q).join(QUESTION_TOKEN);
}

export function buildBody(l: Pick<LearnedRequest, 'body' | 'videoId' | 'channelId'>, question: string, ctx: { videoId?: string; channelId?: string } = {}): string {
  let b = l.body.split(QUESTION_TOKEN).join(jsonInner(question));
  if (l.videoId && ctx.videoId && ctx.videoId !== l.videoId) b = b.split(l.videoId).join(ctx.videoId);
  if (l.channelId && ctx.channelId && ctx.channelId !== l.channelId) b = b.split(l.channelId).join(ctx.channelId);
  return b;
}

/** Parses Studio answers: one JSON, a JSON array stream, or line/chunk-separated JSON (with or without the )]}' guard). */
export function parseChunks(text: string): unknown[] {
  const t = text.replace(/^\)\]\}'\s*/, '').trim();
  if (!t) return [];
  try {
    return [JSON.parse(t)];
  } catch {
    // fall through
  }
  const out: unknown[] = [];
  for (const line of t.split(/\r?\n/)) {
    const l = line.replace(/^data:\s*/, '').replace(/^,/, '').trim();
    if (!l || l === '[' || l === ']') continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      // not JSON
    }
  }
  return out;
}

interface Found {
  path: string;
  value: string;
}

function walk(v: unknown, path: string, out: Found[]): void {
  if (typeof v === 'string') out.push({ path, value: v });
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, out);
}

/** Path with array indexes replaced by *, so the same field matches in every answer. */
export function pathPattern(path: string): string {
  return path
    .split('.')
    .map((p) => (/^\d+$/.test(p) ? '*' : p))
    .join('.');
}

const looksLikeText = (s: string) => /\s/.test(s.trim()) && !/^https?:\/\//.test(s) && !/^[A-Za-z0-9+/=_-]{24,}$/.test(s);

/** Where the answer text was in a learned response: the path pattern holding the most human text. */
export function learnAnswerPath(responseText: string, question: string): string | undefined {
  const found: Found[] = [];
  parseChunks(responseText).forEach((c, i) => walk(c, String(i), found));
  const score = new Map<string, number>();
  for (const f of found) {
    if (!looksLikeText(f.value) || f.value.trim() === question.trim()) continue;
    const p = pathPattern(f.path.split('.').slice(1).join('.'));
    score.set(p, (score.get(p) ?? 0) + f.value.length);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Answer text from a Studio response, by the learned path when it matches, else the longest human-looking strings. */
export function extractAnswer(responseText: string, question: string, answerPath?: string): string {
  const found: Found[] = [];
  parseChunks(responseText).forEach((c, i) => walk(c, String(i), found));
  const texts = found.filter((f) => f.value.trim() && f.value.trim() !== question.trim());
  if (answerPath) {
    const hit = texts.filter((f) => pathPattern(f.path.split('.').slice(1).join('.')) === answerPath).map((f) => f.value);
    if (hit.length) return joinStream(hit);
  }
  const human = texts.filter((f) => looksLikeText(f.value)).map((f) => f.value);
  if (!human.length) return '';
  const longest = human.reduce((a, b) => (b.length > a.length ? b : a));
  return longest.trim();
}

/** Streams often resend the growing answer; keep the final full text, or join distinct pieces. */
function joinStream(parts: string[]): string {
  const last = parts[parts.length - 1]!;
  if (parts.every((p) => last.startsWith(p.slice(0, Math.min(20, p.length))))) return last.trim();
  const uniq: string[] = [];
  for (const p of parts) if (!uniq.includes(p)) uniq.push(p);
  return uniq.join('').trim();
}

/** Keeps only safe client headers from a captured request (never cookies or Authorization). */
export function safeHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const key = k.toLowerCase();
    if (SAFE_HEADERS.includes(key)) out[key] = v.slice(0, 500);
  }
  return out;
}

/** The text a page-mode run adds to the Ask Studio panel: what came after the question. */
export function answerFromPanel(before: string, after: string, question: string): string {
  // What changed between the two snapshots: drop the shared start and the shared end (buttons, footer).
  let pre = 0;
  while (pre < before.length && pre < after.length && before[pre] === after[pre]) pre++;
  let suf = 0;
  while (suf < before.length - pre && suf < after.length - pre && before[before.length - 1 - suf] === after[after.length - 1 - suf]) suf++;
  let t = after.slice(pre, after.length - suf);
  // Skip the echoed question. Studio may show it shortened ("…") or wrapped, so match its start and skip that block.
  const full = question.trim();
  const fi = t.lastIndexOf(full);
  if (fi >= 0) t = t.slice(fi + full.length);
  else {
    const head = full.slice(0, 30);
    const i = head ? t.lastIndexOf(head) : -1;
    if (i >= 0) {
      const nl = t.indexOf('\n', i);
      t = nl >= 0 ? t.slice(nl + 1) : '';
    }
  }
  return t
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l, idx, arr) => !(l === '' && arr[idx - 1] === ''))
    .join('\n')
    .trim();
}

/** Studio page Ask Studio should answer about: the video's analytics, the channel's, or Studio home. */
export function studioUrlFor(ctx: { videoId?: string; channelId?: string }): string {
  if (ctx.videoId) return `https://studio.youtube.com/video/${ctx.videoId}/analytics/tab-overview/period-default`;
  if (ctx.channelId) return `https://studio.youtube.com/channel/${ctx.channelId}/analytics/tab-overview/period-default`;
  return 'https://studio.youtube.com/';
}
