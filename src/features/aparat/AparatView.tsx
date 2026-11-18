// Aparat (#17): every YouTube upload of the active channel with its Aparat state. One click prepares a video's
// Aparat package (title, description without YouTube links, tags) from its YouTube metadata and opens it.
// TubeX never uploads to or signs in to Aparat; the owner publishes on Aparat's own page and records the link.
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Empty, PageHeader, SearchInput } from '../../components/ui';
import { Icon } from '../../components/icons';
import { APARAT_UPLOAD_URL, checkAparat } from '../../domain/aparat';
import type { Draft, PublishStatus } from '../../domain/models';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { onDataChanged } from '../../storage/db';
import { matchesQuery } from '../../domain/text';
import { useChannel, useOwnVideos } from '../reports/hooks';
import { SignedOut, TrackSkeleton, VideoTrack } from '../reports/shared';
import type { RVideo } from '../reports/data';
import { useFormat } from '../research/shared';
import { draftsByVideo, openAparatDraft, prepareForAparat } from './aparatActions';

type Filter = 'all' | 'none' | PublishStatus;
const PAGE = 40;

export function AparatView() {
  const { t } = useI18n();
  const f = useFormat();
  const { g, active } = useChannel();
  const vids = useOwnVideos(active);
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const load = () => void draftsByVideo().then(setDrafts).catch(() => undefined);
    load();
    return onDataChanged((name) => {
      if (name === 'drafts') load();
    });
  }, []);

  const rows = useMemo(() => (vids.data ?? []).map((v) => ({ v, d: drafts.get(v.id) })).map((r) => ({ ...r, p: r.d?.platforms?.aparat })), [vids.data, drafts]);
  const count = (fl: Filter) => rows.filter((r) => (fl === 'all' ? true : fl === 'none' ? !r.p : r.p?.status === fl)).length;
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'none' ? !r.p : r.p?.status === filter) && matchesQuery(r.v.title, q));

  const open = async (v: RVideo, d?: Draft) => {
    setBusy(v.id);
    try {
      const ready = await prepareForAparat(v, d);
      openAparatDraft(ready.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack-l">
      <PageHeader
        kicker={active ? `${t('nav.aparat')} · ${active.title}` : t('nav.aparat')}
        title={t('aparat.page.title')}
        desc={t('aparat.page.desc')}
        art={active ? <Avatar src={active.thumbnail} name={active.title} size="l" /> : undefined}
        actions={
          <a className="btn btn-s" href={APARAT_UPLOAD_URL} target="_blank" rel="noreferrer noopener">
            <Icon name="external" />
            {t('aparat.open')}
          </a>
        }
      />
      {!g.loaded ? (
        <TrackSkeleton rows={4} />
      ) : !active ? (
        <SignedOut />
      ) : (
        <>
          <div className="rp-toolbar" style={{ flexWrap: 'wrap' }}>
            <div className="chips" role="group" aria-label={t('aparat.status')}>
              {(['all', 'none', 'prepared', 'uploaded', 'published'] as const).map((fl) => (
                <button key={fl} type="button" className="chip" aria-pressed={filter === fl} onClick={() => setFilter(fl)}>
                  {t(fl === 'all' ? 'aparat.page.all' : fl === 'none' ? 'aparat.page.none' : (`aparat.st.${fl}` as MessageKey))} · {f.int(count(fl))}
                </button>
              ))}
            </div>
            <SearchInput value={q} onChange={setQ} label={t('reports.searchVideos')} placeholder={t('reports.searchVideos')} />
          </div>
          {vids.loading && !vids.data ? (
            <TrackSkeleton rows={6} />
          ) : shown.length === 0 ? (
            <Empty icon="video">{t('mc.noVideos')}</Empty>
          ) : (
            <div className="tracks" data-testid="aparat-list">
              {shown.slice(0, limit).map(({ v, d, p }, i) => {
                const errors = p ? checkAparat(p).filter((x) => x.severity === 'error').length : 0;
                return (
                  <VideoTrack
                    key={v.id}
                    n={i + 1}
                    videoId={v.id}
                    thumbnail={v.thumbnail}
                    title={v.title || '—'}
                    sub={
                      <>
                        <span className={`badge ${p?.status === 'published' ? 'badge-accent' : ''}`} style={{ marginInlineEnd: 6 }}>
                          {p ? t(`aparat.st.${p.status}` as MessageKey) : t('aparat.page.none')}
                        </span>
                        {p && p.status === 'prepared' && errors > 0 && <span className="muted">{t('aparat.page.toFix', { n: f.int(errors) })} · </span>}
                        {p?.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer noopener" className="ltr">
                            {p.url.replace(/^https:\/\/(www\.)?/, '')}
                          </a>
                        ) : (
                          <span className="muted">
                            {f.compact(v.views)} {t('reports.viewsShort')} · {f.age(v.publishedAt)}
                          </span>
                        )}
                      </>
                    }
                    end={
                      <Button size="s" variant={p ? 'default' : 'primary'} disabled={busy === v.id} onClick={() => void open(v, d)} data-testid="aparat-row-open">
                        <Icon name={p ? 'edit' : 'copy'} />
                        {p ? t('aparat.page.openPkg') : t('aparat.prepare')}
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}
          {shown.length > limit && (
            <div>
              <Button size="s" variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
                {t('opt.showMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
