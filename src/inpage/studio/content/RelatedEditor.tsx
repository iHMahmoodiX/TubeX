// On a Short's Studio edit page, while a related-video queue from the Content page is running: one click fills
// (or clears) Studio's own "Related video" control; the user checks it and presses Studio's Save; "Next Short"
// opens the next one. Renders nothing unless this video is in the queue.
import { useState } from 'react';
import { browser } from 'wxt/browser';
import { Icon } from '../../../components/icons';
import { Button } from '../../../components/ui';
import { advanceQueue, liveQueue, queuePos, studioEditUrl, type RelatedQueue } from '../../../domain/coppa';
import { useI18n } from '../../../i18n';
import { copyText, Mark, useFmt, useStored } from '../../common';
import { useHref, useInpageEnabled } from '../../InpageRoot';
import { clearRelated, fillRelated, relatedCurrent, relatedField, type RelatedResult } from './dom';
import { RelatedLimit } from './flows';
import { FEATURE } from './Menus';

export const onStudioEdit = () => location.hostname === 'studio.youtube.com' && /^\/video\/[\w-]{11}\/edit/.test(location.pathname);

export function RelatedEditor() {
  const on = useInpageEnabled(FEATURE);
  const href = useHref();
  const [raw, setRaw, ready] = useStored<RelatedQueue | null>('sc.relatedQueue', null);
  const videoId = href.match(/studio\.youtube\.com\/video\/([\w-]{11})\/edit/)?.[1];
  const queue = ready ? liveQueue(raw) : null;
  if (!on || !videoId || !queue || queuePos(queue, videoId) < 0) return null;
  return <QueueCard key={videoId} queue={queue} videoId={videoId} save={setRaw} />;
}

function QueueCard({ queue, videoId, save }: { queue: RelatedQueue; videoId: string; save: (q: RelatedQueue | null) => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const [result, setResult] = useState<RelatedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pos = queuePos(queue, videoId);
  const target = queue.target;
  const current = (() => {
    const fl = relatedField(document, false);
    return fl ? relatedCurrent(fl) : '';
  })();

  const act = async () => {
    setBusy(true);
    setResult(queue.mode === 'add' && target ? await fillRelated(document, target) : clearRelated(document));
    setBusy(false);
  };
  const next = () => {
    const { queue: q, next: n } = advanceQueue(queue, videoId);
    if (n) {
      save(q);
      // Studio asks before leaving when there are unsaved changes, so an unsaved edit is not lost silently.
      location.assign(studioEditUrl(n.id));
    } else save({ ...q });
  };
  const stop = () => {
    save(null);
    void browser.storage.local.remove('inpage.sc.relatedQueue').catch(() => {});
  };
  const finished = queue.done.includes(videoId) && queue.index >= queue.items.length;

  const msg: Record<RelatedResult, { tone: 'ok' | 'warn'; text: string }> = {
    filled: { tone: 'ok', text: t('sc.rel.filled') },
    cleared: { tone: 'ok', text: t('sc.rel.cleared') },
    'picker-open': { tone: 'warn', text: t('sc.rel.pickerOpen', { title: target?.title ?? '' }) },
    'no-field': { tone: 'warn', text: t('sc.rel.noField') },
    'no-clear': { tone: 'warn', text: t('sc.rel.noClear') },
  };

  return (
    <section className="tx-card sc-related" aria-label={t('sc.rel.title')}>
      <div className="tx-head">
        <Mark />
        <span className="small bold">{t(queue.mode === 'add' ? 'sc.rel.cardAdd' : 'sc.rel.cardClear')}</span>
        <span className="grow" />
        <span className="tx-badge">{t('sc.rel.progress', { i: f.int(pos + 1), n: f.int(queue.items.length) })}</span>
      </div>
      {finished ? (
        <div className="stack-s">
          <div className="tx-note" role="status">
            <Icon name="check" />
            <span className="grow small">{t('sc.rel.allDone', { n: f.int(queue.done.length) })}</span>
          </div>
          <div className="row">
            {queue.returnUrl?.startsWith('https://studio.youtube.com/') && (
              <a className="btn btn-s" href={queue.returnUrl} onClick={stop}>
                {t('sc.rel.back')}
              </a>
            )}
            <Button size="s" variant="ghost" onClick={stop}>
              {t('sc.rel.endQueue')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {queue.mode === 'add' && target && (
            <div className="tx-out">
              <span className="xsmall muted">{t('sc.rel.target')}</span>
              <p className="row-between">
                <bdi className="bold">{target.title}</bdi>
                <Button
                  size="s"
                  variant="ghost"
                  onClick={async () => {
                    setCopied(await copyText(target.title));
                  }}
                >
                  <Icon name="copy" />
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
              </p>
            </div>
          )}
          {current && <p className="xsmall muted">{t('sc.rel.current', { title: current })}</p>}
          <div className="row">
            <Button size="s" variant="primary" disabled={busy} onClick={() => void act()}>
              <Icon name={queue.mode === 'add' ? 'link' : 'x'} />
              {queue.mode === 'add' ? t('sc.rel.fill', { title: target?.title ?? '' }) : t('sc.rel.clearBtn')}
            </Button>
            <Button size="s" onClick={next}>
              {pos + 1 < queue.items.length ? t('sc.rel.next') : t('sc.rel.finish')}
              <Icon name="chevron" className="icon sc-flip" />
            </Button>
            <Button size="s" variant="ghost" onClick={stop}>
              {t('sc.rel.endQueue')}
            </Button>
          </div>
          {result && (
            <div className={`tx-note${msg[result].tone === 'warn' ? ' tx-note-warn' : ''}`} role="status">
              <Icon name={msg[result].tone === 'ok' ? 'check' : 'info'} />
              <span className="grow small">{msg[result].text}</span>
            </div>
          )}
          <p className="xsmall muted tx-save-note">
            <Icon name="info" />
            {t('sc.rel.saveNote')}
          </p>
          <RelatedLimit />
        </>
      )}
    </section>
  );
}
