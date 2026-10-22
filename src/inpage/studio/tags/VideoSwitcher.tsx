// Floating video switcher on Studio's video details page: docked to the page's end edge, a vertical strip of
// the channel's own uploads with up/down to jump to the previous/next video's details page without going back
// to the Content list. Collapsed to a small tab until opened; the uploads list loads on first open (about
// 2 units per 50 videos, cached 30 min).
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/icons';
import { useI18n } from '../../../i18n';
import { rpc } from '../../../platform/rpc';
import { cachedRpc, InError, useAsync, useStatus, useStored } from '../../common';
import { useInpageEnabled, useYtTheme } from '../../InpageRoot';
import { pageDir } from './dom';
import { neighbours, studioEditUrl } from './logic';
import { useEditor } from './useEditor';

interface SwitchVideo {
  id: string;
  title: string;
  thumbnail?: string;
  privacy: string;
}

const thumbOf = (v: SwitchVideo) => v.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`;

export function VideoSwitcher() {
  const on = useInpageEnabled('studioTags');
  const { videoId } = useEditor();
  const [open, setOpen] = useStored<boolean>('tt.switcherOpen', false);
  const [loaded, setLoaded] = useState(open);
  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);
  const side = pageDir(document);
  if (!on || !videoId) return null;
  return <Switcher videoId={videoId} open={open} setOpen={setOpen} load={loaded} side={side} />;
}

function Switcher({ videoId, open, setOpen, load, side }: { videoId: string; open: boolean; setOpen: (v: boolean) => void; load: boolean; side: 'ltr' | 'rtl' }) {
  const { t } = useI18n();
  const theme = useYtTheme();
  const status = useStatus();
  const signedIn = !!status?.channels.length;
  const list = useAsync(load && signedIn ? 'tt-switcher' : null, () => cachedRpc<{ videos: SwitchVideo[] }>(10 * 60_000, 'tagTools.ownVideos', 100));
  const videos = list.data?.videos ?? [];
  const { prev, next, index } = neighbours(videos, videoId);
  const strip = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open || index < 0) return;
    const el = strip.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'center' });
  }, [open, index]);

  const go = (id: string | undefined) => {
    if (id && id !== videoId) location.assign(studioEditUrl(id));
  };

  if (!open)
    return (
      <button type="button" className="tt-sw-tab" dir={side} data-theme={theme} aria-expanded={false} aria-label={t('tt.sw.open')} title={t('tt.sw.open')} onClick={() => setOpen(true)}>
        <span className="tt-dot" aria-hidden="true">
          <Icon name="logo" />
        </span>
        <Icon name="video" />
      </button>
    );

  return (
    <nav className="tt-sw" dir={side} aria-label={t('tt.sw.label')}>
      <div className="tt-sw-head">
        <span className="tt-dot" aria-hidden="true" title="TubeX">
          <Icon name="logo" />
        </span>
        <button type="button" className="tt-icon tt-icon-s" aria-label={t('tt.sw.settings')} title={t('tt.sw.settings')} onClick={() => void rpc('ui.openWorkspace', 'settings')}>
          <Icon name="settings" />
        </button>
        <button type="button" className="tt-icon tt-icon-s" aria-label={t('tt.sw.close')} title={t('tt.sw.close')} onClick={() => setOpen(false)}>
          <Icon name="x" />
        </button>
      </div>
      <button type="button" className="tt-sw-arrow" disabled={!prev} aria-label={prev ? t('tt.sw.prev', { title: prev.title }) : t('tt.sw.prevNone')} title={prev?.title} onClick={() => go(prev?.id)}>
        <Icon name="arrowUp" />
      </button>
      {status && !signedIn && <p className="tt-sw-msg" dir="auto">{t('tt.sw.signIn')}</p>}
      {list.error !== undefined && (
        <div className="tt-sw-msg">
          <InError error={list.error} onRetry={list.reload} />
        </div>
      )}
      {list.loading && !list.data && (
        <ul className="tt-sw-strip" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i}>
              <span className="skel tt-sw-skel" />
            </li>
          ))}
        </ul>
      )}
      {videos.length > 0 && (
        <ul className="tt-sw-strip" ref={strip}>
          {videos.map((v) => (
            <li key={v.id}>
              <a
                href={studioEditUrl(v.id)}
                className="tt-sw-item"
                aria-current={v.id === videoId ? 'page' : undefined}
                title={v.title}
                onClick={(e) => {
                  e.preventDefault();
                  go(v.id);
                }}
              >
                <img src={thumbOf(v)} alt={v.title} loading="lazy" decoding="async" width={96} height={54} />
                {v.privacy && v.privacy !== 'public' && <span className="tt-sw-priv">{v.privacy === 'private' ? t('tt.sw.private') : v.privacy === 'unlisted' ? t('tt.sw.unlisted') : t('tt.sw.other')}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
      {list.data && !videos.length && <p className="tt-sw-msg">{t('tt.sw.none')}</p>}
      {list.data && videos.length > 0 && index < 0 && <p className="tt-sw-msg">{t('tt.sw.notListed')}</p>}
      <button type="button" className="tt-sw-arrow" disabled={!next} aria-label={next ? t('tt.sw.next', { title: next.title }) : t('tt.sw.nextNone')} title={next?.title} onClick={() => go(next?.id)}>
        <Icon name="arrowDown" />
      </button>
    </nav>
  );
}
