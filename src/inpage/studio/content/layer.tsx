// Overlay layer for this area's popovers and floating sheets (#8). Studio wraps the Content page in scroll
// containers and stacking contexts (overflow, transform, contain); a position: fixed menu inside an island there
// is placed against and clipped by those boxes instead of the viewport. Content portalled through <Layer> renders in
// one body-level shadow host instead: fixed to the viewport, above Studio's list, never clipped. React context
// (i18n, toasts) and events still flow through the portal; styles are copied from the island's shadow root.
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../i18n';
import { useYtTheme } from '../../InpageRoot';

export const LAYER_TAG = 'tubex-sc-layer';

// Wins over the copied island CSS (`:host{all:initial !important}`, `:host{display:block !important}`) by coming later.
const HOST_CSS = `:host{all:initial !important;display:block !important;position:fixed !important;top:0 !important;left:0 !important;width:0 !important;height:0 !important;overflow:visible !important;z-index:2300 !important;}`;

const copied = new WeakMap<ShadowRoot, Set<string>>();

/** The shared layer's shadow root, created on first use; island styles from `from` are copied into it once. */
export function layerRoot(from: Node | null, doc: Document = document): ShadowRoot {
  let host = doc.querySelector(LAYER_TAG) as HTMLElement | null;
  if (!host?.shadowRoot) {
    host?.remove();
    host = doc.createElement(LAYER_TAG);
    host.setAttribute('data-tubex', '');
    const sh = host.attachShadow({ mode: 'open' });
    const base = doc.createElement('style');
    base.setAttribute('data-sc-layer', '');
    base.textContent = HOST_CSS;
    sh.append(base);
    // Like the islands: keep Studio's keyboard shortcuts from seeing keys typed in our menus and sheets.
    for (const ev of ['keydown', 'keyup', 'keypress']) sh.addEventListener(ev, (e) => e.stopPropagation());
  }
  if (!host.isConnected) (doc.body ?? doc.documentElement).append(host);
  const sh = host.shadowRoot!;
  const seen = copied.get(sh) ?? new Set<string>();
  copied.set(sh, seen);
  if (from instanceof ShadowRoot && from !== sh) {
    const base = sh.querySelector('style[data-sc-layer]');
    for (const st of Array.from(from.children).filter((c) => c.tagName === 'STYLE')) {
      const text = st.textContent ?? '';
      if (!text || seen.has(text)) continue;
      seen.add(text);
      sh.insertBefore(st.cloneNode(true), base);
    }
  }
  return sh;
}

/** Renders children in the overlay layer, themed and directed like the island it is used from. */
export function Layer({ children }: { children: ReactNode }) {
  const { lang, dir } = useI18n();
  const theme = useYtTheme();
  const mark = useRef<HTMLSpanElement>(null);
  const box = useMemo(() => document.createElement('div'), []);
  // Layout effect: a parent's own layout effect (menu placement) runs after this one and can measure the menu.
  useLayoutEffect(() => {
    layerRoot(mark.current?.getRootNode() ?? null).append(box);
    return () => box.remove();
  }, [box]);
  return (
    <>
      <span ref={mark} hidden />
      {createPortal(
        <div className="tx-root" lang={lang} dir={dir} data-theme={theme}>
          {children}
        </div>,
        box,
      )}
    </>
  );
}
