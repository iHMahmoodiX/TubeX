// Search Insights: the signed-in channel's real YouTube search terms (YouTube Analytics) and where the
// channel's videos sit in the current keyword sample.
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../components/toasts';
import { Button, Empty, Notice, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ownSearchTerms } from '../../integrations/youtube/seoApi';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle } from '../connections/useConnections';
import { createRankTracker } from '../ranks/service';
import type { KeywordData } from './keywordData';
import { SectionHead, VideoTracks } from './parts';
import { useAsync, useFormat } from './shared';

export function Insights({ data, onExplore }: { data?: KeywordData; onExplore: (term: string) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const google = useGoogle();
  const active = google.channels.find((c) => c.channelId === google.activeChannelId);
  const [days, setDays] = useState(28);
  const terms = useAsync(useCallback((id: string, n: number, fresh: boolean) => ownSearchTerms(id, n, fresh), []));
  useEffect(() => {
    if (active) void terms.run(active.channelId, days, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.channelId, days]);

  if (google.loaded && !active)
    return (
      <Empty icon="lock" title={t('seo.insights.signInTitle')} action={<a className="btn btn-primary" href="#settings">{t('shell.signIn')}</a>}>
        {t('seo.insights.signIn')}
      </Empty>
    );

  const mineInSample = data ? data.sample.videos.map((v, i) => ({ v, pos: i + 1 })).filter((x) => data.mine.includes(x.v.channelId)) : [];
  const max = Math.max(1, ...(terms.data ?? []).map((x) => x.views));

  return (
    <div className="seo-split">
      <section className="seo-section" aria-labelledby="ins-h">
        <SectionHead
          id="ins-h"
          title={t('seo.insights.title')}
          sub={t('seo.insights.help')}
          actions={
            <>
              {[28, 90].map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={days === n} onClick={() => setDays(n)}>
                  {t('mc.lastDays', { n: f.int(n) })}
                </button>
              ))}
              <Button size="s" variant="ghost" disabled={terms.loading || !active} onClick={() => active && void terms.run(active.channelId, days, true)}>
                {t('research.refresh')}
              </Button>
            </>
          }
        />
        <ErrorNotice error={terms.error} />
        {terms.loading && !terms.data && <Skeleton lines={8} />}
        {terms.data && !terms.data.length && <Empty icon="search">{t('seo.insights.none')}</Empty>}
        {terms.data && terms.data.length > 0 && (
          <div>
            <div className="seo-track-head" aria-hidden="true">
              <span style={{ textAlign: 'center' }}>#</span>
              <span>{t('research.keyword')}</span>
              <span className="seo-track-end">
                <span className="seo-num">{t('yt.col.views')}</span>
                <span className="seo-num seo-hide-s">{t('mc.watchHours')}</span>
                <span style={{ minWidth: 150 }} />
              </span>
            </div>
            <ol className="seo-tracks" aria-label={t('seo.insights.title')}>
              {terms.data.map((x, i) => (
                <li key={x.term} className="seo-track" style={{ minHeight: 48 }}>
                  <span className="track-n">{f.int(i + 1)}</span>
                  <div className="seo-track-text">
                    <button type="button" className="item-button seo-track-title truncate" dir="auto" onClick={() => onExplore(x.term)}>
                      {x.term}
                    </button>
                    <div className="meter" data-tone="muted" style={{ maxWidth: 240, marginBlockStart: 4 }} aria-hidden="true">
                      <i style={{ width: `${(x.views / max) * 100}%` }} />
                    </div>
                  </div>
                  <span className="seo-track-end">
                    <span className="seo-num">{f.int(x.views)}</span>
                    <span className="seo-num seo-hide-s">{Number.isFinite(x.minutes) ? f.int(Math.round(x.minutes / 60)) : '—'}</span>
                    <span className="row-nowrap">
                      <Button size="s" variant="ghost" onClick={() => onExplore(x.term)}>
                        {t('research.run')}
                      </Button>
                      <Button
                        size="s"
                        variant="ghost"
                        onClick={async () => {
                          await createRankTracker({ keyword: x.term, channelId: active!.channelId, targetTitle: active!.title });
                          toast(t('seo.rank.created', { k: x.term }));
                        }}
                      >
                        {t('seo.rank.trackShort')}
                      </Button>
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="xsmall faint">{t('seo.insights.note')}</p>
          </div>
        )}
      </section>
      <aside className="seo-section" aria-labelledby="ins-mine">
        <SectionHead id="ins-mine" title={t('seo.insights.inSample')} sub={data ? t('seo.insights.inSampleHelp', { k: data.sample.query }) : undefined} />
        {!data ? (
          <Notice>{t('seo.insights.exploreFirst')}</Notice>
        ) : mineInSample.length ? (
          <VideoTracks videos={mineInSample.map((x) => x.v)} positions={mineInSample.map((x) => x.pos)} mine={data.mine} label={t('seo.insights.inSample')} />
        ) : (
          <p className="small muted">{t('research.notInSample')}</p>
        )}
      </aside>
    </div>
  );
}
