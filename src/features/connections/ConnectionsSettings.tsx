// Settings for the optional AI provider and YouTube Data API key. Keys stay in this browser profile.
import { useEffect, useState } from 'react';
import { Button, ConfirmButton, Field, Notice } from '../../components/ui';
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

function SecretInput({ id, value, onChange, describedBy }: { id: string; value: string; onChange: (v: string) => void; describedBy?: string }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input
        id={id}
        aria-describedby={describedBy}
        className="input ltr"
        dir="ltr"
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      <Button size="s" variant="ghost" aria-pressed={show} onClick={() => setShow((v) => !v)}>
        {show ? t('conn.hide') : t('conn.show')}
      </Button>
    </div>
  );
}

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
  return (
    <section className="stack" aria-labelledby="ai-h" data-testid="ai-settings">
      <div className="row-between">
        <h3 id="ai-h">{t('settings.ai')}</h3>
        <span className={`badge ${saved.ai.enabled ? 'badge-accent' : ''}`}>{saved.ai.enabled ? t('conn.on') : t('conn.off')}</span>
      </div>
      <p className="small muted">{t('conn.aiIntro')}</p>
      <label className="check">
        <input type="checkbox" checked={ai.enabled} onChange={(e) => setAi({ ...ai, enabled: e.target.checked })} />
        <span>{t('conn.aiEnable')}</span>
      </label>
      <Field label={t('conn.provider')}>
        {({ id }) => (
          <select id={id} className="select" value={preset} onChange={(e) => choosePreset(e.target.value as AiPreset)}>
            <option value="ollama">{t('conn.preset.ollama')}</option>
            <option value="gemini">{t('conn.preset.gemini')}</option>
            <option value="custom">{t('conn.preset.custom')}</option>
          </select>
        )}
      </Field>
      <p className="small muted">{t(`conn.presetHelp.${preset}`)}</p>
      <div className="row">
        <div className="grow">
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
        </div>
        <div className="grow">
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
      <p className="small muted" data-testid="ai-usage">
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
          {testing ? t('conn.testing') : t('conn.test')}
        </Button>
      </div>
      {ok && <Notice tone="success">{ok}</Notice>}
      <ErrorNotice error={error} />
    </section>
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
  return (
    <section className="stack" aria-labelledby="yt-h" data-testid="yt-settings">
      <div className="row-between">
        <h3 id="yt-h">{t('conn.ytHeading')}</h3>
        <span className={`badge ${saved.youtube.apiKey ? 'badge-accent' : ''}`}>{saved.youtube.apiKey ? t('conn.on') : t('conn.off')}</span>
      </div>
      <p className="small muted">{t('conn.ytIntro')}</p>
      <Field label={t('conn.apiKey')} help={t('conn.ytKeyHelp')}>
        {({ id, describedBy }) => <SecretInput id={id} describedBy={describedBy} value={yt.apiKey} onChange={(v) => setYt({ ...yt, apiKey: v })} />}
      </Field>
      <div className="row">
        <Field label={t('conn.region')} help={t('conn.regionHelp')}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className="input ltr"
              dir="ltr"
              maxLength={2}
              style={{ maxWidth: 90 }}
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
        <Field label={t('conn.dailyCap')}>
          {({ id }) => (
            <input
              id={id}
              className="input"
              type="number"
              min={0}
              step={500}
              style={{ maxWidth: 140 }}
              value={yt.dailyUnitCap}
              onChange={(e) => setYt({ ...yt, dailyUnitCap: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          )}
        </Field>
      </div>
      <p className="small muted" data-testid="yt-usage">
        {t('conn.ytUsage', { n: num.format(usage.ytUnits), cap: saved.youtube.dailyUnitCap ? num.format(saved.youtube.dailyUnitCap) : '∞' })}
      </p>
      {granted === false && saved.youtube.apiKey && <Notice tone="warning">{t('conn.needsPermission')}</Notice>}
      <div className="row">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty && granted !== false}>
          {t('conn.saveAndAllow')}
        </Button>
        <Button onClick={() => void test()} disabled={!yt.apiKey || testing}>
          {testing ? t('conn.testing') : t('conn.test')}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await cacheClear();
            toast(t('conn.cacheCleared'));
          }}
        >
          {t('conn.clearCache')}
        </Button>
      </div>
      {ok && <Notice tone="success">{t('conn.ytOk')}</Notice>}
      <ErrorNotice error={error} />
    </section>
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
  return (
    <section className="stack" aria-labelledby="g-h" data-testid="google-settings">
      <div className="row-between">
        <h3 id="g-h">{t('settings.youtube')}</h3>
        <span className={`badge ${g.channels.length ? 'badge-accent' : ''}`}>{g.channels.length ? t('conn.on') : t('conn.off')}</span>
      </div>
      <p className="small muted">{t('auth.intro')}</p>
      {g.channels.length > 0 && (
        <ul className="list">
          {g.channels.map((c) => (
            <li key={c.channelId} className="list-item" data-active={c.channelId === g.activeChannelId ? 'true' : undefined}>
              <div className="row-between">
                <span className="row">
                  {c.thumbnail && <img src={c.thumbnail} alt="" width={28} height={28} style={{ borderRadius: '50%' }} />}
                  <strong dir="auto">{c.title}</strong>
                  <span className="small muted ltr">{c.handle}</span>
                </span>
                <span className="row">
                  {c.channelId !== g.activeChannelId ? (
                    <Button size="s" onClick={() => void setActiveChannel(c.channelId)}>
                      {t('auth.makeActive')}
                    </Button>
                  ) : (
                    <span className="badge badge-accent">{t('auth.active')}</span>
                  )}
                  <ConfirmButton
                    size="s"
                    label={t('auth.signOut')}
                    question={t('auth.signOutConfirm', { name: c.title })}
                    confirmLabel={t('auth.signOut')}
                    onConfirm={() => signOut(c.channelId)}
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <Button variant="primary" disabled={busy} onClick={() => void connect()} data-testid="google-signin">
          {busy ? t('auth.signingIn') : g.channels.length ? t('auth.addChannel') : t('auth.signIn')}
        </Button>
      </div>
      <p className="small muted">{t('auth.multiHelp')}</p>
      <ErrorNotice error={error} />
      <p className="small muted">{t('auth.writesNote')}</p>
    </section>
  );
}

export function ConnectionsSettings() {
  const { t } = useI18n();
  return (
    <div className="card stack">
      <h2>{t('settings.connections')}</h2>
      <AiSection />
      <hr className="divider" />
      <YouTubeSection />
      <hr className="divider" />
      <GoogleSection />
    </div>
  );
}
