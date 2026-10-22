// Bulk Thumbnail Overlays: pick own videos, design a banner / corner badge / logo overlay, preview it on each
// video's current thumbnail, then upload with thumbnails.set. Originals are kept locally so a batch can be
// restored ("Remove overlay").
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_DESIGN, THUMB_COST, type BannerPosition, type Corner, type OverlayDesign } from '../../domain/engageThumbs';
import { runSequential, type RunProgress } from '../../domain/engageRun';
import { parseSelection } from '../../domain/coppa';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Button, ConfirmButton, Empty, Field, Notice, PageHeader, Skeleton } from '../../components/ui';
import { useWork } from '../../components/useWork';
import { useI18n } from '../../i18n';
import type { OwnVideo } from '../../integrations/google/own';
import { fetchCurrentThumbnail, setThumbnail } from '../../integrations/google/ownWrites';
import { YtError } from '../../integrations/youtube/client';
import { hasOrigin, requestOrigin } from '../../platform/permissions';
import { newId, one, put, type Snapshot } from '../../storage/stores';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useFormat } from '../research/shared';
import { Cost, isFatal, RunStatus, SignInEmpty, Step, useOwnChannel, useOwnUploads, VideoPicker } from '../bulk/engageKit';
import { draw, ensureFonts, toJpeg } from './render';

const IMG = 'https://i.ytimg.com/';
const BATCH_REF = 'engage.thumbBatches';
const MAX_VIDEOS = 50;

interface Batch {
  id: string;
  at: string;
  videos: { id: string; title: string }[];
  text: string;
  restoredAt?: string;
}

type Loaded = { bmp: ImageBitmap; blob: Blob; size: 'maxres' | 'hq' };

function Preview({ video, base, design, logo, showOverlay }: { video: OwnVideo; base?: Loaded | null; design: OverlayDesign; logo: ImageBitmap | null; showOverlay: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) draw(ref.current, base?.bmp ?? null, design, logo, showOverlay);
  }, [base, design, logo, showOverlay]);
  return (
    <figure className="engage-thumb" style={{ margin: 0 }}>
      {base === undefined ? <div className="skel" style={{ aspectRatio: '16 / 9' }} /> : <canvas ref={ref} role="img" aria-label={t('engage.th.previewOf', { title: video.title })} />}
      <figcaption className="small truncate" dir="auto">
        {video.title}
        {base?.size === 'hq' && <span className="badge badge-warning" style={{ marginInlineStart: 6 }}>{t('engage.th.lowRes')}</span>}
        {base === null && <span className="badge badge-danger" style={{ marginInlineStart: 6 }}>{t('engage.th.noImage')}</span>}
      </figcaption>
    </figure>
  );
}

