// Settings for Google sign-in, the YouTube Data API key and the optional AI provider. Keys stay in this
// browser profile.
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/icons';
import { Avatar, Button, Card, ConfirmButton, Field, Meter, Notice, Switch } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { useI18n } from '../../i18n';
import { AI_PRESETS, AiError, listModels, presetOf, type AiPreset } from '../../integrations/ai/provider';
import { YT_BASE } from '../../integrations/youtube/client';
import { videoCategories } from '../../integrations/youtube/api';
import { hasOrigin, originPattern, requestOrigin } from '../../platform/permissions';
import { cacheClear } from '../../storage/cache';
import { saveIntegrations, type AiSettings, type YouTubeSettings } from '../../storage/integrations';
import { ErrorNotice } from './ErrorNotice';
import { useGoogle, useIntegrations, useUsage } from './useConnections';
import { setActiveChannel, signIn, signOut } from '../../integrations/google/auth';
import '../core/core.css';

export function StatusPill({ on, children }: { on: boolean | 'warn'; children: ReactNode }) {
  return (
    <span className="core-status" data-on={String(on)}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

function SecretInput({ id, value, onChange, describedBy }: { id: string; value: string; onChange: (v: string) => void; describedBy?: string }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="core-secret">
      <input
        id={id}
        aria-describedby={describedBy}
        className="input ltr mono"
        dir="ltr"
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      <Button size="s" variant="ghost" aria-pressed={show} onClick={() => setShow((v) => !v)}>
        <Icon name="eye" />
        {show ? t('conn.hide') : t('conn.show')}
      </Button>
    </div>
  );
}

const meterTone = (pct: number) => (pct >= 95 ? 'danger' : pct >= 80 ? 'warning' : undefined);

/** YouTube units today and AI requests this month, against the local caps. */
function UsageSummary() {
  const { t, lang } = useI18n();
  const saved = useIntegrations();
  const usage = useUsage();
  const num = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US');
  const ytCap = saved.youtube.dailyUnitCap;
  const aiCap = saved.ai.monthlyRequestCap;
  const ytPct = ytCap ? (usage.ytUnits / ytCap) * 100 : 0;
  const aiPct = aiCap ? (usage.aiRequests / aiCap) * 100 : 0;
  return (
    <div className="core-usage" data-testid="usage-summary">
      <div>
        <span className="small muted">{t('core.conn.ytToday')}</span>
        <span>
          <b>{num.format(usage.ytUnits)}</b> <span className="muted small">/ {ytCap ? num.format(ytCap) : '∞'}</span>
        </span>
        <Meter value={ytPct} tone={ytCap ? meterTone(ytPct) : 'muted'} label={t('core.conn.ytToday')} />
        <span className="xsmall faint">{t('core.conn.ytTodayHelp')}</span>
      </div>
      <div>
        <span className="small muted">{t('core.conn.aiMonth')}</span>
        <span>
          <b>{num.format(usage.aiRequests)}</b> <span className="muted small">/ {aiCap ? num.format(aiCap) : '∞'}</span>
        </span>
        <Meter value={aiPct} tone={aiCap ? meterTone(aiPct) : 'muted'} label={t('core.conn.aiMonth')} />
        <span className="xsmall faint">{t('core.conn.aiMonthHelp', { tin: num.format(usage.aiInputTokens), tout: num.format(usage.aiOutputTokens) })}</span>
      </div>
    </div>
  );
}

const PROVIDERS: { id: AiPreset; icon: IconName }[] = [
  { id: 'ollama', icon: 'lock' },
  { id: 'gemini', icon: 'sparkle' },
  { id: 'custom', icon: 'link' },
];

function AiSection() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const saved = useIntegrations();
  const usage = useUsage();
  const [ai, setAi] = useState<AiSettings>(saved.ai);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (saved.loaded) setAi(saved.ai);
  }, [saved.loaded, saved.ai]);
  useEffect(() => {
    void hasOrigin(ai.baseUrl).then(setGranted);
  }, [ai.baseUrl]);

  const preset = presetOf(ai);
  const choosePreset = (p: AiPreset) => {
    if (p === 'custom') return setAi({ ...ai, baseUrl: preset === 'custom' ? ai.baseUrl : '' });
    setAi({ ...ai, baseUrl: AI_PRESETS[p].baseUrl, model: AI_PRESETS[p].model });
  };
  const validUrl = !!originPattern(ai.baseUrl);
  const dirty = JSON.stringify(ai) !== JSON.stringify(saved.ai);

  const save = async () => {
    setError(null);
    setOk(null);
    // Permission first: the browser only shows its prompt during the click.
    const allowed = ai.enabled && validUrl ? await requestOrigin(ai.baseUrl) : true;
    setGranted(validUrl ? await hasOrigin(ai.baseUrl) : false);
    await saveIntegrations({ ...saved, ai });
    toast(allowed ? t('conn.saved') : t('conn.savedNoPermission'));
  };

  const test = async () => {
    setError(null);
    setOk(null);
    setTesting(true);
    try {
      if (!(await requestOrigin(ai.baseUrl))) throw new AiError('permission');
      setGranted(true);
      const ids = await listModels(ai);
      setModels(ids);
      setOk(ids.includes(ai.model) || ids.length === 0 ? t('conn.aiOk', { n: ids.length }) : t('conn.aiModelMissing', { model: ai.model, n: ids.length }));
    } catch (e) {
      setError(e);
    } finally {
      setTesting(false);
    }
  };

  const num = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US');
  const status = saved.ai.enabled ? (granted === false ? 'warn' : true) : false;
  return (
    <Card
      data-testid="ai-settings"
      aria-labelledby="ai-h"
      title={
        <span className="row" style={{ gap: 12 }}>
          <span className="core-section-icon" aria-hidden="true">
            <Icon name="sparkle" />
          </span>
          <span id="ai-h">{t('settings.ai')}</span>
        </span>
      }
      actions={<StatusPill on={status}>{saved.ai.enabled ? (granted === false ? t('core.conn.needsAllow') : t('conn.on')) : t('conn.off')}</StatusPill>}
    >
      <p className="small muted">{t('conn.aiIntro')}</p>
      <Switch checked={ai.enabled} onChange={(v) => setAi({ ...ai, enabled: v })} label={<strong>{t('conn.aiEnable')}</strong>} />
      <div className="core-providers" role="radiogroup" aria-label={t('conn.provider')}>
        {PROVIDERS.map((p) => (
          <label key={p.id} className="core-provider" data-checked={preset === p.id}>
            <input type="radio" name="ai-provider" value={p.id} checked={preset === p.id} onChange={() => choosePreset(p.id)} />
            <span className="core-provider-top">
              <span className="core-provider-icon" aria-hidden="true">
                <Icon name={p.id === preset ? 'check' : p.icon} />
              </span>
              <strong className="small">{t(`conn.preset.${p.id}`)}</strong>
            </span>
            <span className="xsmall muted">{t(`core.conn.provider.${p.id}`)}</span>
          </label>
        ))}
      </div>
      <p className="small muted">{t(`conn.presetHelp.${preset}`)}</p>
      <div className="grid-2">
        <Field label={t('conn.baseUrl')} help={validUrl || !ai.baseUrl ? undefined : t('conn.baseUrlInvalid')}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className="input ltr"
              dir="ltr"
              spellCheck={false}
              placeholder="https://…/v1"
              value={ai.baseUrl}
              onChange={(e) => setAi({ ...ai, baseUrl: e.target.value.trim().replace(/\/+$/, '') })}
            />
          )}
        </Field>
        <Field label={t('conn.model')}>
          {({ id }) => (
            <>
              <input id={id} className="input ltr" dir="ltr" list={`${id}-models`} spellCheck={false} value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value.trim() })} />
              <datalist id={`${id}-models`}>
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </div>
      <Field label={`${t('conn.apiKey')} ${preset === 'ollama' ? `(${t('common.optional')})` : ''}`} help={t('conn.keyStorage')}>
        {({ id, describedBy }) => <SecretInput id={id} describedBy={describedBy} value={ai.apiKey} onChange={(v) => setAi({ ...ai, apiKey: v })} />}
      </Field>
      <Field label={t('conn.monthlyCap')} help={t('conn.monthlyCapHelp')}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            className="input"
            type="number"
            min={0}
            step={50}
            style={{ maxWidth: 160 }}
            value={ai.monthlyRequestCap}
            onChange={(e) => setAi({ ...ai, monthlyRequestCap: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
        )}
      </Field>
      <p className="xsmall faint" data-testid="ai-usage">
        {t('conn.aiUsage', {
          n: num.format(usage.aiRequests),
          cap: saved.ai.monthlyRequestCap ? num.format(saved.ai.monthlyRequestCap) : '∞',
          tin: num.format(usage.aiInputTokens),
          tout: num.format(usage.aiOutputTokens),
        })}
      </p>
      {granted === false && ai.enabled && validUrl && <Notice tone="warning">{t('conn.needsPermission')}</Notice>}
      <div className="row">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty && granted !== false}>
          {t('conn.saveAndAllow')}
        </Button>
        <Button onClick={() => void test()} disabled={!validUrl || testing}>
          <Icon name="pulse" />
          {testing ? t('conn.testing') : t('conn.test')}
        </Button>
      </div>
      {ok && <Notice tone="success">{ok}</Notice>}
      <ErrorNotice error={error} />
    </Card>
  );
}

