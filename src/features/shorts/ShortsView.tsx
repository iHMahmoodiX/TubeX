// Suggested Shorts: pick a long video, gather signals (chapters, audience retention peaks, an optional
// transcript), and get 3–6 vertical Short segments with hook and title. Deterministic suggestions always;
// AI refinement when AI is on. Cutting the Short stays manual in YouTube (Studio's own Remix/Edit tools).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractChapters, formatTimestamp } from '../../domain/chapters';
import { CAPTIONS_DOWNLOAD_COST, CAPTIONS_LIST_COST, coerceAiShort, parseRetention, parseSubtitles, parseTimedLines, studioEditUrl, suggestShorts, watchUrl, type Cue, type RetentionPoint, type ShortSuggestion, type Signal } from '../../domain/engageShorts';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Field, LineChart, Notice, PageHeader, Skeleton } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { report, type OwnVideo } from '../../integrations/google/own';
import { downloadCaption, listCaptions } from '../../integrations/google/ownWrites';
import { copyText } from '../../platform/files';
import { captureIdea } from '../ideas/ideaActions';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { useFormat } from '../research/shared';
import { Cost, SignInEmpty, Step, useOwnChannel, useOwnUploads, VideoPicker } from '../bulk/engageKit';

const MIN_LONG = 120;
const day = (d: Date) => d.toISOString().slice(0, 10);

function ShortCard({ s, video, index }: { s: ShortSuggestion; video: OwnVideo; index: number }) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const dur = Math.max(1, video.durationSec);
  return (
    <article className="engage-short">
      <div className="row-between">
        <span className="badge">{t('engage.sh.n', { n: f.int(index + 1) })}</span>
        <span className="small muted num-t">{t('engage.sh.length', { n: f.int(s.end - s.start) })}</span>
      </div>
      <div className="engage-short-time">
        {formatTimestamp(s.start)} – {formatTimestamp(s.end)}
      </div>
      <div className="engage-timeline" aria-hidden="true">
        <i style={{ insetInlineStart: `${(s.start / dur) * 100}%`, width: `${Math.max(1, ((s.end - s.start) / dur) * 100)}%` }} />
      </div>
      <h3 dir="auto">{s.title || t('engage.sh.untitled', { time: formatTimestamp(s.start) })}</h3>
      {s.hook ? (
        <p className="engage-hook" dir="auto">
          «{s.hook}»
        </p>
      ) : (
        <p className="small muted">{t('engage.sh.noHook')}</p>
      )}
      <div className="row" style={{ gap: 6 }}>
        {s.signals.map((sig: Signal) => (
          <span key={sig} className="badge badge-info">
            {t(`engage.sh.sig.${sig}` as MessageKey)}
          </span>
        ))}
        {s.why && <span className="badge badge-accent">{t('engage.sh.sig.ai')}</span>}
      </div>
      {s.why && (
        <p className="small muted" dir="auto">
          {s.why}
        </p>
      )}
      <div className="row">
        <a className="btn btn-s" href={watchUrl(video.id, s.start)} target="_blank" rel="noreferrer noopener">
          <Icon name="play" />
          {t('engage.sh.watch')}
        </a>
        <Button size="s" variant="ghost" disabled={!s.title} onClick={async () => toast((await copyText(s.title)) ? t('common.copied') : t('common.copyFailed'))}>
          <Icon name="copy" />
          {t('engage.sh.copyTitle')}
        </Button>
        <a className="btn btn-s btn-ghost" href={studioEditUrl(video.id)} target="_blank" rel="noreferrer noopener" title={t('engage.sh.createHelp')}>
          <Icon name="external" />
          {t('engage.sh.create')}
        </a>
        <Button
          size="s"
          variant="ghost"
          onClick={async () => {
            const text = `${s.title || video.title} (${formatTimestamp(s.start)}–${formatTimestamp(s.end)})${s.hook ? `\n«${s.hook}»` : ''}`;
            const url = watchUrl(video.id, s.start);
            const idea = await captureIdea({ text, ctx: { kind: 'watch', url, videoId: video.id, title: video.title, origin: 'url' }, link: true });
            toast(idea ? t('engage.sh.saved') : t('error.generic'), idea ? { label: t('common.open'), run: () => (location.hash = 'ideas') } : undefined);
          }}
        >
          <Icon name="bulb" />
          {t('engage.sh.saveIdea')}
        </Button>
      </div>
    </article>
  );
}

