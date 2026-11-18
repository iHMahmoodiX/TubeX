// MAIN-world half of the Ask Studio bridge (D-030). Two jobs, both started only by TubeX's isolated script:
//  1. watch: while a question is pending, capture the page's own youtubei request whose body contains it
//     (URL, body, headers) and its response text, so TubeX can learn the request once;
//  2. direct: send a learned request with a fresh question, signed like Studio signs it (SAPISIDHASH).
// Events carry JSON strings so nothing structured crosses worlds.
export const EV = {
  watch: 'tubex:ask-watch',
  captured: 'tubex:ask-captured',
  direct: 'tubex:ask-direct',
  result: 'tubex:ask-direct-result',
} as const;

interface Capture {
  url: string;
  body: string;
  headers: Record<string, string>;
  status: number;
  response: string;
}

let watching: { needle: string; until: number } | null = null;

function emit(name: string, detail: unknown) {
  document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) }));
}

function headersOf(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  new Headers(h).forEach((v, k) => (out[k.toLowerCase()] = v));
  return out;
}

function matches(url: string, body: unknown): body is string {
  if (!watching || Date.now() > watching.until || typeof body !== 'string') return false;
  return /\/youtubei\/v1\//.test(url) && body.includes(watching.needle);
}

function hookFetch() {
  const orig = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = init?.body;
    const res = await orig.call(this, input, init);
    if (matches(url, body)) {
      const headers = { ...headersOf(input instanceof Request ? input.headers : undefined), ...headersOf(init?.headers) };
      watching = null;
      void res
        .clone()
        .text()
        .then((response) => emit(EV.captured, { url, body, headers, status: res.status, response } satisfies Capture))
        .catch(() => undefined);
    }
    return res;
  };
}

function hookXhr() {
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  const setHeader = XMLHttpRequest.prototype.setRequestHeader;
  const meta = new WeakMap<XMLHttpRequest, { url: string; headers: Record<string, string> }>();
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    meta.set(this, { url: String(url), headers: {} });
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.setRequestHeader = function (this: XMLHttpRequest, k: string, v: string) {
    const m = meta.get(this);
    if (m) m.headers[k.toLowerCase()] = v;
    return setHeader.call(this, k, v);
  };
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const m = meta.get(this);
    if (m && matches(new URL(m.url, location.href).href, body)) {
      watching = null;
      this.addEventListener('loadend', () => emit(EV.captured, { url: new URL(m.url, location.href).href, body: body as string, headers: m.headers, status: this.status, response: typeof this.responseText === 'string' ? this.responseText : '' } satisfies Capture));
    }
    return send.call(this, body);
  };
}

function cookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function sha1Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Authorization value Google web apps send for signed-in youtubei calls. */
export async function sapisidHash(origin: string, now = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const sid = cookie('SAPISID') ?? cookie('__Secure-3PAPISID');
  if (!sid) return null;
  return `SAPISIDHASH ${now}_${await sha1Hex(`${now} ${sid} ${origin}`)}`;
}

async function direct(req: { id: string; path: string; body: string; headers: Record<string, string> }) {
  try {
    if (!req.path.startsWith('/') || req.path.startsWith('//')) throw new Error('bad-path');
    const auth = await sapisidHash(location.origin);
    const res = await fetch(location.origin + req.path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...req.headers, 'x-origin': location.origin, ...(auth && { authorization: auth }) },
      body: req.body,
    });
    emit(EV.result, { id: req.id, ok: res.ok, status: res.status, text: await res.text() });
  } catch (e) {
    emit(EV.result, { id: req.id, ok: false, status: 0, text: e instanceof Error ? e.message : String(e) });
  }
}

export function installAskStudioBridge(): void {
  if ((window as unknown as { __tubexAsk?: boolean }).__tubexAsk) return;
  (window as unknown as { __tubexAsk?: boolean }).__tubexAsk = true;
  hookFetch();
  hookXhr();
  document.addEventListener(EV.watch, (e) => {
    try {
      const d = JSON.parse(String((e as CustomEvent).detail)) as { needle: string; ms?: number };
      if (typeof d.needle === 'string' && d.needle.length >= 4) watching = { needle: d.needle, until: Date.now() + Math.min(d.ms ?? 120_000, 180_000) };
    } catch {
      // ignore
    }
  });
  document.addEventListener(EV.direct, (e) => {
    try {
      const d = JSON.parse(String((e as CustomEvent).detail));
      if (d && typeof d.id === 'string' && typeof d.path === 'string' && typeof d.body === 'string') void direct({ id: d.id, path: d.path, body: d.body, headers: d.headers ?? {} });
    } catch {
      // ignore
    }
  });
}
