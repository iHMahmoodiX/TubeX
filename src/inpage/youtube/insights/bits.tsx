// Small shared pieces for the channel page sections: signed percent, growth chips, copy buttons, kind badges,
// calendar parts for the UI language (Persian calendar in Persian), day-group labels.
import { useMemo, type ReactNode } from 'react';
import { Icon, type IconName } from '../../../components/icons';
import { Button } from '../../../components/ui';
import { useToast } from '../../../components/toasts';
import { gregorianParts, videoKind, type DateParts, type Growth, type VideoKind } from '../../../domain/channelInsights';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/en';
import { copyText, useFmt } from '../../common';

export function useCiFmt() {
  const f = useFmt();
  const { lang } = useI18n();
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  const extra = useMemo(() => {
    const pctF = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 0, signDisplay: 'exceptZero' });
    const ratioF = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const ratioSmallF = new Intl.NumberFormat(locale, { maximumSignificantDigits: 2 });
    const signedF = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: 'exceptZero' });
    const cal = lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB';
    const dayF = new Intl.DateTimeFormat(cal, { day: 'numeric', month: 'short' });
    const dateF = new Intl.DateTimeFormat(cal, { day: 'numeric', month: 'short', year: 'numeric' });
    const monthF = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US', { month: 'long', year: 'numeric' });
    const weekdayF = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { weekday: 'long' });
    const narrowF = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { weekday: 'narrow' });
    const timeF = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    const sdate = (d: Date | string | number) => {
      const x = new Date(d);
      return Number.isNaN(x.getTime()) ? '—' : dateF.format(x);
    };
    return {
      /** Signed percent, already in percent units (e.g. 1.25 → "+1.25%"). */
      spct: (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '—' : `${pctF.format(n)}%`),
      ratio: (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '—' : `${(n < 1 ? ratioSmallF : ratioF).format(n)}×`),
      /** Signed plain number (e.g. percentage points). */
      snum: (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '—' : signedF.format(n)),
      day: (d: Date | string | number) => dayF.format(new Date(d)),
      sdate,
      month: (d: Date) => monthF.format(d),
      weekday: (d: Date) => weekdayF.format(d),
      narrowDay: (d: Date) => narrowF.format(d),
      time: (d: Date | string) => timeF.format(new Date(d)),
      weekStart: lang === 'fa' ? 6 : 0,
    };
  }, [lang, locale]);
  return { ...f, ...extra };
}

/** Calendar parts in the UI language's calendar (Persian calendar for Persian, Gregorian otherwise). */
export function useDateParts(): DateParts {
  const { lang } = useI18n();
  return useMemo(() => {
    if (lang !== 'fa') return gregorianParts;
    const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
    return (d: Date) => {
      const p = fmt.formatToParts(d);
      const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? NaN);
      const y = get('year');
      return { y: Number.isFinite(y) ? y : get('relatedYear'), m: get('month'), d: get('day') };
    };
  }, [lang]);
}

export const kindKey: Record<VideoKind, MessageKey> = { long: 'ci.kind.long', short: 'ci.kind.short', maybeShort: 'ci.kind.maybeShort', unknown: 'ci.kind.unknown' };

export function KindBadge({ durationSec }: { durationSec: number }) {
  const { t } = useI18n();
  const k = videoKind(durationSec);
  return (
    <span className="ci-kind" data-kind={k}>
      {t(kindKey[k])}
    </span>
  );
}

/** Day-group label: Today, Yesterday, weekday name within a week, else the date. */
export function useDayLabel() {
  const { t } = useI18n();
  const f = useCiFmt();
  return (daysAgo: number, date: Date) => (daysAgo <= 0 ? t('ci.feed.today') : daysAgo === 1 ? t('ci.feed.yesterday') : daysAgo < 7 ? f.weekday(date) : f.sdate(date));
}

/** A colored up/down chip for a difference in percentage points. */
export function DiffChip({ value, suffix }: { value: number | undefined; suffix?: string }) {
  const f = useCiFmt();
  if (value === undefined || !Number.isFinite(value)) return <span className="ci-chip">—</span>;
  const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return (
    <span className="ci-chip" data-tone={tone}>
      <svg viewBox="0 0 12 12" aria-hidden="true" className="ci-chip-arrow">
        {tone === 'flat' ? <path d="M2 6h8" /> : <path d={tone === 'up' ? 'M6 10V2M2.5 5.5 6 2l3.5 3.5' : 'M6 2v8M2.5 6.5 6 10l3.5-3.5'} />}
      </svg>
      <span className="num-t">
        {f.snum(value)}
        {suffix}
      </span>
    </span>
  );
}

/** Growth value with its measured span, or the honest reason there is none. */
export function GrowthText({ g, metric }: { g: Growth | undefined; metric: 'views' | 'subs' }) {
  const { t } = useI18n();
  const f = useCiFmt();
  if (!g || g.state === 'none') return <span className="muted">—</span>;
  if (g.state === 'tracking') return <span className="muted small">{t('ci.growth.trackingSince', { date: f.sdate(g.since) })}</span>;
  const d = g[metric];
  if (!d) return <span className="muted">—</span>;
  return (
    <span className="ci-growth">
      <b className="num-t">{d.pct === undefined ? '—' : f.spct(d.pct)}</b>
      <span className="xsmall muted">{g.source === 'analytics' ? t('ci.growth.analytics30') : t('ci.growth.overDays', { n: Math.max(1, Math.round(g.spanDays)) })}</span>
    </span>
  );
}

export function CopyButton({ text, label, done, icon = 'copy' }: { text: string; label: string; done?: string; icon?: IconName }) {
  const toast = useToast();
  const { t } = useI18n();
  return (
    <Button size="s" variant="ghost" onClick={async () => toast((await copyText(text)) ? (done ?? t('ci.copied')) : t('ci.copyFailed'))}>
      <Icon name={icon} />
      {label}
    </Button>
  );
}

/** A titled block inside the insights panel. */
export function Section({ title, desc, icon, children, actions, id }: { title: string; desc?: ReactNode; icon?: IconName; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section className="ci-sec" aria-labelledby={id}>
      <div className="ci-sec-head">
        {icon && (
          <span className="ci-sec-icon" aria-hidden="true">
            <Icon name={icon} />
          </span>
        )}
        <div className="grow">
          <h3 id={id}>{title}</h3>
          {desc && <p className="small muted">{desc}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** "About N units" line shown before a heavier load. */
export function CostNote({ units, children }: { units: number; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <p className="xsmall muted ci-cost">
      <Icon name="info" />
      <span>
        {children}
        {children ? ' ' : ''}
        {t('ci.cost.units', { n: units })}
      </span>
    </p>
  );
}
