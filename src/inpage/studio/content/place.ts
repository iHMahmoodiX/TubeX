// Pure placement for the Content page popovers (#8): directly under (or, when there is no room, above) the button,
// never overlapping it, clamped into the viewport. Coordinates are viewport (position: fixed) pixels.

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Placement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  side: 'below' | 'above';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/**
 * @param btn the button's getBoundingClientRect()
 * @param size the menu's wanted width and natural (unclipped) height
 * @param vp the viewport size
 * @param rtl the page's direction: the menu starts at the button's start edge (left in LTR, right in RTL)
 */
export function placeMenu(btn: Rect, size: { w: number; h: number }, vp: { w: number; h: number }, rtl: boolean, gap = 6, margin = 8): Placement {
  const width = Math.max(0, Math.min(size.w, vp.w - 2 * margin));
  const want = rtl ? btn.right - width : btn.left;
  const left = clamp(want, margin, Math.max(margin, vp.w - width - margin));
  const below = vp.h - btn.bottom - gap - margin;
  const above = btn.top - gap - margin;
  if (size.h <= below || below >= above) return { top: btn.bottom + gap, left, width, maxHeight: Math.max(0, below), side: 'below' };
  const h = Math.min(size.h, above);
  return { top: btn.top - gap - h, left, width, maxHeight: Math.max(0, above), side: 'above' };
}

/** The button is (at least partly) on screen; when it is not, an open menu should close rather than float. */
export function onScreen(btn: Rect, vp: { w: number; h: number }): boolean {
  if (btn.right - btn.left <= 0 && btn.bottom - btn.top <= 0) return false;
  return btn.bottom > 0 && btn.top < vp.h && btn.right > 0 && btn.left < vp.w;
}
