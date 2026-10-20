import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { createBackup, countRecords, parseBackup, type ImportPreview } from '../../domain/backup';
import type { Lang } from '../../domain/models';
import { usePrefs } from '../../components/AppShell';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Field, Notice } from '../../components/ui';
import { useI18n } from '../../i18n';
import { downloadText } from '../../platform/files';
import type { ThemePref } from '../../storage/prefs';
import { deleteAllData, exportAll, hasImportSnapshot, importData, undoLastImport } from '../../storage/db';

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="stack-s">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function SettingsView() {
  const { t } = useI18n();
  const toast = useToast();
  const { prefs, setPrefs } = usePrefs();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | undefined>();
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

  return (
    <section className="stack" aria-labelledby="set-h" style={{ maxWidth: 820 }}>
      <h1 id="set-h">{t('settings.heading')}</h1>

      <div className="card stack">
        <div className="row">
          <Field label={t('settings.language')}>
            {({ id }) => (
              <select id={id} className="select" value={prefs.uiLanguage} onChange={(e) => void setPrefs({ uiLanguage: e.target.value as Lang })}>
                <option value="fa">فارسی</option>
                <option value="en">English</option>
              </select>
            )}
          </Field>
          <Field label={t('settings.theme')}>
            {({ id }) => (
              <select id={id} className="select" value={prefs.theme} onChange={(e) => void setPrefs({ theme: e.target.value as ThemePref })}>
                <option value="system">{t('settings.theme.system')}</option>
                <option value="light">{t('settings.theme.light')}</option>
                <option value="dark">{t('settings.theme.dark')}</option>
              </select>
            )}
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={prefs.pageAdapterEnabled} onChange={(e) => void setPrefs({ pageAdapterEnabled: e.target.checked })} />
          <span>{t('settings.pageAdapter')}</span>
        </label>
        <p className="small muted">{t('settings.pageAdapterHelp')}</p>
      </div>

      <div className="card stack">
        <h2>{t('settings.connections')}</h2>
        <Row title={t('settings.youtube')}>
          <p className="muted">{t('settings.youtubeState')}</p>
        </Row>
        <Row title={t('settings.ai')}>
          <p className="muted">{t('settings.aiState')}</p>
        </Row>
        <Row title={t('settings.writes')}>
          <p className="muted">{t('settings.writesState')}</p>
        </Row>
      </div>

      <div className="card stack">
        <h2>{t('settings.backup')}</h2>
        <p className="muted">{t('settings.exportHelp')}</p>
        <div>
          <Button variant="primary" onClick={() => void exportBackup()}>
            {t('settings.export')}
          </Button>
        </div>
        <hr className="divider" />
        <Field label={t('settings.importChoose')}>
          {({ id }) => (
            <input
              id={id}
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
        {snapshotAt && (
          <div>
            <Button
              onClick={async () => {
                if (await undoLastImport()) toast(t('settings.importUndone'));
                setSnapshotAt(undefined);
              }}
            >
              {t('settings.importUndo')}
            </Button>
          </div>
        )}
      </div>

      <div className="card stack">
        <h2>{t('settings.data')}</h2>
        <p className="muted">{t('settings.dataHelp')}</p>
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
        <p className="small muted">{t('settings.about', { v: version })}</p>
      </div>
    </section>
  );
}
