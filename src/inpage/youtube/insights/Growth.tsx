// Channel growth rate benchmark (Lowest → Median → Highest) for this channel, your channel and your niche, plus
// "compared to you" and "compared to niche average". Growth comes from YouTube Analytics for your own channel and
// from TubeX's daily snapshots for every other channel; nothing is estimated when history is missing.
import { useState } from 'react';
import { Avatar } from '../../../components/ui';
import { benchmark, dailyRate, type BenchEntry, type Growth, type GrowthMetric } from '../../../domain/channelInsights';
import { useI18n } from '../../../i18n';
import { InError, useAsync } from '../../common';
import { DiffChip, GrowthText, Section, useCiFmt } from './bits';
import { loadGrowth, type GrowthData } from './data';

export function GrowthBlock({ channelId, title, thumbnail, rev, onManage }: { channelId: string; title: string; thumbnail?: string; rev: number; onManage: () => void }) {
  const { t } = useI18n();
  const g = useAsync(`ci:g:${channelId}:${rev}`, () => loadGrowth(channelId));
  const [metric, setMetric] = useState<GrowthMetric>('views');
  return (
    <>
      <Section
        id={`ci-bench-${channelId}`}
        icon="trophy"
        title={t('ci.bench.title')}
        desc={t('ci.bench.desc')}
        actions={
          <div className="ci-seg" role="group" aria-label={t('ci.bench.metric')}>
            {(['views', 'subs'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}>
                {t(m === 'views' ? 'ci.bench.views' : 'ci.bench.subs')}
              </button>
            ))}
          </div>
        }
      >
        {g.loading && !g.data && <div className="skel ci-bench-skel" aria-busy="true" />}
        {g.error !== undefined && <InError error={g.error} onRetry={g.reload} />}
        {g.data && <Bench data={g.data} channelId={channelId} title={title} thumbnail={thumbnail} metric={metric} onManage={onManage} />}
      </Section>
      {g.data && <Compare data={g.data} channelId={channelId} />}
    </>
  );
}

