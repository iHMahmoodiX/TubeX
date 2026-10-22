// Shared pieces for the engage area pages (bulk edit, comments, playlists, schedule, thumbnails, shorts):
// signed-in channel, own uploads, video picker track list, write progress, cost labels and URL tabs.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { RunProgress } from '../../domain/engageRun';
import { matchesQuery } from '../../domain/text';
import { Icon, type IconName } from '../../components/icons';
import { Button, Empty, Meter, Notice, SearchInput, Skeleton, Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { AuthError } from '../../integrations/google/auth';
import { ownVideos, type OwnVideo } from '../../integrations/google/own';
import { YtError } from '../../integrations/youtube/client';
import { ErrorNotice } from '../connections/ErrorNotice';
import { ReconnectButton } from '../connections/Reconnect';
import { useGoogle } from '../connections/useConnections';
import { useAsync, useFormat } from '../research/shared';
import './engage.css';

export function useOwnChannel() {
  const g = useGoogle();
  const channel = g.channels.find((c) => c.channelId === g.activeChannelId);
  return { channel, loaded: g.loaded };
}

/** The signed-in channel's uploads (cached 30 minutes by ownVideos). */
export function useOwnUploads(enabled = true) {
  const { channel } = useOwnChannel();
  const load = useCallback(
    (fresh: boolean) => (channel?.uploadsPlaylistId ? ownVideos(channel.channelId, channel.uploadsPlaylistId, 500, fresh) : Promise.resolve([] as OwnVideo[])),
    [channel?.channelId, channel?.uploadsPlaylistId],
  );
  const st = useAsync(load);
  useEffect(() => {
    if (enabled && channel) void st.run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channel?.channelId]);
  return { videos: st.data, loading: st.loading, error: st.error, refresh: () => st.run(true) };
}

/** Errors after which the next writes would fail too: stop the batch. */
export function isFatal(e: unknown): boolean {
  return e instanceof AuthError || (e instanceof YtError && ['quota', 'budget', 'permission', 'unreachable'].includes(e.code));
}

/** Signed-out state: says why sign-in is needed, signs in right here, and links to Settings. */
export function SignInEmpty({ icon, why }: { icon: IconName; why: MessageKey }) {
  const { t } = useI18n();
  return (
    <Empty
      icon={icon}
      title={t('engage.signIn.title')}
      action={
        <span className="row" style={{ justifyContent: 'center' }}>
          <ReconnectButton />
          <a className="btn btn-s" href="#settings">
            {t('conn.openSettings')}
          </a>
        </span>
      }
    >
      {t(why)}
    </Empty>
  );
}

/** Quota badge, e.g. "≈ 150 units". */
export function Cost({ units, label }: { units: number; label?: string }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <span className="badge badge-info" title={t('engage.cost.help')}>
      <Icon name="pulse" />
      {label ?? t('engage.cost.units', { n: f.int(units) })}
    </span>
  );
}

/** Progress of a sequential write batch, with Stop and the errors. */
export function RunStatus<T>({ p, name, onStop, doneText }: { p: RunProgress<T> | null; name: (item: T) => string; onStop?: () => void; doneText?: string }) {
  const { t } = useI18n();
  const f = useFormat();
  if (!p) return null;
  const running = p.done < p.total && !p.stopped && !p.aborted;
  const tone = p.stopped || p.failed.length ? 'warning' : running ? 'info' : 'success';
  return (
    <Notice tone={tone}>
      <div className="row-between">
        <p role="status" className="bold">
          {running
            ? t('engage.run.progress', { done: f.int(p.done), total: f.int(p.total) })
            : p.aborted
              ? t('engage.run.aborted', { ok: f.int(p.ok.length), total: f.int(p.total) })
              : (doneText ?? t('engage.run.done', { ok: f.int(p.ok.length), failed: f.int(p.failed.length) }))}
        </p>
        {running && onStop && (
          <Button size="s" onClick={onStop}>
            {t('engage.run.stop')}
          </Button>
        )}
      </div>
      <Meter value={p.total ? (p.done / p.total) * 100 : 0} tone={p.failed.length ? 'warning' : undefined} label={t('engage.run.meter')} />
      {p.failed.slice(0, 4).map((x, i) => (
        <div key={i} className="stack-s">
          <bdi className="small bold">{name(x.item)}</bdi>
          <ErrorNotice error={x.error} />
        </div>
      ))}
      {!!p.stopped && <p className="small">{t('engage.run.stopped')}</p>}
    </Notice>
  );
}

