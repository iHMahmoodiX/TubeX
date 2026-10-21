import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { BACKUP_FORMAT, createBackup, countRecords, parseBackup, type ImportPreview } from '../../domain/backup';
import { COLLECTIONS } from '../../domain/models';
import { REJECT_REASONS } from '../../domain/records';
import type { Lang } from '../../domain/models';
import { usePrefs } from '../../components/AppShell';
import { Icon, type IconName } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, Card, ConfirmButton, Field, Notice, PageHeader, Switch } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { ConnectionsSettings } from '../connections/ConnectionsSettings';
import { Cover, Section, Segmented } from '../core/CoreUi';
import { InpageSettings } from './InpageSettings';
import { downloadText } from '../../platform/files';
import type { ThemePref } from '../../storage/prefs';
import { deleteAllData, exportAll, hasImportSnapshot, importData, undoLastImport } from '../../storage/db';
import { GOOGLE_ORIGINS } from '../../integrations/google/auth';
import { originPattern } from '../../platform/permissions';
import { collectSettings, restoreSettings } from './settingsBackup';

const SECTIONS: { id: string; label: MessageKey; icon: IconName }[] = [
  { id: 'set-general', label: 'core.set.general', icon: 'settings' },
  { id: 'set-connections', label: 'settings.connections', icon: 'link' },
  { id: 'set-inpage', label: 'core.set.inpage', icon: 'video' },
  { id: 'set-data', label: 'core.set.data', icon: 'shield' },
];

/** Highlights the sub-navigation entry of the section in view. */
function useSectionInView(ids: string[]): [string, (id: string) => void] {
  const [current, setCurrent] = useState(ids[0]!);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return [current, setCurrent];
}

