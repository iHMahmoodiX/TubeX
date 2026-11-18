// Under Studio's Tags field: the rank legend (on-demand rank badges), the Tag Tools bar (Copy · Sort · Import ·
// Translate · Keyword Explorer) and the Recommended tags panel. Everything fills Studio's own field on a click;
// Studio's Save stays the only save.
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../../components/icons';
import { Button } from '../../../components/ui';
import { useToast } from '../../../components/toasts';
import { KEYWORD_SCORE_UNITS } from '../../../domain/inpage';
import { tagsCharCount, LIMITS } from '../../../domain/metadata';
import type { Lang, Template } from '../../../domain/models';
import { useI18n } from '../../../i18n';
import { rpc } from '../../../platform/rpc';
import { canReadYt, copyText, InError, useAsync, useFmt, useStatus } from '../../common';
import { useInpageEnabled } from '../../InpageRoot';
import type { StudioValues } from '../fields';
import { research } from './KeywordPop';
import { mainPhrase, norm, parsePasted, sameOrder, scoreOf, sortTagList, type TagSort } from './logic';
import { ChipBadges, RankLegend } from './Ranks';
import { Recommended } from './Recommended';
import { openKeywordPop, useKnownScores, useTargetKeyword } from './store';
import { useEditor } from './useEditor';
import { useFieldWriter } from './writer';

type Tool = 'sort' | 'import' | 'translate' | null;

export function TagTools() {
  const on = useInpageEnabled('studioTags');
  const { videoId, values } = useEditor();
  if (!videoId) return null;
  return (
    <>
      <ChipBadges videoId={videoId} enabled={on} />
      {on && <Tools key={videoId} videoId={videoId} values={values} />}
    </>
  );
}

function Tools({ videoId, values }: { videoId: string; values: StudioValues }) {
  const { t } = useI18n();
  const toast = useToast();
  const [tool, setTool] = useState<Tool>(null);
  const [saved] = useTargetKeyword(videoId);
  const keyword = saved.trim() || mainPhrase(values.title);
  const writer = useFieldWriter();
  const kwBtn = useRef<HTMLButtonElement>(null);
  const chars = tagsCharCount(values.tags);

  const toolBtn = (id: Exclude<Tool, null>, icon: Parameters<typeof Icon>[0]['name'], label: string) => (
    <button type="button" className="tt-tool" aria-pressed={tool === id} aria-controls={`tt-tool-${id}`} onClick={() => setTool(tool === id ? null : id)}>
      <Icon name={icon} />
      {label}
    </button>
  );

  return (
    <div className="tt tt-under">
      <RankLegend videoId={videoId} tags={values.tags} />
      <section className="tt-bar" aria-label={t('tt.tools')}>
        <div className="tt-bar-row">
          <span className="tt-title">
            <span className="tt-dot" aria-hidden="true">
              <Icon name="logo" />
            </span>
            {t('tt.tools')}
          </span>
          <span className="xsmall muted num-t" title={t('tt.charsHint')}>
            {t('tt.count', { n: values.tags.length, chars, max: LIMITS.tagsChars })}
          </span>
          <span className="grow" />
        </div>
        <div className="tt-tools" role="toolbar" aria-label={t('tt.tools')}>
          <button type="button" className="tt-tool" disabled={!values.tags.length} onClick={async () => toast((await copyText(values.tags.join(', '))) ? t('tt.copied', { n: values.tags.length }) : t('common.copyFailed'))}>
            <Icon name="copy" />
            {t('tt.copy')}
          </button>
          {toolBtn('sort', 'sort', t('tt.sort'))}
          {toolBtn('import', 'download', t('tt.import'))}
          {toolBtn('translate', 'translate', t('tt.translate'))}
          <button ref={kwBtn} type="button" className="tt-tool" onClick={() => openKeywordPop(keyword || values.tags[0] || '', kwBtn.current)}>
            <Icon name="search" />
            {t('tt.explorer')}
          </button>
        </div>
        {tool && (
          <div className="tt-panel" id={`tt-tool-${tool}`}>
            {tool === 'sort' && <SortTool values={values} keyword={keyword} writer={writer} />}
            {tool === 'import' && <ImportTool values={values} videoId={videoId} writer={writer} />}
            {tool === 'translate' && <TranslateTool values={values} writer={writer} />}
          </div>
        )}
        {writer.view}
      </section>
      <Recommended videoId={videoId} values={values} />
      <p className="xsmall faint tt-save">
        <Icon name="info" />
        {t('tt.saveNote')}
      </p>
    </div>
  );
}

