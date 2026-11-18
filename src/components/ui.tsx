import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type React from 'react';
import { useI18n } from '../i18n';
import { Icon, type IconName } from './icons';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'default',
  size,
  block,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 's'; block?: boolean }) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={cls} {...rest} />;
}

/** Labelled field. `children` receives the generated id and describedby ids. */
export function Field({
  label,
  help,
  counter,
  over,
  children,
}: {
  label: string;
  help?: string;
  counter?: string;
  over?: boolean;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const counterId = counter ? `${id}-counter` : undefined;
  const describedBy = [helpId, counterId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <div className="field-head">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {counter && (
          <span id={counterId} className="counter" data-over={over ? 'true' : 'false'}>
            {counter}
          </span>
        )}
      </div>
      {children({ id, describedBy })}
      {help && (
        <span id={helpId} className="field-help">
          {help}
        </span>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  const icon = ({ info: 'info', warning: 'alert', error: 'alert', success: 'check' } as const)[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="notice-icon">
        <Icon name={icon} />
      </span>
      <div className="grow stack-s">{children}</div>
    </div>
  );
}

export function Empty({ children, icon, title, action }: { children?: ReactNode; icon?: IconName; title?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <Icon name={icon} />}
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** Two-step inline confirmation for consequential actions; no modal dialog. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  danger = true,
  size,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  size?: 's';
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button variant={danger ? 'danger' : 'default'} size={size} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  return (
    <div className="notice notice-warning" role="group" aria-label={label}>
      <div className="grow stack-s">
        <p>{question}</p>
        <div className="row">
          <Button
            className={danger ? 'btn-danger-solid' : ''}
            variant={danger ? 'default' : 'primary'}
            size={size}
            autoFocus
            onClick={async () => {
              setAsking(false);
              await onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
          <Button size={size} onClick={() => setAsking(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function IconButton({ icon, label, pressed, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; pressed?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/** Large page title over the content-tinted hero, with optional artwork (avatar or thumbnail) and actions. */
export function PageHeader({ kicker, title, desc, art, actions }: { kicker?: string; title: string; desc?: ReactNode; art?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="stack">
      <div className="page-head">
        {art}
        <div className="stack-s grow">
          {kicker && <span className="page-kicker">{kicker}</span>}
          <h1>{title}</h1>
          {desc && <div className="page-desc">{desc}</div>}
        </div>
      </div>
      {actions && <div className="action-bar">{actions}</div>}
    </header>
  );
}

export function Card({ title, sub, actions, children, className = '', ...rest }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string } & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(title || actions) && (
        <div className="card-head">
          <div className="stack-s grow" style={{ gap: 2 }}>
            {title && <h2>{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Pill tabs (role=tablist). Arrow keys move between tabs. */
export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon?: IconName; count?: number }[]; label: string }) {
  return (
    <div
      className="tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const i = items.findIndex((x) => x.id === value);
        const rtl = document.documentElement.dir === 'rtl';
        const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
        const next = items[(i + step + items.length) % items.length];
        if (next) onChange(next.id);
        requestAnimationFrame(() => (e.currentTarget.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus());
      }}
    >
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={it.id === value} tabIndex={it.id === value ? 0 : -1} onClick={() => onChange(it.id)}>
          {it.icon && <Icon name={it.icon} />}
          {it.label}
          {it.count !== undefined && <small className="faint num-t">{it.count}</small>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, delta, hint }: { label: string; value: ReactNode; delta?: { text: string; good: boolean | null }; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <span>{label}</span>
      <b>{value}</b>
      {delta && <small className={delta.good === null ? 'faint' : delta.good ? 'pos' : 'neg'}>{delta.text}</small>}
    </div>
  );
}

/** 0–100 score in a ring. `null` renders a dash: a missing score is never shown as zero. */
export function Score({ value, large, label }: { value: number | null; large?: boolean; label: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  const color = value === null ? 'var(--surface-3)' : v >= 70 ? 'var(--accent)' : v >= 40 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className={`score ${large ? 'score-l' : ''}`} style={{ ['--v' as string]: v, ['--c' as string]: color }} role="img" aria-label={`${label}: ${value === null ? '—' : v}`}>
      <b>{value === null ? '—' : v}</b>
    </div>
  );
}

export function Meter({ value, tone, label }: { value: number; tone?: 'warning' | 'danger' | 'muted'; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="meter" data-tone={tone} role={label ? 'meter' : undefined} aria-label={label} aria-valuenow={label ? Math.round(v) : undefined} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${v}%` }} />
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack-s" aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skel" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label, onEnter }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; onEnter?: () => void }) {
  return (
    <div className="search-wrap">
      <Icon name="search" />
      <input
        className="input"
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Avatar({ src, name, size }: { src?: string; name: string; size?: 'l' | 'xl' }) {
  const cls = `avatar ${size ? `avatar-${size}` : ''}`;
  if (src) return <img className={cls} src={src} alt="" referrerPolicy="no-referrer" />;
  return (
    <span className={cls} aria-hidden="true">
      {[...name.trim()][0]?.toUpperCase() ?? '?'}
    </span>
  );
}

export function Thumb({ videoId, src, width = 72 }: { videoId?: string; src?: string; width?: number }) {
  const url = src ?? (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : undefined);
  return url ? <img className="thumb" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width }} /> : <span className="thumb" style={{ width }} />;
}

/** Small dependency-free bar chart. Values that are null are drawn as gaps, not zero. */
export function BarChart({ values, labels, height = 120, label, highlight }: { values: (number | null)[]; labels?: string[]; height?: number; label: string; highlight?: number }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const w = 100 / Math.max(1, values.length);
  return (
    <svg className="chart" viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}>
      {values.map((v, i) =>
        v === null ? null : (
          <rect key={i} className="bar" data-hi={highlight === i ? 'true' : undefined} x={i * w + w * 0.12} width={w * 0.76} y={height / 3 - (v / max) * (height / 3)} height={(v / max) * (height / 3)} rx={0.6}>
            <title>{`${labels?.[i] ?? i + 1}: ${v.toLocaleString()}`}</title>
          </rect>
        ),
      )}
    </svg>
  );
}

/** Line chart for a series (e.g. audience retention). y in 0..yMax. */
export function LineChart({ points, yMax, height = 160, label, refLine }: { points: { x: number; y: number }[]; yMax?: number; height?: number; label: string; refLine?: number }) {
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const top = yMax ?? Math.max(...points.map((p) => p.y), 1);
  const H = 50;
  const px = (x: number) => ((x - minX) / Math.max(1e-9, maxX - minX)) * 100;
  const py = (y: number) => H - (Math.min(y, top) / top) * H;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(2)},${py(p.y).toFixed(2)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} className="grid" x1={0} x2={100} y1={H * f} y2={H * f} vectorEffect="non-scaling-stroke" />
      ))}
      {refLine !== undefined && <line x1={0} x2={100} y1={py(refLine)} y2={py(refLine)} stroke="var(--text-3)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
      <path className="area" d={`${d} L100,${H} L0,${H} Z`} />
      <path className="line" d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
