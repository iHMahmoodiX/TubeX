// AI helpers inside a draft. Every result is a suggestion: nothing replaces the owner's text
// without a click, and each replacement can be undone.
import { useState } from 'react';
import { dedupeTags } from '../../domain/metadata';
import { newBase, type Draft, type Lang, type Profile } from '../../domain/models';
import { Button, Field, Notice } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { chaptersToText, fitTags, type AiTask, type TaskContext, type TaskOutput } from '../../integrations/ai/tasks';
import { copyText } from '../../platform/files';
import { openWorkspace } from '../../platform/navigation';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';
import { useAiTask } from './useAiTask';
import { create } from '../../storage/db';

const TOOLS: { task: AiTask; label: MessageKey }[] = [
  { task: 'titles', label: 'ai.tool.titles' },
  { task: 'description', label: 'ai.tool.description' },
  { task: 'tags', label: 'ai.tool.tags' },
  { task: 'hooks', label: 'ai.tool.hooks' },
  { task: 'brief', label: 'ai.tool.brief' },
  { task: 'translate', label: 'ai.tool.translate' },
  { task: 'chapters', label: 'ai.tool.chapters' },
];

export function draftContext(draft: Draft, profile?: Profile, idea?: string): TaskContext {
  return {
    language: draft.language,
    channelName: profile?.name,
    channelNotes: profile?.notes,
    idea,
    sourceTitle: draft.source?.title ?? draft.source?.searchQuery,
    focusKeyword: draft.focusKeyword,
    title: draft.title,
    description: draft.description,
    tags: draft.tags,
  };
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="stack-s" style={{ margin: 0, paddingInlineStart: '1.2em' }}>
      {items.map((x, i) => (
        <li key={i} dir="auto">
          {x}
        </li>
      ))}
    </ul>
  );
}

