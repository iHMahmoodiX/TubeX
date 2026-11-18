// Audience retention line chart in pixel units (re-measured on resize so labels stay readable on phones).
// One or two series over the video's position (0–100 %), with drop markers for the first series.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { mmss, type Drop, type RetentionPoint } from '../../domain/reportsRetention';
import { useI18n } from '../../i18n';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    setW(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function RetentionChart({
  series,
  durationSec,
  drops = [],
  label,
  timeAxis,
}: {
  series: { points: RetentionPoint[]; name: string }[];
  /** Duration of the first series; used for the time axis when `timeAxis` is true. */
  durationSec: number;
  drops?: Drop[];
  label: string;
  timeAxis: boolean;
}) {
  const { lang } = useI18n();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 240;
  const pad = { s: 40, e: 12, t: 12, b: 28 };
  const rtl = lang === 'fa';
  const innerW = width - pad.s - pad.e;
  const innerH = H - pad.t - pad.b;
  const yMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.watch)));
  const top = Math.ceil(yMax * 4) / 4;
  // Charts read left to right in both languages (time flows forward), like YouTube Studio's own charts.
  const x = (r: number) => pad.s + r * innerW;
  const y = (v: number) => pad.t + innerH - (Math.min(v, top) / top) * innerH;
  const path = (pts: RetentionPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ratio).toFixed(1)},${y(p.watch).toFixed(1)}`).join(' ');
  const pct = new Intl.NumberFormat(rtl ? 'fa-IR' : 'en-US', { style: 'percent', maximumFractionDigits: 0 });
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const yTicks = Array.from({ length: Math.round(top / 0.25) + 1 }, (_, i) => i * 0.25).filter((v) => v <= top + 1e-9);
  const near = (pts: RetentionPoint[], r: number) => pts.reduce((b, p) => (Math.abs(p.ratio - r) < Math.abs(b.ratio - r) ? p : b), pts[0]!);
  const tip: ReactNode =
    hover !== null && series[0]?.points.length ? (
      <div className="small muted" aria-live="polite" style={{ minHeight: 20 }}>
        <span className="ltr">{timeAxis ? mmss(hover * durationSec) : pct.format(hover)}</span>
        {series.map((s, i) => (
          <span key={i} style={{ marginInlineStart: 12 }}>
            <bdi>{s.name}</bdi>: <b className="num-t">{pct.format(near(s.points, hover).watch)}</b>
          </span>
        ))}
      </div>
    ) : (
      <div style={{ minHeight: 20 }} />
    );

  return (
    <div ref={ref} className="stack-s" dir="ltr">
      <svg
        className="rp-chart"
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={label}
        onMouseMove={(e) => {
          const r = (e.clientX - e.currentTarget.getBoundingClientRect().left - pad.s) / innerW;
          setHover(r < 0 || r > 1 ? null : r);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={pad.s} x2={width - pad.e} y1={y(v)} y2={y(v)} />
            <text className="axis" x={pad.s - 6} y={y(v) + 4} textAnchor="end">
              {pct.format(v)}
            </text>
          </g>
        ))}
        {ticks.map((r) => (
          <text key={r} className="axis" x={x(r)} y={H - 8} textAnchor={r === 0 ? 'start' : r === 1 ? 'end' : 'middle'}>
            {timeAxis ? mmss(r * durationSec) : pct.format(r)}
          </text>
        ))}
        {series[0] && series[0].points.length > 1 && (
          <path className="s0a" d={`${path(series[0].points)} L${x(series[0].points[series[0].points.length - 1]!.ratio)},${y(0)} L${x(series[0].points[0]!.ratio)},${y(0)} Z`} />
        )}
        {series[1] && <path className="s1" d={path(series[1].points)} />}
        {series[0] && <path className="s0" d={path(series[0].points)} />}
        {drops.map((d, i) => (
          <g key={i}>
            <line className="drop-line" x1={x(d.ratio)} x2={x(d.ratio)} y1={pad.t} y2={pad.t + innerH} />
            <circle className="drop" cx={x(d.ratio)} cy={y(d.from)} r={5}>
              <title>{`${mmss(d.seconds)} −${pct.format(d.drop)}`}</title>
            </circle>
            <text className="axis" x={x(d.ratio) + 7} y={pad.t + 12}>
              {i + 1}
            </text>
          </g>
        ))}
        {hover !== null && <line className="hover-line" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + innerH} />}
      </svg>
      <div dir={rtl ? 'rtl' : 'ltr'}>{tip}</div>
    </div>
  );
}
