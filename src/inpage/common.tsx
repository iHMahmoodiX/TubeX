// Shared pieces for in-page islands: cached RPC, async state, number/age formatting, copy/download,
// per-key chrome.storage values, the TubeX mark, compact error notices and pill tabs.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { Icon, type IconName } from '../components/icons';
import { Button } from '../components/ui';
import { errorDetail, errorKey } from '../features/connections/useConnections';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { rpc } from '../platform/rpc';

// ---------------------------------------------------------------- RPC with a per-page memory cache

const memo = new Map<string, { at: number; p: Promise<unknown> }>();

/** Calls a background method once per key within `ttlMs`; failed calls are not cached. */
export function cachedRpc<T>(ttlMs: number, method: string, ...args: unknown[]): Promise<T> {
  const key = `${method}:${JSON.stringify(args)}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = rpc<T>(method, ...args);
  memo.set(key, { at: Date.now(), p });
  p.catch(() => memo.delete(key));
  if (memo.size > 300) memo.delete(memo.keys().next().value as string);
  return p;
}

export function forgetRpc(method: string) {
  for (const k of memo.keys()) if (k.startsWith(`${method}:`)) memo.delete(k);
}

/** True when the background does not know a method yet (a feature from another area not merged/installed). */
export function isUnknownMethod(e: unknown): boolean {
  return e instanceof Error && /unknown method/.test(e.message);
}

export interface Async<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/** Runs `fn` when `key` changes (null = idle). Results of stale keys are dropped. */
export function useAsync<T>(key: string | null, fn: () => Promise<T>): Async<T> {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: unknown; loading: boolean }>({ key: null, loading: false });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (key === null) return setState({ key, loading: false });
    let live = true;
    setState((s) => ({ key, loading: true, data: s.key === key ? s.data : undefined }));
    fnRef
      .current()
      .then((data) => live && setState({ key, data, loading: false }))
      .catch((error: unknown) => live && setState({ key, error, loading: false }));
    return () => {
      live = false;
    };
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export interface Status {
  hasKey: boolean;
  ai: boolean;
  channels: { channelId: string; title: string; handle: string; thumbnail?: string }[];
  activeChannelId?: string;
  ytUnits: number;
  dailyCap: number;
}

/** TubeX connection status (API key, Google channels, AI). Cached for a minute. */
export function useStatus(): Status | undefined {
  return useAsync('status', () => cachedRpc<Status>(60_000, 'status.get')).data;
}

/** True when public YouTube data can be read (an API key, or a signed-in Google channel). */
export const canReadYt = (s: Status | undefined) => !!s && (s.hasKey || s.channels.length > 0);

// ---------------------------------------------------------------- formatting

export function useFmt() {
  const { lang, t } = useI18n();
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  const compactF = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const intF = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pctF = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2, minimumFractionDigits: 1 });
  const unit = (u: 'hour' | 'day' | 'month' | 'year', n: number) => new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'long', maximumFractionDigits: 0 }).format(n);
  return {
    compact: (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '—' : compactF.format(n)),
    int: (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '—' : intF.format(n)),
    /** `n` is already in percent (e.g. 4.2 for 4.2%). */
    pct: (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '—' : pctF.format(n / 100)),
    num: (n: number, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n),
    /** Age like "3 days", "5 months". */
    age: (days: number | undefined) => {
      if (days === undefined) return '—';
      if (days < 1) return unit('hour', Math.max(1, Math.floor(days * 24)));
      if (days < 60) return unit('day', Math.floor(days));
      if (days < 730) return unit('month', Math.floor(days / 30.44));
      return unit('year', Math.floor(days / 365.25));
    },
    date: (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
    },
    t,
  };
}

// ---------------------------------------------------------------- clipboard and files

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;inset-block-start:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function downloadFile(name: string, text: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------------------------------------------------------------- small persisted values (chrome.storage.local)

/** A value in chrome.storage.local under `inpage.<key>`; `key` null = not loaded. */
export function useStored<T>(key: string | null, initial: T): [T, (v: T) => void, boolean] {
  const [v, setV] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const full = key ? `inpage.${key}` : null;
  useEffect(() => {
    setReady(false);
    if (!full) return;
    let live = true;
    void browser.storage.local
      .get(full)
      .then((got) => {
        if (!live) return;
        if (got[full] !== undefined) setV(got[full] as T);
        else setV(initial);
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);
  const set = useCallback(
    (next: T) => {
      setV(next);
      if (full) void browser.storage.local.set({ [full]: next }).catch(() => {});
    },
    [full],
  );
  return [v, set, ready];
}

// ---------------------------------------------------------------- UI bits

/** The green TubeX mark used at the start of every island. */
export function Mark({ children }: { children?: ReactNode }) {
  return (
    <span className="tx-mark">
      <i aria-hidden="true">
        <Icon name="logo" />
      </i>
      TubeX
      {children}
    </span>
  );
}

/** Compact error line for islands. Unknown methods (feature not installed yet) get their own sentence. */
export function InError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  if (!error) return null;
  const unknown = isUnknownMethod(error);
  const key: MessageKey = unknown ? 'inpage.notAvailable' : errorKey(error);
  const detail = unknown ? undefined : errorDetail(error);
  const setup = /no-key|permission|bad-key|budget|disabled|unauthorized|not signed in|expired|no-channel/.test(`${(error as { code?: string }).code ?? ''} ${(error as Error).message ?? ''}`);
  return (
    <div className="tx-err" role="alert">
      <Icon name="alert" />
      <div className="grow">
        <p>{key === 'error.generic' && /not signed in/.test((error as Error).message ?? '') ? t('inpage.signInNeeded') : t(key)}</p>
        {detail && (
          <p className="xsmall faint mono" dir="ltr">
            {detail}
          </p>
        )}
      </div>
      {setup && (
        <Button size="s" onClick={() => void rpc('ui.openWorkspace', 'settings')}>
          {t('conn.openSettings')}
        </Button>
      )}
      {onRetry && !setup && (
        <Button size="s" variant="ghost" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

/** Shown when no API key and no Google channel: public data cannot be read. */
export function SetupNeeded() {
  const { t } = useI18n();
  return (
    <div className="tx-err tx-info">
      <Icon name="key" />
      <p className="grow">{t('inpage.setupNeeded')}</p>
      <Button size="s" onClick={() => void rpc('ui.openWorkspace', 'settings')}>
        {t('conn.openSettings')}
      </Button>
    </div>
  );
}

/** Pill tabs with arrow keys that follow the island's own direction (YouTube's page may be LTR). */
export function InTabs<T extends string>({ value, onChange, items, label }: { value: T | null; onChange: (v: T) => void; items: { id: T; label: string; icon?: IconName; count?: number }[]; label: string }) {
  const f = useFmt();
  return (
    <div
      className="tabs tx-tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const i = Math.max(0, items.findIndex((x) => x.id === value));
        const rtl = (e.currentTarget.closest('[dir]') as HTMLElement | null)?.dir === 'rtl';
        let n = i;
        if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = items.length - 1;
        else n = (i + ((e.key === 'ArrowRight') !== rtl ? 1 : -1) + items.length) % items.length;
        const next = items[n];
        if (next) onChange(next.id);
        const list = e.currentTarget;
        requestAnimationFrame(() => (list.querySelectorAll('[role="tab"]')[n] as HTMLElement | undefined)?.focus());
      }}
    >
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={it.id === value} tabIndex={it.id === value || (value === null && it === items[0]) ? 0 : -1} onClick={() => onChange(it.id)}>
          {it.icon && <Icon name={it.icon} />}
          {it.label}
          {it.count !== undefined && <small className="faint num-t">{f.int(it.count)}</small>}
        </button>
      ))}
    </div>
  );
}

/** A labelled number in the compact header row. */
export function Metric({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <span className="tx-metric" title={hint} data-tone={tone}>
      <b className="num-t">{value}</b>
      <span>{label}</span>
    </span>
  );
}

export function CheckRow({ state, children, detail }: { state: 'ok' | 'warn' | 'fail' | 'skip'; children: ReactNode; detail?: ReactNode }) {
  const { t } = useI18n();
  const mark = { ok: '✓', warn: '!', fail: '×', skip: '–' }[state];
  const cls = { ok: 'sev-ok', warn: 'sev-warning', fail: 'sev-error', skip: 'sev-missing' }[state];
  const sr = { ok: t('checks.ok'), warn: t('checks.warning'), fail: t('checks.error'), skip: t('inpage.seo.skipped') }[state];
  return (
    <li className={cls}>
      <span className="check-mark" aria-hidden="true">
        {mark}
      </span>
      <span className="grow">
        <span className="sr-only">{sr}: </span>
        {children}
        {detail && <span className="xsmall muted tx-detail">{detail}</span>}
      </span>
    </li>
  );
}

/** Keeps keyboard events inside a host (so YouTube shortcuts do not fire while typing in our popovers). */
export function stopKeys(el: HTMLElement) {
  for (const type of ['keydown', 'keyup', 'keypress']) el.addEventListener(type, (e) => e.stopPropagation());
}
