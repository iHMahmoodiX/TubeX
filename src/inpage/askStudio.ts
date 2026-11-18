// Isolated-world half of the Ask Studio bridge (D-030). Answers one message from the background:
// { type: 'tubex/ask-studio', question, mode, videoId?, channelId? } → { ok, answer } | { ok: false, code }.
//  - page:   finds Ask Studio in this Studio tab, types the question, sends it and reads the new answer text;
//            meanwhile the MAIN-world bridge captures Studio's request so "direct" can be learned.
//  - direct: replays the learned request through the MAIN-world bridge and extracts the answer.
import { browser } from 'wxt/browser';
import { answerFromPanel, bodyTemplate, buildBody, extractAnswer, jsonInner, learnAnswerPath, safeHeaders, type AskMode, type LearnedRequest } from '../domain/askStudio';
import { loadAskSettings, updateAskSettings } from '../storage/askStudio';
import { EV } from './askStudioMain';

export const ASK_MSG = 'tubex/ask-studio' as const;
export const ASK_PING = 'tubex/ask-ping' as const;

export interface AskRequestMsg {
  type: typeof ASK_MSG;
  question: string;
  mode: Exclude<AskMode, 'copy'>;
  videoId?: string;
  channelId?: string;
}
export type AskErrorCode = 'no-launcher' | 'no-input' | 'timeout' | 'empty' | 'not-learned' | 'direct-failed' | 'signed-out';
export type AskReply = { ok: true; answer: string; learned?: boolean } | { ok: false; code: AskErrorCode; detail?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ASK_RE = /ask\s*studio|askstudio|ask-studio|از\s*استودیو\s*بپرس|بپرسید/i;
const PANEL_RE = /ask|assistant|chat|conversation|gemini|copilot|inspiration/i;

/** querySelectorAll through open shadow roots (Studio mixes light DOM and shadow DOM). */
export function deepAll(root: ParentNode, selector: string, out: Element[] = []): Element[] {
  out.push(...root.querySelectorAll(selector));
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) deepAll(el.shadowRoot, selector, out);
  return out;
}

