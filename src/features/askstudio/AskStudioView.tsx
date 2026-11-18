// Ask Studio page (D-030): ready-made questions for the channel or one video, sent to YouTube Studio's own
// assistant by the method chosen in Settings, with the answer shown here and kept in a local history.
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, Empty, Notice, PageHeader } from '../../components/ui';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { defaultAskSettings, fillPreset, studioUrlFor, type AskHistoryItem, type AskPreset, type AskScope, type AskSettings } from '../../domain/askStudio';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { copyText } from '../../platform/files';
import { clearAskHistory, loadAskHistory, loadAskSettings, onAskHistoryChanged, onAskSettingsChanged } from '../../storage/askStudio';
import { useChannel, useOwnVideos } from '../reports/hooks';
import { askErrorText, askStudio, saveAnswerAsIdea } from './askClient';

export function useAskSettings(): AskSettings {
  const [s, setS] = useState<AskSettings>(defaultAskSettings);
  useEffect(() => {
    void loadAskSettings().then(setS);
    return onAskSettingsChanged(setS);
  }, []);
  return s;
}

export function AnswerBox({ question, answer }: { question: string; answer: string }) {
  const { t } = useI18n();
  const toast = useToast();
  return (
    <div className="stack-s" data-testid="ask-answer">
      <div className="ask-answer" dir="auto">
        {answer}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Button size="s" onClick={async () => toast((await copyText(answer)) ? t('common.copied') : t('common.copyFailed'))}>
          <Icon name="copy" />
          {t('ask.copyAnswer')}
        </Button>
        <Button
          size="s"
          variant="ghost"
          onClick={async () => {
            await saveAnswerAsIdea(question, answer);
            toast(t('ask.savedIdea'));
          }}
        >
          <Icon name="bulb" />
          {t('ask.saveIdea')}
        </Button>
      </div>
    </div>
  );
}

export function AskStudioView() {
  const { t } = useI18n();
  const toast = useToast();
  const { active } = useChannel();
  const vids = useOwnVideos(active);
  const s = useAskSettings();
  const [scope, setScope] = useState<AskScope>('channel');
  const [videoId, setVideoId] = useState('');
  const [presetId, setPresetId] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ q: string; a: string; learned: boolean } | null>(null);
  const [history, setHistory] = useState<AskHistoryItem[]>([]);
  useEffect(() => {
    void loadAskHistory().then(setHistory);
    return onAskHistoryChanged(setHistory);
  }, []);

  const videos = vids.data ?? [];
  const video = videos.find((v) => v.id === videoId);
  const presets = s.presets.filter((p) => p.scope === scope);
  const pick = (p: AskPreset) => {
    setPresetId(p.id);
    setQuestion(fillPreset(p.text, { title: video?.title, channel: active?.title }));
  };
  useEffect(() => {
    if (scope === 'video' && !videoId && videos[0]) setVideoId(videos[0].id);
  }, [scope, videos.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => (scope === 'video' && videoId ? { videoId } : { channelId: active?.channelId }), [scope, videoId, active?.channelId]);

  const run = async () => {
    const q = question.trim();
    if (!q) return;
    if (s.mode === 'copy') {
      // No automation chosen: copy the question and open Studio where it applies.
      toast((await copyText(q)) ? t('ask.copiedOpen') : t('common.copyFailed'));
      window.open(studioUrlFor(ctx), '_blank', 'noopener');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await askStudio(q, ctx, video?.title);
      setResult({ q, a: r.answer, learned: r.learned });
    } catch (e) {
      setError(askErrorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-l">
      <PageHeader
        kicker={active ? `Ask Studio · ${active.title}` : 'Ask Studio'}
        title={t('ask.title')}
        desc={t('ask.desc')}
        art={active ? <Avatar src={active.thumbnail} name={active.title} size="l" /> : undefined}
        actions={
          <a className="btn btn-s btn-ghost" href="#settings/set-askstudio">
            <Icon name="settings" />
            {t('ask.method', { mode: t(`ask.mode.${s.mode}` as MessageKey) })}
          </a>
        }
      />
      {s.mode === 'copy' && <Notice>{t('ask.copyModeNote')}</Notice>}
      <Card>
        <div className="stack">
          <div className="chips" role="group" aria-label={t('ask.scope')}>
            {(['channel', 'video'] as const).map((sc) => (
              <button key={sc} type="button" className="chip" aria-pressed={scope === sc} onClick={() => setScope(sc)}>
                {t(`ask.scope.${sc}` as MessageKey)}
              </button>
            ))}
          </div>
          {scope === 'video' && (
            <label className="stack-s">
              <span className="small">
                <strong>{t('ask.video')}</strong>
              </span>
              <select className="select" value={videoId} onChange={(e) => setVideoId(e.target.value)} data-testid="ask-video">
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="stack-s">
            <strong className="small">{t('ask.presets')}</strong>
            <div className="chips" data-testid="ask-presets">
              {presets.map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={presetId === p.id} onClick={() => pick(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <label className="stack-s">
            <span className="small">
              <strong>{t('ask.question')}</strong>
            </span>
            <textarea className="textarea" dir="auto" rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t('ask.placeholder')} data-testid="ask-question" />
          </label>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <Button variant="primary" disabled={busy || !question.trim()} onClick={() => void run()} data-testid="ask-run">
              <Icon name={s.mode === 'copy' ? 'external' : 'send'} />
              {busy ? t('ask.waiting') : s.mode === 'copy' ? t('ask.copyOpen') : t('ask.run')}
            </Button>
            {busy && <span className="xsmall muted">{t(s.mode === 'page' ? 'ask.waitPage' : 'ask.waitDirect')}</span>}
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {result && (
            <>
              {result.learned && <Notice tone="success">{t('ask.learnedNow')}</Notice>}
              <AnswerBox question={result.q} answer={result.a} />
            </>
          )}
        </div>
      </Card>

      <Card
        title={t('ask.history')}
        actions={
          history.length > 0 && (
            <Button size="s" variant="ghost" onClick={() => void clearAskHistory()}>
              {t('ask.clearHistory')}
            </Button>
          )
        }
      >
        {history.length === 0 ? (
          <Empty icon="message">{t('ask.noHistory')}</Empty>
        ) : (
          <div className="stack-s">
            {history.slice(0, 30).map((h) => (
              <details key={h.id} className="core-fold">
                <summary>
                  <bdi>{h.question.split('\n')[0]!.slice(0, 120)}</bdi>
                  <span className="xsmall faint">
                    {' '}
                    · {h.videoTitle ? `${h.videoTitle} · ` : ''}
                    {new Date(h.at).toLocaleString()}
                  </span>
                </summary>
                <AnswerBox question={h.question} answer={h.answer} />
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