function Bench({ data, channelId, title, thumbnail, metric, onManage }: { data: GrowthData; channelId: string; title: string; thumbnail?: string; metric: GrowthMetric; onManage: () => void }) {
  const { t } = useI18n();
  const f = useCiFmt();
  const isYou = data.you?.channelId === channelId;
  const entries: BenchEntry[] = [{ id: channelId, label: title, rate: dailyRate(data.self, metric), role: isYou ? 'you' : 'this' }];
  if (data.you && !isYou) entries.push({ id: data.you.channelId, label: data.you.title, rate: dailyRate(data.you.growth, metric), role: 'you' });
  for (const m of data.members) entries.push({ id: m.channelId, label: m.title, rate: dailyRate(m.growth, metric), role: 'member' });
  const bm = benchmark(entries);
  const withHistory = data.members.filter((m) => m.growth.state === 'ok').length;

  if (!bm)
    return (
      <div className="ci-bench-empty">
        <p className="small">{t('ci.bench.notEnough')}</p>
        <ul className="small muted ci-facts">
          <li>{data.self.state === 'ok' ? t('ci.bench.thisOk', { n: Math.round(data.self.spanDays) }) : data.trackingSince ? t('ci.growth.trackingSince', { date: f.sdate(data.trackingSince) }) : t('ci.bench.thisNone')}</li>
          <li>{data.members.length ? t('ci.bench.nicheCount', { n: data.members.length, k: withHistory }) : t('ci.bench.nicheEmpty')}</li>
          {!data.you && <li>{t('ci.bench.signIn')}</li>}
        </ul>
        <button type="button" className="btn btn-s" onClick={onManage}>
          {t('ci.niche.manage')}
        </button>
      </div>
    );

  const markLabel = (role: string, label: string) => (role === 'you' ? t('ci.bench.you') : role === 'niche' ? t('ci.bench.niche') : label);
  const rateText = (rate: number) => t('ci.bench.perDay', { v: f.spct(rate) });
  const above = bm.marks.filter((m) => m.role !== 'niche');
  const below = bm.marks.filter((m) => m.role === 'niche');
  const edge = (pos: number) => (pos < 0.18 ? 'start' : pos > 0.82 ? 'end' : undefined);
  const avatarOf = (role: string) => (role === 'you' ? data.you?.thumbnail : role === 'this' ? thumbnail : undefined);
  return (
    <div className="ci-bench">
      <div className="ci-bench-scale xsmall">
        <span>{t('ci.bench.lowest')}</span>
        <span>{t('ci.bench.median')}</span>
        <span>{t('ci.bench.highest')}</span>
      </div>
      <div className="ci-bench-marks ci-bench-above">
        {above.map((m) => (
          <div key={m.role + m.id} className="ci-lane">
            <span className="ci-pin" data-role={m.role} data-edge={edge(m.pos)} style={{ insetInlineStart: `${m.pos * 100}%` }} title={`${m.label}: ${rateText(m.rate)}`}>
              <span className="ci-pin-tag">
                <Avatar src={avatarOf(m.role)} name={m.label} />
                <bdi className="ci-pin-name">{markLabel(m.role, m.label)}</bdi>
                <b className="num-t">{rateText(m.rate)}</b>
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="ci-bench-bar" aria-hidden="true">
        <span className="ci-bench-mid" />
        {bm.marks.map((m) => (
          <span key={`tick-${m.role}-${m.id}`} className="ci-bench-tick" data-role={m.role} style={{ insetInlineStart: `${m.pos * 100}%` }} />
        ))}
      </div>
      <div className="ci-bench-marks ci-bench-below">
        {below.map((m) => (
          <div key="niche" className="ci-lane">
            <span className="ci-pin" data-role="niche" data-edge={edge(m.pos)} style={{ insetInlineStart: `${m.pos * 100}%` }} title={`${t('ci.bench.niche')}: ${rateText(m.rate)}`}>
              <span className="ci-pin-tag">
                <span className="ci-stack" aria-hidden="true">
                  {data.members.slice(0, 3).map((x) => (
                    <Avatar key={x.channelId} src={x.thumbnail} name={x.title} />
                  ))}
                </span>
                <bdi className="ci-pin-name">{t('ci.bench.niche')}</bdi>
                <b className="num-t">{rateText(m.rate)}</b>
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="xsmall muted">{t('ci.bench.foot', { n: bm.n })}</p>
    </div>
  );
}

function Compare({ data, channelId }: { data: GrowthData; channelId: string }) {
  const { t } = useI18n();
  const isYou = data.you?.channelId === channelId;
  const members = data.members.filter((m) => m.channelId !== channelId);
  const nicheAvg = (metric: GrowthMetric) => {
    const rs = members.map((m) => dailyRate(m.growth, metric)).filter((x): x is number => x !== undefined);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : undefined;
  };
  const diff30 = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined ? undefined : (a - b) * 30);
  const card = (metric: GrowthMetric, other: number | undefined) => (
    <div className="ci-cmpcard">
      <span className="small muted">{t(metric === 'views' ? 'ci.cmp.viewGrowth' : 'ci.cmp.subGrowth')}</span>
      <GrowthText g={data.self} metric={metric} />
      <DiffChip value={diff30(dailyRate(data.self, metric), other)} suffix={` ${t('ci.cmp.pts')}`} />
    </div>
  );
  return (
    <>
      {!isYou && (
        <Section id={`ci-vs-you-${channelId}`} icon="users" title={t('ci.cmp.vsYou')} desc={data.you ? <YouLine g={data.you.growth} /> : t('ci.bench.signIn')}>
          {data.you && (
            <div className="ci-cmpgrid">
              {card('views', dailyRate(data.you.growth, 'views'))}
              {card('subs', dailyRate(data.you.growth, 'subs'))}
            </div>
          )}
        </Section>
      )}
      <Section id={`ci-vs-niche-${channelId}`} icon="layers" title={t('ci.cmp.vsNiche')} desc={members.length ? t('ci.cmp.nicheDesc', { n: members.length }) : t('ci.bench.nicheEmpty')}>
        {members.length > 0 && (
          <div className="ci-cmpgrid">
            {card('views', nicheAvg('views'))}
            {card('subs', nicheAvg('subs'))}
          </div>
        )}
      </Section>
      <p className="xsmall faint ci-note-line">{t('ci.cmp.howCompared')}</p>
    </>
  );
}

function YouLine({ g }: { g: Growth | undefined }) {
  const { t } = useI18n();
  return (
    <span className="ci-youline">
      {t('ci.cmp.yourGrowth')} <GrowthText g={g} metric="views" />
    </span>
  );
}
