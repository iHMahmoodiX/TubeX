// Which of the channel's videos the search covers: Studio selection, visibility, Shorts vs longer videos,
// date range, text contained, playlist. Everything is local except loading a playlist (1 unit per 50).
import { useMemo, useState } from 'react';
import { matchesQuery } from '../../domain/text';
import { Icon } from '../../components/icons';
import { SearchInput } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import type { OwnVideo } from '../../integrations/google/own';
import { listMyPlaylists, listPlaylistItems, type Playlist } from '../../integrations/google/ownWrites';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useFormat } from '../research/shared';

export interface Filters {
  privacy: 'all' | 'public' | 'unlisted' | 'private';
  type: 'all' | 'short' | 'long';
  from: string;
  to: string;
  q: string;
  playlistId: string;
  onlySelected: boolean;
}

export const NO_FILTERS: Filters = { privacy: 'all', type: 'all', from: '', to: '', q: '', playlistId: '', onlySelected: true };

/** Shorts can be up to 3 minutes; the API has no Shorts flag, so this is by duration. */
export const SHORT_MAX_SEC = 180;

export function applyFilters(videos: OwnVideo[], f: Filters, preIds: string[], playlistIds: Set<string> | null): OwnVideo[] {
  const pre = f.onlySelected && preIds.length ? new Set(preIds) : null;
  return videos.filter((v) => {
    if (pre && !pre.has(v.id)) return false;
    if (f.privacy !== 'all' && v.privacy !== f.privacy) return false;
    if (f.type === 'short' && !(v.durationSec > 0 && v.durationSec <= SHORT_MAX_SEC)) return false;
    if (f.type === 'long' && !(v.durationSec > SHORT_MAX_SEC)) return false;
    const day = v.publishedAt.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.q.trim() && !matchesQuery(`${v.title}\n${v.description}`, f.q)) return false;
    if (playlistIds && !playlistIds.has(v.id)) return false;
    return true;
  });
}

export function LiveFilters({
  videos,
  filters,
  set,
  preIds,
  channelId,
  onPlaylist,
}: {
  videos: OwnVideo[];
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  preIds: string[];
  channelId: string;
  onPlaylist: (ids: Set<string> | null) => void;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [plError, setPlError] = useState<unknown>(null);
  const [plLoading, setPlLoading] = useState(false);
  const counts = useMemo(() => {
    const c = { all: videos.length, public: 0, unlisted: 0, private: 0, short: 0, long: 0 };
    for (const v of videos) {
      if (v.privacy === 'public' || v.privacy === 'unlisted' || v.privacy === 'private') c[v.privacy]++;
      if (v.durationSec > 0 && v.durationSec <= SHORT_MAX_SEC) c.short++;
      else if (v.durationSec > SHORT_MAX_SEC) c.long++;
    }
    return c;
  }, [videos]);
  const loadPlaylists = async () => {
    if (playlists || plLoading) return;
    setPlLoading(true);
    try {
      setPlaylists(await listMyPlaylists(channelId));
    } catch (e) {
      setPlError(e);
    } finally {
      setPlLoading(false);
    }
  };
  const pickPlaylist = async (id: string) => {
    set({ playlistId: id });
    setPlError(null);
    if (!id) return onPlaylist(null);
    try {
      onPlaylist(new Set((await listPlaylistItems(channelId, id)).map((e) => e.videoId)));
    } catch (e) {
      setPlError(e);
      onPlaylist(null);
    }
  };
  return (
    <div className="fr-filters stack-s" role="group" aria-label={t('fr.filters')}>
      {preIds.length > 0 && (
        <label className="check">
          <input type="checkbox" checked={filters.onlySelected} onChange={(e) => set({ onlySelected: e.target.checked })} />
          <span>{t('fr.onlySelected', { n: f.int(preIds.length) })}</span>
        </label>
      )}
      <div className="row">
        <div className="chips" role="group" aria-label={t('mc.privacy')}>
          {(['all', 'public', 'unlisted', 'private'] as const)
            .filter((p) => p === 'all' || counts[p] > 0)
            .map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={filters.privacy === p} onClick={() => set({ privacy: p })}>
                {p === 'all' ? t('engage.picker.all') : t(`mc.privacy.${p}` as MessageKey)}
                <small className="num-t">{f.int(counts[p])}</small>
              </button>
            ))}
        </div>
        <div className="chips" role="group" aria-label={t('fr.type')}>
          {(['all', 'long', 'short'] as const).map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={filters.type === p} onClick={() => set({ type: p })} title={p === 'short' ? t('fr.shortHelp') : undefined}>
              {t(`fr.type.${p}` as MessageKey)}
              {p !== 'all' && <small className="num-t">{f.int(counts[p])}</small>}
            </button>
          ))}
        </div>
      </div>
      <div className="fr-filter-grid">
        <div style={{ minWidth: 0 }}>
          <SearchInput value={filters.q} onChange={(q) => set({ q })} label={t('fr.contains')} placeholder={t('fr.contains')} />
        </div>
        <label className="fr-date">
          <span className="xsmall muted">{t('fr.from')}</span>
          <input type="date" className="input" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="fr-date">
          <span className="xsmall muted">{t('fr.to')}</span>
          <input type="date" className="input" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label className="fr-date">
          <span className="xsmall muted">
            <Icon name="playlist" /> {t('fr.playlist')}
          </span>
          <select className="select" value={filters.playlistId} onFocus={() => void loadPlaylists()} onPointerDown={() => void loadPlaylists()} onChange={(e) => void pickPlaylist(e.target.value)}>
            <option value="">{plLoading ? t('fr.loading') : t('fr.anyPlaylist')}</option>
            {(playlists ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorNotice error={plError} />
    </div>
  );
}