function Workbench({ channelId, initial }: { channelId: string; initial?: string }) {
  const { t, lang } = useI18n();
  const f = useFormat();
  const integrations = useIntegrations();
  const uploads = useOwnUploads();
  const [chosen, setChosen] = useState<string[]>(initial ? [initial] : []);
  const video = uploads.videos?.find((v) => v.id === chosen[0]);
  const [retention, setRetention] = useState<RetentionPoint[] | null>(null);
  const [retError, setRetError] = useState<unknown>(null);
  const [transcript, setTranscript] = useState('');
  const [capError, setCapError] = useState<unknown>(null);
  const [capBusy, setCapBusy] = useState(false);
  const [ai, setAi] = useState<ShortSuggestion[] | null>(null);
  const [aiError, setAiError] = useState<unknown>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const loadRetention = useCallback(
    async (v: OwnVideo) => {
      setRetention(null);
      setRetError(null);
      try {
        const start = v.publishedAt ? day(new Date(v.publishedAt)) : '2005-01-01';
        const r = await report(channelId, { startDate: start, endDate: day(new Date()), metrics: 'audienceWatchRatio,relativeRetentionPerformance', dimensions: 'elapsedVideoTimeRatio', filters: `video==${v.id}` });
        setRetention(parseRetention(r.columns, r.rows));
      } catch (e) {
        setRetError(e);
        setRetention([]);
      }
    },
    [channelId],
  );
  useEffect(() => {
    setAi(null);
    setTranscript('');
    if (video) void loadRetention(video);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  const chapters = useMemo(() => (video ? extractChapters(video.description).map((c) => ({ seconds: c.seconds, title: c.title })) : []), [video]);
  const cues: Cue[] = useMemo(() => {
    if (!transcript.trim()) return [];
    const srt = parseSubtitles(transcript);
    return srt.length ? srt : parseTimedLines(transcript);
  }, [transcript]);
  const suggestions = useMemo(() => (video && retention ? suggestShorts({ duration: video.durationSec, videoTitle: video.title, chapters, retention, cues }) : []), [video, retention, chapters, cues]);

  const loadCaptions = async () => {
    if (!video) return;
    setCapBusy(true);
    setCapError(null);
    try {
      const tracks = (await listCaptions(channelId, video.id)).filter((x) => !x.isDraft);
      const pick = tracks.find((x) => x.kind !== 'asr' && x.language.startsWith(lang)) ?? tracks.find((x) => x.kind !== 'asr') ?? tracks[0];
      if (!pick) throw new Error(t('engage.sh.noCaptions'));
      setTranscript(await downloadCaption(channelId, pick.id));
    } catch (e) {
      setCapError(e);
    } finally {
      setCapBusy(false);
    }
  };

  const refine = async () => {
    if (!video) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const peaks = suggestions.map((s) => `${s.start}-${s.end}s ${s.signals.join('+')}${s.title ? ` "${s.title}"` : ''}`).join('\n');
      const r = await runAiJson({
        task: 'engage-shorts-v1',
        instructions: `Suggest 3 to 6 vertical YouTube Shorts cut from this long video. Each must be 15 to 60 seconds, inside 0..${video.durationSec} seconds, not overlapping, and start on a strong hook. Prefer the candidate segments (they come from real audience retention, chapters and transcript). Write titles and hooks in ${lang === 'fa' ? 'Persian' : 'English'}. Return {"shorts":[{"start":number,"end":number,"title":string,"hook":string,"why":string}]}.`,
        data:
          dataBlock('Video title', video.title, 300) +
          dataBlock('Candidate segments', peaks, 2000) +
          dataBlock('Chapters', chapters.map((c) => `${formatTimestamp(c.seconds)} ${c.title}`).join('\n'), 2000) +
          dataBlock('Transcript', cues.map((c) => `[${Math.round(c.start)}s] ${c.text}`).join('\n'), 8000),
        maxTokens: 1500,
      });
      const list = Array.isArray(r.output.shorts) ? r.output.shorts : [];
      const out: ShortSuggestion[] = [];
      for (const raw of list) {
        const s = coerceAiShort(raw, video.durationSec);
        if (s && !out.some((o) => o.start < s.end && s.start < o.end)) out.push(s);
      }
      setAi(out.slice(0, 6));
    } catch (e) {
      setAiError(e);
    } finally {
      setAiBusy(false);
    }
  };

  const points = (retention ?? []).map((p) => ({ x: p.ratio * 100, y: p.watch * 100 }));
  return (
    <div className="engage-flow">
      <Step n={1} title={t('engage.sh.step1')} sub={t('engage.sh.step1Sub')} done={!!video}>
        <ErrorNotice error={uploads.error} />
        <VideoPicker videos={uploads.videos} selected={chosen} onChange={setChosen} single label={t('engage.sh.step1')} limit={20} allow={(v) => (v.durationSec < MIN_LONG ? 'engage.sh.tooShort' : null)} extra={(v) => <span className="num-t">{f.duration(v.durationSec)}</span>} />
      </Step>
      <Step n={2} title={t('engage.sh.step2')} sub={t('engage.sh.step2Sub')} done={!!video && retention !== null}>
        {!video ? (
          <p className="small muted">{t('engage.sh.pickFirst')}</p>
        ) : (
          <div className="grid-2">
            <div className="card card-2 stack-s">
              <h3>{t('engage.sh.retention')}</h3>
              {retention === null ? (
                <Skeleton lines={3} />
              ) : retention.length ? (
                <>
                  <LineChart points={points} label={t('engage.sh.retention')} height={120} />
                  <p className="xsmall muted">{t('engage.sh.retentionHelp')}</p>
                </>
              ) : (
                <>
                  <p className="small muted">{t('engage.sh.noRetention')}</p>
                  <ErrorNotice error={retError} />
                </>
              )}
            </div>
            <div className="card card-2 stack-s">
              <h3>{t('engage.sh.chapters', { n: f.int(chapters.length) })}</h3>
              {chapters.length ? (
                <ul className="list" style={{ maxHeight: 160, overflow: 'auto' }}>
                  {chapters.map((c) => (
                    <li key={c.seconds} className="small">
                      <span className="ltr num-t muted">{formatTimestamp(c.seconds)}</span> <bdi>{c.title}</bdi>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">{t('engage.sh.noChapters')}</p>
              )}
            </div>
            <div className="card card-2 stack-s" style={{ gridColumn: '1 / -1' }}>
              <h3>{t('engage.sh.transcript')}</h3>
              <Field label={t('engage.sh.paste')} help={cues.length ? t('engage.sh.cues', { n: f.int(cues.length) }) : t('engage.sh.pasteHelp')}>
                {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" rows={4} dir="auto" value={transcript} onChange={(e) => setTranscript(e.target.value)} />}
              </Field>
              <div className="row">
                <ConfirmButton
                  size="s"
                  danger={false}
                  label={capBusy ? t('common.loading') : t('engage.sh.loadCaptions')}
                  question={t('engage.sh.captionsConfirm', { units: f.int(CAPTIONS_LIST_COST + CAPTIONS_DOWNLOAD_COST) })}
                  confirmLabel={t('engage.sh.captionsGo')}
                  onConfirm={() => void loadCaptions()}
                />
                <Cost units={CAPTIONS_LIST_COST + CAPTIONS_DOWNLOAD_COST} />
              </div>
              <ErrorNotice error={capError} />
            </div>
          </div>
        )}
      </Step>
      <Step
        n={3}
        title={t('engage.sh.step3')}
        sub={t('engage.sh.step3Sub')}
        actions={
          video && retention !== null && integrations.ai.enabled ? (
            <Button variant="primary" disabled={aiBusy} onClick={() => void refine()}>
              <Icon name="sparkle" />
              {aiBusy ? t('common.loading') : t('engage.sh.refine')}
            </Button>
          ) : undefined
        }
      >
        {!video || retention === null ? (
          <p className="small muted">{t('engage.sh.pickFirst')}</p>
        ) : (
          <>
            <ErrorNotice error={aiError} />
            {ai && ai.length > 0 && (
              <section className="stack" aria-label={t('engage.sh.aiTitle')}>
                <h3>{t('engage.sh.aiTitle')}</h3>
                <div className="engage-shorts">
                  {ai.map((s, i) => (
                    <ShortCard key={`ai${s.start}`} s={s} video={video} index={i} />
                  ))}
                </div>
              </section>
            )}
            {suggestions.length === 0 ? (
              <Empty icon="scissors" title={t('engage.sh.none')}>
                {t('engage.sh.noneHelp')}
              </Empty>
            ) : (
              <div className="engage-shorts">
                {suggestions.map((s, i) => (
                  <ShortCard key={s.start} s={s} video={video} index={i} />
                ))}
              </div>
            )}
            {!integrations.ai.enabled && <p className="xsmall muted">{t('engage.sh.aiOff')}</p>}
            <Notice>{t('engage.sh.manualNote')}</Notice>
          </>
        )}
      </Step>
    </div>
  );
}

export function ShortsView({ tab }: { tab?: string }) {
  const { t } = useI18n();
  const { channel, loaded } = useOwnChannel();
  return (
    <div className="stack-l">
      <PageHeader kicker={t('shell.group.create')} title={t('engage.sh.heading')} desc={t('engage.sh.desc')} />
      {!loaded ? <Skeleton lines={2} /> : !channel ? <SignInEmpty icon="scissors" why="engage.signIn.shorts" /> : <Workbench key={channel.channelId} channelId={channel.channelId} initial={tab} />}
    </div>
  );
}
