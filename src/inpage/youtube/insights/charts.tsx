// Dependency-free charts for the channel page: a time chart (line or dots) with labelled axes and an optional
// reference line ("You"), and the performance distribution dot strip. Geometry is in percent so the chart follows
// its container (strip or narrow drawer); text stays HTML so it never stretches.
import { useMemo } from 'react';
import type { PerfItem } from '../../../domain/channelInsights';
import { useCiFmt } from './bits';

export interface TimePoint {
  t: number;
  y: number;
  label?: string;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function TimeChart({ points, mode, label, refLine, zeroBase = true }: { points: TimePoint[]; mode: 'line' | 'dots'; label: string; refLine?: { y: number; label: string }; zeroBase?: boolean }) {
  const f = useCiFmt();
  const geo = useMemo(() => {
    const ts = points.map((p) => p.t);
    const ys = points.map((p) => p.y);
    if (refLine) ys.push(refLine.y);
    const minT = Math.min(...ts);
    const maxT = Math.max(...ts);
    const rawMin = zeroBase ? 0 : Math.min(...ys);
    const rawMax = Math.max(...ys);
    const pad = zeroBase ? 0 : (rawMax - rawMin) * 0.1 || Math.abs(rawMax) * 0.01 || 1;
    const lo = zeroBase ? 0 : rawMin - pad;
    const hi = zeroBase ? niceMax(rawMax) : rawMax + pad;
    const x = (t: number) => (maxT === minT ? 50 : ((t - minT) / (maxT - minT)) * 100);
    const y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 100;
    const ticks = maxT === minT ? [minT] : [0, 0.25, 0.5, 0.75, 1].map((k) => minT + k * (maxT - minT));
    return { x, y, lo, hi, ticks };
  }, [points, refLine, zeroBase]);
  if (!points.length) return null;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${geo.x(p.t).toFixed(2)},${geo.y(p.y).toFixed(2)}`).join(' ');
  return (
    <figure className="ci-chart" role="img" aria-label={label} dir="ltr">
      <div className="ci-chart-y" aria-hidden="true">
        <span>{f.compact(geo.hi)}</span>
        <span>{f.compact((geo.hi + geo.lo) / 2)}</span>
        <span>{f.compact(geo.lo)}</span>
      </div>
      <div className="ci-chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[0, 50, 100].map((g) => (
            <line key={g} x1="0" x2="100" y1={g} y2={g} className="ci-gridline" vectorEffect="non-scaling-stroke" />
          ))}
          {refLine && <line x1="0" x2="100" y1={geo.y(refLine.y)} y2={geo.y(refLine.y)} className="ci-ref" vectorEffect="non-scaling-stroke" />}
          {mode === 'line' && <path d={d} className="ci-line" vectorEffect="non-scaling-stroke" />}
        </svg>
        {points.map((p, i) => (
          <span
            key={i}
            className={mode === 'dots' ? 'ci-dot' : 'ci-dot ci-dot-s'}
            style={{ insetInlineStart: `${geo.x(p.t)}%`, insetBlockStart: `${geo.y(p.y)}%` }}
            title={`${p.label ? `${p.label} · ` : ''}${f.day(p.t)}: ${f.int(p.y)}`}
           
          />
        ))}
        {refLine && (
          <span className="ci-ref-label" style={{ insetBlockStart: `${geo.y(refLine.y)}%` }}>
            {refLine.label}
          </span>
        )}
      </div>
      <div className="ci-chart-x" aria-hidden="true">
        {geo.ticks.map((t, i) => (
          <span key={i}>{f.day(t)}</span>
        ))}
      </div>
    </figure>
  );
}

/** Stable pseudo-random vertical jitter for a video id (0–1). */
const jitter = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};

/**
 * Every judged video as a dot on a log scale of views ÷ the channel's median, with the percentile band behind it.
 * The median (1×) is marked; band edges are the 75th/85th/95th percentile ratios of this channel.
 */
export function DistributionPlot({ items, label, edges }: { items: PerfItem[]; label: string; edges: { p50: string; p75: number; p85: number; p95: number } }) {
  const f = useCiFmt();
  const geo = useMemo(() => {
    const rs = items.map((i) => i.ratio).filter((r) => Number.isFinite(r) && r > 0);
    const lo = Math.log10(Math.min(0.1, ...rs));
    const hi = Math.log10(Math.max(10, ...rs));
    const x = (r: number) => ((Math.log10(Math.max(r, 10 ** lo)) - lo) / (hi - lo)) * 100;
    const ticks = [0.1, 0.25, 0.5, 1, 2, 4, 10, 25, 100].filter((t) => Math.log10(t) >= lo - 1e-9 && Math.log10(t) <= hi + 1e-9);
    return { x, ticks };
  }, [items]);
  return (
    <figure className="ci-dist" role="img" aria-label={label}>
      <div className="ci-dist-plot" dir="ltr">
        <span className="ci-band" data-band="uncommon" style={{ insetInlineStart: `${geo.x(edges.p75)}%`, width: `${geo.x(edges.p85) - geo.x(edges.p75)}%` }} />
        <span className="ci-band" data-band="rare" style={{ insetInlineStart: `${geo.x(edges.p85)}%`, width: `${geo.x(edges.p95) - geo.x(edges.p85)}%` }} />
        <span className="ci-band" data-band="veryRare" style={{ insetInlineStart: `${geo.x(edges.p95)}%`, insetInlineEnd: 0 }} />
        <span className="ci-median" style={{ insetInlineStart: `${geo.x(1)}%` }}>
          <i>{edges.p50}</i>
        </span>
        {items.map((it) => (
          <span
            key={it.video.id}
            className="ci-pdot"
            data-band={it.band}
            data-flop={it.flop || undefined}
            style={{ insetInlineStart: `${geo.x(it.ratio)}%`, insetBlockStart: `${12 + jitter(it.video.id) * 70}%` }}
            title={`${it.video.title} · ${f.ratio(it.ratio)} · P${Math.round(it.percentile)}`}
          />
        ))}
      </div>
      <div className="ci-dist-x" dir="ltr" aria-hidden="true">
        {geo.ticks.map((t) => (
          <span key={t} style={{ insetInlineStart: `${geo.x(t)}%` }}>
            {f.ratio(t)}
          </span>
        ))}
      </div>
    </figure>
  );
}
