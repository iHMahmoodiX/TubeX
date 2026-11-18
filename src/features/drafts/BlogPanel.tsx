// Blog version (WordPress) of a video: an article in the owner's post style with the YouTube and Aparat videos
// embedded, SEO fields and checks. Written by the AI from the video's text (or a plain version without AI); TubeX
// builds the block HTML itself. The owner pastes it into WordPress and publishes there.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Field, Notice } from '../../components/ui';
import { useGoogle } from '../connections/useConnections';
import { browser } from 'wxt/browser';
import { loadWpSites, onWpSitesChanged, originOf, type WpSite } from '../../storage/wordpress';
import { wpErrorText } from '../settings/WordPressSettings';
import { BLOG_RULES, checkBlog, wpNewPostUrl } from '../../domain/blog';
import { emptyRepublish, pickTemplate, siteDefaults, templatesOf, type RepublishSettings } from '../../domain/republish';
import { loadRepublish, onRepublishChanged } from '../../storage/republish';
import { captionsFor, plainBlogPackage, sendBlogToWp, videosOf, writeBlogPackage } from '../republish/pipeline';
import { PUBLISH_STATUSES, nowIso, type BlogPackage, type Draft, type PublishStatus } from '../../domain/models';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { copyText, downloadText, fileSlug } from '../../platform/files';
import { lastBlogDefaults } from '../aparat/aparatActions';
import { parseTags } from '../../domain/aparat';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useIntegrations } from '../connections/useConnections';

const ALLOWED = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'A', 'BR']);

/** Read-only preview: rebuilds the article from allowed elements only (text nodes, no attributes but https links); videos become labels. */
function previewNodes(html: string, videoLabel: string): Node[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (n: Node): Node[] => {
    if (n.nodeType === Node.TEXT_NODE) return /^\s*https:\/\/www\.youtube\.com\/watch/.test(n.textContent ?? '') ? [] : [document.createTextNode(n.textContent ?? '')];
    if (n.nodeType !== Node.ELEMENT_NODE) return [];
    const el = n as Element;
    if (el.tagName === 'FIGURE' || el.tagName === 'IFRAME' || (el.tagName === 'DIV' && el.querySelector('iframe'))) {
      const box = document.createElement('div');
      box.className = 'blog-video';
      box.textContent = videoLabel;
      return [box];
    }
    const kids = [...el.childNodes].flatMap(walk);
    if (!ALLOWED.has(el.tagName)) return kids;
    const out = document.createElement(el.tagName.toLowerCase());
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? '';
      if (/^https:\/\//.test(href)) {
        out.setAttribute('href', href);
        out.setAttribute('target', '_blank');
        out.setAttribute('rel', 'noreferrer noopener');
      }
    }
    kids.forEach((k) => out.appendChild(k));
    return [out];
  };
  return [...doc.body.childNodes].flatMap(walk);
}

function Preview({ html, videoLabel }: { html: string; videoLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.replaceChildren(...previewNodes(html, videoLabel));
  }, [html, videoLabel]);
  return <div ref={ref} className="blog-preview" dir="rtl" />;
}

export { videosOf };