type Writer = ReturnType<typeof useFieldWriter>;

// ---------------------------------------------------------------- Sort

function SortTool({ values, keyword, writer }: { values: StudioValues; keyword: string; writer: Writer }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const [mode, setMode] = useState<TagSort>('relevance');
  const [scores, addScores] = useKnownScores();
  const [scoring, setScoring] = useState<{ done: number; total: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>();
  const stop = useRef(false);
  const next = useMemo(() => sortTagList(values.tags, mode, { keyword, scores, lang }), [values.tags, mode, keyword, scores, lang]);
  const unknown = values.tags.filter((x) => typeof scoreOf(scores, x) !== 'number' && scoreOf(scores, x) !== null);
  const batch = unknown.slice(0, 10);
  const unchanged = sameOrder(next, values.tags);

  const scoreSome = async () => {
    setAsking(false);
    setError(undefined);
    stop.current = false;
    setScoring({ done: 0, total: batch.length });
    try {
      for (let i = 0; i < batch.length && !stop.current; i++) {
        const r = await research(batch[i]!);
        addScores([{ keyword: batch[i]!, score: r.score }]);
        setScoring({ done: i + 1, total: batch.length });
      }
    } catch (e) {
      setError(e);
    }
    setScoring(null);
  };

  const modes: { id: TagSort; label: string; help: string }[] = [
    { id: 'relevance', label: t('tt.sort.relevance'), help: t('tt.sort.relevanceHelp', { k: keyword || '—' }) },
    { id: 'score', label: t('tt.sort.score'), help: t('tt.sort.scoreHelp') },
    { id: 'alpha', label: t('tt.sort.alpha'), help: t('tt.sort.alphaHelp') },
  ];

  return (
    <div className="stack-s">
      <div className="tt-radios" role="radiogroup" aria-label={t('tt.sort')}>
        {modes.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className="tt-radio" onClick={() => setMode(m.id)} title={m.help}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="xsmall muted">{modes.find((m) => m.id === mode)!.help}</p>
      {mode === 'score' && (
        <>
          <p className="xsmall muted">{t('tt.sort.known', { n: values.tags.length - unknown.length, total: values.tags.length })}</p>
          {unknown.length > 0 && canReadYt(status) && !scoring && !asking && (
            <div>
              <Button size="s" onClick={() => setAsking(true)}>
                <Icon name="target" />
                {t('tt.scoreSome', { n: batch.length })}
              </Button>
            </div>
          )}
          {asking && (
            <div className="tx-confirm" role="group" aria-label={t('tt.scoreSome', { n: batch.length })}>
              <Icon name="alert" />
              <p className="grow small">{t('tt.scoreCost', { n: batch.length, units: f.int(batch.length * (KEYWORD_SCORE_UNITS + 1)) })}</p>
              <Button size="s" variant="primary" autoFocus onClick={() => void scoreSome()}>
                {t('tt.research')}
              </Button>
              <Button size="s" variant="ghost" onClick={() => setAsking(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          )}
          {scoring && (
            <div className="row" role="status">
              <span className="xsmall">{t('tt.scoring', { done: scoring.done, total: scoring.total })}</span>
              <Button size="s" variant="ghost" onClick={() => (stop.current = true)}>
                {t('tt.stop')}
              </Button>
            </div>
          )}
          {error !== undefined && <InError error={error} />}
        </>
      )}
      <ol className="tt-preview" aria-label={t('tt.sort.preview')}>
        {next.map((tag) => {
          const s = scoreOf(scores, tag);
          return (
            <li key={tag} dir="auto">
              <bdi>{tag}</bdi>
              {mode === 'score' && <small className="num-t">{typeof s === 'number' ? f.int(s) : '—'}</small>}
            </li>
          );
        })}
      </ol>
      <div className="row">
        <Button size="s" variant="primary" disabled={unchanged || writer.busy || !values.tags.length} onClick={() => void writer.replace(next, t('tt.sorted'))}>
          <Icon name="sort" />
          {unchanged ? t('tt.sort.same') : t('tt.sort.apply')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Import

type ImportFrom = 'template' | 'video' | 'paste';

interface OwnVideoLite {
  id: string;
  title: string;
  thumbnail?: string;
  publishedAt: string;
  privacy: string;
  tags: string[];
}

function ImportTool({ values, videoId, writer }: { values: StudioValues; videoId: string; writer: Writer }) {
  const { t } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const [from, setFrom] = useState<ImportFrom>('template');
  const [tplId, setTplId] = useState('');
  const [vid, setVid] = useState('');
  const [text, setText] = useState('');
  const templates = useAsync(from === 'template' ? 'tt-templates' : null, () => rpc<Template[]>('templates.list'));
  const signedIn = !!status?.channels.length;
  const videos = useAsync(from === 'video' && signedIn ? 'tt-own-200' : null, () => rpc<{ videos: OwnVideoLite[] }>('tagTools.ownVideos', 200));
  const tplList = (templates.data ?? []).filter((x) => x.tags.length).sort((a, b) => a.name.localeCompare(b.name));
  const tpl = tplList.find((x) => x.id === tplId) ?? tplList[0];
  const vidList = (videos.data?.videos ?? []).filter((v) => v.id !== videoId && v.tags.length);
  const v = vidList.find((x) => x.id === vid) ?? vidList[0];
  const pasted = parsePasted(text);
  const have = new Set(values.tags.map(norm));

  const tags = from === 'template' ? (tpl?.tags ?? []) : from === 'video' ? (v?.tags ?? []) : pasted;
  const fresh = tags.filter((x) => !have.has(norm(x)));

  const tabs: { id: ImportFrom; label: string }[] = [
    { id: 'template', label: t('tt.import.template') },
    { id: 'video', label: t('tt.import.video') },
    { id: 'paste', label: t('tt.import.paste') },
  ];

  return (
    <div className="stack-s">
      <div className="tt-radios" role="radiogroup" aria-label={t('tt.import')}>
        {tabs.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={from === x.id} className="tt-radio" onClick={() => setFrom(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {from === 'template' && (
        <>
          {templates.error !== undefined && <InError error={templates.error} onRetry={templates.reload} />}
          {templates.loading && !templates.data && <span className="skel tx-skel-line" />}
          {templates.data && !tplList.length && (
            <div className="row">
              <p className="small muted grow">{t('tt.import.noTemplates')}</p>
              <Button size="s" onClick={() => void rpc('ui.openWorkspace', 'templates')}>
                {t('inpage.profile.create')}
              </Button>
            </div>
          )}
          {tplList.length > 0 && (
            <select className="select tx-select" aria-label={t('tt.import.template')} value={tpl?.id ?? ''} onChange={(e) => setTplId(e.target.value)}>
              {tplList.map((x) => (
                <option key={x.id} value={x.id}>
                  {`${x.name || t('inpage.profile.unnamed')} (${f.int(x.tags.length)})`}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {from === 'video' && (
        <>
          {!signedIn && <p className="small muted">{t('tt.import.signIn')}</p>}
          {videos.error !== undefined && <InError error={videos.error} onRetry={videos.reload} />}
          {videos.loading && !videos.data && <span className="skel tx-skel-line" />}
          {videos.data && !vidList.length && <p className="small muted">{t('tt.import.noVideos')}</p>}
          {vidList.length > 0 && (
            <select className="select tx-select" aria-label={t('tt.import.video')} value={v?.id ?? ''} onChange={(e) => setVid(e.target.value)}>
              {vidList.map((x) => (
                <option key={x.id} value={x.id}>
                  {`${x.title} (${f.int(x.tags.length)})`}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {from === 'paste' && (
        <textarea className="input tx-input tt-paste" dir="auto" rows={3} value={text} maxLength={5000} placeholder={t('tt.import.pastePh')} aria-label={t('tt.import.paste')} onChange={(e) => setText(e.target.value)} />
      )}
      {tags.length > 0 && (
        <>
          <p className="xsmall muted">{t('tt.import.summary', { n: tags.length, fresh: fresh.length })}</p>
          <ul className="tt-preview tt-preview-chips" aria-label={t('tt.import')}>
            {tags.slice(0, 60).map((x) => (
              <li key={x} dir="auto" data-have={have.has(norm(x)) || undefined}>
                <bdi>{x}</bdi>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row">
        <Button size="s" variant="primary" disabled={!fresh.length || writer.busy} onClick={() => writer.add(fresh)}>
          <Icon name="plus" />
          {t('tt.import.add', { n: fresh.length })}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Translate

function TranslateTool({ values, writer }: { values: StudioValues; writer: Writer }) {
  const { t, lang } = useI18n();
  const status = useStatus();
  const [target, setTarget] = useState<Lang>(lang === 'fa' ? 'en' : 'fa');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [out, setOut] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const have = new Set(values.tags.map(norm));

  if (status && !status.ai)
    return (
      <div className="row">
        <p className="small muted grow">{t('inpage.studio.aiOff')}</p>
        <Button size="s" onClick={() => void rpc('ui.openWorkspace', 'settings')}>
          {t('conn.openSettings')}
        </Button>
      </div>
    );

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const source: Lang = target === 'fa' ? 'en' : 'fa';
      const r = await rpc<{ tags: string[] }>('ai.task', 'translate', { language: source, title: values.title, description: values.description.slice(0, 1500), tags: values.tags }, { targetLanguage: target });
      setOut(r.tags);
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };
  const fresh = (out ?? []).filter((x) => !have.has(norm(x)));

  return (
    <div className="stack-s">
      <div className="row">
        <select className="select tx-select" aria-label={t('inpage.studio.translateTo')} value={target} onChange={(e) => setTarget(e.target.value as Lang)}>
          <option value="en">{t('tt.toEnglish')}</option>
          <option value="fa">{t('tt.toPersian')}</option>
        </select>
        <Button size="s" variant="primary" disabled={busy || !values.tags.length} onClick={() => void run()}>
          <Icon name="translate" />
          {busy ? t('common.loading') : t('tt.translateRun', { n: values.tags.length })}
        </Button>
      </div>
      <p className="xsmall faint">{t('tt.translateHelp')}</p>
      {error !== undefined && <InError error={error} />}
      {out && (
        <>
          <ul className="tt-sugg" aria-label={t('tt.translate')}>
            {out.map((x) => (
              <li key={x} className="tt-sugg-chip">
                <button type="button" className="tt-sugg-add" dir="auto" disabled={have.has(norm(x))} onClick={() => writer.add([x])} aria-label={t('inpage.studio.addTag', { tag: x })}>
                  <Icon name={have.has(norm(x)) ? 'check' : 'plus'} />
                  <bdi>{x}</bdi>
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <Button size="s" disabled={!fresh.length || writer.busy} onClick={() => writer.add(fresh)}>
              <Icon name="plus" />
              {t('tt.import.add', { n: fresh.length })}
            </Button>
            {!confirm ? (
              <Button size="s" variant="ghost" disabled={!out.length} onClick={() => setConfirm(true)}>
                {t('tt.translateReplace')}
              </Button>
            ) : (
              <div className="tx-confirm" role="group" aria-label={t('tt.translateReplace')}>
                <Icon name="alert" />
                <p className="grow small">{t('tt.translateReplaceConfirm', { n: values.tags.length })}</p>
                <Button
                  size="s"
                  variant="primary"
                  onClick={() => {
                    setConfirm(false);
                    void writer.replace(out, t('tt.translated'));
                  }}
                >
                  {t('inpage.studio.replace')}
                </Button>
                <Button size="s" variant="ghost" onClick={() => setConfirm(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
