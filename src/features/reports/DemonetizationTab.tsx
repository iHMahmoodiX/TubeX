// Demonetization Audit: a heuristic word-list check of titles, descriptions and tags against YouTube's
// advertiser-friendly categories, with highlighted matches and an optional AI second opinion. It is not
// YouTube's decision and says so.
import { useMemo, useState } from 'react';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { Button, Empty, Notice, SearchInput, Switch } from '../../components/ui';
import { AD_CATEGORIES, checkAdFriendly, segments, tagsText, type AdCategory, type AdMatch, type AdReport, type AdRisk } from '../../domain/reportsDemonetization';
import { matchesQuery } from '../../domain/text';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useFormat } from '../research/shared';
import { studioUrl, type RVideo } from './data';
import { VideoTrack } from './shared';

interface Item {
  key: string;
  kind: 'video' | 'draft';
  id: string;
  title: string;
  description: string;
  tags: string[];
  thumbnail?: string;
  videoId?: string;
  report: AdReport;
}

const RISK_ORDER: Record<AdRisk, number> = { high: 3, medium: 2, low: 1, none: 0 };
const PAGE = 40;

export function RiskBadge({ risk }: { risk: AdRisk }) {
  const { t } = useI18n();
  const cls = risk === 'high' ? 'badge-danger' : risk === 'medium' ? 'badge-warning' : risk === 'low' ? '' : 'badge-accent';
  return <span className={`badge ${cls}`}>{t(`reports.demo.risk.${risk}` as MessageKey)}</span>;
}

