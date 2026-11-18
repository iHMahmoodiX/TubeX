// Actions of the watch page (tiles in the bar's Actions tab, and the Videolytics Tools menu): save as idea, add the channel to competitors, export comments as CSV,
// embed code builder, open in Studio, and (own videos) inline title/description/tags edit with a diff and
// an explicit confirmation before anything is written to YouTube.
import { useId, useMemo, useState } from 'react';
import { Icon, type IconName } from '../../components/icons';
import { Button, Switch } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { commentsCsv, embedCode, parseStart, snippetDiff, studioVideoUrl, UPDATE_UNITS, type CsvComment, type SnippetFields } from '../../domain/inpage';
import { charCount } from '../../domain/text';
import { LIMITS, parseTags, tagsCharCount } from '../../domain/metadata';
import type { VideoInfo } from '../../integrations/youtube/api';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { copyText, downloadFile, forgetRpc, InError, useAsync, useFmt } from '../common';

export type WatchActionId = 'idea' | 'competitor' | 'csv' | 'embed' | 'studio' | 'edit';
export interface WatchAction {
  id: WatchActionId;
  icon: IconName;
  title: string;
  sub: string;
  href?: string;
  disabled?: boolean;
  /** Opens an inline panel (embed builder, editor) instead of running right away. */
  panel?: 'embed' | 'edit';
  run?: () => Promise<void>;
}

export interface WatchActionsProps {
  v: VideoInfo;
  own: boolean;
  activeChannelId?: string;
  onUpdated: () => void;
}

/** The watch page's actions, shared by the tiles in the bar under the video and the Tools menu of Videolytics. */
export function useWatchActions({ v, own, activeChannelId, onUpdated }: WatchActionsProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState<WatchActionId | null>(null);
  const [panel, setPanel] = useState<'embed' | 'edit' | null>(null);
  const canEdit = own && activeChannelId === v.channelId;

  const actions: WatchAction[] = [
    {
      id: 'idea',
      icon: 'bulb',
      title: t('inpage.act.idea'),
      sub: t('inpage.act.ideaSub'),
      run: async () => {
        const r = await rpc<unknown>('ideas.capture', v.title, `https://www.youtube.com/watch?v=${v.id}`, v.title);
        toast(r ? t('inpage.act.ideaDone') : t('error.generic'));
      },
    },
  ];
  if (!own)
    actions.push({
      id: 'competitor',
      icon: 'users',
      title: t('inpage.act.competitor'),
      sub: t('inpage.act.competitorSub', { name: v.channelTitle }),
      run: async () => {
        const existed = await rpc<boolean>('watch.add', v.channelId);
        toast(existed ? t('inpage.act.competitorExists') : t('inpage.act.competitorDone'));
      },
    });
  actions.push(
    {
      id: 'csv',
      icon: 'download',
      title: t('inpage.act.csv'),
      sub: t('inpage.act.csvSub'),
      run: async () => {
        const r = await rpc<{ comments: CsvComment[]; disabled: boolean }>('yt.comments', v.id, 500);
        if (r.disabled) return void toast(t('inpage.act.csvDisabled'));
        if (!r.comments.length) return void toast(t('inpage.act.csvEmpty'));
        downloadFile(`comments-${v.id}.csv`, commentsCsv(r.comments), 'text/csv;charset=utf-8');
        toast(t('inpage.act.csvDone', { n: r.comments.length }));
      },
    },
    { id: 'embed', icon: 'link', title: t('inpage.act.embed'), sub: t('inpage.act.embedSub'), panel: 'embed' },
  );
  if (own) {
    actions.push({ id: 'studio', icon: 'external', title: t('inpage.act.studio'), sub: t('inpage.act.studioSub'), href: studioVideoUrl(v.id) });
    actions.push({ id: 'edit', icon: 'edit', title: t('inpage.act.edit'), sub: canEdit ? t('inpage.act.editSub') : t('inpage.act.editSwitch'), disabled: !canEdit, panel: 'edit' });
  }

  const trigger = async (a: WatchAction) => {
    if (a.disabled) return;
    if (a.panel) return setPanel(panel === a.panel ? null : a.panel);
    if (!a.run) return;
    setBusy(a.id);
    setError(undefined);
    try {
      await a.run();
    } catch (e) {
      setError(e);
    }
    setBusy(null);
  };

  const panelNode =
    panel === 'embed' ? (
      <EmbedBuilder videoId={v.id} />
    ) : panel === 'edit' && canEdit ? (
      <FreshEditor
        videoId={v.id}
        onClose={() => setPanel(null)}
        onSaved={() => {
          setPanel(null);
          forgetRpc('yt.videos');
          onUpdated();
        }}
      />
    ) : null;

  return { actions, trigger, busy, error, panel, setPanel, panelNode };
}

