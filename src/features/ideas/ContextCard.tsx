import type { PageContext } from '../../domain/pageContext';
import { Icon } from '../../components/icons';
import { Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { kindIcon } from './IdeasView';
import '../core/core.css';

/** The open page, like a "now playing" card: video thumbnail on watch pages, title, channel and where the data came from. */
export function ContextCard({ ctx }: { ctx: PageContext | null }) {
  const { t } = useI18n();
  if (!ctx)
    return (
      <div className="core-now" role="status" aria-label={t('ctx.loading')}>
        <div className="core-now-body">
          <Skeleton lines={2} />
        </div>
      </div>
    );
  const unsupported = ctx.kind === 'unsupported' || ctx.kind === 'unknown';
  const label = ctx.title ?? (ctx.searchQuery ? t('ctx.searchFor', { q: ctx.searchQuery }) : ctx.channelHandle);
  const video = (ctx.kind === 'watch' || ctx.kind === 'shorts' || ctx.kind === 'studio-video') && ctx.videoId;
  return (
    <section className="core-now" aria-labelledby="ctx-h" data-testid="context-card" data-kind={ctx.kind}>
      {video && (
        <div className="core-now-art">
          <img src={`https://i.ytimg.com/vi/${ctx.videoId}/mqdefault.jpg`} alt="" referrerPolicy="no-referrer" />
          <span className="badge">{t(`ctx.kind.${ctx.kind}`)}</span>
        </div>
      )}
      <div className="core-now-body">
        <div className="row-between" style={{ flexWrap: 'nowrap' }}>
          <h2 id="ctx-h" className="xsmall muted bold">
            {t('ctx.heading')}
          </h2>
          {!video && (
            <span className={`badge ${unsupported ? '' : 'badge-accent'}`}>
              <Icon name={unsupported ? 'globe' : kindIcon(ctx.kind)} />
              {t(`ctx.kind.${ctx.kind}`)}
            </span>
          )}
        </div>
        {unsupported ? (
          <p className="small muted">{t(ctx.kind === 'unknown' ? 'ctx.unknownHelp' : 'ctx.unsupportedHelp')}</p>
        ) : (
          <>
            {label && (
              <p className="core-now-title clamp-2" dir="auto" data-testid="context-title">
                {label}
              </p>
            )}
            {ctx.channelName && (
              <p className="small muted truncate" dir="auto">
                <bdi>{ctx.channelName}</bdi>
              </p>
            )}
            <p className="xsmall faint">{t(`ctx.origin.${ctx.origin}`)}</p>
          </>
        )}
      </div>
    </section>
  );
}
