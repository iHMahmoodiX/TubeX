// WordPress sites connected with an Application Password (D-028). Saving tests the login first; the site's origin
// permission is requested from the Save click. The password stays in this browser only and is never exported.
import { useEffect, useState } from 'react';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { testWpSite, WpError } from '../../integrations/wordpress';
import { loadWpSites, onWpSitesChanged, originOf, removeWpSite, saveWpSite, type WpSite } from '../../storage/wordpress';
import { browser } from 'wxt/browser';

export function wpErrorText(t: (k: MessageKey, v?: Record<string, string | number>) => string, e: unknown): string {
  if (e instanceof WpError) return t(`wp.err.${e.code}` as MessageKey);
  return t('error.generic');
}

export function WordPressSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const [sites, setSites] = useState<WpSite[]>([]);
  const [url, setUrl] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void loadWpSites().then(setSites);
    return onWpSitesChanged(setSites);
  }, []);

  const add = async () => {
    const origin = originOf(url);
    setError('');
    if (!origin) return setError(t('wp.err.url'));
    // Permission first, from the click, with nothing awaited before it.
    const granted = await browser.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
    if (!granted) return setError(t('wp.err.permission'));
    setBusy(true);
    try {
      const site = await testWpSite({ origin, user: user.trim(), appPassword: pass.trim(), addedAt: new Date().toISOString() });
      await saveWpSite(site);
      setUrl('');
      setUser('');
      setPass('');
      toast(t('wp.saved', { name: site.displayName ?? site.user }));
    } catch (e) {
      setError(wpErrorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" data-testid="wp-settings">
      <p className="small muted">{t('wp.help')}</p>
      {sites.map((s) => (
        <div key={s.origin} className="row-between card" style={{ padding: 12 }}>
          <div className="stack-s" style={{ gap: 2, minWidth: 0 }}>
            <strong className="ltr truncate">{s.origin.replace(/^https:\/\//, '')}</strong>
            <span className="xsmall muted">{t('wp.as', { user: s.displayName ?? s.user })}</span>
          </div>
          <ConfirmButton
            size="s"
            label={t('wp.remove')}
            question={t('wp.removeQ')}
            confirmLabel={t('wp.remove')}
            onConfirm={async () => {
              await removeWpSite(s.origin);
              await browser.permissions.remove({ origins: [`${s.origin}/*`] }).catch(() => false);
            }}
          />
        </div>
      ))}
      <div className="grid-2">
        <Field label={t('wp.f.url')}>{({ id }) => <input id={id} className="input" dir="ltr" inputMode="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />}</Field>
        <Field label={t('wp.f.user')}>{({ id }) => <input id={id} className="input" dir="ltr" autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} />}</Field>
      </div>
      <Field label={t('wp.f.pass')} help={t('wp.passHelp')}>
        {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input" dir="ltr" type="password" autoComplete="new-password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" value={pass} onChange={(e) => setPass(e.target.value)} />}
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div>
        <Button variant="primary" size="s" disabled={busy || !url.trim() || !user.trim() || !pass.trim()} onClick={() => void add()} data-testid="wp-add">
          <Icon name="link" />
          {busy ? t('common.loading') : t('wp.add')}
        </Button>
      </div>
    </div>
  );
}
