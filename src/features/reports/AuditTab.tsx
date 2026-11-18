// Best Practice Audit: checks every upload's metadata, scores it, and explains each fix. Read-only;
// fixes happen in a TubeX draft (Copy to draft) or in Studio.
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { Button, Empty, Score, SearchInput } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { AUDIT_IDS, auditAll, failureCounts, passesAudit, type AuditCheck, type AuditId } from '../../domain/reportsAudit';
import { matchesQuery } from '../../domain/text';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { useFormat } from '../research/shared';
import { draftKeywords, studioUrl, videoToDraft, type RVideo } from './data';
import { VideoTrack } from './shared';

type Sort = 'score' | 'views' | 'newest';
const PAGE = 40;

export const checkLabel = (id: AuditId): MessageKey => `reports.audit.check.${id}` as MessageKey;
export const fixKey = (c: AuditCheck): MessageKey => `reports.audit.fix.${c.id}${c.reason ? `.${c.reason}` : ''}` as MessageKey;

export function AuditTab({ videos }: { videos: RVideo[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const [keywords, setKeywords] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void draftKeywords().then(setKeywords).catch(() => undefined);
  }, []);
  const results = useMemo(() => {
    const r = auditAll(videos.map((v) => ({ ...v, keyword: keywords.get(v.id) })));
    return videos.map((v, i) => ({ v, r: r[i]! }));
  }, [videos, keywords]);
  const counts = useMemo(() => failureCounts(results.map((x) => x.r)), [results]);
  const [filter, setFilter] = useState<AuditId | 'all'>('all');
  const [sort, setSort] = useState<Sort>('score');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const shown = useMemo(() => {
    const xs = results.filter((x) => (filter === 'all' || x.r.failing.some((c) => c.id === filter)) && matchesQuery(x.v.title, q));
    const by: Record<Sort, (a: (typeof xs)[0], b: (typeof xs)[0]) => number> = {
      score: (a, b) => a.r.score - b.r.score,
      views: (a, b) => (b.v.views ?? -1) - (a.v.views ?? -1),
      newest: (a, b) => b.v.publishedAt.localeCompare(a.v.publishedAt),
    };
    return xs.sort(by[sort]);
  }, [results, filter, sort, q]);

  if (!videos.length) return <Empty icon="video" title={t('reports.noVideosTitle')}>{t('mc.noVideos')}</Empty>;
  const avg = Math.round(results.reduce((n, x) => n + x.r.score, 0) / results.length);
  const passing = results.filter((x) => passesAudit(x.r)).length;

  return (
    <div className="stack-l">
      <div className="rp-score-hero">
        <Score value={avg} large label={t('reports.audit.avg')} />
        <div className="stack-s grow" style={{ minWidth: 220 }}>
          <span className="page-kicker">{t('reports.audit.avg')}</span>
          <h2 style={{ fontSize: 28 }}>{t('reports.audit.passing', { n: f.int(passing), total: f.int(results.length) })}</h2>
          <p className="small muted">{t('reports.audit.disclaimer')}</p>
        </div>
      </div>

      <div className="stack">
        <div className="rp-chip-row" role="group" aria-label={t('reports.audit.filter')}>
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            {t('reports.audit.all')} <small>{f.int(results.length)}</small>
          </button>
          {counts.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              {t(checkLabel(c.id))} <small>{f.int(c.count)}</small>
            </button>
          ))}
        </div>
        <div className="rp-toolbar">
          <SearchInput value={q} onChange={setQ} label={t('reports.searchVideos')} placeholder={t('reports.searchVideos')} />
          <label className="row small muted">
            {t('reports.sortBy')}
            <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="score">{t('reports.sort.score')}</option>
              <option value="views">{t('reports.sort.views')}</option>
              <option value="newest">{t('reports.sort.newest')}</option>
            </select>
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty icon="check" title={t('reports.audit.noneTitle')}>
          {t('reports.audit.none')}
        </Empty>
      ) : (
        <div className="tracks">
          <div className="track-head rp-track">
            <span>#</span>
            <span>{t('yt.col.title')}</span>
            <span>{t('reports.audit.score')}</span>
          </div>
          {shown.slice(0, limit).map(({ v, r }, i) => (
            <VideoTrack
              key={v.id}
              n={i + 1}
              videoId={v.id}
              thumbnail={v.thumbnail}
              title={v.title || '—'}
              sub={
                <>
                  {v.privacy && v.privacy !== 'public' && <span className="badge" style={{ marginInlineEnd: 6 }}>{t(`mc.privacy.${v.privacy}` as MessageKey)}</span>}
                  {f.compact(v.views)} {t('reports.viewsShort')} · {f.age(v.publishedAt)}
                  {r.failing.length > 0 && (
                    <>
                      {' · '}
                      <span className={r.failing.some((c) => c.severity === 'error') ? 'neg' : 'muted'}>{t('reports.audit.fixCount', { n: r.failing.length })}</span>
                    </>
                  )}
                </>
              }
              selected={open === v.id}
              onSelect={() => setOpen(open === v.id ? null : v.id)}
              end={<Score value={r.score} label={t('reports.audit.score')} />}
            >
              {open === v.id && <AuditDetail v={v} checks={r.checks} />}
            </VideoTrack>
          ))}
          {shown.length > limit && (
            <div className="row" style={{ justifyContent: 'center', paddingBlock: 12 }}>
              <Button size="s" onClick={() => setLimit(limit + PAGE)}>
                {t('reports.showMore', { n: f.int(shown.length - limit) })}
              </Button>
            </div>
          )}
        </div>
      )}
      <p className="xsmall faint">{t('reports.audit.checksList', { n: AUDIT_IDS.length })}</p>
    </div>
  );
}

