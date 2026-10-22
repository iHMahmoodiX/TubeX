// Studio video editor assistant card (studio.youtube.com/video/<id>/edit): the live SEO checklist that follows
// the title/description/tags fields as the user types, the target (focus) keyword shared with the tag tools at
// Studio's Tags field, upload profiles (templates) and AI translation of the title and description.
// Tag work (suggestions, ranks, sort, import, tag translation) lives at the Tags field itself (./tags, switch
// 'studioTags'); this card keeps its old Tags tab only when that switch is off, so nothing is duplicated.
// Fields are only filled on a click; the user reviews and presses Save in Studio.
import { useId, useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { Button, Score } from '../../components/ui';
import { useToast } from '../../components/toasts';
import { KEYWORD_SCORE_UNITS, tagsFromVideos, videoSeo } from '../../domain/inpage';
import { LIMITS, tagsCharCount } from '../../domain/metadata';
import type { Lang } from '../../domain/models';
import type { SearchSample } from '../../integrations/youtube/api';
import { useI18n } from '../../i18n';
import { rpc } from '../../platform/rpc';
import { studioEditorRoot } from '../../platform/youtubeDomInpage';
import { canReadYt, copyText, InError, InTabs, Mark, useFmt, useStatus, useStored } from '../common';
import { useHref, useInpageEnabled } from '../InpageRoot';
import { SeoChecklist } from '../youtube/WatchSeo';
import { addTags, replaceField, useStudioValues, type StudioValues } from './fields';
import { ProfilePicker } from './ProfilePicker';
import { scrollToTags } from './tags/dom';
import { mainPhrase, ranksFor } from './tags/logic';
import { openKeywordPop, useRanks, useTargetKeyword } from './tags/store';

type Tab = 'checks' | 'tags' | 'profile' | 'translate';

export const onStudioEditor = () => location.hostname === 'studio.youtube.com' && /^\/video\/[\w-]{11}\/edit/.test(location.pathname);

export function StudioEditor() {
  const on = useInpageEnabled('studioEditor');
  const href = useHref();
  const videoId = href.match(/studio\.youtube\.com\/video\/([\w-]{11})\/edit/)?.[1];
  if (!on || !videoId) return null;
  return <Assistant key={videoId} videoId={videoId} />;
}

function Assistant({ videoId }: { videoId: string }) {
  const { t } = useI18n();
  const getRoot = () => studioEditorRoot(document);
  const values = useStudioValues(getRoot);
  const tagTools = useInpageEnabled('studioTags');
  const [kw, setKw] = useTargetKeyword(videoId);
  const [ranks] = useRanks(videoId);
  const derived = mainPhrase(values.title);
  const keyword = kw.trim() || derived;
  const [tab, setTab] = useStored<Tab>('studio.tab', 'checks');
  const [open, setOpen] = useStored<boolean>('studio.open', true);
  const seo = useMemo(() => videoSeo({ title: values.title, description: values.description, tags: values.tags, keyword }), [values, keyword]);
  const kwId = useId();
  const shown: Tab = tagTools && tab === 'tags' ? 'checks' : tab;
  const r = ranksFor(values.tags, ranks);

  return (
    <section className="tx-card tx-studio" aria-label={t('inpage.studio.label')}>
      <div className="tx-head">
        <Mark />
        <span className="small bold">{t('inpage.studio.title')}</span>
        <span className="grow" />
        <Score value={values.found.title ? seo.score : null} label={t('inpage.seo.score')} />
        <button type="button" className="icon-btn tx-toggle" aria-expanded={open} aria-label={open ? t('inpage.hideDetails') : t('inpage.showDetails')} title={open ? t('inpage.hideDetails') : t('inpage.showDetails')} onClick={() => setOpen(!open)}>
          <Icon name="down" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {open && (
        <>
          <div className="stack-s">
            <label className="small bold" htmlFor={kwId}>
              {t('tt.target')}
            </label>
            <div className="row tx-kw">
              <input id={kwId} className="input tx-input" dir="auto" value={kw} placeholder={derived || t('inpage.studio.kwPh')} maxLength={100} onChange={(e) => setKw(e.target.value)} />
              {tagTools && keyword && (
                <Button size="s" onClick={(e) => openKeywordPop(keyword, e.currentTarget)}>
                  <Icon name="search" />
                  {t('tt.research')}
                </Button>
              )}
            </div>
            {!kw.trim() && derived && <p className="xsmall muted">{t('tt.targetFromTitle', { k: derived })}</p>}
          </div>
          <InTabs<Tab>
            label={t('inpage.studio.tabs')}
            value={shown}
            onChange={setTab}
            items={[
              { id: 'checks', label: t('inpage.tab.seo'), icon: 'target' },
              ...(tagTools ? [] : [{ id: 'tags' as const, label: t('inpage.tab.tags'), icon: 'tag' as const, count: values.tags.length }]),
              { id: 'profile', label: t('inpage.tab.profile'), icon: 'file' },
              { id: 'translate', label: t('inpage.tab.translate'), icon: 'translate' },
            ]}
          />
          <div role="tabpanel" className="tx-panel">
            {shown === 'checks' &&
              (values.found.title ? (
                <div className="stack-s">
                  <SeoChecklist items={seo.items} />
                  {!values.found.tags && <p className="xsmall muted">{t('inpage.studio.tagsHidden')}</p>}
                  {tagTools && values.found.tags && (
                    <div className="tx-note tt-card-note">
                      <Icon name="tag" />
                      <span className="grow">
                        {t('tt.card.atField', { n: values.tags.length, chars: tagsCharCount(values.tags), max: LIMITS.tagsChars })}
                        {r.checked > 0 && ` ${t('tt.rankSummary', { top: r.top10, found: r.found, n: r.checked })}`}
                      </span>
                      <Button size="s" variant="ghost" onClick={() => scrollToTags(document)}>
                        {t('tt.card.goTags')}
                      </Button>
                    </div>
                  )}
                  <p className="xsmall faint">{t('inpage.seo.disclaimer')}</p>
                </div>
              ) : (
                <p className="small muted">{t('inpage.studio.noEditor')}</p>
              ))}
            {shown === 'tags' && <TagSuggestions values={values} keyword={keyword} getRoot={getRoot} />}
            {shown === 'profile' && <ProfilePicker getRoot={getRoot} />}
            {shown === 'translate' && <Translate values={values} getRoot={getRoot} />}
          </div>
          <p className="xsmall muted tx-save-note">
            <Icon name="info" />
            {t('inpage.studio.reviewSave')}
          </p>
        </>
      )}
    </section>
  );
}

function TagSuggestions({ values, keyword, getRoot }: { values: StudioValues; keyword: string; getRoot: () => ParentNode | null }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const status = useStatus();
  const [suggest, setSuggest] = useState<{ tag: string; count?: number }[] | null>(null);
  const [source, setSource] = useState<'ai' | 'top' | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>();
  const [note, setNote] = useState<string | null>(null);
  const chars = tagsCharCount(values.tags);
  const query = keyword.trim() || values.title.trim();
  const have = new Set(values.tags.map((x) => x.toLowerCase()));

  const run = async (kind: 'ai' | 'top') => {
    setAsking(false);
    setBusy(true);
    setError(undefined);
    setNote(null);
    try {
      if (kind === 'ai') {
        const out = await rpc<{ tags: string[] }>('ai.task', 'tags', { language: lang as Lang, title: values.title, description: values.description.slice(0, 3000), tags: values.tags, focusKeyword: keyword });
        setSuggest(out.tags.map((tag) => ({ tag })));
      } else {
        const s = await rpc<SearchSample>('yt.search', query, { max: 10 });
        setSuggest(tagsFromVideos(s.videos, values.tags, 30));
      }
      setSource(kind);
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };

  const add = (tags: string[]) => {
    const root = getRoot();
    const r = root ? addTags(root, tags) : ({ ok: false } as const);
    if (!r.ok) return setNote(t('inpage.studio.noTags'));
    setNote([t('inpage.studio.tagsAdded', { n: r.added.length }), r.overLimit.length ? t('inpage.studio.tagsOver', { n: r.overLimit.length }) : ''].filter(Boolean).join(' '));
  };

  const fresh = (suggest ?? []).filter((s) => !have.has(s.tag.toLowerCase()));

  return (
    <div className="stack-s">
      <p className="small muted">{t('inpage.tags.count', { n: values.tags.length, chars, max: LIMITS.tagsChars })}</p>
      <div className="row">
        {status?.ai && (
          <Button size="s" disabled={busy} onClick={() => void run('ai')}>
            <Icon name="sparkle" />
            {t('inpage.studio.suggestAi')}
          </Button>
        )}
        {canReadYt(status) && !asking && (
          <Button size="s" disabled={busy || !query} onClick={() => setAsking(true)}>
            <Icon name="search" />
            {t('inpage.studio.suggestTop')}
          </Button>
        )}
      </div>
      {!status?.ai && <p className="xsmall faint">{t('inpage.studio.aiOff')}</p>}
      {asking && (
        <div className="tx-confirm" role="group" aria-label={t('inpage.studio.suggestTop')}>
          <Icon name="info" />
          <p className="grow small">{t('inpage.studio.topCost', { q: query, units: f.int(KEYWORD_SCORE_UNITS) })}</p>
          <Button size="s" variant="primary" autoFocus onClick={() => void run('top')}>
            {t('inpage.search.run')}
          </Button>
          <Button size="s" variant="ghost" onClick={() => setAsking(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {busy && <span className="skel tx-skel-line" aria-busy="true" />}
      {error !== undefined && <InError error={error} />}
      {suggest && (
        <>
          <div className="row-between">
            <span className="xsmall muted">{source === 'top' ? t('inpage.studio.fromTop') : t('inpage.studio.fromAi')}</span>
            {fresh.length > 0 && (
              <Button size="s" variant="ghost" onClick={() => add(fresh.map((s) => s.tag))}>
                {t('inpage.studio.addAll')}
              </Button>
            )}
          </div>
          {fresh.length ? (
            <ul className="chips" aria-label={t('inpage.studio.suggestions')}>
              {fresh.map((s) => (
                <li key={s.tag}>
                  <button type="button" className="chip" dir="auto" onClick={() => add([s.tag])} aria-label={t('inpage.studio.addTag', { tag: s.tag })}>
                    <Icon name="plus" />
                    {s.tag}
                    {s.count !== undefined && <small className="num-t">{f.int(s.count)}</small>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">{t('inpage.studio.noNew')}</p>
          )}
        </>
      )}
      {note && (
        <div className="tx-note" role="status">
          <Icon name="info" />
          <span className="grow">{note}</span>
        </div>
      )}
    </div>
  );
}

function Translate({ values, getRoot }: { values: StudioValues; getRoot: () => ParentNode | null }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const status = useStatus();
  const id = useId();
  const [target, setTarget] = useState<Lang>(lang === 'fa' ? 'en' : 'fa');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [out, setOut] = useState<{ title: string; description: string; tags: string[] } | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (status && !status.ai)
    return (
      <div className="tx-empty">
        <Icon name="translate" />
        <p>{t('inpage.studio.aiOff')}</p>
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
      setOut(await rpc('ai.task', 'translate', { language: source, title: values.title, description: values.description.slice(0, 3000), tags: values.tags }, { targetLanguage: target }));
    } catch (e) {
      setError(e);
    }
    setBusy(false);
  };
  const copy = async (s: string) => toast((await copyText(s)) ? t('common.copied') : t('common.copyFailed'));

  return (
    <div className="stack-s">
      <div className="row">
        <label className="small bold" htmlFor={id}>
          {t('inpage.studio.translateTo')}
        </label>
        <select id={id} className="select tx-select" value={target} onChange={(e) => setTarget(e.target.value as Lang)}>
          <option value="en">English</option>
          <option value="fa">فارسی</option>
        </select>
        <Button size="s" variant="primary" disabled={busy || !values.title} onClick={() => void run()}>
          <Icon name="translate" />
          {busy ? t('common.loading') : t('inpage.studio.translate')}
        </Button>
      </div>
      <p className="xsmall faint">{t('inpage.studio.translateHelp')}</p>
      {error !== undefined && <InError error={error} />}
      {out && (
        <div className="stack-s">
          <div className="tx-out">
            <div className="row-between">
              <span className="xsmall muted">{t('inpage.edit.title')}</span>
              <Button size="s" variant="ghost" onClick={() => void copy(out.title)}>
                <Icon name="copy" />
                {t('common.copy')}
              </Button>
            </div>
            <p dir="auto">{out.title}</p>
          </div>
          <div className="tx-out">
            <div className="row-between">
              <span className="xsmall muted">{t('inpage.edit.description')}</span>
              <Button size="s" variant="ghost" onClick={() => void copy(out.description)}>
                <Icon name="copy" />
                {t('common.copy')}
              </Button>
            </div>
            <p dir="auto" className="tx-clip tx-pre">
              {out.description}
            </p>
          </div>
          {!confirm ? (
            <div>
              <Button size="s" onClick={() => setConfirm(true)}>
                {t('inpage.studio.useInFields')}
              </Button>
            </div>
          ) : (
            <div className="tx-confirm" role="group" aria-label={t('inpage.studio.useInFields')}>
              <Icon name="alert" />
              <p className="grow small">{t('inpage.studio.useConfirm')}</p>
              <Button
                size="s"
                variant="primary"
                onClick={() => {
                  const root = getRoot();
                  setConfirm(false);
                  if (!root) return;
                  replaceField(root, 'title', out.title);
                  replaceField(root, 'description', out.description);
                  toast(t('inpage.studio.reviewSave'));
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
      )}
    </div>
  );
}
