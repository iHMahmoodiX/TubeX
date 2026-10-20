// Pick a video: paste a link or ID, or choose one of the signed-in channel's recent uploads.
import { useCallback, useEffect, useState } from 'react';
import { parseVideoInput } from '../../domain/seo';
import { Field } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ownVideosMeta, type VideoMeta } from '../../integrations/youtube/seoApi';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle } from '../connections/useConnections';
import { useAsync } from '../research/shared';

/** The signed-in channel's latest 50 uploads (about 2 units, cached 30 min). */
export function useOwnUploads(enabled = true) {
  const google = useGoogle();
  const active = google.channels.find((c) => c.channelId === google.activeChannelId);
  const load = useAsync(useCallback((id: string, playlist: string) => ownVideosMeta(id, playlist, 50), []));
  useEffect(() => {
    if (enabled && active?.uploadsPlaylistId) void load.run(active.channelId, active.uploadsPlaylistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, active?.channelId]);
  return { active, videos: load.data ?? [], loading: load.loading, error: load.error };
}

export function VideoPicker({ value, onChange, label }: { value: string; onChange: (id: string, video?: VideoMeta) => void; label: string }) {
  const { t } = useI18n();
  const own = useOwnUploads();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const parsed = text.trim() ? parseVideoInput(text) : null;
  return (
    <div className="stack-s grow" style={{ minWidth: 'min(100%, 260px)' }}>
      <Field label={label} help={text.trim() && !parsed ? t('seo.video.bad') : t('seo.video.help')}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            className="input ltr"
            dir="ltr"
            placeholder="https://youtu.be/…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const v = parseVideoInput(e.target.value);
              onChange(v ?? '', own.videos.find((x) => x.id === v));
            }}
          />
        )}
      </Field>
      {own.active && (
        <select
          className="select"
          aria-label={t('seo.video.own')}
          value={own.videos.some((v) => v.id === value) ? value : ''}
          onChange={(e) => {
            const v = own.videos.find((x) => x.id === e.target.value);
            setText(e.target.value);
            onChange(e.target.value, v);
          }}
        >
          <option value="">{own.loading ? t('common.loading') : t('seo.video.own')}</option>
          {own.videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      )}
      <ErrorNotice error={own.error} />
    </div>
  );
}