export function WatchActions(props: WatchActionsProps) {
  const { actions, trigger, busy, error, panel, panelNode } = useWatchActions(props);
  return (
    <div className="stack">
      <div className="tx-actions">
        {actions.map((a) => (
          <ActionTile key={a.id} icon={a.icon} title={a.title} sub={a.sub} href={a.href} disabled={a.disabled} busy={busy === a.id} pressed={a.panel ? panel === a.panel : undefined} onClick={() => void trigger(a)} />
        ))}
      </div>
      {error !== undefined && <InError error={error} />}
      {panelNode}
    </div>
  );
}

/** Edits start from the live values (re-read, 1 unit), not from a cached copy. */
function FreshEditor({ videoId, onClose, onSaved }: { videoId: string; onClose: () => void; onSaved: () => void }) {
  const live = useAsync(`fresh:${videoId}`, async () => (await rpc<VideoInfo[]>('yt.videos', [videoId], true))[0] ?? null);
  if (live.error !== undefined) return <InError error={live.error} onRetry={live.reload} />;
  if (!live.data) return <span className="skel tx-skel-line" aria-busy="true" />;
  return <InlineEditor v={live.data} onCancel={onClose} onDone={onSaved} />;
}

function ActionTile({ icon, title, sub, onClick, href, busy, disabled, pressed }: { icon: Parameters<typeof Icon>[0]['name']; title: string; sub: string; onClick?: () => void; href?: string; busy?: boolean; disabled?: boolean; pressed?: boolean }) {
  const body = (
    <>
      <span className="tx-tile-icon">
        <Icon name={busy ? 'refresh' : icon} />
      </span>
      <span className="stack-s grow" style={{ gap: 0 }}>
        <strong>{title}</strong>
        <span className="xsmall muted" dir="auto">
          {sub}
        </span>
      </span>
    </>
  );
  if (href)
    return (
      <a className="tx-tile" href={href} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  return (
    <button type="button" className="tx-tile" onClick={onClick} disabled={disabled || busy} aria-pressed={pressed} aria-busy={busy}>
      {body}
    </button>
  );
}

const SIZES = [
  [560, 315],
  [640, 360],
  [853, 480],
  [1280, 720],
] as const;

function EmbedBuilder({ videoId }: { videoId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const id = useId();
  const [size, setSize] = useState(0);
  const [start, setStart] = useState('');
  const [opts, setOpts] = useState({ autoplay: false, mute: false, controls: true, loop: false, privacy: true, captions: false });
  const startSec = parseStart(start);
  const code = useMemo(() => embedCode({ videoId, width: SIZES[size]![0], height: SIZES[size]![1], start: startSec, ...opts }), [videoId, size, startSec, opts]);
  const toggle = (k: keyof typeof opts) => (v: boolean) => setOpts({ ...opts, [k]: v });
  return (
    <div className="tx-sub stack-s">
      <strong className="small">{t('inpage.embed.title')}</strong>
      <div className="row">
        <label className="small" htmlFor={`${id}-size`}>
          {t('inpage.embed.size')}
        </label>
        <select id={`${id}-size`} className="select tx-select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {SIZES.map(([w, h], i) => (
            <option key={w} value={i}>
              {w}×{h}
            </option>
          ))}
        </select>
        <label className="small" htmlFor={`${id}-start`}>
          {t('inpage.embed.start')}
        </label>
        <input id={`${id}-start`} className="input tx-input tx-input-s" dir="ltr" placeholder="1:30" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={!!start && startSec === undefined} />
      </div>
      <div className="tx-switches">
        <Switch checked={opts.privacy} onChange={toggle('privacy')} label={t('inpage.embed.privacy')} />
        <Switch checked={opts.autoplay} onChange={toggle('autoplay')} label={t('inpage.embed.autoplay')} />
        <Switch checked={opts.mute || opts.autoplay} disabled={opts.autoplay} onChange={toggle('mute')} label={t('inpage.embed.mute')} />
        <Switch checked={opts.controls} onChange={toggle('controls')} label={t('inpage.embed.controls')} />
        <Switch checked={opts.loop} onChange={toggle('loop')} label={t('inpage.embed.loop')} />
        <Switch checked={opts.captions} onChange={toggle('captions')} label={t('inpage.embed.captions')} />
      </div>
      <textarea className="textarea tx-code" dir="ltr" readOnly rows={3} value={code} aria-label={t('inpage.embed.code')} onFocus={(e) => e.currentTarget.select()} />
      <div>
        <Button size="s" variant="primary" onClick={async () => toast((await copyText(code)) ? t('common.copied') : t('common.copyFailed'))}>
          <Icon name="copy" />
          {t('inpage.embed.copy')}
        </Button>
      </div>
    </div>
  );
}

