// Upload dialog (details step): a compact "Upload profile" pill sits right after Studio's own "Reuse details"
// button. It changes nothing in Studio's layout; clicking it opens a floating panel (a separate overlay island on
// <body>, so Studio's dialog never clips or reflows) that fills the description and tags from a TubeX template.
// The user continues and publishes with Studio's own buttons.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../../components/icons';
import { useI18n } from '../../i18n';
import { uploadDialogRoot } from '../../platform/youtubeDomInpage';
import { Mark } from '../common';
import { useInpageEnabled } from '../InpageRoot';
import { ProfilePicker } from './ProfilePicker';

// Shared open state between the button island and the panel island (same content-script context).
let open = false;
const subs = new Set<() => void>();
export function setUploadPanelOpen(v: boolean): void {
  if (open === v) return;
  open = v;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
const useOpen = () => useSyncExternalStore(subscribe, () => open);

export const UPLOAD_BUTTON_HOST = 'tubex-studio-upload';
const buttonEl = () => document.querySelector(UPLOAD_BUTTON_HOST)?.shadowRoot?.querySelector<HTMLElement>('.tx-upload-btn') ?? null;

/** The inline pill next to "Reuse details". */
export function StudioUpload() {
  const on = useInpageEnabled('studioUpload');
  const { t } = useI18n();
  const isOpen = useOpen();
  const ref = useRef<HTMLButtonElement>(null);
  // The island host is inline by default; keep it a small inline-flex item in Studio's button row.
  useLayoutEffect(() => {
    const host = (ref.current?.getRootNode() as ShadowRoot | undefined)?.host as HTMLElement | undefined;
    if (host) host.style.cssText = 'display:inline-flex;vertical-align:middle;margin-inline-start:8px;';
  });
  useEffect(() => () => setUploadPanelOpen(false), []);
  if (!on) return null;
  return (
    <button
      ref={ref}
      type="button"
      className="tx-upload-btn"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      title={t('inpage.upload.title')}
      onClick={() => setUploadPanelOpen(!isOpen)}
    >
      <i aria-hidden="true">
        <Icon name="logo" />
      </i>
      {t('inpage.upload.button')}
    </button>
  );
}

/** The floating panel; rendered only while open. */
export function StudioUploadPanel() {
  const on = useInpageEnabled('studioUpload');
  const isOpen = useOpen();
  if (!on || !isOpen) return null;
  return <Panel />;
}

function Panel() {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const close = () => setUploadPanelOpen(false);

  useLayoutEffect(() => {
    const place = () => {
      const b = buttonEl();
      const r = b?.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) return close();
      const w = Math.min(360, window.innerWidth - 16);
      const h = Math.min(box.current?.offsetHeight ?? 320, window.innerHeight - 16);
      const below = r.bottom + 8 + h <= window.innerHeight;
      const rtl = getComputedStyle(b!).direction === 'rtl';
      const left = rtl ? r.right - w : r.left;
      setPos({ top: below ? r.bottom + 8 : Math.max(8, r.top - 8 - h), left: Math.min(Math.max(8, left), window.innerWidth - w - 8) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('select, button')?.focus());
    const away = (e: PointerEvent) => {
      const path = e.composedPath();
      const panelHost = (box.current?.getRootNode() as ShadowRoot | undefined)?.host;
      const btnHost = document.querySelector(UPLOAD_BUTTON_HOST);
      if ((panelHost && path.includes(panelHost)) || (btnHost && path.includes(btnHost))) return;
      close();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, []);

  return (
    <div
      ref={box}
      className="tx-pop tx-upload-pop"
      role="dialog"
      aria-label={t('inpage.upload.label')}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          buttonEl()?.focus();
        }
      }}
    >
      <div className="row-between">
        <span className="row" style={{ gap: 8 }}>
          <Mark />
          <span className="small bold">{t('inpage.upload.title')}</span>
        </span>
        <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={close}>
          <Icon name="x" />
        </button>
      </div>
      <p className="xsmall muted">{t('inpage.upload.desc')}</p>
      <ProfilePicker getRoot={() => uploadDialogRoot(document)} />
    </div>
  );
}