function YouTubeSection() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const saved = useIntegrations();
  const usage = useUsage();
  const [yt, setYt] = useState<YouTubeSettings>(saved.youtube);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (saved.loaded) setYt(saved.youtube);
  }, [saved.loaded, saved.youtube]);
  useEffect(() => {
    void hasOrigin(YT_BASE).then(setGranted);
  }, []);
  const dirty = JSON.stringify(yt) !== JSON.stringify(saved.youtube);

  const save = async () => {
    setError(null);
    setOk(false);
    const allowed = yt.apiKey ? await requestOrigin(YT_BASE) : true;
    setGranted(await hasOrigin(YT_BASE));
    await saveIntegrations({ ...saved, youtube: yt });
    toast(allowed ? t('conn.saved') : t('conn.savedNoPermission'));
  };

  const test = async () => {
    setError(null);
    setOk(false);
    setTesting(true);
    try {
      await requestOrigin(YT_BASE);
      setGranted(await hasOrigin(YT_BASE));
      if (dirty) await saveIntegrations({ ...saved, youtube: yt });
      await videoCategories();
      setOk(true);
    } catch (e) {
      setError(e);
    } finally {
      setTesting(false);
    }
  };

  const num = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US');
  const hasKey = !!saved.youtube.apiKey;
  return (
    <Card
      data-testid="yt-settings"
      aria-labelledby="yt-h"
      title={
        <span className="row" style={{ gap: 12 }}>
          <span className="core-section-icon" aria-hidden="true">
            <Icon name="key" />
          </span>
          <span id="yt-h">{t('conn.ytHeading')}</span>
        </span>
      }
      actions={<StatusPill on={hasKey ? (granted === false ? 'warn' : true) : false}>{hasKey ? (granted === false ? t('core.conn.needsAllow') : t('conn.on')) : t('conn.off')}</StatusPill>}
    >
      <p className="small muted">{t('conn.ytIntro')}</p>
      <Notice>{t('core.conn.ytOptional')}</Notice>
      <Field label={t('conn.apiKey')} help={t('conn.ytKeyHelp')}>
        {({ id, describedBy }) => <SecretInput id={id} describedBy={describedBy} value={yt.apiKey} onChange={(v) => setYt({ ...yt, apiKey: v })} />}
      </Field>
      <div className="grid-3">
        <Field label={t('conn.region')} help={t('conn.regionHelp')}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className="input ltr"
              dir="ltr"
              maxLength={2}
              value={yt.region}
              onChange={(e) => setYt({ ...yt, region: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
            />
          )}
        </Field>
        <Field label={t('conn.searchLanguage')}>
          {({ id }) => (
            <select id={id} className="select" value={yt.language} onChange={(e) => setYt({ ...yt, language: e.target.value })}>
              <option value="fa">{t('lang.fa')}</option>
              <option value="en">{t('lang.en')}</option>
              <option value="ar">العربية</option>
              <option value="tr">Türkçe</option>
              <option value="de">Deutsch</option>
            </select>
          )}
        </Field>
        <Field label={t('conn.dailyCap')} help={t('core.conn.dailyCapHelp')}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className="input"
              type="number"
              min={0}
              step={500}
              value={yt.dailyUnitCap}
              onChange={(e) => setYt({ ...yt, dailyUnitCap: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          )}
        </Field>
      </div>
      <p className="xsmall faint" data-testid="yt-usage">
        {t('conn.ytUsage', { n: num.format(usage.ytUnits), cap: saved.youtube.dailyUnitCap ? num.format(saved.youtube.dailyUnitCap) : '∞' })}
      </p>
      {granted === false && hasKey && <Notice tone="warning">{t('conn.needsPermission')}</Notice>}
      <div className="row">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty && granted !== false}>
          {t('conn.saveAndAllow')}
        </Button>
        <Button onClick={() => void test()} disabled={!yt.apiKey || testing}>
          <Icon name="pulse" />
          {testing ? t('conn.testing') : t('conn.test')}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await cacheClear();
            toast(t('conn.cacheCleared'));
          }}
        >
          <Icon name="refresh" />
          {t('conn.clearCache')}
        </Button>
      </div>
      {ok && <Notice tone="success">{t('conn.ytOk')}</Notice>}
      <ErrorNotice error={error} />
    </Card>
  );
}