export type PrivacyFilter = 'all' | 'public' | 'unlisted' | 'private';

/**
 * Track list of the channel's videos with search, visibility chips and checkboxes. `single` makes it a
 * one-choice list (radio semantics).
 */
export function VideoPicker({
  videos,
  selected,
  onChange,
  single,
  allow,
  privacy: initialPrivacy = 'all',
  limit = 60,
  extra,
  label,
}: {
  videos: OwnVideo[] | undefined;
  selected: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
  /** Videos that cannot be chosen show the reason instead of a checkbox. */
  allow?: (v: OwnVideo) => MessageKey | null;
  privacy?: PrivacyFilter;
  limit?: number;
  extra?: (v: OwnVideo) => ReactNode;
  label: string;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const [q, setQ] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyFilter>(initialPrivacy);
  const [shown, setShown] = useState(limit);
  const list = useMemo(() => (videos ?? []).filter((v) => (privacy === 'all' || v.privacy === privacy) && (!q.trim() || matchesQuery(`${v.title}\n${v.tags.join(' ')}`, q))), [videos, privacy, q]);
  const [open, setOpen] = useState(false);
  if (!videos) return <Skeleton lines={5} />;
  const sel = new Set(selected);
  const one = single && !open ? videos.find((v) => v.id === selected[0]) : undefined;
  if (one)
    return (
      <div className="track engage-pick" data-selected="true" role="group" aria-label={label}>
        <span className="track-n">
          <Icon name="check" />
        </span>
        <span className="track-main">
          <Thumb videoId={one.id} src={one.thumbnail} />
          <span className="stack-s grow" style={{ gap: 0, minWidth: 0 }}>
            <span className="track-title truncate" dir="auto">
              {one.title}
            </span>
            <span className="track-sub truncate">
              {one.privacy ? t(`mc.privacy.${one.privacy}` as MessageKey) : '—'} · {f.age(one.publishedAt)}
            </span>
          </span>
        </span>
        <span className="track-end">
          <Button size="s" onClick={() => setOpen(true)}>
            {t('engage.picker.change')}
          </Button>
        </span>
      </div>
    );
  const selectable = list.filter((v) => !allow?.(v));
  const toggle = (id: string, on: boolean) => {
    if (single) {
      setOpen(false);
      return onChange(on ? [id] : []);
    }
    const n = new Set(sel);
    if (on) n.add(id);
    else n.delete(id);
    onChange([...n]);
  };
  const counts = { all: videos.length, public: 0, unlisted: 0, private: 0 } as Record<PrivacyFilter, number>;
  for (const v of videos) if (v.privacy in counts) counts[v.privacy as PrivacyFilter]++;
  return (
    <div className="stack" role="group" aria-label={label}>
      <div className="row">
        <div className="grow" style={{ minWidth: 200, maxWidth: 360 }}>
          <SearchInput value={q} onChange={setQ} label={t('engage.picker.search')} placeholder={t('engage.picker.search')} />
        </div>
        <div className="chips" role="group" aria-label={t('mc.privacy')}>
          {(['all', 'public', 'unlisted', 'private'] as PrivacyFilter[]).filter((p) => p === 'all' || counts[p] > 0 || privacy === p).map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={privacy === p} onClick={() => setPrivacy(p)}>
              {p === 'all' ? t('engage.picker.all') : t(`mc.privacy.${p}` as MessageKey)}
              <small className="num-t">{f.int(counts[p])}</small>
            </button>
          ))}
        </div>
        {!single && (
          <div className="row">
            <Button size="s" variant="ghost" disabled={!selectable.length} onClick={() => onChange([...new Set([...selected, ...selectable.map((v) => v.id)])])}>
              {t('engage.picker.selectShown', { n: f.int(selectable.length) })}
            </Button>
            <Button size="s" variant="ghost" disabled={!selected.length} onClick={() => onChange([])}>
              {t('engage.picker.clear')}
            </Button>
          </div>
        )}
      </div>
      {list.length === 0 ? (
        <Empty icon="video" title={t('engage.picker.none')} />
      ) : (
        <div className="tracks engage-pick-list" role={single ? 'radiogroup' : undefined} aria-label={label}>
          {list.slice(0, shown).map((v, i) => {
            const why = allow?.(v) ?? null;
            const on = sel.has(v.id);
            return (
              <label key={v.id} className="track engage-pick" data-selected={on} data-disabled={!!why}>
                <span className="track-n">
                  <input type={single ? 'radio' : 'checkbox'} name={single ? `pick-${label}` : undefined} checked={on} disabled={!!why} onChange={(e) => toggle(v.id, e.target.checked)} aria-label={v.title} />
                  <span className="engage-idx" aria-hidden="true">
                    {f.int(i + 1)}
                  </span>
                </span>
                <span className="track-main">
                  <Thumb videoId={v.id} src={v.thumbnail} />
                  <span className="stack-s grow" style={{ gap: 0, minWidth: 0 }}>
                    <span className="track-title truncate" dir="auto">
                      {v.title}
                    </span>
                    <span className="track-sub truncate">
                      <span className={`engage-privacy engage-privacy-${v.privacy}`}>{v.privacy ? t(`mc.privacy.${v.privacy}` as MessageKey) : '—'}</span>
                      {' · '}
                      {f.age(v.publishedAt)}
                      {why && <> · {t(why)}</>}
                    </span>
                  </span>
                </span>
                <span className="track-end small">
                  {extra?.(v)}
                  <span title={t('yt.col.views')}>{f.compact(v.views)}</span>
                </span>
              </label>
            );
          })}
          {list.length > shown && (
            <div className="row" style={{ justifyContent: 'center', paddingBlock: 8 }}>
              <Button size="s" onClick={() => setShown((n) => n + limit)}>
                {t('engage.picker.more', { n: f.int(list.length - shown) })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Tab kept in the URL (#route/tab) without a hashchange, so switching tabs does not move focus. */
export function useUrlTab<T extends string>(route: string, tabs: readonly T[], initial: string | undefined, fallback: T): [T, (t: T) => void] {
  const fromHash = () => {
    const [r, sub] = location.hash.replace(/^#/, '').split('/');
    return r === route ? sub : undefined;
  };
  const pick = (v: string | undefined) => (tabs as readonly string[]).includes(v ?? '') ? (v as T) : undefined;
  const [tab, setTab] = useState<T>(() => pick(initial) ?? pick(fromHash()) ?? fallback);
  useEffect(() => {
    const v = pick(initial);
    if (v) setTab(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const set = (v: T) => {
    setTab(v);
    try {
      history.replaceState(history.state, '', `#${route}/${v}`);
    } catch {
      /* not critical */
    }
  };
  return [tab, set];
}

/** Numbered step header of a guided flow. */
export function Step({ n, title, sub, done, children, actions }: { n: number; title: string; sub?: ReactNode; done?: boolean; children?: ReactNode; actions?: ReactNode }) {
  const f = useFormat();
  return (
    <section className="engage-step" data-done={done ? 'true' : undefined}>
      <div className="engage-step-head">
        <span className="engage-step-n" aria-hidden="true">
          {done ? <Icon name="check" /> : f.int(n)}
        </span>
        <div className="stack-s grow" style={{ gap: 2 }}>
          <h2>{title}</h2>
          {sub && <div className="small muted">{sub}</div>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
      {children && <div className="engage-step-body stack">{children}</div>}
    </section>
  );
}

/** Before → after lines for a text field. */
export function DiffLines({ label, before, after }: { label: string; before: string; after: string }) {
  const { t } = useI18n();
  return (
    <div className="engage-diff">
      <span className="xsmall muted bold">{label}</span>
      <del dir="auto">{before || t('engage.diff.empty')}</del>
      <ins dir="auto">{after || t('engage.diff.empty')}</ins>
    </div>
  );
}
