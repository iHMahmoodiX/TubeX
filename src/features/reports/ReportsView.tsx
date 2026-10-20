// Reports: channel health, best-practice audit, retention, best time to publish, click magnet,
// opportunities and demonetization risk. All read-only; everything needs Google sign-in.
import { useEffect, useState } from 'react';
import type { IconName } from '../../components/icons';
import { Avatar, PageHeader, Tabs } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { ErrorNotice } from '../connections/ErrorNotice';
import { AuditTab } from './AuditTab';
import { BestTimeTab } from './BestTimeTab';
import { ClickTab } from './ClickTab';
import { DemonetizationTab } from './DemonetizationTab';
import { HealthTab } from './HealthTab';
import { useChannel, useOwnVideos } from './hooks';
import { OpportunitiesTab } from './OpportunitiesTab';
import { RetentionTab } from './RetentionTab';
import { RefreshButton, SignedOut, TrackSkeleton } from './shared';
import './reports.css';

export const REPORT_TABS = ['health', 'audit', 'retention', 'besttime', 'clickmagnet', 'opportunities', 'demonetization'] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export const REPORT_META: Record<ReportTab, { icon: IconName; label: MessageKey; desc: MessageKey }> = {
  health: { icon: 'pulse', label: 'reports.tab.health', desc: 'reports.desc.health' },
  audit: { icon: 'check', label: 'reports.tab.audit', desc: 'reports.desc.audit' },
  retention: { icon: 'trend', label: 'reports.tab.retention', desc: 'reports.desc.retention' },
  besttime: { icon: 'clock', label: 'reports.tab.besttime', desc: 'reports.desc.besttime' },
  clickmagnet: { icon: 'target', label: 'reports.tab.clickmagnet', desc: 'reports.desc.clickmagnet' },
  opportunities: { icon: 'rocket', label: 'reports.tab.opportunities', desc: 'reports.desc.opportunities' },
  demonetization: { icon: 'dollar', label: 'reports.tab.demonetization', desc: 'reports.desc.demonetization' },
};

const asTab = (t: string | undefined): ReportTab => (REPORT_TABS as readonly string[]).includes(t ?? '') ? (t as ReportTab) : 'health';

export function ReportsView({ tab }: { tab?: string }) {
  const { t } = useI18n();
  const [cur, setCur] = useState<ReportTab>(() => asTab(tab));
  useEffect(() => setCur(asTab(tab)), [tab]);
  const { g, active } = useChannel();
  const vids = useOwnVideos(active);

  const select = (id: ReportTab) => {
    setCur(id);
    if (location.hash !== `#reports/${id}`) location.hash = `reports/${id}`;
  };

  const meta = REPORT_META[cur];
  return (
    <div className="stack-l">
      <PageHeader
        kicker={active ? `${t('nav.reports')} · ${active.title}` : t('nav.reports')}
        title={t(meta.label)}
        desc={t(meta.desc)}
        art={active ? <Avatar src={active.thumbnail} name={active.title} size="l" /> : undefined}
        actions={active ? <RefreshButton loading={vids.loading} onClick={() => void vids.run(true)} /> : undefined}
      />
      <Tabs value={cur} onChange={select} label={t('nav.reports')} items={REPORT_TABS.map((id) => ({ id, label: t(REPORT_META[id].label), icon: REPORT_META[id].icon }))} />
      <div role="tabpanel" aria-label={t(meta.label)} className="stack-l">
        {!g.loaded ? (
          <TrackSkeleton rows={4} />
        ) : !active ? (
          <SignedOut />
        ) : (
          <>
            <ErrorNotice error={vids.error} />
            {!vids.data ? (
              vids.loading || !vids.error ? <TrackSkeleton rows={6} /> : null
            ) : (
              <Body key={`${active.channelId}:${cur}`} tab={cur} channelId={active.channelId} videos={vids.data} onTab={select} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Body({ tab, channelId, videos, onTab }: { tab: ReportTab; channelId: string; videos: import('./data').RVideo[]; onTab: (t: ReportTab) => void }) {
  switch (tab) {
    case 'audit':
      return <AuditTab videos={videos} />;
    case 'retention':
      return <RetentionTab channelId={channelId} videos={videos} />;
    case 'besttime':
      return <BestTimeTab channelId={channelId} videos={videos} />;
    case 'clickmagnet':
      return <ClickTab channelId={channelId} videos={videos} />;
    case 'opportunities':
      return <OpportunitiesTab channelId={channelId} videos={videos} />;
    case 'demonetization':
      return <DemonetizationTab videos={videos} />;
    default:
      return <HealthTab channelId={channelId} videos={videos} onTab={onTab} />;
  }
}
