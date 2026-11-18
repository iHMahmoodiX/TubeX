// Suggestions for one queued video (#15). Rule advice first (no AI, no cost). The AI step runs only on click,
// after a one-time consent that lists exactly what is sent, through the existing provider (Gemini/Ollama/custom)
// with its monthly cap and 30-day cache. Ask Studio has no public API: TubeX opens Studio and copies a prompt.
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { Button, Notice } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { ASK_STUDIO_URL, askStudioPrompt, COACH_INSTRUCTIONS, coachEvidence, RULE_ADVICE, validateCoach, type CoachSuggestion } from '../../domain/coach';
import type { QueueEntry } from '../../domain/optimizeQueue';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { loadPrefs, onPrefsChanged, updatePrefs } from '../../storage/prefs';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';

export function CoachPanel({ e, medians }: { e: QueueEntry; medians: { ctr: number | null; avgViewPercent: number | null; views: number | null } }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const integrations = useIntegrations();
  const ev = useMemo(() => coachEvidence(e, medians), [e, medians]);
  const [consentAt, setConsentAt] = useState<string | undefined>();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [out, setOut] = useState<{ suggestions: CoachSuggestion[]; dropped: number; model: string; fromCache: boolean } | null>(null);
  useEffect(() => {
    void loadPrefs().then((p) => setConsentAt(p.aiChannelConsentAt));
    return onPrefsChanged((p) => setConsentAt(p.aiChannelConsentAt));
  }, []);
  const aiOn = integrations.ai.enabled && !!integrations.ai.model;

  const run = async (fresh: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await runAiJson({
        task: 'optimize.coach.v1',
        instructions: COACH_INSTRUCTIONS,
        data: dataBlock('Evidence (JSON)', JSON.stringify(ev), 3000),
        maxTokens: 900,
        fresh,
      });
      setOut({ ...validateCoach(r.output, ev), model: r.model, fromCache: r.fromCache });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(askStudioPrompt(ev, lang));
      toast(t('coach.askStudio.copied'));
    } catch {
      toast(t('common.copyFailed'));
    }
  };

  return (
    <section className="stack-s opt-coach" aria-labelledby={`coach-${e.videoId}`}>
      <h4 id={`coach-${e.videoId}`}>{t('coach.title')}</h4>
      <ul className="stack-s opt-rules">
        {e.signals.map((s) => (
          <li key={s.kind}>
            <Icon name="check" />
            <span className="small">
              {t(`coach.rule.${s.kind}` as MessageKey)} <span className="xsmall faint">· {t(`coach.effort.${RULE_ADVICE[s.kind].effort}` as MessageKey)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="xsmall faint">{t('coach.rulesNote')}</p>

      {!aiOn ? (
        <p className="small muted">
          {t('coach.noAi')}{' '}
          <a href="#settings">{t('coach.openSettings')}</a>
        </p>
      ) : !consentAt ? (
        asking ? (
          <Notice>
            <p className="small">{t('coach.consent.body', { provider: integrations.ai.baseUrl, model: integrations.ai.model })}</p>
            <pre className="opt-evidence" dir="ltr">
              {JSON.stringify(ev, null, 2)}
            </pre>
            <div className="row">
              <Button
                size="s"
                variant="primary"
                onClick={() =>
                  void updatePrefs({ aiChannelConsentAt: new Date().toISOString() }).then(() => {
                    setAsking(false);
                    void run(false);
                  })
                }
              >
                {t('coach.consent.agree')}
              </Button>
              <Button size="s" variant="ghost" onClick={() => setAsking(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </Notice>
        ) : (
          <div className="row">
            <Button size="s" onClick={() => setAsking(true)}>
              <Icon name="sparkle" />
              {t('coach.personalize')}
            </Button>
            <span className="xsmall faint">{t('coach.onClick')}</span>
          </div>
        )
      ) : (
        <div className="row">
          <Button size="s" disabled={busy} onClick={() => void run(!!out)}>
            <Icon name="sparkle" />
            {busy ? t('common.loading') : out ? t('coach.regenerate') : t('coach.personalize')}
          </Button>
          <span className="xsmall faint">{t('coach.onClick')}</span>
          <Button size="s" variant="ghost" onClick={() => void updatePrefs({ aiChannelConsentAt: undefined })}>
            {t('coach.consent.revoke')}
          </Button>
        </div>
      )}
      <ErrorNotice error={error} />
      {out && (
        <div className="stack-s" data-testid="coach-out">
          {out.suggestions.length ? (
            out.suggestions.map((s, i) => (
              <article key={i} className="opt-sug">
                <b dir="auto">{s.title}</b>
                {s.why && (
                  <p className="small muted" dir="auto">
                    {s.why}
                  </p>
                )}
                <p className="small" dir="auto">
                  <Icon name="chevron" /> {s.nextStep}
                </p>
                <span className="xsmall faint">
                  {t('coach.meta', { effort: t(`coach.effort.${s.effort}` as MessageKey), confidence: t(`coach.confidence.${s.confidence}` as MessageKey) })}
                  {s.uses.length ? ` · ${t('coach.uses', { keys: s.uses.join(', ') })}` : ''}
                </span>
              </article>
            ))
          ) : (
            <p className="small muted">{t('coach.none')}</p>
          )}
          <p className="xsmall faint">
            {t('coach.label', { model: out.model })}
            {out.fromCache ? ` · ${t('coach.cached')}` : ''}
            {out.dropped ? ` · ${t('coach.dropped', { n: out.dropped })}` : ''}
          </p>
        </div>
      )}

      <div className="row opt-ask">
        <a className="btn btn-s" href={ASK_STUDIO_URL(e.videoId)} target="_blank" rel="noreferrer noopener" onClick={() => void copyPrompt()}>
          <Icon name="external" />
          {t('coach.askStudio')}
        </a>
        <Button size="s" variant="ghost" onClick={() => void copyPrompt()}>
          <Icon name="copy" />
          {t('coach.askStudio.copy')}
        </Button>
      </div>
      <p className="xsmall faint">{t('coach.askStudio.note')}</p>
    </section>
  );
}