export function SettingsView() {
  const { t, lang } = useI18n();
  const sep = lang === 'fa' ? '، ' : ', ';
  const toast = useToast();
  const { prefs, setPrefs } = usePrefs();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | undefined>();
  const [withSettings, setWithSettings] = useState(true);
  const [withAiKey, setWithAiKey] = useState(false);
  const [withYtKey, setWithYtKey] = useState(false);
  const [restoreSet, setRestoreSet] = useState(true);
  const [current, setCurrent] = useSectionInView(SECTIONS.map((s) => s.id));
  const version = browser.runtime.getManifest().version;

  useEffect(() => {
    void hasImportSnapshot().then(setSnapshotAt);
  }, []);

  const exportBackup = async () => {
    const settings = withSettings ? await collectSettings({ includeAiKey: withAiKey, includeYtKey: withYtKey }) : undefined;
    const backup = createBackup(await exportAll(), version, settings);
    downloadText(`tubex-backup-${backup.exportedAt.slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
    toast(t('settings.exported'));
  };

  const onFile = async (file: File | undefined) => {
    setPreview(null);
    setImportError(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setImportError(t('settings.importError.too-large'));
    const result = parseBackup(await file.text());
    if (!result.ok) return setImportError(t(`settings.importError.${result.error}`));
    setPreview(result);
    setRestoreSet(true);
  };

  const runImport = async (mode: 'merge' | 'replace') => {
    if (!preview) return;
    const s = restoreSet ? preview.settings : undefined;
    // Host access for a restored YouTube key, connected channels or AI server is asked first, while the
    // click still counts as a user gesture. Declining keeps the import going; Settings shows "Allow access".
    const origins = [
      ...(s?.youtube?.apiKey || s?.channels?.length ? GOOGLE_ORIGINS : []),
      ...(s?.ai?.enabled && s.ai.baseUrl && originPattern(s.ai.baseUrl) ? [originPattern(s.ai.baseUrl)!] : []),
    ];
    if (origins.length) await browser.permissions.request({ origins }).catch(() => false);
    const r = await importData(preview.data, mode);
    const restored = s ? await restoreSettings(s) : null;
    setPreview(null);
    setSnapshotAt(await hasImportSnapshot());
    toast(t('settings.importDone', { added: r.added, updated: r.updated, kept: r.keptLocal }));
    if (restored) toast(restored.channelsAdded ? t('backup.channelsRestored', { n: restored.channelsAdded }) : t('backup.settingsRestored'));
  };

  const rejected = preview ? Object.values(preview.rejected).reduce((a, b) => a + b, 0) : 0;
  const jump = (id: string) => {
    setCurrent(id);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    (el?.querySelector('h2') as HTMLElement | null)?.focus({ preventScroll: true });
  };

  return (
    <section className="stack-l" aria-labelledby="set-h">
      <PageHeader title={t('settings.heading')} desc={t('core.set.desc')} art={<Cover icon="settings" />} />
      <div className="core-settings">
        <nav className="core-subnav" aria-label={t('core.set.nav')}>
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={current === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>
              <Icon name={s.icon} />
              {t(s.label)}
            </button>
          ))}
        </nav>
        <div className="core-sections">
          <Section id="set-general" title={t('core.set.general')} desc={t('core.set.generalDesc')} icon="settings">
            <Card>
              <div className="core-row-setting">
                <div className="stack-s" style={{ gap: 2 }}>
                  <strong id="lang-l">{t('settings.language')}</strong>
                  <span className="small muted">{t('core.set.languageHelp')}</span>
                </div>
                <Segmented<Lang>
                  label={t('settings.language')}
                  value={prefs.uiLanguage}
                  onChange={(v) => void setPrefs({ uiLanguage: v })}
                  items={[
                    { id: 'fa', label: 'فارسی' },
                    { id: 'en', label: 'English' },
                  ]}
                />
              </div>
              <div className="core-row-setting">
                <div className="stack-s" style={{ gap: 2 }}>
                  <strong>{t('settings.theme')}</strong>
                  <span className="small muted">{t('core.set.themeHelp')}</span>
                </div>
                <Segmented<ThemePref>
                  label={t('settings.theme')}
                  value={prefs.theme}
                  onChange={(v) => void setPrefs({ theme: v })}
                  items={[
                    { id: 'dark', label: t('settings.theme.dark'), icon: 'moon' },
                    { id: 'light', label: t('settings.theme.light'), icon: 'sun' },
                    { id: 'system', label: t('settings.theme.system'), icon: 'settings' },
                  ]}
                />
              </div>
              <div className="core-row-setting">
                <div className="stack-s" style={{ gap: 2 }}>
                  <Switch checked={prefs.pageAdapterEnabled} onChange={(v) => void setPrefs({ pageAdapterEnabled: v })} label={<strong>{t('settings.pageAdapter')}</strong>} />
                  <span className="small muted">{t('settings.pageAdapterHelp')}</span>
                </div>
              </div>
            </Card>
          </Section>

          <Section id="set-connections" title={t('settings.connections')} desc={t('core.set.connectionsDesc')} icon="link">
            <ConnectionsSettings />
          </Section>

          <Section id="set-inpage" title={t('core.set.inpage')} desc={t('core.set.inpageDesc')} icon="video">
            <div className="core-slot" data-empty={t('core.set.inpageEmpty')}>
              <InpageSettings />
            </div>
          </Section>

          <Section id="set-data" title={t('core.set.data')} desc={t('settings.dataHelp')} icon="shield">
            <Card title={t('settings.backup')} sub={t('settings.exportHelp')}>
              <div className="stack-s">
                <Switch checked={withSettings} onChange={setWithSettings} label={<strong>{t('backup.includeSettings')}</strong>} />
                <span className="small muted">{t('backup.includeSettingsHelp')}</span>
                {withSettings && (
                  <div className="stack-s" style={{ paddingInlineStart: 16 }}>
                    <label className="check">
                      <input type="checkbox" checked={withAiKey} onChange={(e) => setWithAiKey(e.target.checked)} />
                      <span>{t('backup.includeAiKey')}</span>
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={withYtKey} onChange={(e) => setWithYtKey(e.target.checked)} data-testid="backup-yt-key" />
                      <span>{t('backup.includeYtKey')}</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="row">
                <Button variant="primary" onClick={() => void exportBackup()}>
                  <Icon name="download" />
                  {t('settings.export')}
                </Button>
                {snapshotAt && (
                  <Button
                    onClick={async () => {
                      if (await undoLastImport()) toast(t('settings.importUndone'));
                      setSnapshotAt(undefined);
                    }}
                  >
                    <Icon name="undo" />
                    {t('settings.importUndo')}
                  </Button>
                )}
              </div>
              <hr className="divider" />
              <Field label={t('settings.importChoose')} help={t('core.set.importHelp')}>
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    className="core-file"
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      void onFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                )}
              </Field>
              {importError && <Notice tone="error">{importError}</Notice>}
              {preview && (
                <Notice>
                  <p>{t('settings.importPreview', { n: countRecords(preview.data), rejected })}</p>
                  {preview.format < BACKUP_FORMAT && <p className="small">{t('backup.older', { v: preview.appVersion ?? '—' })}</p>}
                  <ul className="small" data-testid="import-collections" style={{ margin: 0, paddingInlineStart: 20 }}>
                    {COLLECTIONS.filter((c) => preview.data[c].length > 0 || preview.rejected[c] > 0).map((c) => (
                      <li key={c}>
                        {t('backup.colLine', { name: t(`backup.col.${c}` as MessageKey), n: preview.data[c].length })}
                        {preview.rejected[c] > 0 && (
                          <>
                            {' · '}
                            {t('backup.colSkipped', {
                              n: preview.rejected[c],
                              why: REJECT_REASONS.filter((w) => preview.reasons[c][w])
                                .map((w) => `${t(`backup.why.${w}` as MessageKey)} (${preview.reasons[c][w]})`)
                                .join(sep),
                            })}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {preview.settings && (
                    <div className="stack-s">
                      <label className="check">
                        <input type="checkbox" checked={restoreSet} onChange={(e) => setRestoreSet(e.target.checked)} data-testid="import-settings" />
                        <span>{t('backup.restoreSettings')}</span>
                      </label>
                      <span className="small muted">
                        {t('backup.settingsParts', {
                          parts: [
                            preview.settings.prefs && t('backup.part.prefs'),
                            preview.settings.ai && t('backup.part.ai'),
                            preview.settings.youtube && t('backup.part.youtube'),
                            preview.settings.channels?.length && t('backup.part.channels', { n: preview.settings.channels.length }),
                            (preview.settings.ai?.apiKey || preview.settings.youtube?.apiKey) &&
                              t('backup.part.keys', { n: (preview.settings.ai?.apiKey ? 1 : 0) + (preview.settings.youtube?.apiKey ? 1 : 0) }),
                          ]
                            .filter(Boolean)
                            .join(sep),
                        })}
                      </span>
                    </div>
                  )}
                  <div className="row">
                    <Button variant="primary" onClick={() => void runImport('merge')}>
                      {t('settings.importMerge')}
                    </Button>
                    <ConfirmButton
                      label={t('settings.importReplace')}
                      question={t('settings.importReplaceConfirm')}
                      confirmLabel={t('settings.importReplace')}
                      onConfirm={() => runImport('replace')}
                    />
                    <Button variant="ghost" onClick={() => setPreview(null)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </Notice>
              )}
            </Card>
            <Card title={t('core.set.danger')} sub={t('core.set.dangerHelp')}>
              <div>
                <ConfirmButton
                  label={t('settings.deleteAll')}
                  question={t('settings.deleteAllConfirm')}
                  confirmLabel={t('settings.deleteAll')}
                  onConfirm={async () => {
                    await deleteAllData();
                    setSnapshotAt(undefined);
                    toast(t('settings.deletedAll'));
                  }}
                />
              </div>
            </Card>
            <Card title={t('settings.updateTitle')}>
              <p className="small muted" data-testid="update-note">
                {t('settings.updateNote')}
              </p>
            </Card>
            <p className="small faint">{t('settings.about', { v: version })}</p>
          </Section>
        </div>
      </div>
    </section>
  );
}