function InlineEditor({ v, onDone, onCancel }: { v: VideoInfo; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const id = useId();
  const before: SnippetFields = { title: v.title, description: v.description, tags: v.tags };
  const [title, setTitle] = useState(v.title);
  const [description, setDescription] = useState(v.description);
  const [tagText, setTagText] = useState(v.tags.join(', '));
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const after: SnippetFields = { title: title.trim(), description, tags: parseTags(tagText) };
  const diff = snippetDiff(before, after);
  const tLen = charCount(after.title);
  const tagChars = tagsCharCount(after.tags);
  const invalid = !after.title || tLen > LIMITS.titleChars || tagChars > LIMITS.tagsChars || /[<>]/.test(after.title + after.description);

  const write = async (fields: SnippetFields, label: string) => rpc('own.updateSnippet', v.id, fields, label);

  const apply = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await write(after, t('inpage.edit.logLabel'));
      toast(t('inpage.edit.done'), {
        label: t('common.undo'),
        run: () =>
          void write(before, t('inpage.edit.undoLabel'))
            .then(() => toast(t('inpage.edit.undone')))
            .catch(() => toast(t('inpage.edit.undoFailed'))),
      });
      onDone();
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };

  if (step === 'review')
    return (
      <div className="tx-sub stack-s">
        <strong className="small">{t('inpage.edit.review')}</strong>
        {!diff.changed && <p className="small muted">{t('inpage.edit.noChanges')}</p>}
        {diff.title && (
          <div className="tx-diff">
            <span className="xsmall muted">{t('inpage.edit.title')}</span>
            <del dir="auto">{diff.title.from}</del>
            <ins dir="auto">{diff.title.to}</ins>
          </div>
        )}
        {diff.description && (
          <div className="tx-diff">
            <span className="xsmall muted">{t('inpage.edit.description')}</span>
            <del dir="auto" className="tx-clip">
              {diff.description.from || '—'}
            </del>
            <ins dir="auto" className="tx-clip">
              {diff.description.to || '—'}
            </ins>
          </div>
        )}
        {(diff.tagsAdded.length > 0 || diff.tagsRemoved.length > 0 || diff.tagOrderChanged) && (
          <div className="tx-diff">
            <span className="xsmall muted">{t('inpage.edit.tags')}</span>
            <div className="chips">
              {diff.tagsAdded.map((x) => (
                <span key={`+${x}`} className="tx-badge tx-badge-good" dir="auto">
                  + {x}
                </span>
              ))}
              {diff.tagsRemoved.map((x) => (
                <span key={`-${x}`} className="tx-badge tx-badge-bad" dir="auto">
                  − {x}
                </span>
              ))}
              {diff.tagOrderChanged && <span className="tx-badge">{t('inpage.edit.tagOrder')}</span>}
            </div>
          </div>
        )}
        {error !== undefined && <InError error={error} />}
        <div className="tx-confirm" role="group" aria-label={t('inpage.edit.review')}>
          <Icon name="alert" />
          <p className="grow small">{t('inpage.edit.confirm', { units: f.int(UPDATE_UNITS) })}</p>
          <Button size="s" variant="primary" disabled={!diff.changed || busy} onClick={() => void apply()}>
            {busy ? t('common.loading') : t('inpage.edit.apply')}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setStep('edit')}>
            {t('inpage.edit.back')}
          </Button>
        </div>
      </div>
    );

  return (
    <div className="tx-sub stack-s">
      <strong className="small">{t('inpage.act.edit')}</strong>
      <div className="field">
        <div className="field-head">
          <label className="field-label" htmlFor={`${id}-t`}>
            {t('inpage.edit.title')}
          </label>
          <span className="counter" data-over={tLen > LIMITS.titleChars}>
            {f.int(tLen)}/{f.int(LIMITS.titleChars)}
          </span>
        </div>
        <input id={`${id}-t`} className="input" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-d`}>
          {t('inpage.edit.description')}
        </label>
        <textarea id={`${id}-d`} className="textarea" dir="auto" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <div className="field-head">
          <label className="field-label" htmlFor={`${id}-g`}>
            {t('inpage.edit.tags')}
          </label>
          <span className="counter" data-over={tagChars > LIMITS.tagsChars}>
            {f.int(tagChars)}/{f.int(LIMITS.tagsChars)}
          </span>
        </div>
        <textarea id={`${id}-g`} className="textarea" dir="auto" rows={2} value={tagText} onChange={(e) => setTagText(e.target.value)} />
        <span className="field-help">{t('inpage.edit.tagsHelp')}</span>
      </div>
      {invalid && <p className="small tx-warn">{t('inpage.edit.invalid')}</p>}
      <div className="row">
        <Button size="s" variant="primary" disabled={invalid || !diff.changed} onClick={() => setStep('review')}>
          {t('inpage.edit.reviewBtn')}
        </Button>
        <Button size="s" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