function GoogleSection() {
  const { t } = useI18n();
  const toast = useToast();
  const g = useGoogle();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const connect = async () => {
    setError(null);
    setBusy(true);
    try {
      const ch = await signIn();
      toast(t('auth.connected', { name: ch.title }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const n = g.channels.length;
  return (
    <Card
      data-testid="google-settings"
      aria-labelledby="g-h"
      title={
        <span className="row" style={{ gap: 12 }}>
          <span className="core-section-icon" aria-hidden="true">
            <Icon name="users" />
          </span>
          <span id="g-h">{t('settings.youtube')}</span>
        </span>
      }
      actions={<StatusPill on={n > 0}>{n ? t('core.conn.channelsN', { n }) : t('core.conn.signedOut')}</StatusPill>}
    >
      <p className="small muted">{t('core.conn.googleIntro')}</p>
      {n > 0 && (
        <div className="stack-s">
          {g.channels.map((c) => {
            const active = c.channelId === g.activeChannelId;
            return (
              <div key={c.channelId} className="core-account" data-active={active ? 'true' : undefined}>
                <Avatar src={c.thumbnail} name={c.title} />
                <div className="stack-s grow" style={{ gap: 0 }}>
                  <strong className="truncate" dir="auto">
                    {c.title}
                  </strong>
                  <span className="small muted ltr truncate">{c.handle}</span>
                </div>
                {active ? (
                  <span className="badge badge-accent">{t('auth.active')}</span>
                ) : (
                  <Button size="s" onClick={() => void setActiveChannel(c.channelId)}>
                    {t('auth.makeActive')}
                  </Button>
                )}
                <ConfirmButton
                  size="s"
                  label={t('auth.signOut')}
                  question={t('auth.signOutConfirm', { name: c.title })}
                  confirmLabel={t('auth.signOut')}
                  onConfirm={() => signOut(c.channelId)}
                />
              </div>
            );
          })}
        </div>
      )}
      <div className="row">
        <Button variant="primary" disabled={busy} onClick={() => void connect()} data-testid="google-signin">
          <Icon name={n ? 'plus' : 'lock'} />
          {busy ? t('auth.signingIn') : n ? t('auth.addChannel') : t('auth.signIn')}
        </Button>
      </div>
      <ErrorNotice error={error} />
      <details className="disclosure">
        <summary className="small">{t('core.conn.howSignIn')}</summary>
        <div className="stack-s small muted">
          <p>{t('auth.intro')}</p>
          <p>{t('auth.multiHelp')}</p>
          <p>{t('auth.writesNote')}</p>
        </div>
      </details>
    </Card>
  );
}

export function ConnectionsSettings() {
  return (
    <div className="stack">
      <UsageSummary />
      <GoogleSection />
      <YouTubeSection />
      <AiSection />
    </div>
  );
}