export function BlogPanel({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { ai } = useIntegrations();
  const p = draft.platforms?.blog;
  const [defaults, setDefaults] = useState<{ site: string; ctaUrl: string; sites: string[] }>({ site: '', ctaUrl: '', sites: [] });
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [capNote, setCapNote] = useState('');
  const [wpSites, setWpSites] = useState<WpSite[]>([]);
  const [wpBusy, setWpBusy] = useState(false);
  const [wpMsg, setWpMsg] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [featured, setFeatured] = useState(true);
  const [rs, setRs] = useState<RepublishSettings>(emptyRepublish);
  const [tplId, setTplId] = useState('');
  useEffect(() => {
    void loadWpSites().then(setWpSites);
    void loadRepublish().then((x) => {
      setRs(x);
      setFeatured(x.blog.featuredImage);
    });
    const a = onWpSitesChanged(setWpSites);
    const b = onRepublishChanged(setRs);
    return () => {
      a();
      b();
    };
  }, []);
  const google = useGoogle();
  const ownChannel = google.channels.find((c) => c.channelId === google.activeChannelId);
  // Captions can be read only for the owner's own videos (captions.list 50 + captions.download 200 units).
  const canCaptions = !!draft.source?.videoId && !!ownChannel;
  const fetchCaptions = async (): Promise<string> => {
    if (!ownChannel) return '';
    const c = await captionsFor(draft, ownChannel.channelId);
    if (!c) {
      setCapNote(t('blog.noCaptions'));
      return '';
    }
    setTranscript(c.text);
    setCapNote(t('blog.captionsLoaded', { lang: c.language, kind: c.auto ? t('blog.capAuto') : t('blog.capManual') }));
    return c.text;
  };
  const loadCaptions = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetchCaptions();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const [tagText, setTagText] = useState(p?.tags.join('، ') ?? '');
  useEffect(() => void lastBlogDefaults().then(setDefaults).catch(() => undefined), []);
  useEffect(() => setTagText(p?.tags.join('، ') ?? ''), [draft.id, p?.tags.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('tubex.focus') !== 'blog') return;
      sessionStorage.removeItem('tubex.focus');
    } catch {
      return;
    }
    const el = ref.current;
    if (el && el.offsetParent) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
  }, [draft.id]);
  const put = (next: BlogPackage) => update({ platforms: { ...draft.platforms, blog: next } });
  const set = (patch: Partial<BlogPackage>) => p && put({ ...p, ...patch });
  const videos = videosOf(draft);

  const currentSite = p?.site || defaults.site || rs.blog.defaultSite || wpSites[0]?.origin || '';
  const templates = templatesOf(rs, 'blog');
  const template = templates.find((x) => x.id === tplId) ?? pickTemplate(rs, 'blog', currentSite);
  const autoWp = rs.blog.autoWpDraft && !!wpSites.find((s) => s.origin === originOf(currentSite));

  const write = async (withAi: boolean) => {
    const site = currentSite;
    const sd = siteDefaults(rs, site);
    const ctaUrl = p?.ctaUrl || defaults.ctaUrl || sd?.ctaUrl || '';
    if (!withAi) {
      put(plainBlogPackage(draft, site, ctaUrl));
      return;
    }
    // Asked from the click itself (before any await) so the featured image can be attached afterwards.
    const imgOk = autoWp && featured && draft.source?.videoId ? await browser.permissions.request({ origins: ['https://i.ytimg.com/*'] }).catch(() => false) : false;
    setBusy(true);
    setError(null);
    setWpMsg(null);
    try {
      // The owner's workflow: the article is written from the video's own captions.
      let script = transcript;
      if (!script.trim() && canCaptions) script = await fetchCaptions().catch(() => '');
      const next = await writeBlogPackage(draft, { site, ctaUrl, template, transcript: script, category: p?.category || sd?.category, fresh: !!p });
      put(next);
      if (autoWp) await sendToWp(next, imgOk);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const sendToWp = async (pkg: BlogPackage, imageAllowed?: boolean) => {
    const site = wpSites.find((x) => x.origin === originOf(pkg.site));
    if (!site) return;
    const videoId = draft.source?.videoId;
    // Permission for the thumbnail host is asked from the click, before anything is awaited.
    const imgOk = imageAllowed ?? (featured && videoId ? await browser.permissions.request({ origins: ['https://i.ytimg.com/*'] }).catch(() => false) : false);
    setWpBusy(true);
    setWpMsg(null);
    try {
      const r = await sendBlogToWp(pkg, site, videoId, featured && imgOk);
      put(r.pkg);
      const notes = [!r.categoryFound && t('wp.noCategory', { name: pkg.category }), r.imageMissing && t('wp.noImage')].filter(Boolean).join(' ');
      setWpMsg({ tone: notes ? 'warning' : 'success', text: `${t(r.updated ? 'wp.updated' : 'wp.created')} ${notes}`.trim() });
    } catch (e) {
      setWpMsg({ tone: 'error', text: wpErrorText(t, e) });
    } finally {
      setWpBusy(false);
    }
  };

  const meta = () =>
    [
      [t('blog.f.title'), p?.title],
      [t('blog.f.slug'), p?.slug],
      [t('blog.f.keyword'), p?.focusKeyword],
      [t('blog.f.meta'), p?.metaDescription],
      [t('blog.f.excerpt'), p?.excerpt],
      [t('blog.f.category'), p?.category],
      [t('blog.f.tags'), p?.tags.join('، ')],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}:\n${v}`)
      .join('\n\n');
  const copy = async (text: string) => toast((await copyText(text)) ? t('common.copied') : t('common.copyFailed'));

  const generator = (
    <div className="stack-s">
      {!p && <p className="small muted">{t('blog.intro')}</p>}
      <div className="grid-2">
        <Field label={t('blog.f.site')} help={t('blog.siteHelp')}>
          {({ id, describedBy }) => (
            <>
              <input
                id={id}
                aria-describedby={describedBy}
                className="input"
                dir="ltr"
                list={`${id}-sites`}
                inputMode="url"
                placeholder="https://example.com/blog"
                value={p ? p.site : currentSite}
                onChange={(e) => (p ? set({ site: e.target.value.trim() }) : setDefaults((d) => ({ ...d, site: e.target.value.trim() })))}
              />
              <datalist id={`${id}-sites`}>
                {[...new Set([...defaults.sites, ...rs.blog.sites.map((x) => x.site), ...wpSites.map((w) => w.origin)])].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={t('blog.f.cta')} help={t('blog.ctaHelp')}>
          {({ id, describedBy }) => (
            <input id={id} aria-describedby={describedBy} className="input" dir="ltr" inputMode="url" placeholder="https://…" value={p ? p.ctaUrl : defaults.ctaUrl || siteDefaults(rs, currentSite)?.ctaUrl || ''} onChange={(e) => (p ? set({ ctaUrl: e.target.value.trim() }) : setDefaults((d) => ({ ...d, ctaUrl: e.target.value.trim() })))} />
          )}
        </Field>
      </div>
      <Field label={t('blog.f.transcript')} help={canCaptions ? t('blog.transcriptAuto') : t('blog.transcriptHelp')} counter={transcript ? `${[...transcript].length}` : undefined}>
        {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="auto" rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} />}
      </Field>
      {canCaptions && (
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <Button size="s" variant="ghost" disabled={busy} onClick={() => void loadCaptions()} data-testid="blog-captions">
            <Icon name="download" />
            {t('blog.getCaptions')}
          </Button>
          {capNote && <span className="xsmall muted">{capNote}</span>}
        </div>
      )}
      {ai.enabled && (
        <Field label={t('prompt.use')} help={t('prompt.useHelp')}>
          {({ id, describedBy }) => (
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
              <select id={id} aria-describedby={describedBy} className="select" value={template.id} onChange={(e) => setTplId(e.target.value)} data-testid="blog-template">
                {templates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name || t('prompt.builtinName')}
                  </option>
                ))}
              </select>
              <a className="btn btn-s btn-ghost" href="#settings/set-blog" style={{ whiteSpace: 'nowrap' }}>
                {t('prompt.edit')}
              </a>
            </div>
          )}
        </Field>
      )}
      <p className="xsmall faint">{videos.youtubeId ? (videos.aparatHash ? t('blog.videosBoth') : t('blog.videosYt')) : t('blog.videosNone')}</p>
      <div className="row" style={{ gap: 8 }}>
        {ai.enabled ? (
          <Button size="s" variant="primary" disabled={busy} onClick={() => void write(true)} data-testid="blog-ai-run">
            <Icon name="sparkle" />
            {busy ? t('common.loading') : autoWp ? (p ? t('blog.ai.againWp') : t('blog.ai.runWp')) : p ? t('blog.ai.again') : t('blog.ai.run')}
          </Button>
        ) : (
          <a className="btn btn-s btn-primary" href="#settings">
            {t('aparat.ai.setup')}
          </a>
        )}
        {!p && (
          <Button size="s" onClick={() => void write(false)} data-testid="blog-plain">
            {t('blog.plain')}
          </Button>
        )}
      </div>
      <ErrorNotice error={error} />
    </div>
  );

  if (!p)
    return (
      <div className="stack-s" data-testid="blog-panel" ref={ref}>
        {generator}
      </div>
    );

  const issues = checkBlog(p);
  const wpSite = wpSites.find((s) => s.origin === originOf(p.site));
  const newPost = wpNewPostUrl(p.site);
  const len = (x: string) => [...x].length;
  return (
    <div className="stack" data-testid="blog-panel" ref={ref}>
      {generator}
      <hr className="divider" />
      <Field label={t('blog.f.title')} counter={`${len(p.title)} / ${BLOG_RULES.titleMax}`} over={len(p.title) > BLOG_RULES.titleMax}>
        {({ id }) => <input id={id} className="input" dir="auto" value={p.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />}
      </Field>
      <div className="grid-2">
        <Field label={t('blog.f.slug')}>
          {({ id }) => <input id={id} className="input" dir="ltr" value={p.slug} maxLength={120} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} />}
        </Field>
        <Field label={t('blog.f.keyword')}>
          {({ id }) => <input id={id} className="input" dir="auto" value={p.focusKeyword} maxLength={120} onChange={(e) => set({ focusKeyword: e.target.value })} />}
        </Field>
      </div>
      <Field label={t('blog.f.meta')} counter={`${len(p.metaDescription)} / ${BLOG_RULES.metaMax}`} over={len(p.metaDescription) > BLOG_RULES.metaMax}>
        {({ id }) => <textarea id={id} className="textarea" dir="auto" rows={2} value={p.metaDescription} onChange={(e) => set({ metaDescription: e.target.value })} />}
      </Field>
      <Field label={t('blog.f.excerpt')}>
        {({ id }) => <textarea id={id} className="textarea" dir="auto" rows={2} value={p.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />}
      </Field>
      <div className="grid-2">
        <Field label={t('blog.f.category')}>
          {({ id }) => <input id={id} className="input" dir="auto" value={p.category} maxLength={100} onChange={(e) => set({ category: e.target.value })} />}
        </Field>
        <Field label={t('blog.f.tags')}>
          {({ id }) => (
            <input
              id={id}
              className="input"
              dir="auto"
              value={tagText}
              onChange={(e) => {
                setTagText(e.target.value);
                set({ tags: parseTags(e.target.value).slice(0, 20) });
              }}
            />
          )}
        </Field>
      </div>
      <Field label={t('blog.f.html')} help={t('blog.htmlHelp')} counter={`${len(p.html)}`}>
        {({ id, describedBy }) => <textarea id={id} aria-describedby={describedBy} className="textarea" dir="ltr" rows={10} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} value={p.html} onChange={(e) => set({ html: e.target.value })} />}
      </Field>

      <details className="core-fold" data-testid="blog-preview">
        <summary>{t('blog.preview')}</summary>
        <Preview html={p.html} videoLabel={t('blog.videoHere')} />
      </details>

      <div aria-live="polite" data-testid="blog-checks">
        {issues.length === 0 ? (
          <Notice tone="success">{t('blog.ready')}</Notice>
        ) : (
          <ul className="stack-s small" style={{ margin: 0, paddingInlineStart: 18 }}>
            {issues.map((i) => (
              <li key={i.id}>
                <strong>{t(i.severity === 'error' ? 'aparat.sev.error' : 'aparat.sev.warning')}</strong> {t(`blog.issue.${i.id}` as MessageKey, i.values)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Button size="s" variant="primary" onClick={() => void copy(p.html)} data-testid="blog-copy-html">
          <Icon name="copy" />
          {t('blog.copyHtml')}
        </Button>
        <Button size="s" onClick={() => void copy(meta())}>
          <Icon name="copy" />
          {t('blog.copyMeta')}
        </Button>
        <Button size="s" onClick={() => downloadText(`${fileSlug(p.slug || p.title || 'post')}.html`, p.html, 'text/html;charset=utf-8')}>
          <Icon name="download" />
          {t('blog.download')}
        </Button>
        {newPost && (
          <a className="btn btn-s" href={newPost} target="_blank" rel="noreferrer noopener">
            <Icon name="external" />
            {t('blog.openWp')}
          </a>
        )}
      </div>
      <div className="card stack-s" style={{ background: 'var(--surface-2)' }} data-testid="blog-wp">
        <strong>{t('wp.panelTitle')}</strong>
        {wpSite ? (
          <>
            <p className="xsmall muted">{t('wp.panelHelp', { site: wpSite.origin.replace(/^https:\/\//, '') })}</p>
            <label className="check">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              <span className="small">{t('wp.featured')}</span>
            </label>
            <div className="row" style={{ gap: 8 }}>
              <Button size="s" variant="primary" disabled={wpBusy || !p.html.trim()} onClick={() => void sendToWp(p)} data-testid="wp-send">
                <Icon name="upload" />
                {wpBusy ? t('common.loading') : p.wp ? t('wp.update') : t('wp.create')}
              </Button>
              {p.wp && (
                <a className="btn btn-s" href={`${p.wp.origin}/wp-admin/post.php?post=${p.wp.postId}&action=edit`} target="_blank" rel="noreferrer noopener">
                  <Icon name="external" />
                  {t('wp.openDraft')}
                </a>
              )}
            </div>
            {wpMsg && <Notice tone={wpMsg.tone}>{wpMsg.text}</Notice>}
          </>
        ) : (
          <p className="xsmall muted">
            {t('wp.connectFirst')}{' '}
            <a href="#settings">{t('conn.openSettings')}</a>
          </p>
        )}
      </div>
      <p className="xsmall faint">{t('blog.handoff')}</p>

      <hr className="divider" />
      <div className="grid-2">
        <Field label={t('blog.status')}>
          {({ id }) => (
            <select id={id} className="select" value={p.status} onChange={(e) => set({ status: e.target.value as PublishStatus, statusAt: nowIso() })}>
              {PUBLISH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`blog.st.${s}` as MessageKey)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('blog.url')}>
          {({ id }) => <input id={id} className="input" dir="ltr" inputMode="url" placeholder="https://…" value={p.url ?? ''} maxLength={500} onChange={(e) => set({ url: e.target.value.trim() || undefined, statusAt: nowIso() })} />}
        </Field>
      </div>
      <div>
        <ConfirmButton
          size="s"
          label={t('blog.remove')}
          question={t('blog.removeQ')}
          confirmLabel={t('blog.remove')}
          onConfirm={() => {
            const { blog: _drop, ...rest } = draft.platforms ?? {};
            update({ platforms: Object.keys(rest).length ? rest : undefined });
          }}
        />
      </div>
    </div>
  );
}
