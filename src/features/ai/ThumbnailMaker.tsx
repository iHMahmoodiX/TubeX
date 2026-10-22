// Simple 1280×720 thumbnail maker: background image or color plus large outlined text. Runs locally.
import { useEffect, useRef, useState } from 'react';
import { isRtlText } from '../../domain/text';
import { Button, Field } from '../../components/ui';
import { useI18n } from '../../i18n';

interface Opts {
  text: string;
  size: number;
  color: string;
  stroke: string;
  bg: string;
  position: 'top' | 'middle' | 'bottom';
  shade: boolean;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export async function drawThumbnail(canvas: HTMLCanvasElement, image: HTMLImageElement | null, o: Opts): Promise<void> {
  const W = 1280;
  const H = 720;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, W, H);
  if (image) {
    const s = Math.max(W / image.naturalWidth, H / image.naturalHeight);
    const w = image.naturalWidth * s;
    const h = image.naturalHeight * s;
    ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h);
  }
  if (!o.text.trim()) return;
  const font = `900 ${o.size}px "TubeX Estedad", sans-serif`;
  await document.fonts?.load(font).catch(() => undefined);
  ctx.font = font;
  ctx.direction = isRtlText(o.text) ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapLines(ctx, o.text.trim(), W - 120);
  const lh = o.size * 1.15;
  const total = lh * lines.length;
  const top = o.position === 'top' ? 60 : o.position === 'bottom' ? H - 60 - total : (H - total) / 2;
  if (o.shade) {
    const g = ctx.createLinearGradient(0, top - 40, 0, top + total + 40);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top - 40, W, total + 80);
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, o.size / 8);
  ctx.strokeStyle = o.stroke;
  ctx.fillStyle = o.color;
  lines.forEach((l, i) => {
    const y = top + lh * i + lh / 2;
    ctx.strokeText(l, W / 2, y);
    ctx.fillText(l, W / 2, y);
  });
}

export function ThumbnailMaker({ defaultText, onUse }: { defaultText: string; onUse: (img: { dataUrl: string; width: number; height: number }) => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [o, setO] = useState<Opts>({ text: defaultText, size: 120, color: '#ffffff', stroke: '#000000', bg: '#c2410c', position: 'bottom', shade: true });

  useEffect(() => {
    if (canvas.current) void drawThumbnail(canvas.current, image, o);
  }, [image, o]);

  const exportUrl = () => canvas.current!.toDataURL('image/jpeg', 0.92);
  return (
    <div className="stack-s" data-testid="thumb-maker">
      <Field label={t('maker.background')}>
        {({ id }) => (
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const url = URL.createObjectURL(f);
              const img = new Image();
              img.onload = () => setImage(img);
              img.src = url;
            }}
          />
        )}
      </Field>
      <Field label={t('maker.text')}>
        {({ id }) => <textarea id={id} className="textarea" rows={2} dir="auto" value={o.text} onChange={(e) => setO({ ...o, text: e.target.value })} />}
      </Field>
      <div className="row">
        <Field label={t('maker.size')}>
          {({ id }) => <input id={id} type="range" min={48} max={220} value={o.size} onChange={(e) => setO({ ...o, size: Number(e.target.value) })} />}
        </Field>
        <Field label={t('maker.color')}>{({ id }) => <input id={id} type="color" value={o.color} onChange={(e) => setO({ ...o, color: e.target.value })} />}</Field>
        <Field label={t('maker.stroke')}>{({ id }) => <input id={id} type="color" value={o.stroke} onChange={(e) => setO({ ...o, stroke: e.target.value })} />}</Field>
        <Field label={t('maker.bg')}>{({ id }) => <input id={id} type="color" value={o.bg} onChange={(e) => setO({ ...o, bg: e.target.value })} />}</Field>
        <Field label={t('maker.position')}>
          {({ id }) => (
            <select id={id} className="select" value={o.position} onChange={(e) => setO({ ...o, position: e.target.value as Opts['position'] })}>
              <option value="top">{t('maker.top')}</option>
              <option value="middle">{t('maker.middle')}</option>
              <option value="bottom">{t('maker.bottom')}</option>
            </select>
          )}
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={o.shade} onChange={(e) => setO({ ...o, shade: e.target.checked })} />
        <span>{t('maker.shade')}</span>
      </label>
      <canvas ref={canvas} style={{ width: '100%', maxWidth: 480, aspectRatio: '16 / 9', borderRadius: 8, border: '1px solid var(--border)' }} aria-label={t('maker.preview')} role="img" />
      <div className="row">
        <Button size="s" onClick={() => onUse({ dataUrl: exportUrl(), width: 1280, height: 720 })}>
          {t('maker.use')}
        </Button>
        <Button
          size="s"
          variant="primary"
          onClick={() => {
            const a = document.createElement('a');
            a.href = canvas.current!.toDataURL('image/png');
            a.download = 'tubex-thumbnail.png';
            a.click();
          }}
        >
          {t('maker.download')}
        </Button>
      </div>
    </div>
  );
}