function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[]; label: string }) {
  return (
    <div className="engage-seg" role="group" aria-label={label}>
      {items.map((i) => (
        <button key={i.id} type="button" aria-pressed={value === i.id} onClick={() => onChange(i.id)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Range({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <Field label={label}>
      {({ id }) => (
        <div className="engage-range">
          <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
          <span className="small num-t" style={{ minWidth: 44, textAlign: 'end' }}>
            {format(value)}
          </span>
        </div>
      )}
    </Field>
  );
}

function Designer({ d, set, logo, setLogo }: { d: OverlayDesign; set: (p: Partial<OverlayDesign>) => void; logo: ImageBitmap | null; setLogo: (b: ImageBitmap | null) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const corners = (): { id: Corner; label: string }[] => [
    { id: 'tl', label: t('engage.th.corner.tl') },
    { id: 'tr', label: t('engage.th.corner.tr') },
    { id: 'bl', label: t('engage.th.corner.bl') },
    { id: 'br', label: t('engage.th.corner.br') },
  ];
  const color = (k: 'textColor' | 'bgColor' | 'badgeColor' | 'badgeTextColor', label: string) => (
    <label className="row-nowrap small">
      <input type="color" className="engage-swatch" value={d[k]} onChange={(e) => set({ [k]: e.target.value })} aria-label={label} />
      {label}
    </label>
  );
  return (
    <div className="stack">
      <div className="card stack">
        <h3>{t('engage.th.banner')}</h3>
        <Field label={t('engage.th.text')}>{({ id }) => <input id={id} className="input" dir="auto" value={d.text} onChange={(e) => set({ text: e.target.value })} placeholder={t('engage.th.textPh')} />}</Field>
        <Seg<BannerPosition>
          label={t('engage.th.position')}
          value={d.position}
          onChange={(position) => set({ position })}
          items={[
            { id: 'top', label: t('engage.th.pos.top') },
            { id: 'center', label: t('engage.th.pos.center') },
            { id: 'bottom', label: t('engage.th.pos.bottom') },
          ]}
        />
        <Range label={t('engage.th.fontSize')} value={d.fontSize} min={32} max={140} step={2} onChange={(fontSize) => set({ fontSize })} format={(v) => f.int(v)} />
        <div className="row" style={{ gap: 'var(--space-4)' }}>
          {color('textColor', t('engage.th.textColor'))}
          {color('bgColor', t('engage.th.bgColor'))}
        </div>
        <Range label={t('engage.th.bgOpacity')} value={d.bgOpacity} min={0} max={1} step={0.05} onChange={(bgOpacity) => set({ bgOpacity })} format={(v) => f.pct(v)} />
      </div>
      <div className="card stack">
        <h3>{t('engage.th.badge')}</h3>
        <Field label={t('engage.th.badgeText')}>{({ id }) => <input id={id} className="input" dir="auto" value={d.badge} onChange={(e) => set({ badge: e.target.value })} placeholder={t('engage.th.badgePh')} />}</Field>
        <Seg label={t('engage.th.corner')} value={d.badgeCorner} onChange={(badgeCorner) => set({ badgeCorner })} items={corners()} />
        <div className="row" style={{ gap: 'var(--space-4)' }}>
          {color('badgeColor', t('engage.th.badgeColor'))}
          {color('badgeTextColor', t('engage.th.textColor'))}
        </div>
      </div>
      <div className="card stack">
        <h3>{t('engage.th.logo')}</h3>
        <div className="row">
          <label className="btn btn-s">
            <Icon name="upload" />
            {logo ? t('engage.th.logoChange') : t('engage.th.logoPick')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || file.size > 5 * 1024 * 1024) return;
                try {
                  setLogo(await createImageBitmap(file));
                } catch {
                  setLogo(null);
                }
              }}
            />
          </label>
          {logo && (
            <Button size="s" variant="ghost" onClick={() => setLogo(null)}>
              {t('common.delete')}
            </Button>
          )}
        </div>
        {logo && (
          <>
            <Seg label={t('engage.th.corner')} value={d.logoCorner} onChange={(logoCorner) => set({ logoCorner })} items={corners()} />
            <Range label={t('engage.th.logoSize')} value={d.logoScale} min={0.05} max={0.4} step={0.01} onChange={(logoScale) => set({ logoScale })} format={(v) => f.pct(v)} />
          </>
        )}
        <p className="xsmall muted">{t('engage.th.logoHelp')}</p>
      </div>
      <div className="card stack">
        <Range label={t('engage.th.opacity')} value={d.opacity} min={0.2} max={1} step={0.05} onChange={(opacity) => set({ opacity })} format={(v) => f.pct(v)} />
        <Button size="s" variant="ghost" onClick={() => set({ ...DEFAULT_DESIGN })}>
          {t('engage.th.reset')}
        </Button>
      </div>
    </div>
  );
}

function History({ channelId }: { channelId: string }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const snaps = useWork('snapshots');
  const [progress, setProgress] = useState<RunProgress<{ id: string; title: string }> | null>(null);
  const batches = useMemo(
    () =>
      snaps.items
        .filter((s: Snapshot) => s.ref === BATCH_REF)
        .map((s) => s.data as unknown as Batch)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [snaps.items],
  );
  const restore = async (b: Batch) => {
    const p = await runSequential(
      b.videos,
      async (v) => {
        const orig = await one('snapshots', `engage.thumbOrig:${b.id}:${v.id}`);
        const blob = orig?.data.blob;
        if (!(blob instanceof Blob)) throw new Error(t('engage.th.noOriginal'));
        await setThumbnail(channelId, v.id, blob);
      },
      { isFatal, onProgress: setProgress },
    );
    if (!p.failed.length) {
      await put('snapshots', { id: `${BATCH_REF}:${b.id}`, ref: BATCH_REF, at: b.at, data: { ...b, restoredAt: new Date().toISOString() } as unknown as Record<string, unknown> });
      toast(t('engage.th.restored', { n: f.int(p.ok.length) }));
    }
  };
  if (!batches.length) return null;
  return (
    <section className="card stack-s" aria-labelledby="th-hist-h">
      <h2 id="th-hist-h">{t('engage.th.history')}</h2>
      <p className="small muted">{t('engage.th.historyHelp')}</p>
      <RunStatus p={progress} name={(v) => v.title} />
      <ul className="list">
        {batches.map((b) => (
          <li key={b.id} className="list-item row-between">
            <span className="small grow" style={{ minWidth: 0 }}>
              <bdi className="bold">{b.text || t('engage.th.noText')}</bdi> · {t('bulk.videosCount', { n: f.int(b.videos.length) })} · {formatDate(b.at)}
            </span>
            {b.restoredAt ? (
              <span className="badge">{t('engage.th.restoredBadge')}</span>
            ) : (
              <ConfirmButton
                size="s"
                danger={false}
                label={t('engage.th.restore')}
                question={t('engage.th.restoreConfirm', { n: f.int(b.videos.length), units: f.int(b.videos.length * THUMB_COST) })}
                confirmLabel={t('engage.th.restoreGo')}
                onConfirm={() => restore(b)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Workbench({ channelId, preselect = [] }: { channelId: string; preselect?: string[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const uploads = useOwnUploads();
  const [chosen, setChosen] = useState<string[]>(() => preselect.slice(0, MAX_VIDEOS));
  const [design, setDesign] = useState<OverlayDesign>({ ...DEFAULT_DESIGN, text: '' });
  const [logo, setLogo] = useState<ImageBitmap | null>(null);
  const [images, setImages] = useState<Map<string, Loaded | null>>(new Map());
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [progress, setProgress] = useState<RunProgress<OwnVideo> | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const stop = useRef({ aborted: false });
  const picked = (uploads.videos ?? []).filter((v) => chosen.includes(v.id));
  useEffect(() => {
    void hasOrigin(IMG).then(setAllowed);
    void ensureFonts();
  }, []);
  // Load current thumbnails of newly chosen videos once the image host is allowed.
  useEffect(() => {
    if (!allowed) return;
    const missing = picked.filter((v) => !images.has(v.id));
    if (!missing.length) return;
    let alive = true;
    void (async () => {
      for (const v of missing) {
        let entry: Loaded | null = null;
        try {
          const r = await fetchCurrentThumbnail(v.id);
          entry = { ...r, bmp: await createImageBitmap(r.blob) };
        } catch (e) {
          setError(e);
        }
        if (!alive) return;
        setImages((m) => new Map(m).set(v.id, entry));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, chosen.join(',')]);

  const hasOverlay = !!design.text.trim() || !!design.badge.trim() || !!logo;
  const ready = picked.filter((v) => images.get(v.id));
  const apply = async () => {
    stop.current = { aborted: false };
    setForbidden(false);
    const batch: Batch = { id: newId(), at: new Date().toISOString(), videos: [], text: design.text.trim() || design.badge.trim() };
    const canvas = document.createElement('canvas');
    await ensureFonts();
    const p = await runSequential(
      ready,
      async (v) => {
        const img = images.get(v.id)!;
        draw(canvas, img.bmp, design, logo, true);
        const jpeg = await toJpeg(canvas);
        // Keep the original before replacing it.
        await put('snapshots', { id: `engage.thumbOrig:${batch.id}:${v.id}`, ref: `engage.thumbOrig:${batch.id}`, at: batch.at, data: { videoId: v.id, blob: img.blob } });
        await setThumbnail(channelId, v.id, jpeg);
        batch.videos.push({ id: v.id, title: v.title });
        await put('snapshots', { id: `${BATCH_REF}:${batch.id}`, ref: BATCH_REF, at: batch.at, data: batch as unknown as Record<string, unknown> });
      },
      { isFatal: (e) => isFatal(e) || (e instanceof YtError && e.code === 'forbidden'), onProgress: setProgress, signal: stop.current },
    );
    if (p.stopped instanceof YtError && p.stopped.code === 'forbidden') setForbidden(true);
    if (batch.videos.length) toast(t('engage.th.applied', { n: f.int(batch.videos.length) }));
  };

  return (
    <div className="engage-flow">
      <Step n={1} title={t('engage.th.step1')} sub={t('engage.th.step1Sub', { n: f.int(MAX_VIDEOS) })} done={chosen.length > 0}>
        <ErrorNotice error={uploads.error} />
        <VideoPicker videos={uploads.videos} selected={chosen} onChange={(ids) => setChosen(ids.slice(0, MAX_VIDEOS))} label={t('engage.th.step1')} limit={30} />
      </Step>
      <Step n={2} title={t('engage.th.step2')} sub={t('engage.th.step2Sub')} done={hasOverlay}>
        {allowed === false && (
          <Notice>
            <p>{t('engage.th.needImages')}</p>
            <div>
              <Button
                size="s"
                variant="primary"
                onClick={() => {
                  void requestOrigin(IMG).then(setAllowed);
                }}
              >
                {t('engage.th.allowImages')}
              </Button>
            </div>
          </Notice>
        )}
        <div className="engage-design">
          <Designer d={design} set={(p) => setDesign((d) => ({ ...d, ...p }))} logo={logo} setLogo={setLogo} />
          <div className="stack">
            <div className="row-between">
              <h3>{t('engage.th.preview', { n: f.int(picked.length) })}</h3>
              <label className="check small">
                <input type="checkbox" checked={!showOverlay} onChange={(e) => setShowOverlay(!e.target.checked)} />
                <span>{t('engage.th.showOriginal')}</span>
              </label>
            </div>
            {picked.length === 0 ? (
              <Empty icon="image" title={t('engage.th.pickFirst')} />
            ) : (
              <div className="engage-thumbs">
                {picked.map((v) => (
                  <Preview key={v.id} video={v} base={allowed ? images.get(v.id) : null} design={design} logo={logo} showOverlay={showOverlay} />
                ))}
              </div>
            )}
            <ErrorNotice error={error} />
          </div>
        </div>
      </Step>
      <Step n={3} title={t('engage.th.step3')} sub={t('engage.th.step3Sub')}>
        <Notice tone="warning">
          <p>{t('engage.th.verifiedNote')}</p>
        </Notice>
        {forbidden && (
          <Notice tone="error">
            <p className="bold">{t('engage.th.forbidden')}</p>
            <a href="https://www.youtube.com/verify" target="_blank" rel="noreferrer noopener">
              youtube.com/verify
            </a>
          </Notice>
        )}
        <div className="row">
          <ConfirmButton
            danger={false}
            label={t('engage.th.apply', { n: f.int(ready.length) })}
            question={t('engage.th.applyConfirm', { n: f.int(ready.length), units: f.int(ready.length * THUMB_COST) })}
            confirmLabel={t('engage.th.applyGo')}
            onConfirm={() => (ready.length && hasOverlay ? void apply() : undefined)}
          />
          <Cost units={ready.length * THUMB_COST} />
          {!hasOverlay && <span className="small muted">{t('engage.th.needOverlay')}</span>}
        </div>
        <RunStatus p={progress} name={(v: OwnVideo) => v.title} onStop={() => (stop.current.aborted = true)} />
        <History channelId={channelId} />
      </Step>
    </div>
  );
}

export function ThumbsView({ tab }: { tab?: string }) {
  // Videos selected on Studio's Content page arrive as the route id `ids=...` (studioContent.open).
  const preselect = parseSelection(tab).ids;
  const { t } = useI18n();
  const { channel, loaded } = useOwnChannel();
  return (
    <div className="stack-l">
      <PageHeader kicker={t('shell.group.manage')} title={t('engage.th.heading')} desc={t('engage.th.desc')} />
      {!loaded ? <Skeleton lines={2} /> : !channel ? <SignInEmpty icon="image" why="engage.signIn.thumbs" /> : <Workbench key={channel.channelId} channelId={channel.channelId} preselect={preselect} />}
    </div>
  );
}

