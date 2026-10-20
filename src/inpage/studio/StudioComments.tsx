// Studio comments: a small "Canned reply" button on each comment thread. It opens a picker of saved replies
// and puts the chosen text (with {name} filled from the comment's author) into that thread's reply box.
// Nothing is sent: the user sends it with YouTube's own Reply button.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui';
import { fillReply, normalizeReplies } from '../../domain/inpage';
import { matchesQuery } from '../../domain/text';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { fillReplyBox, findReplyBox, findReplyButton, readCommentThreads } from '../../platform/youtubeDomInpage';
import { isUnknownMethod, InError, stopKeys, useAsync } from '../common';
import { useInpageEnabled, useYtTheme } from '../InpageRoot';

interface Slot {
  key: string;
  thread: Element;
  author: string;
  container: HTMLElement;
  button: () => HTMLElement | null;
}

const BTN_CSS = `
:host { all: initial; display: inline-flex; vertical-align: middle; margin-inline-start: 8px; }
button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding-inline: 10px 12px; border-radius: 9999px; font: 500 13px/1 Roboto, Arial, Tahoma, sans-serif; }
button[data-theme='dark'] { color: #f1f1f1; background: rgba(255,255,255,0.08); }
button[data-theme='light'] { color: #0f0f0f; background: rgba(0,0,0,0.05); }
button:hover { filter: brightness(1.2); }
button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
button[aria-expanded='true'] { background: #1ed760; color: #000; }
i { width: 16px; height: 16px; border-radius: 50%; background: #1ed760; display: inline-grid; place-items: center; }
button[aria-expanded='true'] i { background: #000; }
i svg { width: 9px; height: 9px; fill: #000; }
button[aria-expanded='true'] i svg { fill: #1ed760; }
`;

let seq = 0;

export function StudioComments() {
  const on = useInpageEnabled('studioComments');
  if (!on) return null;
  return <CannedReplies />;
}

function CannedReplies() {
  const { t, dir } = useI18n();
  const theme = useYtTheme();
  const slots = useThreadButtons();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = slots.find((s) => s.key === openKey) ?? null;

  return (
    <>
      {slots.map((s) =>
        createPortal(
          <button type="button" data-theme={theme} dir={dir} aria-haspopup="dialog" aria-expanded={openKey === s.key} onClick={() => setOpenKey(openKey === s.key ? null : s.key)} title={t('inpage.reply.button')}>
            <i aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </i>
            {t('inpage.reply.button')}
          </button>,
          s.container,
          s.key,
        ),
      )}
      {open && <Picker slot={open} onClose={() => setOpenKey(null)} />}
    </>
  );
}

