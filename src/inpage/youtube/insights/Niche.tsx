// Manage niche: the channels the owner compares against (TubeX's competitor watchlist plus the owner's own channels).
// Removing asks for nothing but offers Undo (the removed record, with its notes, is restored).
import { useState } from 'react';
import { Icon } from '../../../components/icons';
import { Avatar, IconButton } from '../../../components/ui';
import { useToast } from '../../../components/toasts';
import { useI18n } from '../../../i18n';
import { rpc } from '../../../platform/rpc';
import { InError, useAsync } from '../../common';
import { Section, useCiFmt } from './bits';
import { loadNiche, removeFromNiche, undoRemove } from './data';

export function NicheManager({ rev, onChanged, onClose }: { rev: number; onChanged: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const f = useCiFmt();
  const toast = useToast();
  const niche = useAsync(`ci:niche:${rev}`, () => loadNiche());
  const [error, setError] = useState<unknown>();
  const list = niche.data ?? [];
  return (
    <Section
      id="ci-niche"
      icon="users"
      title={t('ci.niche.title')}
      desc={t('ci.niche.desc')}
      actions={<IconButton icon="x" label={t('ci.close')} onClick={onClose} />}
    >
      {niche.loading && !niche.data && <span className="skel tx-skel-line" aria-busy="true" />}
      {niche.error !== undefined && <InError error={niche.error} onRetry={niche.reload} />}
      {niche.data && !list.some((c) => !c.mine) && <p className="small muted">{t('ci.niche.empty')}</p>}
      <ul className="ci-niche-list">
        {list.map((c) => (
          <li key={c.channelId}>
            <Avatar src={c.thumbnail} name={c.title} />
            <a className="grow ci-niche-name" href={`https://www.youtube.com/channel/${c.channelId}`}>
              <bdi>{c.title}</bdi>
              <span className="xsmall muted">
                {c.latest?.subscribers !== undefined ? t('ci.subs', { v: f.compact(c.latest.subscribers) }) : ''}
                {c.since ? `${c.latest?.subscribers !== undefined ? ' · ' : ''}${t('ci.growth.trackingSince', { date: f.sdate(c.since) })}` : t('ci.niche.noSnap')}
              </span>
            </a>
            {c.mine ? (
              <span className="tx-badge tx-badge-own">
                <Icon name="star" />
                {t('inpage.badge.own')}
              </span>
            ) : (
              <IconButton
                icon="trash"
                label={t('ci.niche.remove', { name: c.title })}
                onClick={async () => {
                  setError(undefined);
                  try {
                    if (await removeFromNiche(c.channelId)) {
                      onChanged();
                      toast(t('ci.niche.removed', { name: c.title }), {
                        label: t('common.undo'),
                        run: () => void undoRemove(c.channelId).then(onChanged, setError),
                      });
                    }
                  } catch (e) {
                    setError(e);
                  }
                }}
              />
            )}
          </li>
        ))}
      </ul>
      {error !== undefined && <InError error={error} />}
      <div className="ci-niche-foot">
        <p className="xsmall muted grow">{t('ci.niche.howAdd')}</p>
        <button type="button" className="btn btn-s btn-ghost" onClick={() => void rpc('ui.openWorkspace', 'competitors')}>
          <Icon name="external" />
          {t('ci.niche.openCompetitors')}
        </button>
      </div>
    </Section>
  );
}
