// "TubeX questions" inside Studio's own Ask Studio panel: a small collapsible strip right above the question box.
// One click types the ready-made question into Ask Studio and sends it. Nothing else on the page changes.
import { fillPreset, type AskPreset } from '../domain/askStudio';
import { loadAskSettings, onAskSettingsChanged } from '../storage/askStudio';
import { deepText, findInput, findSend, panelOf, typeInto } from './askStudio';

const HOST_ID = 'tubex-ask-presets';
const AI_FOOTER = /AI can make mistakes|ممکن است اشتباه|Ask Studio|هوش مصنوعی/i;

/** True when the question box belongs to Ask Studio (not the description editor or another field). */
export function isAskStudioInput(input: HTMLElement): boolean {
  const panel = panelOf(input);
  const r = panel.getBoundingClientRect();
  return r.width < window.innerWidth * 0.6 && AI_FOOTER.test(deepText(panel).slice(-4000));
}

const up = (el: Element): Element | null => el.parentElement ?? (((el.getRootNode() as ShadowRoot).host as Element | undefined) ?? null);

/** The input's own box (with + and send buttons): the highest ancestor that is still short. */
export function inputBox(input: HTMLElement): Element {
  let best: Element = input;
  let cur: Element | null = input;
  for (let i = 0; cur && i < 12; i++) {
    const r = cur.getBoundingClientRect();
    if (r.height > 220) break;
    best = cur;
    cur = up(cur);
  }
  return best;
}

const CSS = `
:host { all: initial; display: block; margin: 0 0 8px; font-family: inherit; direction: rtl; }
.wrap { font: 13px/1.5 'Estedad-FD', 'Vazirmatn', Roboto, Arial, sans-serif; color: #f1f1f1; }
.toggle { display: inline-flex; gap: 6px; align-items: center; background: #1f1f1f; color: #f1f1f1; border: 1px solid #3f3f3f; border-radius: 999px; padding: 4px 12px; cursor: pointer; font: inherit; }
.toggle:hover { background: #2a2a2a; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #1ed760; }
.list { display: none; margin-top: 8px; max-height: 220px; overflow: auto; }
.open .list { display: block; }
.group { font-size: 11px; color: #aaa; margin: 6px 2px 4px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: #282828; color: #f1f1f1; border: 1px solid #3a3a3a; border-radius: 999px; padding: 4px 10px; cursor: pointer; font: inherit; text-align: start; }
.chip:hover { background: #333; border-color: #1ed760; }
.chip:focus-visible, .toggle:focus-visible { outline: 2px solid #1ed760; outline-offset: 2px; }
`;

function render(root: ShadowRoot, presets: AskPreset[], open: boolean, onToggle: () => void, onPick: (p: AskPreset) => void) {
  const onVideo = /\/video\/[\w-]{11}/.test(location.pathname);
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = CSS;
  const wrap = document.createElement('div');
  wrap.className = `wrap${open ? ' open' : ''}`;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toggle';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.innerHTML = '<span class="dot"></span>';
  toggle.append(document.createTextNode('سؤال‌های آمادهٔ TubeX'));
  toggle.addEventListener('click', onToggle);
  const list = document.createElement('div');
  list.className = 'list';
  const groups: [string, AskPreset[]][] = [
    ...(onVideo ? ([['همین ویدیو', presets.filter((p) => p.scope === 'video')]] as [string, AskPreset[]][]) : []),
    ['کانال', presets.filter((p) => p.scope === 'channel')],
    ...(!onVideo ? ([['ویدیو (در صفحهٔ یک ویدیو)', presets.filter((p) => p.scope === 'video')]] as [string, AskPreset[]][]) : []),
  ];
  for (const [title, items] of groups) {
    if (!items.length) continue;
    const g = document.createElement('div');
    g.className = 'group';
    g.textContent = title;
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const p of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = p.name;
      b.title = p.text;
      b.addEventListener('click', () => onPick(p));
      chips.append(b);
    }
    list.append(g, chips);
  }
  wrap.append(toggle, list);
  root.append(style, wrap);
}

/** Types and sends a question in the open Ask Studio panel. */
export function sendInPanel(text: string): boolean {
  const input = findInput();
  if (!input) return false;
  typeInto(input, text);
  setTimeout(() => {
    const send = findSend(panelOf(input));
    if (send) send.click();
    else for (const type of ['keydown', 'keypress', 'keyup']) input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true }));
  }, 250);
  return true;
}

export function registerAskStudioBar(): void {
  let presets: AskPreset[] = [];
  let enabled = true;
  let open = false;
  let host: HTMLElement | null = null;
  const draw = () => {
    if (!host?.shadowRoot) return;
    render(
      host.shadowRoot,
      presets,
      open,
      () => {
        open = !open;
        draw();
      },
      (p) => {
        sendInPanel(fillPreset(p.text, { title: 'این ویدیو', channel: 'کانال من' }));
        open = false;
        draw();
      },
    );
  };
  const place = () => {
    const existing = document.getElementById(HOST_ID) ?? (host?.isConnected ? host : null);
    if (!enabled) {
      existing?.remove();
      return;
    }
    if (host?.isConnected) return;
    const input = findInput();
    if (!input || !isAskStudioInput(input)) {
      if (existing && !existing.isConnected) host = null;
      return;
    }
    const box = inputBox(input);
    host?.remove();
    host = document.createElement('div');
    host.id = HOST_ID;
    host.attachShadow({ mode: 'open' });
    box.parentNode?.insertBefore(host, box);
    draw();
  };
  void loadAskSettings().then((s) => {
    presets = s.presets;
    enabled = s.showInStudio;
    place();
  });
  onAskSettingsChanged((s) => {
    presets = s.presets;
    enabled = s.showInStudio;
    if (!enabled) host?.remove();
    draw();
    place();
  });
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      place();
    }, 1000);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
