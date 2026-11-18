// Rankings: keyword rank tracking (search positions over time), tag rankings of a video and brand alerts.
import { useEffect, useState } from 'react';
import { PageHeader, Tabs } from '../../components/ui';
import { useI18n } from '../../i18n';
import { usePublicAccess } from '../research/access';
import { NeedsAccess } from '../research/parts';
import { Brand } from './Brand';
import { TagRanks } from './TagRanks';
import { Tracking } from './Tracking';
import '../research/seo.css';

type Tab = 'tracking' | 'tags' | 'brand';
const TABS: Tab[] = ['tracking', 'tags', 'brand'];

export function RanksView({ tab }: { tab?: string }) {
  const { t } = useI18n();
  const access = usePublicAccess();
  const fromRoute: Tab = TABS.find((x) => x === tab) ?? 'tracking';
  const [current, setCurrent] = useState<Tab>(fromRoute);
  useEffect(() => {
    setCurrent(fromRoute);
    const on = () => {
      const [route, sub] = location.hash.replace(/^#/, '').split('/');
      if (route === 'ranks') setCurrent(TABS.find((x) => x === sub) ?? 'tracking');
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [fromRoute]);
  return (
    <div className="stack-l">
      <PageHeader kicker={t('shell.group.grow')} title={t('nav.ranks')} desc={t('seo.ranks.desc')} />
      {access.loaded && !access.ok && <NeedsAccess />}
      <Tabs
        label={t('nav.ranks')}
        value={current}
        onChange={(v) => {
          setCurrent(v);
          // Keeps the tab in the address (reload, bookmarks) without a hashchange, which would move focus to the page title.
          history.replaceState(history.state, '', `#ranks/${v}`);
        }}
        items={[
          { id: 'tracking', label: t('seo.ranks.tab.tracking'), icon: 'trend' },
          { id: 'tags', label: t('seo.ranks.tab.tags'), icon: 'tag' },
          { id: 'brand', label: t('seo.ranks.tab.brand'), icon: 'bell' },
        ]}
      />
      {current === 'tracking' && <Tracking canRead={access.ok} />}
      {current === 'tags' && <TagRanks canRead={access.ok} />}
      {current === 'brand' && <Brand canRead={access.ok} />}
    </div>
  );
}