export function AiAssist({
  draft,
  profile,
  update,
  setTagsText,
}: {
  draft: Draft;
  profile?: Profile;
  update: (patch: Partial<Draft>) => void;
  setTagsText: (s: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { ai, loaded } = useIntegrations();
  const { run, cancel, running, results, error } = useAiTask();
  const [active, setActive] = useState<AiTask>('titles');
  const [transcript, setTranscript] = useState('');
  const [target, setTarget] = useState<Lang>(draft.language === 'fa' ? 'en' : 'fa');

  if (!loaded) return null;
  if (!ai.enabled)
    return (
      <Notice>
        <p>{t('ai.off')}</p>
        <div>
          <Button size="s" onClick={() => void openWorkspace('settings')}>
            {t('conn.openSettings')}
          </Button>
        </div>
      </Notice>
    );

  const ctx = draftContext(draft, profile);
  const go = (fresh = false) =>
    void run(active, ctx, active === 'chapters' ? { transcript } : active === 'translate' ? { targetLanguage: target } : {}, { fresh });

  const replace = (patch: Partial<Draft>, msg: MessageKey) => {
    const before: Partial<Draft> = Object.fromEntries(Object.keys(patch).map((k) => [k, draft[k as keyof Draft]]));
    update(patch);
    if (patch.tags) setTagsText(patch.tags.join(', '));
    toast(t(msg), {
      label: t('common.undo'),
      run: () => {
        update(before);
        if (before.tags) setTagsText(before.tags.join(', '));
      },
    });
  };
  const copy = async (text: string) => toast((await copyText(text)) ? t('common.copied') : t('common.copyFailed'));

  const result = results[active];
  const out = result?.output as TaskOutput | undefined;
  const needsInput = active === 'chapters' && transcript.trim().length < 20;

  return (
    <div className="stack-s" data-testid="ai-assist">
      <div className="row" role="group" aria-label={t('ai.tools')}>
        {TOOLS.map((x) => (
          <Button key={x.task} size="s" variant={active === x.task ? 'primary' : 'default'} aria-pressed={active === x.task} onClick={() => setActive(x.task)}>
            {t(x.label)}
          </Button>
        ))}
      </div>
      <p className="small muted">{t(`ai.help.${active}` as MessageKey)}</p>

      {active === 'chapters' && (
        <Field label={t('ai.transcript')} help={t('ai.transcriptHelp')}>
          {({ id, describedBy }) => (
            <textarea id={id} aria-describedby={describedBy} className="textarea" rows={5} dir="auto" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          )}
        </Field>
      )}
      {active === 'translate' && (
        <Field label={t('ai.targetLanguage')}>
          {({ id }) => (
            <select id={id} className="select" value={target} onChange={(e) => setTarget(e.target.value as Lang)}>
              <option value="fa">{t('lang.fa')}</option>
              <option value="en">{t('lang.en')}</option>
            </select>
          )}
        </Field>
      )}

      <div className="row">
        <Button variant="primary" size="s" disabled={!!running || needsInput} onClick={() => go(false)} data-testid="ai-run">
          {running === active ? t('ai.running') : t('ai.generate')}
        </Button>
        {running && (
          <Button size="s" onClick={cancel}>
            {t('common.cancel')}
          </Button>
        )}
        {result && !running && (
          <Button size="s" variant="ghost" onClick={() => go(true)}>
            {t('ai.again')}
          </Button>
        )}
        {result && <span className="small muted">{result.fromCache ? t('ai.fromCache') : t('ai.byModel', { model: result.model })}</span>}
      </div>
      <ErrorNotice error={error} />

      {out?.task === 'titles' && (
        <ul className="list" data-testid="ai-titles">
          {out.titles.map((x, i) => (
            <li key={i} className="list-item">
              <span dir="auto" style={{ fontWeight: 600 }}>
                {x.text}
              </span>
              <div className="row-between">
                <span className="small muted" dir="auto">
                  {x.angle}
                </span>
                <Button size="s" onClick={() => replace({ title: x.text }, 'ai.applied')}>
                  {t('ai.use')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {out?.task === 'description' && (
        <div className="stack-s">
          <div className="yt-desc" dir="auto">
            {out.description}
          </div>
          <div className="row">
            <Button size="s" onClick={() => replace({ description: out.description }, 'ai.applied')}>
              {t('ai.replace')}
            </Button>
            <Button size="s" onClick={() => replace({ description: [draft.description.trimEnd(), out.description].filter(Boolean).join('\n\n') }, 'ai.applied')}>
              {t('ai.append')}
            </Button>
            <Button size="s" variant="ghost" onClick={() => void copy(out.description)}>
              {t('common.copy')}
            </Button>
          </div>
        </div>
      )}
      {out?.task === 'tags' && (
        <div className="stack-s">
          <div className="row">
            {out.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="badge"
                style={{ cursor: 'pointer' }}
                disabled={draft.tags.includes(tag)}
                onClick={() => replace({ tags: fitTags([...draft.tags, tag]) }, 'ai.tagAdded')}
              >
                <bdi>+ {tag}</bdi>
              </button>
            ))}
          </div>
          <div className="row">
            <Button size="s" onClick={() => replace({ tags: fitTags(dedupeTags([...draft.tags, ...out.tags])) }, 'ai.applied')}>
              {t('ai.addAll')}
            </Button>
            <Button size="s" onClick={() => replace({ tags: out.tags }, 'ai.applied')}>
              {t('ai.replace')}
            </Button>
          </div>
        </div>
      )}
      {out?.task === 'hooks' && (
        <div className="stack-s">
          <h4 className="small">{t('ai.hooks')}</h4>
          <List items={out.hooks} />
          <h4 className="small">{t('ai.outline')}</h4>
          <List items={out.outline} />
          <div>
            <Button size="s" variant="ghost" onClick={() => void copy([...out.hooks, '', ...out.outline].join('\n'))}>
              {t('common.copy')}
            </Button>
          </div>
        </div>
      )}
      {out?.task === 'brief' && (
        <div className="stack-s" dir="auto">
          <p>
            <strong>{t('ai.brief.audience')}:</strong> {out.audience}
          </p>
          <p>
            <strong>{t('ai.brief.promise')}:</strong> {out.promise}
          </p>
          <h4 className="small">{t('ai.brief.keyPoints')}</h4>
          <List items={out.keyPoints} />
          <h4 className="small">{t('ai.outline')}</h4>
          <List items={out.outline} />
          <p>
            <strong>{t('ai.brief.cta')}:</strong> {out.callToAction}
          </p>
          <h4 className="small">{t('ai.tool.titles')}</h4>
          <List items={out.titleIdeas} />
          <div>
            <Button
              size="s"
              variant="ghost"
              onClick={() =>
                void copy(
                  [out.audience, out.promise, '', ...out.keyPoints.map((x) => `• ${x}`), '', ...out.outline.map((x, i) => `${i + 1}. ${x}`), '', out.callToAction].join('\n'),
                )
              }
            >
              {t('common.copy')}
            </Button>
          </div>
        </div>
      )}
      {out?.task === 'translate' && (
        <div className="stack-s">
          <p dir="auto" style={{ fontWeight: 600 }}>
            {out.title}
          </p>
          <div className="yt-desc" dir="auto">
            {out.description}
          </div>
          <p className="small" dir="auto">
            {out.tags.join(', ')}
          </p>
          <div className="row">
            <Button
              size="s"
              onClick={async () => {
                await create('drafts', {
                  ...newBase(),
                  language: target,
                  focusKeyword: '',
                  title: out.title,
                  description: out.description,
                  tags: out.tags,
                  ...(draft.profileId && { profileId: draft.profileId }),
                  ...(draft.source && { source: draft.source }),
                });
                toast(t('ai.translatedDraft'));
              }}
            >
              {t('ai.newDraftFromTranslation')}
            </Button>
            <Button size="s" variant="ghost" onClick={() => void copy(`${out.title}\n\n${out.description}\n\n${out.tags.join(', ')}`)}>
              {t('common.copy')}
            </Button>
          </div>
        </div>
      )}
      {out?.task === 'chapters' && (
        <div className="stack-s">
          {!out.valid && <Notice tone="warning">{t('ai.chaptersInvalid')}</Notice>}
          <pre className="yt-desc mono" dir="ltr" style={{ margin: 0 }}>
            {chaptersToText(out.chapters)}
          </pre>
          <div className="row">
            <Button size="s" disabled={!out.valid} onClick={() => replace({ description: [draft.description.trimEnd(), chaptersToText(out.chapters)].filter(Boolean).join('\n\n') }, 'ai.applied')}>
              {t('ai.appendChapters')}
            </Button>
            <Button size="s" variant="ghost" onClick={() => void copy(chaptersToText(out.chapters))}>
              {t('common.copy')}
            </Button>
          </div>
        </div>
      )}
      <p className="small muted">{t('ai.disclaimer')}</p>
    </div>
  );
}
