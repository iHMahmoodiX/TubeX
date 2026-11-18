// Brand alerts: terms (channel name, brand, product) searched for new videos by other channels.
// search.list order=date since the last check, 100 units each, every 12 h in the background.
import { useState } from 'react';
import { SEARCH_COST } from '../../domain/seo';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Notice, Switch, Thumb } from '../../components/ui';
import { useWork } from '../../components/useWork';
import { useI18n } from '../../i18n';
import { put } from '../../storage/stores';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle } from '../connections/useConnections';
import { SectionHead } from '../research/parts';
import { useFormat } from '../research/shared';
import { brandConfig, checkBrand, createBrandTracker, deleteTracker, watchUrl } from './service';

export function Brand({ canRead }: { canRead: boolean }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const google = useGoogle();
  const trackers = useWork('trackers');
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const brands = trackers.items.filter((x) => x.kind === 'brand').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const enabled = brands.filter((b) => b.enabled).length;
  const suggestions = [...new Set(google.channels.flatMap((c) => [c.title, c.handle].filter(Boolean)))].filter((s) => !brands.some((b) => brandConfig(b).term.toLowerCase() === s.toLowerCase()));
  const mentions = brands
    .filter((b) => !filter || b.id === filter)
    .flatMap((b) => brandConfig(b).mentions.map((m) => ({ ...m, term: brandConfig(b).term })))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const check = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const found = await checkBrand(id);
      toast(t('seo.brand.found', { n: found.length }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };
  const add = async (value: string) => {
    if (!value.trim()) return;
    const tr = await createBrandTracker(value);
    setTerm('');
    if (canRead) await check(tr.id);
  };

  return (
    <div className="stack-l">
      <form
        className="seo-searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          void add(term);
        }}
      >
        <div className="search-wrap">
          <Icon name="bell" />
          <input className="input" dir="auto" aria-label={t('seo.brand.term')} placeholder={t('seo.brand.placeholder')} value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!term.trim() || !!busy}>
          {t('seo.brand.add')}
        </button>
      </form>
      <div className="row" style={{ marginBlockStart: -12 }}>
        <span className="seo-cost">{t('seo.brand.cost', { n: SEARCH_COST, day: f.int(enabled * SEARCH_COST * 2) })}</span>
        {suggestions.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => void add(s)}>
            <Icon name="plus" /> <bdi>{s}</bdi>
          </button>
        ))}
      </div>
      <ErrorNotice error={error} />

      <section className="seo-section" aria-labelledby="br-terms">
        <SectionHead id="br-terms" title={t('seo.brand.terms')} />
        {trackers.loaded && !brands.length ? (
          <Empty icon="bell" title={t('seo.brand.emptyTitle')}>
            {t('seo.brand.emptyHelp')}
          </Empty>
        ) : (
          <ul className="list">
            {brands.map((b) => {
              const c = brandConfig(b);
              return (
                <li key={b.id} className="seo-track" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }} data-selected={filter === b.id || undefined}>
                  <Switch checked={b.enabled} onChange={(v) => void put('trackers', { ...b, enabled: v })} label={<span className="sr-only">{t('seo.brand.auto', { term: c.term })}</span>} />
                  <button type="button" className="item-button stack-s" style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0, textAlign: "start" }} aria-pressed={filter === b.id} onClick={() => setFilter((x) => (x === b.id ? null : b.id))}>
                    <span className="bold truncate">
                      <bdi>{c.term}</bdi>
                    </span>
                    <span className="xsmall faint">
                      {t('seo.brand.mentions', { n: c.mentions.length })} · {b.lastCheckedAt ? t('seo.rank.lastChecked', { when: formatDate(b.lastCheckedAt) }) : t('seo.rank.neverChecked')}
                      {!b.enabled && ` · ${t('seo.brand.paused')}`}
                    </span>
                  </button>
                  <div className="row-nowrap">
                    <Button size="s" disabled={busy === b.id || !canRead} onClick={() => void check(b.id)}>
                      {busy === b.id ? t('common.loading') : t('seo.rank.checkNow')}
                    </Button>
                    <ConfirmButton size="s" label={t('common.delete')} question={t('seo.brand.deleteQ', { term: c.term })} confirmLabel={t('common.delete')} onConfirm={() => deleteTracker(b.id)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {brands.length > 0 && (
        <section className="seo-section" aria-labelledby="br-m">
          <SectionHead id="br-m" title={t('seo.brand.mentionsTitle')} sub={filter ? t('seo.brand.filtered') : t('seo.brand.mentionsHelp')} />
          {!mentions.length ? (
            <Empty icon="search">{t('seo.brand.noMentions')}</Empty>
          ) : (
            <ol className="seo-tracks">
              {mentions.map((m, i) => (
                <li key={`${m.id}-${m.term}`} className="seo-track">
                  <span className="track-n">{f.int(i + 1)}</span>
                  <div className="seo-track-main">
                    <Thumb videoId={m.id} src={m.thumbnail} width={88} />
                    <div className="seo-track-text">
                      <a className="seo-track-title truncate" href={watchUrl(m.id)} target="_blank" rel="noreferrer noopener" dir="auto">
                        {m.title}
                      </a>
                      <span className="seo-track-sub truncate">
                        <a href={`https://www.youtube.com/channel/${m.channelId}`} target="_blank" rel="noreferrer noopener" style={{ color: 'inherit' }}>
                          <bdi>{m.channelTitle}</bdi>
                        </a>
                        <span className="badge" style={{ marginInlineStart: 6 }}>
                          <bdi>{m.term}</bdi>
                        </span>
                      </span>
                    </div>
                  </div>
                  <span className="seo-track-end">
                    <span className="seo-num">{m.publishedAt ? f.age(m.publishedAt) : '—'}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <Notice>
        <p>{t('seo.brand.how')}</p>
        <p className="small muted">{t('jobs.browserOpen')}</p>
      </Notice>
    </div>
  );
}
