// Studio Content list page (#2, #3): bulk & tools menu in the header, selection-toolbar actions.
// Contract: `registerStudioContentIslands` mounts this area's islands (own anchors, own CSS); `StudioContentPanel` is this area's
// page-aware panel shown inside the TubeX drawer (returns null when the current page is not its page).
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { Icon } from '../../../components/icons';
import { contentTab, VIDEO_TABS } from '../../../domain/coppa';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n/en';
import { studioEditorSpot } from '../../../platform/youtubeDomInpage';
import { InError } from '../../common';
import { useHref, useInpageEnabled } from '../../InpageRoot';
import { mountIsland } from '../../mount';
import { readSelectedRows, relatedSpot, selectionSpot, toolsSpot } from './dom';
import { ContentTools, FEATURE, SelectionActions, useToolRunner } from './Menus';
import { onStudioEdit, RelatedEditor } from './RelatedEditor';
import { TOOL_GROUPS } from './tools';
import './content.css';

const onContent = () => contentTab(location.href) !== null;
const onVideoTab = () => {
  const tab = contentTab(location.href);
  return !!tab && VIDEO_TABS.includes(tab);
};

export async function registerStudioContentIslands(ctx: ContentScriptContext): Promise<void> {
  await Promise.all([
    mountIsland(ctx, { name: 'tubex-sc-tools', when: onContent, anchor: () => toolsSpot(document), render: () => <ContentTools /> }),
    mountIsland(ctx, { name: 'tubex-sc-select', when: onVideoTab, anchor: () => selectionSpot(document), render: () => <SelectionActions /> }),
    mountIsland(ctx, { name: 'tubex-sc-related', when: onStudioEdit, anchor: () => relatedSpot(document) ?? studioEditorSpot(document), render: () => <RelatedEditor /> }),
  ]);
}

/** Drawer panel on the Content page: the same tool groups as the header menu, as a vertical list. */
export function StudioContentPanel() {
  const href = useHref();
  const on = useInpageEnabled(FEATURE);
  if (!on || contentTab(href) === null) return null;
  return <Panel />;
}

function Panel() {
  const { t } = useI18n();
  const runner = useToolRunner();
  const videoTab = !!runner.tab && VIDEO_TABS.includes(runner.tab);
  return (
    <section className="sc-panel stack-s" aria-label={t('sc.panel.title')}>
      <div className="stack-s" style={{ gap: 2 }}>
        <h3 className="sc-panel-title">{t('sc.panel.title')}</h3>
        <p className="xsmall muted">{runner.tab ? t('sc.panel.sub', { tab: t(`sc.tab.${runner.tab}` as MessageKey) }) : ''}</p>
      </div>
      {videoTab && (
        <div className="sc-panel-group" role="group" aria-label={t('sc.sel.kids')}>
          <span className="sc-group-label">
            <Icon name="check" />
            {t('sc.panel.selected')}
          </span>
          <button type="button" className="tx-menu-item sc-item" onClick={() => runner.setFlow({ kind: 'kids', rows: readSelectedRows(document), value: null })}>
            <Icon name="shield" />
            <span className="grow">{t('sc.panel.kidsSel')}</span>
          </button>
          <button
            type="button"
            className="tx-menu-item sc-item"
            aria-disabled={runner.tab !== 'shorts' || undefined}
            title={runner.tab !== 'shorts' ? t('sc.rel.shortsOnly') : undefined}
            onClick={() => runner.tab === 'shorts' && runner.setFlow({ kind: 'related', rows: readSelectedRows(document), mode: 'add' })}
          >
            <Icon name="link" />
            <span className="stack-s grow" style={{ gap: 0 }}>
              <span>{t('sc.panel.relatedSel')}</span>
              {runner.tab !== 'shorts' && <span className="xsmall muted">{t('sc.rel.shortsOnly')}</span>}
            </span>
          </button>
          <p className="xsmall faint sc-panel-hint">{t('sc.panel.hint')}</p>
        </div>
      )}
      {TOOL_GROUPS.map((g) => (
        <div key={g.id} className="sc-panel-group" role="group" aria-label={t(g.label)}>
          <span className="sc-group-label">
            <Icon name={g.icon} />
            {t(g.label)}
          </span>
          {g.items.map((it) => {
            const off = it.action.kind === 'off';
            return (
              <button key={it.id} type="button" className="tx-menu-item sc-item" aria-disabled={off || undefined} title={off ? t((it.action as { reason: MessageKey }).reason) : undefined} onClick={() => runner.run(it.action)}>
                <Icon name={it.icon} />
                <span className="stack-s grow" style={{ gap: 0, minWidth: 0 }}>
                  <span>{t(it.label)}</span>
                  {it.action.kind === 'off' && <span className="xsmall muted">{t(it.action.reason)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      {runner.error !== undefined && <InError error={runner.error} />}
      {runner.sheet}
    </section>
  );
}
