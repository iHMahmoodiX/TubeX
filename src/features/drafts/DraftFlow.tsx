// Where this draft came from and what to do next (#14): the research record carried from Research/YouTube (keyword,
// topic, intent, public signals with their date) and a compact stepper with one next action. No new page.
import { Icon } from '../../components/icons';
import { INTENTS, type Draft, type Intent } from '../../domain/models';
import { draftSteps, type StepId } from '../../domain/workflow';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { useFormat } from '../research/shared';

const SIG_KEYS = ['keywordScore', 'sampleSize', 'medianViews', 'views', 'publishedAt', 'channel', 'viewsPerDay', 'channelMedianViews', 'ratio'];

export function DraftFlow({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const { steps, next } = draftSteps(draft);
  const r = draft.research;
  const ownVideo = draft.source?.videoId;
  return (
    <section className="stack-s flow" aria-label={t('flow.label')} data-testid="draft-flow">
      <ol className="flow-steps">
        {steps.map((s) => (
          <li key={s.id} data-done={s.done} data-next={s.id === next} aria-current={s.id === next ? 'step' : undefined}>
            <span className="flow-dot" aria-hidden="true">
              {s.done ? <Icon name="check" /> : null}
            </span>
            <span className="xsmall">{t(`flow.step.${s.id}` as MessageKey)}</span>
          </li>
        ))}
      </ol>
      {next && <p className="small flow-next">{t(`flow.next.${next as Exclude<StepId, 'research' | 'idea'>}` as MessageKey)}</p>}
      {next === 'publish' && ownVideo && (
        <p className="small">
          <a href={`#optimize/${encodeURIComponent(ownVideo)}`}>{t('flow.toQueue')}</a>
        </p>
      )}
      {r && (
        <details className="flow-research">
          <summary className="small">
            {t('flow.research')}
            {r.keyword && (
              <>
                {' · '}
                <bdi>{r.keyword}</bdi>
              </>
            )}
          </summary>
          <dl className="flow-dl small">
            {r.topic && r.topic !== r.keyword && (
              <>
                <dt>{t('flow.topic')}</dt>
                <dd dir="auto">{r.topic}</dd>
              </>
            )}
            <dt>{t('flow.intent')}</dt>
            <dd>
              <select className="select" aria-label={t('flow.intent')} value={r.intent ?? ''} onChange={(e) => update({ research: { ...r, intent: (e.target.value || undefined) as Intent | undefined } })}>
                <option value="">{t('flow.intent.none')}</option>
                {INTENTS.map((i) => (
                  <option key={i} value={i}>
                    {t(`flow.intent.${i}` as MessageKey)}
                  </option>
                ))}
              </select>
            </dd>
            {Object.entries(r.signals ?? {}).map(([k, v]) => (
              <span key={k} style={{ display: 'contents' }}>
                <dt>{SIG_KEYS.includes(k) ? t(`flow.sig.${k}` as MessageKey) : k}</dt>
                <dd>{typeof v === 'number' ? f.int(v) : k === 'publishedAt' ? f.date(String(v)) : <bdi>{v}</bdi>}</dd>
              </span>
            ))}
          </dl>
          {r.retrievedAt && <p className="xsmall faint">{t('flow.sampled', { date: f.date(r.retrievedAt) })}</p>}
        </details>
      )}
    </section>
  );
}
