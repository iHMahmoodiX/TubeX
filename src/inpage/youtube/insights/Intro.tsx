// First-run introduction to Channel Insights: four short feature tabs with a small illustration each.
// Inline (not a page-blocking modal), dismissable, and remembered; the "?" button in the header reopens it.
import { useState } from 'react';
import { Icon, type IconName } from '../../../components/icons';
import { IconButton } from '../../../components/ui';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/en';
import { InTabs } from '../../common';

export type IntroTab = 'start' | 'channel' | 'niche' | 'topics';

const TABS: { id: IntroTab; icon: IconName; label: MessageKey; head: MessageKey; points: MessageKey[]; action: MessageKey }[] = [
  { id: 'start', icon: 'flag', label: 'ci.intro.start', head: 'ci.intro.startHead', points: ['ci.intro.start1', 'ci.intro.start2', 'ci.intro.start3'], action: 'ci.intro.startAct' },
  { id: 'channel', icon: 'pulse', label: 'ci.intro.channel', head: 'ci.intro.channelHead', points: ['ci.intro.channel1', 'ci.intro.channel2', 'ci.intro.channel3'], action: 'ci.intro.channelAct' },
  { id: 'niche', icon: 'target', label: 'ci.intro.niche', head: 'ci.intro.nicheHead', points: ['ci.intro.niche1', 'ci.intro.niche2', 'ci.intro.niche3'], action: 'ci.intro.nicheAct' },
  { id: 'topics', icon: 'layers', label: 'ci.intro.topics', head: 'ci.intro.topicsHead', points: ['ci.intro.topics1', 'ci.intro.topics2', 'ci.intro.topics3'], action: 'ci.intro.topicsAct' },
];

export function Intro({ onClose, onAction }: { onClose: () => void; onAction: (tab: IntroTab) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<IntroTab>('start');
  const cur = TABS.find((x) => x.id === tab)!;
  const i = TABS.indexOf(cur);
  return (
    <section className="ci-intro" aria-labelledby="ci-intro-title">
      <div className="ci-intro-head">
        <div className="grow">
          <h3 id="ci-intro-title">{t('ci.intro.title')}</h3>
          <p className="small muted">{t('ci.intro.sub')}</p>
        </div>
        <IconButton icon="x" label={t('ci.intro.later')} onClick={onClose} />
      </div>
      <InTabs value={tab} onChange={setTab} label={t('ci.intro.features')} items={TABS.map((x) => ({ id: x.id, label: t(x.label), icon: x.icon }))} />
      <div className="ci-intro-body" role="tabpanel">
        <Illustration tab={tab} />
        <div className="ci-intro-text">
          <h4>{t(cur.head)}</h4>
          <ul>
            {cur.points.map((p) => (
              <li key={p}>
                <Icon name="check" />
                <span>{t(p)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="ci-intro-foot">
        <span className="ci-dots" aria-hidden="true">
          {TABS.map((x, k) => (
            <i key={x.id} data-on={k === i || undefined} />
          ))}
        </span>
        <span className="grow" />
        <button type="button" className="btn btn-s btn-ghost" onClick={onClose}>
          {t('ci.intro.later')}
        </button>
        <button
          type="button"
          className="btn btn-s btn-primary"
          onClick={() => {
            onAction(tab);
            onClose();
          }}
        >
          {t(cur.action)}
        </button>
      </div>
    </section>
  );
}

/** Tiny abstract drawings of each feature, built from CSS shapes (no data shown). */
function Illustration({ tab }: { tab: IntroTab }) {
  if (tab === 'start')
    return (
      <div className="ci-ill" aria-hidden="true">
        <div className="ci-ill-niche">
          {[0, 1, 2, 3].map((k) => (
            <span key={k} data-on={k < 3 || undefined}>
              <i />
              <em />
            </span>
          ))}
        </div>
      </div>
    );
  if (tab === 'channel')
    return (
      <div className="ci-ill" aria-hidden="true">
        <div className="ci-ill-bench">
          <span className="ci-ill-bar" />
          <span className="ci-ill-pin" style={{ insetInlineStart: '30%' }} />
          <span className="ci-ill-pin" data-you="true" style={{ insetInlineStart: '58%' }} />
          <span className="ci-ill-pin" data-niche="true" style={{ insetInlineStart: '78%' }} />
        </div>
      </div>
    );
  if (tab === 'niche')
    return (
      <div className="ci-ill" aria-hidden="true">
        <div className="ci-ill-dist">
          {[22, 34, 48, 60, 54, 40, 28, 18, 12, 8].map((h, k) => (
            <span key={k} style={{ blockSize: `${h}%` }} data-band={k >= 9 ? 'veryRare' : k >= 8 ? 'rare' : k >= 7 ? 'uncommon' : undefined} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="ci-ill" aria-hidden="true">
      <div className="ci-ill-matrix">
        {[0.7, 0, 0.4, 0.2, 0.9, 0, 0, 0.5, 0.3].map((v, k) => (
          <span key={k} style={{ ['--v' as string]: v }} data-none={v === 0 || undefined} />
        ))}
      </div>
    </div>
  );
}
