// Thumbnail overlay layout on a 1280×720 canvas. Pure geometry: the page measures text with the canvas and
// draws the rectangles this returns. No browser APIs.

export const THUMB_W = 1280;
export const THUMB_H = 720;
/** thumbnails.set accepts images up to 2 MB (Inferred from the API reference). */
export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
export const THUMB_COST = 50; // thumbnails.set (Inferred)

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type BannerPosition = 'top' | 'center' | 'bottom';

export interface OverlayDesign {
  text: string;
  /** Font size in canvas pixels (of 720 height). */
  fontSize: number;
  textColor: string;
  bgColor: string;
  /** Banner background opacity 0..1. */
  bgOpacity: number;
  position: BannerPosition;
  badge: string;
  badgeCorner: Corner;
  badgeColor: string;
  badgeTextColor: string;
  logoCorner: Corner;
  /** Logo width as a share of the canvas width (0.05..0.4). */
  logoScale: number;
  /** Whole-overlay opacity 0..1. */
  opacity: number;
}

export const DEFAULT_DESIGN: OverlayDesign = {
  text: '',
  fontSize: 72,
  textColor: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 0.65,
  position: 'bottom',
  badge: '',
  badgeCorner: 'tr',
  badgeColor: '#1ed760',
  badgeTextColor: '#000000',
  logoCorner: 'tl',
  logoScale: 0.14,
  opacity: 1,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Measure = (text: string, fontSize: number) => number;

/** Greedy word wrap to `maxWidth`, at most `maxLines` lines (the last line is cut with an ellipsis). */
export function wrapText(text: string, maxWidth: number, fontSize: number, measure: Measure, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next, fontSize) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]}…`;
    while (last.length > 1 && measure(last, fontSize) > maxWidth) last = `${last.slice(0, -2)}…`;
    kept[maxLines - 1] = last;
    return kept;
  }
  return lines;
}

export interface OverlayLayout {
  banner?: Rect & { lines: string[]; lineHeight: number; fontSize: number };
  badge?: Rect & { fontSize: number };
  logo?: Rect;
}

const PAD = 36;

function cornerRect(corner: Corner, w: number, h: number, W: number, H: number, inset = PAD): Rect {
  const x = corner === 'tl' || corner === 'bl' ? inset : W - inset - w;
  const y = corner === 'tl' || corner === 'tr' ? inset : H - inset - h;
  return { x, y, w, h };
}

/**
 * Where the banner, badge and logo go. The banner spans the full width at the chosen position; the badge and
 * logo sit in corners and move off the banner's band when they would cover it.
 */
export function overlayLayout(d: OverlayDesign, measure: Measure, logo?: { width: number; height: number }, W = THUMB_W, H = THUMB_H): OverlayLayout {
  const out: OverlayLayout = {};
  const fontSize = Math.max(24, Math.min(160, Math.round(d.fontSize)));
  if (d.text.trim()) {
    const lines = wrapText(d.text, W - PAD * 4, fontSize, measure);
    const lineHeight = Math.round(fontSize * 1.25);
    const h = lines.length * lineHeight + PAD;
    const y = d.position === 'top' ? 0 : d.position === 'bottom' ? H - h : Math.round((H - h) / 2);
    out.banner = { x: 0, y, w: W, h, lines, lineHeight, fontSize };
  }
  const band = out.banner;
  const avoid = (r: Rect): Rect => {
    if (!band || r.y + r.h <= band.y || r.y >= band.y + band.h) return r;
    // Move to the corner's side of the banner when there is room there, otherwise to the other side.
    const above = band.y - r.h - 12;
    const below = band.y + band.h + 12;
    const fitsAbove = above >= 0;
    const fitsBelow = below + r.h <= H;
    const preferAbove = r.y < H / 2;
    if ((preferAbove && fitsAbove) || (!fitsBelow && fitsAbove)) return { ...r, y: above };
    if (fitsBelow) return { ...r, y: below };
    return r;
  };
  if (d.badge.trim()) {
    const bs = Math.round(Math.max(28, Math.min(72, fontSize * 0.6)));
    const w = Math.min(W / 2, measure(d.badge.trim(), bs) + bs * 1.2);
    out.badge = { ...avoid(cornerRect(d.badgeCorner, w, Math.round(bs * 1.6), W, H)), fontSize: bs };
  }
  if (logo && logo.width > 0 && logo.height > 0) {
    const w = Math.round(W * Math.max(0.05, Math.min(0.4, d.logoScale)));
    const h = Math.round((w * logo.height) / logo.width);
    let r = avoid(cornerRect(d.logoCorner, w, Math.min(h, H / 2), W, H));
    if (out.badge && d.logoCorner === d.badgeCorner) r = { ...r, y: r.y < H / 2 ? out.badge.y + out.badge.h + 12 : out.badge.y - r.h - 12 };
    out.logo = r;
  }
  return out;
}

/** JPEG qualities to try, best first, until the image fits under THUMB_MAX_BYTES. */
export const JPEG_QUALITIES = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5];

/** Crop of a 480×360 hqdefault frame that holds the 16:9 picture (YouTube letterboxes it). */
export function letterboxCrop(w: number, h: number): Rect {
  const target = (w * 9) / 16;
  if (h <= target + 1) return { x: 0, y: 0, w, h };
  return { x: 0, y: Math.round((h - target) / 2), w, h: Math.round(target) };
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  const v = m ? parseInt(m[1]!, 16) : 0;
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}
