// Language analysis: the language/script mix of titles, descriptions and tags in the keyword sample and in
// the owner's videos, compared with the declared default language, plus optional AI translation.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyzeMetadata, bucketOfCode, detectMix, dominantCounts, mergeMixes, type LangBucket, type LangIssue } from '../../domain/seoLanguage';
import { useToast } from '../../components/toasts';
import { Button, Empty, Field, Notice, Skeleton, Switch, Thumb } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { dataBlock, runAiJson } from '../../integrations/ai/custom';
import { ownChannelMeta, ownVideosMeta, videosMeta, type VideoMeta } from '../../integrations/youtube/seoApi';
import { copyText } from '../../platform/files';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useGoogle, useIntegrations } from '../connections/useConnections';
import type { KeywordData } from './keywordData';
import { LANG_KEYS, MixBars, MixChips, SectionHead } from './parts';
import { useAsync, useFormat } from './shared';

const ISSUE_KEYS: Record<LangIssue, MessageKey> = {
  'missing-default': 'seo.lang.issue.missing',
  mismatch: 'seo.lang.issue.mismatch',
  'mixed-title': 'seo.lang.issue.mixedTitle',
  'mixed-description': 'seo.lang.issue.mixedDesc',
  'mixed-tags': 'seo.lang.issue.mixedTags',
};
const TARGETS = ['fa', 'en', 'ar', 'tr', 'de', 'fr', 'es', 'ru', 'hi', 'ur', 'pt', 'it'];

function useLangName() {
  const { lang } = useI18n();
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([lang === 'fa' ? 'fa' : 'en'], { type: 'language' });
    } catch {
      return null;
    }
  }, [lang]);
  return (code: string | undefined) => (code ? (names?.of(code) ?? code) : '—');
}

