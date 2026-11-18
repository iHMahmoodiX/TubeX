// The drawer's general views: a tools list (this page's panel, TubeX workspace sections, Studio sections),
// the latest alerts, and this site's in-page switches.
import { useEffect, useState } from 'react';
import { Icon } from '../../components/icons';
import { Switch } from '../../components/ui';
import { STUDIO_SECTIONS, studioUrl } from '../../domain/inpage';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { rpc } from '../../platform/rpc';
import { loadPrefs, onPrefsChanged, updatePrefs, type Prefs } from '../../storage/prefs';
import { InError, useAsync, useFmt, useStatus } from '../common';
import type { DrawerView } from './bus';
import { PAGE_META, SITE_FEATURES, STUDIO_ICONS, WORKSPACE_LINKS } from './links';
import type { PagePanel, Site } from './logic';


export function ToolsView({ site, panel, onView }: { site: Site; panel: PagePanel; onView: (v: DrawerView) => void }) {
  const { t } = useI18n();
  const status = useStatus();
  const active = status?.channels.find((c) => c.channelId === status.activeChannelId);
  return (
    <div className="tx-ln-tools">
      {panel !== 'none' && (
        <div className="tx-ln-group">
          <span className="tx-menu-label">{t('ln.tools.thisPage')}</span>
          <button type="button" className="tx-menu-item" onClick={() => onView('page')}>
            <Icon name={PAGE_META[panel].icon} />
            <span className="grow">{t(PAGE_META[panel].label)}</span>
          </button>
        </div>
      )}
      <div className="tx-ln-group">
        <span className="tx-menu-label">{t('inpage.mast.workspace')}</span>
        {WORKSPACE_LINKS.map((x) => (
          <button key={x.route} type="button" className="tx-menu-item" onClick={() => void rpc('ui.openWorkspace', x.route)}>
            <Icon name={x.icon} />
            <span className="grow">{t(x.label)}</span>
            <Icon name="external" className="icon tx-menu-ext" />
          </button>
        ))}
      </div>
      <div className="tx-ln-group">
        <span className="tx-menu-label">{t('inpage.mast.studio')}</span>
        {STUDIO_SECTIONS.map((s) => (
          <a key={s} className="tx-menu-item" href={studioUrl(s, active?.channelId)} target={site === 'studio' ? '_self' : '_blank'} rel="noopener noreferrer">
            <Icon name={STUDIO_ICONS[s]} />
            <span className="grow">{t(`inpage.studio.${s}` as MessageKey)}</span>
            {site !== 'studio' && <Icon name="external" className="icon tx-menu-ext" />}
          </a>
        ))}
        {!active && <span className="tx-menu-note xsmall muted">{t('inpage.mast.studioGeneric')}</span>}
      </div>
    </div>
  );
}

interface AlertRow {
  id: string;
  at: string;
  kind: string;
  title: string;
  body: string;
  url?: string;
  read: boolean;
}

export function AlertsView({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const [tick, setTick] = useState(0);
  const list = useAsync(`launch.alerts.${tick}`, () => rpc<AlertRow[]>('launchers.alerts'));
  const markRead = async (id: string) => {
    await rpc('alerts.markRead', id).catch(() => undefined);
    setTick((n) => n + 1);
    onChanged();
  };
  if (list.error !== undefined) return <InError error={list.error} onRetry={list.reload} />;
  if (!list.data) return <span className="skel tx-skel-line" aria-busy="true" />;
  if (!list.data.length)
    return (
      <div className="tx-empty">
        <Icon name="bell" />
        <p className="small">{t('ln.alerts.none')}</p>
      </div>
    );
  return (
    <div className="stack-s">
      <ul className="tx-ln-alerts">
        {list.data.map((a) => (
          <li key={a.id} data-read={a.read}>
            <span className="tx-ln-alert-dot" aria-hidden="true" />
            <div className="grow stack-s" style={{ gap: 2 }}>
              <strong className="small" dir="auto">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    {a.title}
                  </a>
                ) : (
                  a.title
                )}
              </strong>
              <span className="xsmall muted" dir="auto">
                {a.body}
              </span>
              <span className="xsmall faint">{f.date(a.at)}</span>
            </div>
            {!a.read && (
              <button type="button" className="tx-ln-iconbtn" aria-label={t('ln.alerts.markRead', { title: a.title })} title={t('ln.alerts.markReadShort')} onClick={() => void markRead(a.id)}>
                <Icon name="check" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="tx-menu-item" onClick={() => void rpc('ui.openWorkspace', 'alerts')}>
        <Icon name="bell" />
        <span className="grow">{t('ln.alerts.all')}</span>
        <Icon name="external" className="icon tx-menu-ext" />
      </button>
    </div>
  );
}

export function SettingsView({ site }: { site: Site }) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    void loadPrefs().then(setPrefs);
    return onPrefsChanged(setPrefs);
  }, []);
  if (!prefs) return <span className="skel tx-skel-line" aria-busy="true" />;
  const map = prefs.inpage ?? {};
  const set = (id: string, v: boolean) => void updatePrefs({ inpage: { ...map, [id]: v } });
  const rows = SITE_FEATURES[site].filter((x) => t(`inpage.feature.${x.id}` as MessageKey) !== `inpage.feature.${x.id}`);
  return (
    <div className="stack">
      <p className="small muted">{t('ln.settings.desc')}</p>
      <ul className="tx-ln-switches">
        {rows.map((x) => (
          <li key={x.id}>
            <Icon name={x.icon} />
            <div className="grow stack-s" style={{ gap: 0 }}>
              <span className="small bold">{t(`inpage.feature.${x.id}` as MessageKey)}</span>
              <span className="xsmall muted">{t(`inpage.feature.${x.id}.desc` as MessageKey)}</span>
            </div>
            <Switch checked={map[x.id] !== false} onChange={(v) => set(x.id, v)} label={<span className="sr-only">{t(`inpage.feature.${x.id}` as MessageKey)}</span>} />
          </li>
        ))}
      </ul>
      <button type="button" className="tx-menu-item" onClick={() => void rpc('ui.openWorkspace', 'settings')}>
        <Icon name="settings" />
        <span className="grow">{t('ln.settings.all')}</span>
        <Icon name="external" className="icon tx-menu-ext" />
      </button>
    </div>
  );
}
