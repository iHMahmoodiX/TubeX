// Tags tab of the watch card: the video's tags as chips (click to copy one), copy all, add to a TubeX draft,
// and an opt-in tag ranking check that states its quota cost before running.
import { useState } from 'react';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { normalizeTagRanks, tagRankCost, type TagRank } from '../../domain/inpage';
import { LIMITS, tagsCharCount } from '../../domain/metadata';
import type { Draft } from '../../domain/models';
import type { VideoInfo } from '../../integrations/youtube/api';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { copyText, InError, useAsync, useFmt } from '../common';

export function WatchTags({ v }: { v: VideoInfo }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const chars = tagsCharCount(v.tags);

  const copy = async (text: string, what: string) => toast((await copyText(text)) ? t('inpage.copied', { what }) : t('common.copyFailed'));

  if (!v.tags.length)
    return (
      <div className="tx-empty">
        <Icon name="tag" />
        <p>{t('inpage.tags.none')}</p>
      </div>
    );

  return (
    <div className="stack">
      <div className="row-between">
        <span className="small muted">{t('inpage.tags.count', { n: v.tags.length, chars, max: LIMITS.tagsChars })}</span>
        <Button size="s" onClick={() => void copy(v.tags.join(', '), t('inpage.tags.all'))}>
          <Icon name="copy" />
          {t('inpage.tags.copyAll')}
        </Button>
      </div>
      <ul className="chips tx-tag-chips" aria-label={t('inpage.tab.tags')}>
        {v.tags.map((tag) => (
          <li key={tag}>
            <button type="button" className="chip" dir="auto" onClick={() => void copy(tag, `“${tag}”`)} aria-label={t('inpage.tags.copyOne', { tag })} title={t('inpage.tags.copyOne', { tag })}>
              {tag}
              <Icon name="copy" className="icon tx-chip-icon" />
            </button>
          </li>
        ))}
      </ul>
      <AddToDraft tags={v.tags} />
      <TagRanks v={v} />
      <p className="xsmall faint">{t('inpage.tags.note', { n: f.int(v.tags.length) })}</p>
    </div>
  );
}

function AddToDraft({ tags }: { tags: string[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [error, setError] = useState<unknown>();
  const drafts = useAsync(show ? 'drafts' : null, () => rpc<Draft[]>('drafts.list'));
  const sorted = (drafts.data ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const chosen = draftId || sorted[0]?.id || '';

  if (!show)
    return (
      <div>
        <Button size="s" onClick={() => setShow(true)}>
          <Icon name="plus" />
          {t('inpage.tags.toDraft')}
        </Button>
      </div>
    );
  return (
    <div className="tx-sub stack-s">
      <strong className="small">{t('inpage.tags.toDraft')}</strong>
      {drafts.loading && <span className="skel tx-skel-line" />}
      {drafts.error !== undefined && <InError error={drafts.error} />}
      {drafts.data && !sorted.length && <p className="small muted">{t('inpage.tags.noDrafts')}</p>}
      {sorted.length > 0 && (
        <div className="row">
          <select className="select tx-select" aria-label={t('inpage.tags.pickDraft')} value={chosen} onChange={(e) => setDraftId(e.target.value)}>
            {sorted.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title.trim() || t('inpage.untitledDraft')}
              </option>
            ))}
          </select>
          <Button
            size="s"
            variant="primary"
            onClick={async () => {
              setError(undefined);
              try {
                const r = await rpc<{ added: number; skipped: string[] }>('inpage.addTagsToDraft', chosen, tags.slice(0, 100));
                toast(r.skipped.length ? t('inpage.tags.addedSome', { n: r.added, skipped: r.skipped.length }) : t('inpage.tags.added', { n: r.added }));
                setShow(false);
              } catch (e) {
                setError(e);
              }
            }}
          >
            {t('inpage.tags.addTo')}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setShow(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {error !== undefined && <InError error={error} />}
    </div>
  );
}

function TagRanks({ v }: { v: VideoInfo }) {
  const { t } = useI18n();
  const f = useFmt();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => v.tags.slice(0, 5));
  const [busy, setBusy] = useState(false);
  const [ranks, setRanks] = useState<TagRank[] | null>(null);
  const [error, setError] = useState<unknown>();
  const cost = tagRankCost(picked.length);

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setRanks(normalizeTagRanks(await rpc('seo.tagRanks', v.id, picked), picked));
      setPicking(false);
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };

  return (
    <div className="tx-sub stack-s">
      <div className="row-between">
        <strong className="small">{t('inpage.ranks.title')}</strong>
        {!picking && (
          <Button size="s" onClick={() => setPicking(true)}>
            <Icon name="trophy" />
            {ranks ? t('inpage.ranks.again') : t('inpage.ranks.check')}
          </Button>
        )}
      </div>
      {picking && (
        <>
          <p className="small muted">{t('inpage.ranks.pick')}</p>
          <div className="chips">
            {v.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="chip"
                dir="auto"
                aria-pressed={picked.includes(tag)}
                onClick={() => setPicked(picked.includes(tag) ? picked.filter((x) => x !== tag) : picked.length >= 20 ? picked : [...picked, tag])}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="tx-confirm" role="group" aria-label={t('inpage.ranks.title')}>
            <Icon name="alert" />
            <p className="grow small">{t('inpage.ranks.cost', { n: picked.length, units: f.int(cost) })}</p>
            <Button size="s" variant="primary" disabled={!picked.length || busy} onClick={() => void run()}>
              {busy ? t('common.loading') : t('inpage.ranks.run', { units: f.int(cost) })}
            </Button>
            <Button size="s" variant="ghost" onClick={() => setPicking(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </>
      )}
      {error !== undefined && <InError error={error} />}
      {ranks && (
        <ol className="tx-rows">
          {ranks.map((r) => (
            <li key={r.tag}>
              <span className="grow" dir="auto">
                {r.tag}
              </span>
              {r.rank === null ? <span className="tx-badge">{t('inpage.ranks.notFound')}</span> : <span className={`tx-badge ${r.rank <= 10 ? 'tx-badge-good' : ''}`}>#{f.int(r.rank)}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