function Picker({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const replies = useAsync('replies', async () => {
    try {
      return normalizeReplies(await rpc('engage.listReplies'));
    } catch (e) {
      if (!isUnknownMethod(e)) throw e;
      return normalizeReplies(await rpc('inpage.replies'));
    }
  });
  const list = useMemo(() => (replies.data ?? []).filter((r) => matchesQuery(`${r.name} ${r.text}`, q)), [replies.data, q]);

  useLayoutEffect(() => {
    const place = () => {
      const r = slot.button()?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(360, window.innerWidth - 16);
      const h = 360;
      const below = r.bottom + 8 + h < window.innerHeight;
      setPos({ top: below ? r.bottom + 8 : Math.max(8, r.top - 8 - h), left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [slot]);

  useEffect(() => {
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('input')?.focus());
    const away = (e: PointerEvent) => {
      const path = e.composedPath();
      const islandHost = (box.current?.getRootNode() as ShadowRoot | undefined)?.host;
      const buttonHost = (slot.container.getRootNode() as ShadowRoot).host;
      if ((islandHost && path.includes(islandHost)) || path.includes(buttonHost)) return;
      onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [slot, onClose]);

  const insert = async (text: string) => {
    let target = findReplyBox(slot.thread);
    if (!target) {
      findReplyButton(slot.thread)?.click(); // opens Studio's reply box; nothing is sent
      for (let i = 0; i < 10 && !target; i++) {
        await new Promise((r) => setTimeout(r, 150));
        target = findReplyBox(slot.thread);
      }
    }
    if (!target) return setNote(t('inpage.reply.noBox'));
    fillReplyBox(target, fillReply(text, { name: slot.author }));
    onClose();
  };

  return (
    <div
      ref={box}
      className="tx-pop"
      role="dialog"
      aria-label={t('inpage.reply.title')}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
          slot.button()?.focus();
        }
      }}
    >
      <div className="row-between">
        <span className="tx-mark">
          <i aria-hidden="true">
            <Icon name="logo" />
          </i>
          {t('inpage.reply.title')}
        </span>
        <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      {slot.author && <p className="xsmall muted">{t('inpage.reply.to', { name: slot.author })}</p>}
      <input className="input tx-input" type="search" dir="auto" placeholder={t('common.search')} aria-label={t('inpage.reply.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {replies.error !== undefined && <InError error={replies.error} onRetry={replies.reload} />}
      {replies.loading && !replies.data && <span className="skel tx-skel-line" aria-busy="true" />}
      {replies.data && !replies.data.length && (
        <div className="tx-empty">
          <Icon name="message" />
          <p>{t('inpage.reply.none')}</p>
          <Button size="s" onClick={() => void rpc('ui.openWorkspace', 'comments')}>
            {t('inpage.reply.create')}
          </Button>
        </div>
      )}
      {list.length > 0 && (
        <ul className="tx-reply-list">
          {list.map((r) => (
            <li key={r.id}>
              <button type="button" className="tx-reply" onClick={() => void insert(r.text)}>
                <strong dir="auto">{r.name}</strong>
                <span className="xsmall muted clamp-2" dir="auto">
                  {fillReply(r.text, { name: slot.author })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {replies.data && replies.data.length > 0 && !list.length && <p className="small muted">{t('inpage.reply.noMatch')}</p>}
      {note && <p className="small tx-warn">{note}</p>}
      <p className="xsmall faint">{t('inpage.reply.help')}</p>
    </div>
  );
}

/** Places a button host after each comment thread's action row; follows new threads as Studio loads more. */
function useThreadButtons(): Slot[] {
  const [slots, setSlots] = useState<Slot[]>([]);
  const hosts = useRef(new Map<Element, { host: HTMLElement; slot: Slot }>());
  useEffect(() => {
    let timer: number | undefined;
    const scan = () => {
      timer = undefined;
      const found = readCommentThreads(document);
      const live = new Set<Element>();
      let changed = false;
      for (const th of found) {
        live.add(th.thread);
        const h = hosts.current.get(th.thread);
        if (h && h.host.isConnected && h.host.previousElementSibling === th.after) {
          if (h.slot.author !== th.author) {
            h.slot = { ...h.slot, author: th.author };
            changed = true;
          }
          continue;
        }
        h?.host.remove();
        const host = document.createElement('tubex-reply');
        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = BTN_CSS;
        const container = document.createElement('span');
        shadow.append(style, container);
        stopKeys(host);
        th.after.insertAdjacentElement('afterend', host);
        const slot: Slot = { key: `r${seq++}`, thread: th.thread, author: th.author, container, button: () => container.querySelector('button') };
        hosts.current.set(th.thread, { host, slot });
        changed = true;
      }
      for (const [el, h] of hosts.current)
        if (!live.has(el)) {
          h.host.remove();
          hosts.current.delete(el);
          changed = true;
        }
      if (changed) setSlots([...hosts.current.values()].map((h) => h.slot));
    };
    const mo = new MutationObserver((records) => {
      if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n.nodeName === 'TUBEX-REPLY'))) return;
      if (timer === undefined) timer = window.setTimeout(scan, 700);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => {
      mo.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      for (const h of hosts.current.values()) h.host.remove();
      hosts.current.clear();
    };
  }, []);
  return slots;
}