export function DemonetizationTab({ videos }: { videos: RVideo[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const drafts = useCollection('drafts');
  const [withDrafts, setWithDrafts] = useState(false);
  const [cat, setCat] = useState<AdCategory | 'all'>('all');
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const items = useMemo<Item[]>(() => {
    const vs: Item[] = videos.map((v) => ({ key: `v:${v.id}`, kind: 'video', id: v.id, videoId: v.id, title: v.title, description: v.description, tags: v.tags, thumbnail: v.thumbnail, report: checkAdFriendly(v) }));
    const ds: Item[] = withDrafts
      ? drafts.items.map((d) => ({ key: `d:${d.id}`, kind: 'draft', id: d.id, title: d.title || '—', description: d.description, tags: d.tags, videoId: d.source?.videoId, report: checkAdFriendly(d) }))
      : [];
    return [...ds, ...vs].sort((a, b) => RISK_ORDER[b.report.risk] - RISK_ORDER[a.report.risk] || b.report.points - a.report.points);
  }, [videos, drafts.items, withDrafts]);

  const counts = useMemo(() => {
    const c: Record<AdRisk, number> = { high: 0, medium: 0, low: 0, none: 0 };
    for (const i of items) c[i.report.risk]++;
    return c;
  }, [items]);
  const catCounts = useMemo(() => Object.fromEntries(AD_CATEGORIES.map((c) => [c, items.filter((i) => i.report.categories.includes(c)).length])) as Record<AdCategory, number>, [items]);
  const shown = items.filter((i) => (!onlyFlagged || i.report.risk !== 'none') && (cat === 'all' || i.report.categories.includes(cat)) && matchesQuery(`${i.title} ${i.tags.join(' ')}`, q));

  return (
    <div className="stack-l">
      <Notice tone="warning">
        <p>
          <b>{t('reports.demo.heuristic')}</b> {t('reports.demo.disclaimer')}
        </p>
      </Notice>
      <div className="stats rp-stats">
        {(['high', 'medium', 'low', 'none'] as AdRisk[]).map((r) => (
          <div key={r} className="stat">
            <span>{t(`reports.demo.risk.${r}` as MessageKey)}</span>
            <b className={r === 'high' && counts[r] > 0 ? 'neg' : undefined}>{f.int(counts[r])}</b>
          </div>
        ))}
      </div>
      <div className="stack">
        <div className="rp-chip-row" role="group" aria-label={t('reports.demo.category')}>
          <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
            {t('reports.audit.all')}
          </button>
          {AD_CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)} disabled={!catCounts[c]}>
              {t(`reports.demo.cat.${c}` as MessageKey)} <small>{f.int(catCounts[c])}</small>
            </button>
          ))}
        </div>
        <div className="rp-toolbar">
          <SearchInput value={q} onChange={setQ} label={t('reports.searchVideos')} placeholder={t('reports.searchVideos')} />
          <Switch checked={onlyFlagged} onChange={setOnlyFlagged} label={t('reports.demo.onlyFlagged')} />
          <Switch checked={withDrafts} onChange={setWithDrafts} label={t('reports.demo.withDrafts', { n: f.int(drafts.items.length) })} />
        </div>
      </div>
      {shown.length === 0 ? (
        <Empty icon="shield" title={t('reports.demo.noneTitle')}>
          {t('reports.demo.none')}
        </Empty>
      ) : (
        <div className="tracks">
          {shown.slice(0, limit).map((i, n) => (
            <VideoTrack
              key={i.key}
              n={n + 1}
              videoId={i.kind === 'video' ? i.videoId : undefined}
              thumbnail={i.thumbnail}
              title={i.title}
              sub={
                <>
                  {i.kind === 'draft' && <span className="badge" style={{ marginInlineEnd: 6 }}>{t('reports.demo.draft')}</span>}
                  {i.report.matches.length ? t('reports.demo.matches', { n: f.int(i.report.matches.length), cats: i.report.categories.map((c) => t(`reports.demo.cat.${c}` as MessageKey)).join(' · ') }) : t('reports.demo.clean')}
                </>
              }
              selected={open === i.key}
              onSelect={() => setOpen(open === i.key ? null : i.key)}
              end={<RiskBadge risk={i.report.risk} />}
            >
              {open === i.key && <Detail item={i} />}
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
      <p className="xsmall faint">{t('reports.demo.method')}</p>
    </div>
  );
}

function Highlighted({ text, matches }: { text: string; matches: AdMatch[] }) {
  const { t } = useI18n();
  return (
    <>
      {segments(text, matches).map((s, i) =>
        s.match ? (
          <mark key={i} data-sev={s.match.severity} title={`${t(`reports.demo.cat.${s.match.category}` as MessageKey)} · ${t(`reports.demo.sev.${s.match.severity}` as MessageKey)}`}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Detail({ item }: { item: Item }) {
  const { t } = useI18n();
  const m = item.report.matches;
  const by = (field: AdMatch['field']) => m.filter((x) => x.field === field);
  const [ai, setAi] = useState<{ risk: string; reasons: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const second = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await runAiJson({
        task: 'reports.ad-friendly.v1',
        instructions:
          'Judge how advertiser-friendly this YouTube video metadata is under YouTube’s advertiser-friendly content guidelines (violence, adult content, profanity, drugs, hateful content, sensitive events, firearms, controversial issues). Consider context (education, news, art). ' +
          'Return {"risk": "none"|"low"|"medium"|"high", "reasons": [up to 4 short reasons in the same language as the title]}.',
        data: dataBlock('Title', item.title, 300) + dataBlock('Description', item.description, 3000) + dataBlock('Tags', item.tags.join(', '), 500),
        maxTokens: 600,
      });
      const risk = ['none', 'low', 'medium', 'high'].includes(String(r.output.risk)) ? String(r.output.risk) : 'unknown';
      const reasons = Array.isArray(r.output.reasons) ? r.output.reasons.filter((x): x is string => typeof x === 'string').slice(0, 4) : [];
      setAi({ risk, reasons });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rp-detail">
      <div className="stack-s">
        <span className="xsmall muted">{t('yt.col.title')}</span>
        <p className="rp-hl" dir="auto">
          <Highlighted text={item.title} matches={by('title')} />
        </p>
      </div>
      {item.tags.length > 0 && (
        <div className="stack-s">
          <span className="xsmall muted">{t('reports.demo.tags')}</span>
          <p className="rp-hl" dir="auto">
            <Highlighted text={tagsText(item.tags)} matches={by('tags')} />
          </p>
        </div>
      )}
      {item.description.trim() && (
        <div className="stack-s">
          <span className="xsmall muted">{t('reports.demo.description')}</span>
          <p className="rp-hl rp-hl-desc" dir="auto">
            <Highlighted text={item.description} matches={by('description')} />
          </p>
        </div>
      )}
      {m.length > 0 && (
        <ul className="rp-fails">
          {m.map((x, i) => (
            <li key={i} className={x.severity === 'high' ? 'sev-error' : x.severity === 'medium' ? 'sev-warning' : 'sev-missing'}>
              <span className="check-mark" aria-hidden="true">
                !
              </span>
              <span>
                <bdi className="bold">{x.text}</bdi> · {t(`reports.demo.cat.${x.category}` as MessageKey)} · {t(`reports.demo.sev.${x.severity}` as MessageKey)} · {t(`reports.demo.field.${x.field}` as MessageKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">{t(m.length ? 'reports.demo.advice' : 'reports.demo.cleanAdvice')}</p>
      <div className="row">
        <Button size="s" disabled={busy} onClick={() => void second()}>
          <Icon name="sparkle" />
          {busy ? t('common.loading') : t('reports.demo.ai')}
        </Button>
        {item.kind === 'video' && item.videoId && (
          <a className="btn btn-s btn-ghost" href={studioUrl(item.videoId)} target="_blank" rel="noreferrer noopener">
            <Icon name="external" />
            {t('reports.openStudio')}
          </a>
        )}
        {item.kind === 'draft' && (
          <a className="btn btn-s btn-ghost" href={`#drafts/${encodeURIComponent(item.id)}`}>
            <Icon name="edit" />
            {t('reports.demo.openDraft')}
          </a>
        )}
      </div>
      <ErrorNotice error={error} />
      {ai && (
        <Notice tone={ai.risk === 'high' ? 'error' : ai.risk === 'medium' ? 'warning' : 'info'}>
          <p>
            <b>{t('reports.demo.aiSays')}</b> {ai.risk === 'unknown' ? '—' : t(`reports.demo.risk.${ai.risk}` as MessageKey)}
          </p>
          {ai.reasons.length > 0 && (
            <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
              {ai.reasons.map((r) => (
                <li key={r} dir="auto">
                  {r}
                </li>
              ))}
            </ul>
          )}
          <p className="xsmall muted">{t('reports.demo.aiNote')}</p>
        </Notice>
      )}
    </div>
  );
}
