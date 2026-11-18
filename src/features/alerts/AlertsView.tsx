import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Button, Empty, IconButton, Notice, PageHeader, Tabs } from '../../components/ui';
import { useWork } from '../../components/useWork';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { del, put, type Job } from '../../storage/stores';

const STATUS_TONE: Record<Job['status'], string> = { pending: 'badge-info', running: 'badge-accent', done: 'badge-accent', failed: 'badge-danger', canceled: '' };

export function AlertsView({ tab }: { tab?: string }) {
  const { t, formatDate } = useI18n();
  const [view, setView] = useState<'alerts' | 'jobs'>(tab === 'jobs' ? 'jobs' : 'alerts');
  const alerts = useWork('alerts');
  const jobs = useWork('jobs');
  const sortedAlerts = [...alerts.items].sort((a, b) => b.at.localeCompare(a.at));
  const sortedJobs = [...jobs.items].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.runAt.localeCompare(a.runAt));
  const unread = alerts.items.filter((a) => !a.read).length;

  return (
    <div className="stack-l">
      <PageHeader kicker={t('nav.alerts')} title={t('alerts.title')} desc={t('alerts.desc')} />
      <div className="row-between">
        <Tabs
          label={t('alerts.title')}
          value={view}
          onChange={setView}
          items={[
            { id: 'alerts', label: t('alerts.tab.alerts'), icon: 'bell', count: unread || undefined },
            { id: 'jobs', label: t('alerts.tab.jobs'), icon: 'clock', count: jobs.items.filter((j) => j.status === 'pending').length || undefined },
          ]}
        />
        {view === 'alerts' && alerts.items.length > 0 && (
          <div className="row">
            <Button size="s" variant="ghost" onClick={() => void Promise.all(alerts.items.filter((a) => !a.read).map((a) => put('alerts', { ...a, read: true })))}>
              {t('alerts.markAll')}
            </Button>
            <Button size="s" variant="ghost" onClick={() => void Promise.all(alerts.items.filter((a) => a.read).map((a) => del('alerts', a.id)))}>
              {t('alerts.clearRead')}
            </Button>
          </div>
        )}
      </div>

      {view === 'alerts' &&
        (alerts.loaded && !sortedAlerts.length ? (
          <Empty icon="bell" title={t('alerts.empty')}>
            {t('alerts.emptyHelp')}
          </Empty>
        ) : (
          <ul className="list">
            {sortedAlerts.map((a) => (
              <li key={a.id} className="track" style={{ gridTemplateColumns: '28px minmax(0,1fr) auto' }} data-selected={!a.read}>
                <span className="track-n">{a.read ? <Icon name="bell" /> : <span className="dot dot-on" aria-label="new" />}</span>
                <div className="stack-s" style={{ gap: 0 }}>
                  <span className={a.read ? '' : 'bold'} dir="auto">
                    {a.title}
                  </span>
                  <span className="track-sub" dir="auto">
                    {a.body}
                  </span>
                  <span className="xsmall faint">{formatDate(a.at)}</span>
                </div>
                <div className="row">
                  {a.url && (
                    <a className="btn btn-s" href={a.url} target="_blank" rel="noreferrer" onClick={() => void put('alerts', { ...a, read: true })}>
                      {t('alerts.open')}
                    </a>
                  )}
                  <IconButton icon="x" label={t('alerts.delete')} onClick={() => void del('alerts', a.id)} />
                </div>
              </li>
            ))}
          </ul>
        ))}

      {view === 'jobs' && (
        <div className="stack">
          <Notice>{t('jobs.browserOpen')}</Notice>
          {jobs.loaded && !sortedJobs.length ? (
            <Empty icon="clock" title={t('jobs.empty')}>
              {t('jobs.emptyHelp')}
            </Empty>
          ) : (
            <ul className="list">
              {sortedJobs.map((j) => (
                <li key={j.id} className="track">
                  <span className="track-n">
                    <Icon name={j.everyMinutes ? 'refresh' : 'clock'} />
                  </span>
                  <div className="stack-s" style={{ gap: 0 }}>
                    <span dir="auto">{j.label}</span>
                    <span className="track-sub">
                      {t('jobs.runAt', { when: formatDate(j.runAt) })}
                      {j.everyMinutes ? ` · ${t('jobs.every', { n: j.everyMinutes })}` : ''}
                    </span>
                    {j.result && (
                      <span className="xsmall faint" dir="auto">
                        {j.result}
                      </span>
                    )}
                  </div>
                  <div className="row">
                    <span className={`badge ${STATUS_TONE[j.status]}`}>{t(`jobs.status.${j.status}`)}</span>
                    {(j.status === 'pending' || j.status === 'failed') && (
                      <Button size="s" variant="ghost" onClick={() => void rpc('jobs.cancel', j.id)}>
                        {t('jobs.cancel')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
