import { useCallback, useState } from 'react';
import { compactNumber, daysSince, engagementRate, toCsv, viewsPerDay } from '../../domain/research';
import { useI18n } from '../../i18n';
import type { VideoInfo } from '../../integrations/youtube/api';

/** Runs one async loader at a time and keeps its result and error. */
export function useAsync<T, A extends unknown[]>(fn: (...args: A) => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: false });
  const run = useCallback(
    async (...args: A) => {
      setState((s) => ({ data: s.data, loading: true }));
      try {
        const data = await fn(...args);
        setState({ data, loading: false });
        return data;
      } catch (error) {
        setState((s) => ({ data: s.data, error, loading: false }));
        return undefined;
      }
    },
    [fn],
  );
  return { ...state, run, reset: () => setState({ loading: false }) };
}

export function useFormat() {
  const { lang } = useI18n();
  const int = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { style: 'percent', maximumFractionDigits: 1 });
  return {
    compact: (n: number | undefined) => compactNumber(n, lang),
    int: (n: number | undefined) => (n === undefined ? '—' : int.format(n)),
    pct: (n: number | undefined) => (n === undefined ? '—' : pct.format(n)),
    age: (iso: string) => {
      const d = daysSince(iso);
      return d < 1 ? int.format(Math.max(1, Math.round(d * 24))) + (lang === 'fa' ? ' ساعت' : 'h') : d < 60 ? int.format(Math.round(d)) + (lang === 'fa' ? ' روز' : 'd') : int.format(Math.round(d / 30)) + (lang === 'fa' ? ' ماه' : 'mo');
    },
    duration: (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + `:${String(s).padStart(2, '0')}`;
    },
  };
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function VideoTable({ videos, mine = [], showRank = true, newIds = [] }: { videos: VideoInfo[]; mine?: string[]; showRank?: boolean; newIds?: string[] }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {showRank && <th className="num">#</th>}
            <th>{t('yt.col.title')}</th>
            <th>{t('yt.col.channel')}</th>
            <th className="num">{t('yt.col.views')}</th>
            <th className="num">{t('yt.col.perDay')}</th>
            <th className="num">{t('yt.col.engagement')}</th>
            <th className="num">{t('yt.col.age')}</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((v, i) => (
            <tr key={v.id} data-mine={mine.includes(v.channelId) ? 'true' : undefined}>
              {showRank && <td className="num">{f.int(i + 1)}</td>}
              <td>
                <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer noopener" dir="auto">
                  {v.title}
                </a>
                {newIds.includes(v.id) && <span className="badge badge-accent" style={{ marginInlineStart: 6 }}>{t('comp.new')}</span>}
                <div className="small muted">{f.duration(v.durationSec)}</div>
              </td>
              <td dir="auto">
                <a href={`https://www.youtube.com/channel/${v.channelId}`} target="_blank" rel="noreferrer noopener">
                  {v.channelTitle}
                </a>
              </td>
              <td className="num">{f.compact(v.views)}</td>
              <td className="num">{f.compact(viewsPerDay(v))}</td>
              <td className="num">{f.pct(engagementRate(v))}</td>
              <td className="num">{f.age(v.publishedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TermChips({ items, onPick, label }: { items: { term: string; count: number }[]; onPick?: (term: string) => void; label: string }) {
  const f = useFormat();
  if (!items.length) return null;
  return (
    <div className="row" role="list" aria-label={label}>
      {items.map((x) => (
        <span role="listitem" key={x.term}>
          <button type="button" className="chip" onClick={() => onPick?.(x.term)}>
            <bdi>{x.term}</bdi> <small>{f.int(x.count)}</small>
          </button>
        </span>
      ))}
    </div>
  );
}

export function videosCsv(videos: VideoInfo[]): string {
  return toCsv([
    ['video_id', 'url', 'title', 'channel', 'published_at', 'duration_sec', 'views', 'views_per_day', 'likes', 'comments', 'tags', 'description'],
    ...videos.map((v) => [
      v.id,
      `https://www.youtube.com/watch?v=${v.id}`,
      v.title,
      v.channelTitle,
      v.publishedAt,
      v.durationSec,
      v.views,
      Math.round(viewsPerDay(v) ?? 0),
      v.likes,
      v.comments,
      v.tags.join(' | '),
      v.description,
    ]),
  ]);
}