function AuditDetail({ v, checks }: { v: RVideo; checks: AuditCheck[] }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const failing = checks.filter((c) => !c.pass).sort((a, b) => b.weight - a.weight);
  const passed = checks.filter((c) => c.pass);
  const vals = (c: AuditCheck) => Object.fromEntries(Object.entries(c.values ?? {}).map(([k, x]) => [k, x])) as Record<string, string | number>;
  return (
    <div className="rp-detail">
      {failing.length ? (
        <ul className="rp-fails">
          {failing.map((c) => (
            <li key={c.id} className={c.severity === 'error' ? 'sev-error' : c.severity === 'warning' ? 'sev-warning' : 'sev-missing'}>
              <span className="check-mark" aria-hidden="true">
                {c.severity === 'tip' ? 'i' : '!'}
              </span>
              <span className="stack-s grow" style={{ gap: 0 }}>
                <b>
                  {t(checkLabel(c.id))} <span className="xsmall muted">· {t(`reports.audit.sev.${c.severity}` as MessageKey)}</span>
                </b>
                <span className="rp-fix">{t(fixKey(c), vals(c))}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">{t('reports.audit.allPass')}</p>
      )}
      {passed.length > 0 && (
        <p className="xsmall muted">
          <Icon name="check" /> {t('reports.audit.passed')}: {passed.map((c) => t(checkLabel(c.id))).join(lang === 'fa' ? '، ' : ', ')}
        </p>
      )}
      <div className="row">
        <Button
          size="s"
          variant="primary"
          onClick={async () => {
            const d = await videoToDraft(v);
            toast(t('mc.draftCreated'), { label: t('common.open'), run: () => (location.hash = `drafts/${encodeURIComponent(d.id)}`) });
          }}
        >
          <Icon name="copy" />
          {t('mc.toDraft')}
        </Button>
        <a className="btn btn-s" href={studioUrl(v.id)} target="_blank" rel="noreferrer noopener">
          <Icon name="external" />
          {t('reports.openStudio')}
        </a>
      </div>
    </div>
  );
}
