import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { createBackup, countRecords, parseBackup, type ImportPreview } from '../../domain/backup';
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
  const { t } = useI18n();
  const toast = useToast();
  const { prefs, setPrefs } = usePrefs();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | undefined>();
  const [current, setCurrent] = useSectionInView(SECTIONS.map((s) => s.id));
  const version = browser.runtime.getManifest().version;

  useEffect(() => {
    void hasImportSnapshot().then(setSnapshotAt);
  }, []);

  const exportBackup = async () => {
    const backup = createBackup(await exportAll(), version);
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
  };

  const runImport = async (mode: 'merge' | 'replace') => {
    if (!preview) return;
    const r = await importData(preview.data, mode);
    setPreview(null);
    setSnapshotAt(await hasImportSnapshot());
    toast(t('settings.importDone', { added: r.added, updated: r.updated, kept: r.keptLocal }));
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
            <p className="small faint">{t('settings.about', { v: version })}</p>
          </Section>
        </div>
      </div>
    </section>
  );
}
