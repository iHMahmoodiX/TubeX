// Draws a thumbnail with the overlay on a 1280×720 canvas and encodes it as JPEG under 2 MB.
import { hexToRgba, JPEG_QUALITIES, letterboxCrop, overlayLayout, THUMB_H, THUMB_MAX_BYTES, THUMB_W, type OverlayDesign } from '../../domain/engageThumbs';
import { isRtlText } from '../../domain/text';

const FONT = '"Estedad Variable", "Figtree Variable", Tahoma, sans-serif';
const font = (size: number) => `800 ${size}px ${FONT}`;

export async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([document.fonts.load(font(64), 'آزمون'), document.fonts.load(font(64), 'Test')]);
  } catch {
    /* fall back to system fonts */
  }
}

export function draw(canvas: HTMLCanvasElement, base: ImageBitmap | null, d: OverlayDesign, logo: ImageBitmap | null, withOverlay = true): void {
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  if (base) {
    const crop = letterboxCrop(base.width, base.height);
    ctx.drawImage(base, crop.x, crop.y, crop.w, crop.h, 0, 0, THUMB_W, THUMB_H);
  }
  if (!withOverlay) return;
  const measure = (text: string, size: number) => {
    ctx.font = font(size);
    return ctx.measureText(text).width;
  };
  const l = overlayLayout(d, measure, logo ? { width: logo.width, height: logo.height } : undefined);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, d.opacity));
  if (l.banner) {
    ctx.fillStyle = hexToRgba(d.bgColor, d.bgOpacity);
    ctx.fillRect(l.banner.x, l.banner.y, l.banner.w, l.banner.h);
    ctx.fillStyle = d.textColor;
    ctx.font = font(l.banner.fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = isRtlText(d.text) ? 'rtl' : 'ltr';
    l.banner.lines.forEach((line, i) => ctx.fillText(line, THUMB_W / 2, l.banner!.y + 18 + l.banner!.lineHeight * (i + 0.5)));
  }
  if (l.badge) {
    const b = l.badge;
    ctx.fillStyle = d.badgeColor;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fill();
    ctx.fillStyle = d.badgeTextColor;
    ctx.font = font(b.fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = isRtlText(d.badge) ? 'rtl' : 'ltr';
    ctx.fillText(d.badge.trim(), b.x + b.w / 2, b.y + b.h / 2 + 2);
  }
  if (l.logo && logo) ctx.drawImage(logo, l.logo.x, l.logo.y, l.logo.w, l.logo.h);
  ctx.restore();
}

/** JPEG at the best quality that fits under the 2 MB upload limit. */
export async function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const q of JPEG_QUALITIES) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= THUMB_MAX_BYTES) return blob;
  }
  throw new Error('image too large');
}
