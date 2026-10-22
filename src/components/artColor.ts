import { useEffect, useState } from 'react';

/** Stable fallback tint from a string (channel id): content-derived colour without reading pixels. */
export function seedColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 45% 32%)`;
}

/**
 * Average colour of an image (channel avatar or thumbnail), darkened for a hero tint. Falls back to a
 * seeded colour when the image host does not allow reading pixels (CORS).
 */
export function useArtColor(src: string | undefined, seed: string): string {
  const [color, setColor] = useState(() => seedColor(seed));
  useEffect(() => {
    setColor(seedColor(seed));
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const g = c.getContext('2d');
        if (!g) return;
        g.drawImage(img, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        let r = 0, gr = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i] ?? 0;
          gr += d[i + 1] ?? 0;
          b += d[i + 2] ?? 0;
        }
        const n = d.length / 4;
        const k = 0.6; // darken so white text stays readable
        setColor(`rgb(${Math.round((r / n) * k)} ${Math.round((gr / n) * k)} ${Math.round((b / n) * k)})`);
      } catch {
        /* tainted canvas: keep the seeded colour */
      }
    };
    img.src = src;
  }, [src, seed]);
  return color;
}
