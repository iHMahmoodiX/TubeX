// Settings → In-page tools: a master switch and one switch per island. Islands read prefs.inpage live
// (useInpageEnabled), so a change shows on open YouTube/Studio tabs without reloading.
import { Icon, type IconName } from '../../components/icons';
import { usePrefs } from '../../components/AppShell';
import { Switch } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';

export const INPAGE_FEATURES: { id: string; icon: IconName; site: 'youtube' | 'studio' }[] = [
  { id: 'watch', icon: 'video', site: 'youtube' },
  { id: 'search', icon: 'search', site: 'youtube' },
  { id: 'channel', icon: 'users', site: 'youtube' },
  { id: 'masthead', icon: 'menu', site: 'youtube' },
  { id: 'studioEditor', icon: 'edit', site: 'studio' },
  { id: 'studioUpload', icon: 'upload', site: 'studio' },
  { id: 'studioComments', icon: 'message', site: 'studio' },
];

export function InpageSettings() {
  const { t } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const map = prefs.inpage ?? {};
  const allOn = map.all !== false;
  const set = (key: string, v: boolean) => void setPrefs({ inpage: { ...map, [key]: v } });

  return (
    <section className="card stack" aria-labelledby="inpage-h">
      <div className="row-between">
        <div className="stack-s grow" style={{ gap: 2 }}>
          <h2 id="inpage-h">{t('inpage.settings.title')}</h2>
          <p className="muted small">{t('inpage.settings.desc')}</p>
        </div>
      </div>
      <Switch checked={allOn} onChange={(v) => set('all', v)} label={<strong>{t('inpage.settings.all')}</strong>} />
      {(['youtube', 'studio'] as const).map((site) => (
        <div key={site} className="stack-s">
          <span className="small bold muted">{t(site === 'youtube' ? 'inpage.settings.youtube' : 'inpage.settings.studio')}</span>
          <ul className="tracks" aria-label={t(site === 'youtube' ? 'inpage.settings.youtube' : 'inpage.settings.studio')}>
            {INPAGE_FEATURES.filter((x) => x.site === site).map((x) => (
              <li key={x.id} className="track">
                <span className="track-n" aria-hidden="true">
                  <Icon name={x.icon} />
                </span>
                <div className="track-main">
                  <div className="stack-s" style={{ gap: 0 }}>
                    <span className="track-title">{t(`inpage.feature.${x.id}` as MessageKey)}</span>
                    <span className="track-sub">{t(`inpage.feature.${x.id}.desc` as MessageKey)}</span>
                  </div>
                </div>
                <div className="track-end">
                  <Switch checked={allOn && map[x.id] !== false} disabled={!allOn} onChange={(v) => set(x.id, v)} label={<span className="sr-only">{t(`inpage.feature.${x.id}` as MessageKey)}</span>} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="xsmall muted">{t('inpage.settings.note')}</p>
    </section>
  );
}