const visible = (el: Element) => {
  const r = (el as HTMLElement).getBoundingClientRect?.();
  return !!r && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

const label = (el: Element) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.id} ${typeof el.className === 'string' ? el.className : ''} ${el.tagName}`;

/** The Ask Studio button in Studio's header (by label, id or tag name). */
export function findLauncher(root: ParentNode = document): HTMLElement | null {
  const cands = deepAll(root, 'button, [role="button"], ytcp-button, ytcp-icon-button, tp-yt-paper-icon-button, a');
  const hit = cands.find((el) => visible(el) && (ASK_RE.test(label(el)) || ASK_RE.test((el.textContent ?? '').trim().slice(0, 60))));
  return (hit as HTMLElement) ?? null;
}

const up = (el: Element): Element | null => el.parentElement ?? (((el.getRootNode() as ShadowRoot).host as Element | undefined) ?? null);

/** The labelled ancestor (ask/chat/dialog) closest to an element; used to score inputs. */
function labelledAncestor(el: Element): Element {
  let cur: Element | null = el;
  for (let i = 0; cur && i < 25; i++) {
    if (PANEL_RE.test(label(cur)) || cur.getAttribute('role') === 'dialog' || cur.getAttribute('role') === 'complementary') return cur;
    cur = up(cur);
  }
  return el.parentElement ?? el;
}

/**
 * The whole Ask Studio side panel around the question box: the highest ancestor (crossing shadow roots) that is
 * still a side column, i.e. narrower than 60% of the window. It holds the conversation, not only the input.
 */
export function panelOf(el: Element): Element {
  const maxW = Math.max(320, window.innerWidth * 0.6);
  let best: Element = labelledAncestor(el);
  let cur: Element | null = el;
  for (let i = 0; cur && i < 40; i++) {
    const r = cur.getBoundingClientRect();
    if (r.width > maxW || cur === document.body || cur === document.documentElement) break;
    if (r.height > 0) best = cur;
    cur = up(cur);
  }
  return best;
}

const BLOCK = new Set(['DIV', 'P', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'TABLE', 'UL', 'OL', 'SECTION', 'ARTICLE', 'PRE', 'BLOCKQUOTE']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SVG', 'svg', 'NOSCRIPT', 'TEMPLATE']);

/** Visible text of an element including open shadow roots and slotted content (innerText skips shadow DOM). */
export function deepText(root: Node): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out.push(n.textContent ?? '');
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE && n.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const el = n as Element;
    if (n.nodeType === Node.ELEMENT_NODE) {
      if (SKIP.has(el.tagName)) return;
      if ((el as HTMLElement).hidden || el.getAttribute('aria-hidden') === 'true') return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
    }
    const block = n.nodeType === Node.ELEMENT_NODE && BLOCK.has(el.tagName);
    if (block) out.push('\n');
    if (el.tagName === 'SLOT') (el as HTMLSlotElement).assignedNodes({ flatten: true }).forEach(walk);
    else if ((el as Element).shadowRoot) walk((el as Element).shadowRoot!);
    else n.childNodes.forEach(walk);
    if (el.tagName === 'TD' || el.tagName === 'TH') out.push(' | ');
    if (block) out.push('\n');
  };
  walk(root);
  return out
    .join('')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The question box of the open Ask Studio panel. */
export function findInput(root: ParentNode = document): HTMLElement | null {
  const inputs = deepAll(root, 'textarea, [contenteditable="true"], [contenteditable=""], input[type="text"]').filter(visible) as HTMLElement[];
  const inPanel = inputs.filter((i) => PANEL_RE.test(label(labelledAncestor(i))) || PANEL_RE.test(label(i)) || ASK_RE.test(i.getAttribute('placeholder') ?? ''));
  const scored = (inPanel.length ? inPanel : inputs).map((i) => ({ i, s: (PANEL_RE.test(label(labelledAncestor(i))) ? 2 : 0) + (/ask|question|prompt|پرس/i.test(`${i.getAttribute('placeholder') ?? ''} ${i.getAttribute('aria-label') ?? ''}`) ? 2 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0]?.i ?? null;
}

export function typeInto(el: HTMLElement, text: string): void {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  } else {
    const sel = getSelection();
    sel?.selectAllChildren(el);
    if (!document.execCommand('insertText', false, text)) el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text, inputType: 'insertText' }));
  }
}

export function findSend(panel: Element): HTMLElement | null {
  const btns = deepAll(panel, 'button, [role="button"], ytcp-icon-button, tp-yt-paper-icon-button').filter(visible) as HTMLElement[];
  return btns.find((b) => /send|submit|ارسال|بفرست/i.test(label(b)) && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true') ?? null;
}

function busy(panel: Element): boolean {
  return deepAll(panel, '[role="progressbar"], tp-yt-paper-spinner[active], tp-yt-paper-spinner-lite[active], .loading, [aria-busy="true"]').some(visible);
}

const textOf = (el: Element) => deepText(el);

async function waitFor<T>(fn: () => T | null, ms: number, step = 250): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

/** Waits until the panel text has changed and stayed the same for `quiet` ms with no spinner. */
async function waitAnswer(panel: Element, before: string, question: string, timeoutMs: number, quiet = 3000): Promise<string> {
  const end = Date.now() + timeoutMs;
  let last = '';
  let since = Date.now();
  while (Date.now() < end) {
    await sleep(400);
    const now = textOf(panel);
    if (now !== last) {
      last = now;
      since = Date.now();
      continue;
    }
    const answer = answerFromPanel(before, now, question);
    // Done when the text stopped changing; a spinner that never goes away is ignored after a longer quiet time.
    const still = Date.now() - since;
    if (answer.length > 2 && ((still >= quiet && !busy(panel)) || still >= quiet * 3)) return answer;
  }
  const partial = answerFromPanel(before, last, question);
  if (partial.length > 2) return partial;
  throw Object.assign(new Error('timeout'), { code: 'timeout' as const });
}

function watchCapture(question: string, ms: number): Promise<{ url: string; body: string; headers: Record<string, string>; response: string; status: number } | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      document.removeEventListener(EV.captured, on);
      resolve(null);
    }, ms);
    const on = (e: Event) => {
      clearTimeout(t);
      document.removeEventListener(EV.captured, on);
      try {
        resolve(JSON.parse(String((e as CustomEvent).detail)));
      } catch {
        resolve(null);
      }
    };
    document.addEventListener(EV.captured, on);
    document.dispatchEvent(new CustomEvent(EV.watch, { detail: JSON.stringify({ needle: jsonInner(question), ms }) }));
  });
}

const videoIdOfPage = () => location.pathname.match(/\/video\/([\w-]{11})/)?.[1];
const channelIdOfPage = () => location.pathname.match(/\/channel\/(UC[\w-]{22})/)?.[1];

/** Saves what the captured request teaches, for "direct" mode. */
async function learn(cap: { url: string; body: string; headers: Record<string, string>; response: string; status: number }, question: string): Promise<boolean> {
  if (cap.status < 200 || cap.status >= 300) return false;
  const u = new URL(cap.url, location.href);
  if (u.origin !== location.origin) return false;
  const body = bodyTemplate(cap.body, question);
  if (!body) return false;
  const learned: LearnedRequest = {
    path: u.pathname + u.search,
    body,
    headers: safeHeaders(cap.headers),
    answerPath: learnAnswerPath(cap.response, question),
    videoId: videoIdOfPage(),
    channelId: channelIdOfPage(),
    learnedAt: new Date().toISOString(),
  };
  await updateAskSettings((s) => ({ ...s, learned }));
  return true;
}

export async function askOnPage(question: string, timeoutMs = 150_000): Promise<AskReply> {
  let input = findInput();
  if (!input || !PANEL_RE.test(label(labelledAncestor(input)))) {
    const launcher = await waitFor(() => findLauncher(), 15_000);
    if (!launcher) return { ok: false, code: 'no-launcher' };
    launcher.click();
    input = await waitFor(() => findInput(), 10_000);
  }
  if (!input) return { ok: false, code: 'no-input' };
  const panel = panelOf(input);
  const before = textOf(panel);
  const capture = watchCapture(question, timeoutMs);
  typeInto(input, question);
  await sleep(300);
  const send = findSend(panel);
  if (send) send.click();
  else for (const type of ['keydown', 'keypress', 'keyup']) input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true }));
  try {
    const answer = await waitAnswer(panel, before, question, timeoutMs);
    const cap = await Promise.race([capture, sleep(1500).then(() => null)]);
    const learned = cap ? await learn(cap, question).catch(() => false) : false;
    return { ok: true, answer, learned };
  } catch {
    return { ok: false, code: 'timeout' };
  }
}

export async function askDirect(question: string, ctx: { videoId?: string; channelId?: string }, timeoutMs = 120_000): Promise<AskReply> {
  const { learned } = await loadAskSettings();
  if (!learned) return { ok: false, code: 'not-learned' };
  const id = Math.random().toString(36).slice(2);
  const res = await new Promise<{ ok: boolean; status: number; text: string } | null>((resolve) => {
    const t = setTimeout(() => {
      document.removeEventListener(EV.result, on);
      resolve(null);
    }, timeoutMs);
    const on = (e: Event) => {
      try {
        const d = JSON.parse(String((e as CustomEvent).detail));
        if (d.id !== id) return;
        clearTimeout(t);
        document.removeEventListener(EV.result, on);
        resolve(d);
      } catch {
        // ignore
      }
    };
    document.addEventListener(EV.result, on);
    document.dispatchEvent(new CustomEvent(EV.direct, { detail: JSON.stringify({ id, path: learned.path, body: buildBody(learned, question, ctx), headers: learned.headers }) }));
  });
  if (!res) return { ok: false, code: 'timeout' };
  if (res.status === 401 || res.status === 403) return { ok: false, code: 'signed-out', detail: String(res.status) };
  if (!res.ok) return { ok: false, code: 'direct-failed', detail: `${res.status} ${res.text.slice(0, 200)}` };
  const answer = extractAnswer(res.text, question, learned.answerPath);
  return answer ? { ok: true, answer } : { ok: false, code: 'empty' };
}

export function registerAskStudio(): void {
  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse: (r: unknown) => void) => {
    const m = msg as Omit<Partial<AskRequestMsg>, "type"> & { type?: string };
    if (m?.type === ASK_PING) {
      sendResponse({ ok: true, videoId: videoIdOfPage() });
      return false;
    }
    if (m?.type !== ASK_MSG || typeof m.question !== 'string' || !m.question.trim()) return false;
    const q = m.question.slice(0, 4000);
    const run = m.mode === 'direct' ? askDirect(q, { videoId: m.videoId, channelId: m.channelId }) : askOnPage(q);
    run.then(sendResponse).catch((e: unknown) => sendResponse({ ok: false, code: 'timeout', detail: String(e) }));
    return true;
  });
}