function SampleLanguage({ data }: { data: KeywordData }) {
  const { t } = useI18n();
  const f = useFormat();
  const langName = useLangName();
  const meta = useAsync(useCallback((ids: string[]) => videosMeta(ids), []));
  useEffect(() => {
    void meta.run(data.sample.videos.map((v) => v.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.sample.fetchedAt, data.sample.query]);
  const vids: VideoMeta[] = meta.data ?? data.sample.videos;
  const titles = vids.map((v) => detectMix(v.title));
  const titleMix = mergeMixes(titles);
  const descMix = mergeMixes(vids.map((v) => detectMix(v.description)));
  const tagMix = mergeMixes(vids.map((v) => detectMix(v.tags)));
  const dom = dominantCounts(titles);
  const declared = vids.map((v) => bucketOfCode(v.defaultLanguage));
  const declaredCount = declared.filter(Boolean).length;
  const top = (Object.entries(dom) as [LangBucket, number][]).sort((a, b) => b[1] - a[1])[0];
  const mixedTitles = titles.filter((m) => m.mixed).length;
  const codes = new Map<string, number>();
  for (const v of vids) if (v.defaultLanguage) codes.set(v.defaultLanguage, (codes.get(v.defaultLanguage) ?? 0) + 1);
  return (
    <section className="seo-section" aria-labelledby="lang-sample">
      <SectionHead id="lang-sample" title={t('seo.lang.sampleTitle', { k: data.sample.query })} sub={t('seo.lang.sampleHelp')} />
      <ErrorNotice error={meta.error} />
      {top && top[1] > 0 && (
        <Notice tone="info">
          <p>
            {t('seo.lang.sampleVerdict', { n: top[1], total: vids.length, lang: t(LANG_KEYS[top[0]]) })} {mixedTitles > 0 && t('seo.lang.sampleMixed', { n: mixedTitles })}
          </p>
        </Notice>
      )}
      <div className="grid-3">
        <div className="seo-part">
          <h3>{t('seo.lang.titles')}</h3>
          <MixBars mix={titleMix} label={t('seo.lang.titles')} />
        </div>
        <div className="seo-part">
          <h3>{t('seo.lang.descriptions')}</h3>
          <MixBars mix={descMix} label={t('seo.lang.descriptions')} />
        </div>
        <div className="seo-part">
          <h3>{t('seo.lang.tags')}</h3>
          <MixBars mix={tagMix} label={t('seo.lang.tags')} />
        </div>
      </div>
      <p className="small muted">
        {meta.loading ? t('common.loading') : t('seo.lang.declared', { n: declaredCount, total: vids.length })}{' '}
        {[...codes.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([c, n]) => `${langName(c)} ${f.int(n)}`)
          .join(' · ')}
      </p>
    </section>
  );
}

function OwnLanguage({ onTranslate }: { onTranslate: (v: VideoMeta) => void }) {
  const { t } = useI18n();
  const langName = useLangName();
  const google = useGoogle();
  const active = google.channels.find((c) => c.channelId === google.activeChannelId);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const load = useAsync(
    useCallback(async (channelId: string, playlist: string | undefined, fresh: boolean) => {
      const ch = await ownChannelMeta(channelId, fresh);
      const uploads = ch?.uploadsPlaylistId ?? playlist;
      const videos = uploads ? await ownVideosMeta(channelId, uploads, 50, fresh) : [];
      return { ch, videos };
    }, []),
  );
  useEffect(() => {
    if (active) void load.run(active.channelId, active.uploadsPlaylistId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.channelId]);
  const rows = useMemo(() => (load.data?.videos ?? []).map((v) => ({ v, a: analyzeMetadata({ ...v, defaultLanguage: v.defaultLanguage }) })), [load.data]);
  if (google.loaded && !active)
    return (
      <section className="seo-section" aria-labelledby="lang-own">
        <SectionHead id="lang-own" title={t('seo.lang.ownTitle')} />
        <Empty icon="lock" action={<a className="btn btn-s" href="#settings">{t('shell.signIn')}</a>}>
          {t('seo.lang.ownSignIn')}
        </Empty>
      </section>
    );
  const withIssues = rows.filter((r) => r.a.issues.length);
  const shown = onlyIssues ? withIssues : rows;
  const ch = load.data?.ch;
  return (
    <section className="seo-section" aria-labelledby="lang-own">
      <SectionHead
        id="lang-own"
        title={t('seo.lang.ownTitle')}
        sub={t('seo.lang.ownHelp')}
        actions={
          <Button size="s" variant="ghost" disabled={load.loading || !active} onClick={() => active && void load.run(active.channelId, active.uploadsPlaylistId, true)}>
            {t('research.refresh')}
          </Button>
        }
      />
      <ErrorNotice error={load.error} />
      {load.loading && !load.data && <Skeleton lines={5} />}
      {load.data && (
        <>
          {ch && (
            <Notice tone={ch.defaultLanguage ? 'info' : 'warning'}>
              <p>{ch.defaultLanguage ? t('seo.lang.channelDefault', { lang: langName(ch.defaultLanguage) }) : t('seo.lang.channelNoDefault')}</p>
            </Notice>
          )}
          <div className="row-between">
            <p className="small muted">{t('seo.lang.ownSummary', { n: withIssues.length, total: rows.length })}</p>
            <Switch checked={onlyIssues} onChange={setOnlyIssues} label={t('seo.lang.onlyIssues')} />
          </div>
          {!shown.length ? (
            <Empty icon="check">{t('seo.lang.noIssues')}</Empty>
          ) : (
            <ol className="seo-tracks" aria-label={t('seo.lang.ownTitle')}>
              {shown.map(({ v, a }, i) => (
                <li key={v.id} className="seo-track" style={{ alignItems: 'start' }}>
                  <span className="track-n" style={{ paddingBlockStart: 12 }}>
                    {i + 1}
                  </span>
                  <div className="seo-track-main" style={{ alignItems: 'start' }}>
                    <Thumb videoId={v.id} src={v.thumbnail} width={88} />
                    <div className="seo-track-text" style={{ gap: 4 }}>
                      <a className="seo-track-title truncate" href={`https://studio.youtube.com/video/${v.id}/edit`} target="_blank" rel="noreferrer noopener" dir="auto">
                        {v.title}
                      </a>
                      <span className="xsmall faint">
                        {t('seo.lang.declaredShort', { lang: langName(v.defaultLanguage) })}
                        {v.defaultAudioLanguage ? ` · ${t('seo.lang.audio', { lang: langName(v.defaultAudioLanguage) })}` : ''}
                      </span>
                      <MixChips mix={a.overall} />
                      {a.issues.length > 0 && (
                        <span className="row" style={{ gap: 4 }}>
                          {a.issues.map((x) => (
                            <span key={x} className={`badge ${x === 'mismatch' || x === 'missing-default' ? 'badge-warning' : 'badge-info'}`}>
                              {t(ISSUE_KEYS[x], { lang: a.declared ? t(LANG_KEYS[a.declared]) : '—' })}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="s" variant="ghost" onClick={() => onTranslate(v)}>
                    {t('seo.lang.translate')}
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <p className="xsmall faint">{t('seo.lang.heuristic')}</p>
        </>
      )}
    </section>
  );
}

interface Translation {
  title: string;
  description: string;
  tags: string[];
}

function Translate({ source }: { source?: VideoMeta }) {
  const { t } = useI18n();
  const toast = useToast();
  const langName = useLangName();
  const { ai } = useIntegrations();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tags, setTags] = useState('');
  const [target, setTarget] = useState('en');
  const [out, setOut] = useState<Translation | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!source) return;
    setTitle(source.title);
    setDesc(source.description);
    setTags(source.tags.join(', '));
    setOut(null);
    const from = bucketOfCode(source.defaultLanguage) ?? detectMix(source.title).dominant;
    setTarget(from === 'fa' ? 'en' : 'fa');
  }, [source]);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await runAiJson({
        task: 'seo-translate-v1',
        instructions:
          `Translate this YouTube video's title, description and tags into ${langName(target)} (language code ${target}). ` +
          'Write natural, searchable wording a native speaker would type on YouTube; do not translate word by word. ' +
          'Keep URLs, @handles, timestamps (like 00:00) and brand names unchanged. Title at most 100 characters; tags short phrases, at most 25. ' +
          'Return {"title": string, "description": string, "tags": string[]}.',
        data: dataBlock('Title', title, 300) + dataBlock('Description', desc, 5000) + dataBlock('Tags', tags, 1500),
        maxTokens: 2500,
      });
      const o = r.output;
      setOut({
        title: typeof o.title === 'string' ? o.title.slice(0, 100) : '',
        description: typeof o.description === 'string' ? o.description : '',
        tags: Array.isArray(o.tags) ? o.tags.filter((x): x is string => typeof x === 'string').slice(0, 40) : [],
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string) => toast((await copyText(text)) ? t('common.copied') : t('common.copyFailed'));
  return (
    <section className="seo-section" aria-labelledby="lang-tr" id="seo-translate">
      <SectionHead id="lang-tr" title={t('seo.lang.trTitle')} sub={t('seo.lang.trHelp')} />
      {!ai.enabled && (
        <Notice>
          <p>{t('seo.lang.trNoAi')}</p>
          <div>
            <a className="btn btn-s" href="#settings">
              {t('conn.openSettings')}
            </a>
          </div>
        </Notice>
      )}
      <div className="editor-grid">
        <div className="card stack-s">
          <Field label={t('yt.col.title')}>{({ id }) => <input id={id} className="input" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label={t('seo.lang.description')}>{({ id }) => <textarea id={id} className="textarea" rows={4} dir="auto" value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
          <Field label={t('seo.lang.tags')} help={t('seo.lang.tagsHelp')}>
            {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input" dir="auto" value={tags} onChange={(e) => setTags(e.target.value)} />}
          </Field>
          <div className="row">
            <Field label={t('seo.lang.target')}>
              {({ id }) => (
                <select id={id} className="select" style={{ width: 'auto' }} value={target} onChange={(e) => setTarget(e.target.value)}>
                  {TARGETS.map((c) => (
                    <option key={c} value={c}>
                      {langName(c)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Button variant="primary" style={{ alignSelf: 'flex-end' }} disabled={!ai.enabled || busy || !(title.trim() || desc.trim())} onClick={() => void run()}>
              {busy ? t('ai.running') : t('seo.lang.translate')}
            </Button>
          </div>
          <ErrorNotice error={error} />
        </div>
        <div className="card stack-s" aria-live="polite">
          {!out ? (
            <Empty icon="translate">{t('seo.lang.trEmpty')}</Empty>
          ) : (
            <>
              {(
                [
                  ['yt.col.title', out.title],
                  ['seo.lang.description', out.description],
                  ['seo.lang.tags', out.tags.join(', ')],
                ] as [MessageKey, string][]
              ).map(([k, v]) => (
                <div key={k} className="stack-s">
                  <div className="row-between">
                    <h3 className="small">{t(k)}</h3>
                    <Button size="s" variant="ghost" onClick={() => void copy(v)} aria-label={`${t('common.copy')} ${t(k)}`}>
                      {t('common.copy')}
                    </Button>
                  </div>
                  <div className="seo-out" dir="auto">
                    {v || '—'}
                  </div>
                </div>
              ))}
              <p className="xsmall faint">{t('ai.disclaimer')}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function Language({ data }: { data?: KeywordData }) {
  const { t } = useI18n();
  const [source, setSource] = useState<VideoMeta>();
  return (
    <div className="stack-l">
      {data ? <SampleLanguage data={data} /> : <Notice>{t('seo.lang.exploreFirst')}</Notice>}
      <OwnLanguage
        onTranslate={(v) => {
          setSource(v);
          requestAnimationFrame(() => document.getElementById('seo-translate')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }}
      />
      <Translate source={source} />
    </div>
  );
}
