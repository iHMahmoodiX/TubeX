import type { PageContext } from '../../domain/pageContext';
import { useI18n } from '../../i18n';

export function ContextCard({ ctx }: { ctx: PageContext | null }) {
  const { t } = useI18n();
  if (!ctx) return <p className="small muted" role="status">{t('ctx.loading')}</p>;
  const unsupported = ctx.kind === 'unsupported' || ctx.kind === 'unknown';
  const label = ctx.title ?? (ctx.searchQuery ? t('ctx.searchFor', { q: ctx.searchQuery }) : ctx.channelHandle);
  return (
    <section className="card stack-s" aria-labelledby="ctx-h" data-testid="context-card" data-kind={ctx.kind}>
      <div className="row-between">
        <h2 id="ctx-h" className="small muted">
          {t('ctx.heading')}
        </h2>
        <span className={`badge ${unsupported ? '' : 'badge-accent'}`}>{t(`ctx.kind.${ctx.kind}`)}</span>
      </div>
      {unsupported ? (
        <p className="small muted">{t(ctx.kind === 'unknown' ? 'ctx.unknownHelp' : 'ctx.unsupportedHelp')}</p>
      ) : (
        <>
          {label && (
            <p dir="auto" style={{ fontWeight: 600 }} data-testid="context-title">
              {label}
            </p>
          )}
          {ctx.channelName && (
            <p className="small" dir="auto">
              <bdi>{ctx.channelName}</bdi>
            </p>
          )}
          <p className="small muted">{t(`ctx.origin.${ctx.origin}`)}</p>
        </>
      )}
    </section>
  );
}
