// Content calendar (month grid of upload days, long-form vs Shorts by duration) and the activity feed (recent uploads
// grouped by day). Both work on the uploads already fetched for the channel; month navigation is limited to them.
import { useMemo, useState } from 'react';
import { Icon } from '../../../components/icons';
import { IconButton, Thumb } from '../../../components/ui';
import { feedGroups, localDay, monthBounds, monthGrid, nextMonth, prevMonth, videoKind, type CalendarCell } from '../../../domain/channelInsights';
import type { VideoInfo } from '../../../integrations/youtube/api';
import { useI18n } from '../../../i18n';
import { KindBadge, Section, useCiFmt, useDateParts, useDayLabel } from './bits';

export function ContentCalendar({ videos, id }: { videos: VideoInfo[]; id: string }) {
  const { t } = useI18n();
  const f = useCiFmt();
  const parts = useDateParts();
  const latest = useMemo(() => {
    const ts = videos.map((v) => Date.parse(v.publishedAt)).filter(Number.isFinite);
    return ts.length ? new Date(Math.max(...ts)) : new Date();
  }, [videos]);
  const earliest = useMemo(() => {
    const ts = videos.map((v) => Date.parse(v.publishedAt)).filter(Number.isFinite);
    return ts.length ? new Date(Math.min(...ts)) : new Date();
  }, [videos]);
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [picked, setPicked] = useState<string | null>(null);
  const grid = useMemo(() => monthGrid(anchor, parts, f.weekStart, videos), [anchor, parts, f.weekStart, videos]);
  const canPrev = grid.first.getTime() > monthBounds(earliest, parts).first.getTime();
  const canNext = grid.last.getTime() < monthBounds(new Date(Math.max(Date.now(), latest.getTime())), parts).first.getTime();
  const inMonth = grid.weeks.flat().filter((c) => c.inMonth);
  const counts = { long: 0, short: 0, maybe: 0 };
  for (const c of inMonth)
    for (const v of c.uploads) {
      const k = videoKind(v.durationSec);
      if (k === 'long' || k === 'unknown') counts.long++;
      else if (k === 'short') counts.short++;
      else counts.maybe++;
    }
  const days = grid.weeks[0]!.map((c) => c.date);
  const today = localDay(new Date());
  const pickedCell = picked ? grid.weeks.flat().find((c) => c.key === picked) : undefined;
  const label = f.month(new Date((grid.first.getTime() + grid.last.getTime()) / 2));

  const cellKind = (c: CalendarCell) => {
    if (!c.uploads.length) return undefined;
    const ks = new Set(c.uploads.map((v) => videoKind(v.durationSec)));
    if (ks.has('long') || ks.has('unknown')) return ks.has('short') || ks.has('maybeShort') ? 'mixed' : 'long';
    return ks.has('short') ? 'short' : 'maybe';
  };

  return (
    <Section id={`ci-cal-${id}`} icon="calendar" title={t('ci.cal.title')} desc={t('ci.cal.desc')}>
      <div className="ci-cal">
        <div className="ci-cal-nav">
          <IconButton icon="chevron" className="ci-flip" label={t('ci.cal.prev')} disabled={!canPrev} onClick={() => setAnchor(prevMonth(grid.first))} />
          <b className="grow ci-cal-month">{label}</b>
          <IconButton icon="chevron" label={t('ci.cal.next')} disabled={!canNext} onClick={() => setAnchor(nextMonth(grid.last))} />
        </div>
        <div className="ci-cal-grid" role="grid" aria-label={label}>
          <div role="row" className="ci-cal-row">
            {days.map((d) => (
              <span key={d.getDay()} role="columnheader" className="ci-cal-wd" aria-label={f.weekday(d)}>
                {f.narrowDay(d)}
              </span>
            ))}
          </div>
          {grid.weeks.map((w, i) => (
            <div role="row" className="ci-cal-row" key={i}>
              {w.map((c) => {
                const kind = cellKind(c);
                const name = `${f.sdate(c.date)}${c.uploads.length ? ` — ${t('ci.cal.uploads', { n: c.uploads.length })}` : ''}`;
                return (
                  <span role="gridcell" key={c.key} aria-selected={picked === c.key}>
                    <button
                      type="button"
                      className="ci-cal-day"
                      data-out={!c.inMonth || undefined}
                      data-kind={kind}
                      data-today={c.key === today || undefined}
                      aria-label={name}
                      title={c.uploads.map((v) => v.title).join('\n') || undefined}
                      disabled={!c.uploads.length}
                      onClick={() => setPicked(picked === c.key ? null : c.key)}
                    >
                      {f.int(c.day)}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className="ci-cal-legend xsmall muted">
          <span>
            <i data-kind="long" /> {t('ci.kind.long')} <b className="num-t">{f.int(counts.long)}</b>
          </span>
          <span>
            <i data-kind="short" /> {t('ci.kind.short')} <b className="num-t">{f.int(counts.short)}</b>
          </span>
          <span>
            <i data-kind="maybe" /> {t('ci.kind.maybeShort')} <b className="num-t">{f.int(counts.maybe)}</b>
          </span>
        </div>
        {pickedCell && pickedCell.uploads.length > 0 && <VideoList videos={pickedCell.uploads as VideoInfo[]} />}
        <p className="xsmall faint">{t('ci.cal.rule', { from: f.sdate(earliest), n: videos.length })}</p>
      </div>
    </Section>
  );
}

function VideoList({ videos }: { videos: VideoInfo[] }) {
  const f = useCiFmt();
  const { t } = useI18n();
  return (
    <ul className="ci-vlist">
      {videos.map((v) => (
        <li key={v.id}>
          <a href={`https://www.youtube.com/watch?v=${v.id}`} className="ci-vrow">
            <Thumb videoId={v.id} src={v.thumbnail} width={96} />
            <span className="grow ci-vrow-main">
              <bdi className="ci-vtitle">{v.title}</bdi>
              <span className="xsmall muted">
                {v.views === undefined ? t('inpage.hidden') : t('ci.views', { v: f.compact(v.views) })} · {f.time(v.publishedAt)} · <KindBadge durationSec={v.durationSec} />
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const FEED_GROUPS = 6;

export function ActivityFeed({ videos, id }: { videos: VideoInfo[]; id: string }) {
  const { t } = useI18n();
  const f = useCiFmt();
  const dayLabel = useDayLabel();
  const [more, setMore] = useState(false);
  const groups = useMemo(() => feedGroups(videos, new Date()), [videos]);
  const shown = more ? groups : groups.slice(0, FEED_GROUPS);
  return (
    <Section id={`ci-feed-${id}`} icon="pulse" title={t('ci.feed.title')} desc={t('ci.feed.desc')}>
      {!groups.length && <p className="small muted">{t('ci.feed.none')}</p>}
      <div className="ci-feed">
        {shown.map((g) => (
          <div key={g.key} className="ci-feed-day">
            <div className="ci-feed-sep">
              <span>{dayLabel(g.daysAgo, g.date)}</span>
            </div>
            {g.videos.map((v) => {
              const k = videoKind(v.durationSec);
              return (
                <a key={v.id} className="ci-feed-item" href={`https://www.youtube.com/watch?v=${v.id}`}>
                  <span className="ci-feed-kind" data-kind={k}>
                    <Icon name={k === 'long' || k === 'unknown' ? 'video' : 'play'} />
                    {t(k === 'long' ? 'ci.feed.longUp' : k === 'short' ? 'ci.feed.shortUp' : k === 'maybeShort' ? 'ci.feed.maybeUp' : 'ci.feed.otherUp')}
                  </span>
                  <span className="ci-feed-body">
                    <Thumb videoId={v.id} src={v.thumbnail} width={120} />
                    <span className="grow ci-vrow-main">
                      <bdi className="ci-vtitle">{v.title}</bdi>
                      <span className="xsmall muted">
                        {v.views === undefined ? t('inpage.hidden') : t('ci.views', { v: f.compact(v.views) })} · {f.time(v.publishedAt)}
                      </span>
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        ))}
      </div>
      {groups.length > FEED_GROUPS && (
        <button type="button" className="btn btn-s btn-ghost" onClick={() => setMore(!more)}>
          {more ? t('ci.less') : t('ci.feed.more', { n: groups.length - FEED_GROUPS })}
        </button>
      )}
      <p className="xsmall faint">{t('ci.kind.rule')}</p>
    </Section>
  );
}

