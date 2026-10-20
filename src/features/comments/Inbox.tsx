// Comment inbox for the signed-in channel: latest threads on its videos as a track list, filters, inline
// replies with canned responses, moderation (hold / hide / publish) with undo, and bulk moderation.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  answeredByOwner,
  chunk,
  COMMENT_WRITE_COST,
  filterThreads,
  fillReply,
  isQuestion,
  MAX_COMMENT_CHARS,
  moderationCost,
  MODERATION_CHUNK,
  spamSignals,
  type CommentFilter,
  type CommentReply,
  type CommentThread,
  type ModerationStatus,
} from '../../domain/engageComments';
import { runSequential, type RunProgress } from '../../domain/engageRun';
import { normalizeForSearch } from '../../domain/text';
import { useCollection } from '../../components/hooks';
import { Icon } from '../../components/icons';
import { useToast } from '../../components/toasts';
import { Avatar, Button, ConfirmButton, Empty, Field, IconButton, Notice, SearchInput, Skeleton, Thumb } from '../../components/ui';
import { useWork } from '../../components/useWork';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import type { OwnVideo } from '../../integrations/google/own';
import { deleteComment, listCommentThreads, replyToComment, setModerationStatus } from '../../integrations/google/ownWrites';
import { put, type Snapshot } from '../../storage/stores';
import { ErrorNotice } from '../connections/ErrorNotice';
import { useFormat } from '../research/shared';
import { Cost, isFatal, RunStatus, useOwnUploads } from '../bulk/engageKit';
import { renderCommentMarkup } from './markup';

type View = Exclude<ModerationStatus, 'rejected'>;
type Target = Exclude<ModerationStatus, 'likelySpam'>;

interface ModBatch {
  at: string;
  ids: string[];
  to: Target;
  /** Status to go back to on undo (likelySpam cannot be set, so it returns to held for review). */
  from: Target;
  texts: string[];
  undone?: boolean;
}

const MOD_REF = 'engage.moderation';

async function recordBatch(b: ModBatch): Promise<void> {
  await put('snapshots', { id: `${MOD_REF}:${b.at}`, ref: MOD_REF, at: b.at, data: b as unknown as Record<string, unknown> });
}

function ReplyComposer({ thread, video, channelId, onPosted, onClose }: { thread: CommentThread; video?: OwnVideo; channelId: string; onPosted: (r: CommentReply) => void; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const canned = useCollection('replies').items;
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const vars = { name: thread.authorName, video: video?.title };
  const final = fillReply(text, vars);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await replyToComment(channelId, thread.id, final);
      onPosted(r);
      toast(t('engage.inbox.replied'));
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="engage-composer">
      {canned.length > 0 && (
        <div className="row">
          <label className="small muted" htmlFor={`canned-${thread.id}`}>
            {t('engage.inbox.canned')}
          </label>
          <select
            id={`canned-${thread.id}`}
            className="select"
            style={{ width: 'auto', maxWidth: '100%' }}
            value=""
            onChange={(e) => {
              const c = canned.find((x) => x.id === e.target.value);
              if (c) {
                setText(c.text);
                setReviewing(false);
              }
            }}
          >
            <option value="">{t('engage.inbox.pickCanned')}</option>
            {canned.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!reviewing ? (
        <>
          <Field label={t('engage.inbox.yourReply')} help={t('engage.inbox.placeholders')} counter={`${[...final].length}`} over={[...final].length > MAX_COMMENT_CHARS}>
            {({ id, describedBy }) => (
              <textarea ref={ref} id={id} aria-describedby={describedBy} className="textarea" rows={3} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />
            )}
          </Field>
          <div className="row">
            <Button variant="primary" size="s" disabled={!final.trim() || [...final].length > MAX_COMMENT_CHARS} onClick={() => setReviewing(true)}>
              {t('engage.inbox.review')}
            </Button>
            <Button size="s" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="xsmall muted bold">{t('engage.inbox.previewAs')}</span>
          <div className="engage-preview-box" dir="auto" data-testid="reply-preview">
            {renderCommentMarkup(final)}
          </div>
          <div className="row">
            <Button variant="primary" size="s" disabled={busy} onClick={() => void send()}>
              <Icon name="send" />
              {busy ? t('engage.inbox.posting') : t('engage.inbox.post')}
            </Button>
            <Button size="s" onClick={() => setReviewing(false)}>
              {t('common.edit')}
            </Button>
            <Cost units={COMMENT_WRITE_COST} />
            <span className="xsmall muted">{t('engage.inbox.publicNote')}</span>
          </div>
        </>
      )}
      <ErrorNotice error={error} />
    </div>
  );
}

function CommentRow({
  thread,
  video,
  channelId,
  ownName,
  selected,
  onSelect,
  onModerate,
  onChange,
  view,
}: {
  thread: CommentThread;
  video?: OwnVideo;
  channelId: string;
  ownName: string;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onModerate: (to: Target) => Promise<void>;
  onChange: (t: CommentThread) => void;
  view: View;
}) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const answered = answeredByOwner(thread, channelId);
  const spam = spamSignals(thread.text);
  const mine = thread.authorChannelId === channelId;
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(thread.videoId)}&lc=${encodeURIComponent(thread.id)}`;
  return (
    <article className="engage-comment" data-selected={selected} aria-label={t('engage.inbox.commentBy', { name: thread.authorName })}>
      <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={t('engage.inbox.select', { name: thread.authorName })} disabled={mine} />
      <Avatar src={thread.authorAvatar} name={thread.authorName.replace(/^@/, '')} />
      <div className="stack-s" style={{ gap: 4, minWidth: 0 }}>
        <div className="engage-comment-head">
          <bdi className="bold">{thread.authorName || '—'}</bdi>
          <span className="xsmall muted" title={formatDate(thread.publishedAt)}>
            {f.age(thread.publishedAt)}
          </span>
          {answered === true && <span className="badge badge-accent">{t('engage.inbox.answered')}</span>}
          {answered === null && <span className="badge" title={t('engage.inbox.answeredUnknownHelp')}>{t('engage.inbox.answeredUnknown')}</span>}
          {isQuestion(thread.text) && <span className="badge badge-info">{t('engage.inbox.question')}</span>}
          {spam.length > 0 && <span className="badge badge-warning">{t('engage.inbox.spamLike')}</span>}
          {view === 'heldForReview' && <span className="badge badge-warning">{t('engage.inbox.held')}</span>}
        </div>
        <p className="engage-comment-text" dir="auto">
          {thread.text}
        </p>
        <div className="engage-comment-meta">
          <span title={t('yt.likes')}>
            <Icon name="heart" /> {f.int(thread.likes)}
          </span>
          <span title={t('engage.inbox.replyCount')}>
            <Icon name="message" /> {f.int(thread.replyCount)}
          </span>
          <a className="engage-video-chip" href={watch} target="_blank" rel="noreferrer noopener" title={t('engage.inbox.openOnYoutube')}>
            <Thumb videoId={thread.videoId} src={video?.thumbnail} width={48} />
            <span className="truncate" dir="auto">
              {video?.title ?? thread.videoId}
            </span>
          </a>
        </div>
        <div className="row">
          {thread.canReply && view === 'published' && (
            <Button size="s" variant={composing ? 'default' : 'ghost'} onClick={() => setComposing((v) => !v)} aria-expanded={composing}>
              <Icon name="message" />
              {t('engage.inbox.reply')}
            </Button>
          )}
          {!mine && view !== 'heldForReview' && (
            <Button size="s" variant="ghost" onClick={() => void onModerate('heldForReview').catch(setError)}>
              {t('engage.inbox.hold')}
            </Button>
          )}
          {!mine && view !== 'published' && (
            <Button size="s" variant="ghost" onClick={() => void onModerate('published').catch(setError)}>
              {t('engage.inbox.approve')}
            </Button>
          )}
          {!mine && (
            <ConfirmButton size="s" label={t('engage.inbox.hide')} question={t('engage.inbox.hideConfirm')} confirmLabel={t('engage.inbox.hideGo')} onConfirm={() => onModerate('rejected').catch(setError)} />
          )}
        </div>
        <ErrorNotice error={error} />
        {thread.replies.length > 0 && (
          <div className="engage-replies">
            {thread.replies.map((r) => {
              const own = r.authorChannelId === channelId;
              return (
                <div key={r.id} className="engage-reply" data-mine={own}>
                  <Avatar src={r.authorAvatar} name={(r.authorName || ownName).replace(/^@/, '')} />
                  <div className="stack-s" style={{ gap: 0, minWidth: 0 }}>
                    <span className="small">
                      <bdi className="bold engage-reply-name">{own ? t('engage.inbox.you') : r.authorName}</bdi> <span className="xsmall muted">{r.publishedAt ? f.age(r.publishedAt) : ''}</span>
                    </span>
                    <span className="small engage-comment-text" dir="auto">
                      {renderCommentMarkup(r.text)}
                    </span>
                  </div>
                  {own && (
                    <ConfirmButton
                      size="s"
                      label={t('common.delete')}
                      question={t('engage.inbox.deleteReplyConfirm')}
                      confirmLabel={t('engage.inbox.deleteReplyGo')}
                      onConfirm={async () => {
                        try {
                          await deleteComment(channelId, r.id);
                          onChange({ ...thread, replies: thread.replies.filter((x) => x.id !== r.id), replyCount: Math.max(0, thread.replyCount - 1) });
                          toast(t('engage.inbox.replyDeleted'));
                        } catch (e) {
                          setError(e);
                        }
                      }}
                    />
                  )}
                </div>
              );
            })}
            {thread.replyCount > thread.replies.length && (
              <a className="small muted" href={watch} target="_blank" rel="noreferrer noopener">
                {t('engage.inbox.moreReplies', { n: f.int(thread.replyCount - thread.replies.length) })}
              </a>
            )}
          </div>
        )}
        {composing && (
          <ReplyComposer
            thread={thread}
            video={video}
            channelId={channelId}
            onClose={() => setComposing(false)}
            onPosted={(r) => onChange({ ...thread, replies: [...thread.replies, { ...r, authorChannelId: channelId }], replyCount: thread.replyCount + 1 })}
          />
        )}
      </div>
    </article>
  );
}

const STATUS_TABS: { id: View; label: MessageKey }[] = [
  { id: 'published', label: 'engage.inbox.view.published' },
  { id: 'heldForReview', label: 'engage.inbox.view.held' },
  { id: 'likelySpam', label: 'engage.inbox.view.spam' },
];

export function Inbox({ channelId, channelName }: { channelId: string; channelName: string }) {
  const { t, formatDate } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const uploads = useOwnUploads();
  const videoMap = useMemo(() => new Map((uploads.videos ?? []).map((v) => [v.id, v])), [uploads.videos]);
  const [view, setView] = useState<View>('published');
  const [threads, setThreads] = useState<CommentThread[] | null>(null);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<CommentFilter>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<{ to: Target; ids: string[] } | null>(null);
  const [progress, setProgress] = useState<RunProgress<string[]> | null>(null);
  const stop = useRef({ aborted: false });
  const [authorPick, setAuthorPick] = useState('');
  const [keywordPick, setKeywordPick] = useState('');
  const snaps = useWork('snapshots');
  const batches = useMemo(
    () =>
      snaps.items
        .filter((s: Snapshot) => s.ref === MOD_REF)
        .map((s) => s.data as unknown as ModBatch)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 6),
    [snaps.items],
  );

  const load = async (opts: { fresh?: boolean; more?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listCommentThreads(channelId, { status: view, pageToken: opts.more ? next : undefined, fresh: opts.fresh });
      setThreads((cur) => (opts.more && cur ? [...cur, ...page.threads.filter((x) => !cur.some((c) => c.id === x.id))] : page.threads));
      setNext(page.nextPageToken);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setThreads(null);
    setSelected(new Set());
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, view]);

  const shown = useMemo(() => filterThreads(threads ?? [], filter, channelId), [threads, filter, channelId]);
  const videoOptions = useMemo(() => {
    const ids = [...new Set((threads ?? []).map((x) => x.videoId))];
    return ids.map((id) => ({ id, title: videoMap.get(id)?.title ?? id }));
  }, [threads, videoMap]);
  const counts = useMemo(() => {
    const all = threads ?? [];
    return {
      unanswered: filterThreads(all, { unanswered: true }, channelId).length,
      questions: filterThreads(all, { questions: true }, channelId).length,
      spam: filterThreads(all, { spam: true }, channelId).length,
    };
  }, [threads, channelId]);

  const replaceThread = (nt: CommentThread) => setThreads((cur) => cur?.map((x) => (x.id === nt.id ? nt : x)) ?? cur);
  const dropThreads = (ids: string[]) => {
    const drop = new Set(ids);
    setThreads((cur) => cur?.filter((x) => !drop.has(x.id)) ?? cur);
    setSelected((s) => new Set([...s].filter((id) => !drop.has(id))));
  };
  const from: Target = view === 'published' ? 'published' : 'heldForReview';

  const moderateOne = async (thread: CommentThread, to: Target) => {
    await setModerationStatus(channelId, [thread.id], to);
    dropThreads([thread.id]);
    const batch: ModBatch = { at: new Date().toISOString(), ids: [thread.id], to, from, texts: [thread.text.slice(0, 120)] };
    await recordBatch(batch);
    toast(t(to === 'rejected' ? 'engage.inbox.hidden' : to === 'published' ? 'engage.inbox.approved' : 'engage.inbox.heldDone'), {
      label: t('common.undo'),
      run: () => void undoBatch(batch),
    });
  };

  const undoBatch = async (b: ModBatch) => {
    try {
      for (const ids of chunk(b.ids, MODERATION_CHUNK)) await setModerationStatus(channelId, ids, b.from);
      await recordBatch({ ...b, undone: true });
      toast(t('engage.inbox.undone'));
      void load({ fresh: true });
    } catch (e) {
      setError(e);
      toast(t('engage.inbox.undoFailed'));
    }
  };

  const runBulk = async () => {
    if (!pending) return;
    const texts = new Map((threads ?? []).map((x) => [x.id, x.text.slice(0, 120)]));
    stop.current = { aborted: false };
    const p = await runSequential(chunk(pending.ids, MODERATION_CHUNK), (ids) => setModerationStatus(channelId, ids, pending.to), { isFatal, onProgress: setProgress, signal: stop.current, stopOnAnyError: true });
    const done = p.ok.flat();
    if (done.length) {
      dropThreads(done);
      await recordBatch({ at: new Date().toISOString(), ids: done, to: pending.to, from, texts: done.map((id) => texts.get(id) ?? '') });
    }
    setPending(null);
  };

  const selectWhere = (pred: (x: CommentThread) => boolean) => setSelected(new Set(shown.filter((x) => x.authorChannelId !== channelId && pred(x)).map((x) => x.id)));
  const selectedThreads = (threads ?? []).filter((x) => selected.has(x.id));
  const toggleChip = (k: 'unanswered' | 'questions' | 'spam') => setFilter((cur) => ({ ...cur, [k]: !cur[k] }));
  const running = !!progress && progress.done < progress.total && !progress.stopped && !progress.aborted;

  return (
    <div className="stack">
      <div className="row-between">
        <div className="engage-seg" role="group" aria-label={t('engage.inbox.status')}>
          {STATUS_TABS.map((s) => (
            <button key={s.id} type="button" aria-pressed={view === s.id} onClick={() => setView(s.id)}>
              {t(s.label)}
            </button>
          ))}
        </div>
        <div className="row">
          <span className="xsmall muted">{t('engage.inbox.costNote')}</span>
          <IconButton icon="refresh" label={t('engage.inbox.refresh')} disabled={loading} onClick={() => void load({ fresh: true })} />
        </div>
      </div>

      <div className="engage-filters">
        <div style={{ minWidth: 200, flex: '1 1 220px', maxWidth: 360 }}>
          <SearchInput value={filter.query ?? ''} onChange={(q) => setFilter((c) => ({ ...c, query: q }))} label={t('engage.inbox.search')} placeholder={t('engage.inbox.search')} />
        </div>
        {view === 'published' && (
          <button type="button" className="chip" aria-pressed={!!filter.unanswered} onClick={() => toggleChip('unanswered')}>
            {t('engage.inbox.f.unanswered')} <small className="num-t">{f.int(counts.unanswered)}</small>
          </button>
        )}
        <button type="button" className="chip" aria-pressed={!!filter.questions} onClick={() => toggleChip('questions')}>
          {t('engage.inbox.f.questions')} <small className="num-t">{f.int(counts.questions)}</small>
        </button>
        <button type="button" className="chip" aria-pressed={!!filter.spam} onClick={() => toggleChip('spam')}>
          {t('engage.inbox.f.spam')} <small className="num-t">{f.int(counts.spam)}</small>
        </button>
        {videoOptions.length > 1 && (
          <select className="select" style={{ width: 'auto', maxWidth: 280 }} aria-label={t('engage.inbox.f.video')} value={filter.videoId ?? ''} onChange={(e) => setFilter((c) => ({ ...c, videoId: e.target.value || undefined }))}>
            <option value="">{t('engage.inbox.f.allVideos')}</option>
            {videoOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {view === 'heldForReview' && <Notice>{t('engage.inbox.heldHelp')}</Notice>}
      {view === 'likelySpam' && <Notice>{t('engage.inbox.spamHelp')}</Notice>}
      <ErrorNotice error={error} />

      {threads === null ? (
        <Skeleton lines={6} />
      ) : shown.length === 0 ? (
        <Empty icon="message" title={threads.length ? t('engage.inbox.noMatch') : t('engage.inbox.empty')}>
          {threads.length ? t('engage.inbox.noMatchHelp') : t(view === 'published' ? 'engage.inbox.emptyHelp' : 'engage.inbox.emptyQueue')}
        </Empty>
      ) : (
        <div className="engage-comments">
          {shown.map((x) => (
            <CommentRow
              key={x.id}
              thread={x}
              video={videoMap.get(x.videoId)}
              channelId={channelId}
              ownName={channelName}
              selected={selected.has(x.id)}
              view={view}
              onSelect={(on) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (on) n.add(x.id);
                  else n.delete(x.id);
                  return n;
                })
              }
              onModerate={(to) => moderateOne(x, to)}
              onChange={replaceThread}
            />
          ))}
        </div>
      )}
      {next && threads && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button disabled={loading} onClick={() => void load({ more: true })}>
            {loading ? t('common.loading') : t('engage.inbox.loadMore')}
          </Button>
          <span className="xsmall muted">{t('engage.inbox.loadMoreCost')}</span>
        </div>
      )}

      {/* Bulk moderation: select by rule, review, confirm, run with progress, undo. */}
      {threads && threads.length > 0 && (
        <details className="card disclosure">
          <summary>
            <Icon name="filter" />
            {t('engage.bulk.selectBy')}
          </summary>
          <div className="stack">
            <p className="small muted">{t('engage.bulk.help')}</p>
            <div className="row">
              <input className="input" style={{ maxWidth: 240 }} dir="auto" aria-label={t('engage.bulk.keyword')} placeholder={t('engage.bulk.keyword')} value={keywordPick} onChange={(e) => setKeywordPick(e.target.value)} />
              <Button size="s" disabled={!keywordPick.trim()} onClick={() => selectWhere((x) => normalizeForSearch(x.text).includes(normalizeForSearch(keywordPick.trim())))}>
                {t('engage.bulk.selectMatches')}
              </Button>
            </div>
            <div className="row">
              <input className="input" style={{ maxWidth: 240 }} dir="auto" aria-label={t('engage.bulk.author')} placeholder={t('engage.bulk.author')} value={authorPick} onChange={(e) => setAuthorPick(e.target.value)} />
              <Button size="s" disabled={!authorPick.trim()} onClick={() => selectWhere((x) => normalizeForSearch(x.authorName).includes(normalizeForSearch(authorPick.trim())))}>
                {t('engage.bulk.selectAuthor')}
              </Button>
            </div>
            <div className="row">
              <Button size="s" onClick={() => selectWhere((x) => spamSignals(x.text).length > 0)}>
                {t('engage.bulk.selectSpam')}
              </Button>
              <Button size="s" onClick={() => selectWhere(() => true)}>
                {t('engage.bulk.selectShown', { n: f.int(shown.filter((x) => x.authorChannelId !== channelId).length) })}
              </Button>
              <Button size="s" variant="ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>
                {t('engage.picker.clear')}
              </Button>
            </div>
          </div>
        </details>
      )}

      {pending && (
        <section className="card stack" aria-labelledby="mod-review-h">
          <div className="row-between">
            <h2 id="mod-review-h">{t('engage.bulk.reviewTitle', { n: f.int(pending.ids.length), action: t(`engage.bulk.action.${pending.to}` as MessageKey) })}</h2>
            <Cost units={moderationCost(pending.ids.length)} />
          </div>
          <Notice tone={pending.to === 'rejected' ? 'warning' : 'info'}>
            <p>{t(pending.to === 'rejected' ? 'engage.bulk.rejectExplain' : pending.to === 'heldForReview' ? 'engage.bulk.holdExplain' : 'engage.bulk.publishExplain')}</p>
          </Notice>
          <ul className="list" style={{ maxHeight: 280, overflow: 'auto' }}>
            {(threads ?? [])
              .filter((x) => pending.ids.includes(x.id))
              .map((x) => (
                <li key={x.id} className="list-item">
                  <span className="small">
                    <bdi className="bold">{x.authorName}</bdi> · <span className="muted truncate" dir="auto">{x.text.slice(0, 140)}</span>
                  </span>
                </li>
              ))}
          </ul>
          <div className="row">
            <Button variant="primary" disabled={running} onClick={() => void runBulk()}>
              {t('engage.bulk.go', { n: f.int(pending.ids.length), action: t(`engage.bulk.action.${pending.to}` as MessageKey) })}
            </Button>
            <Button disabled={running} onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </section>
      )}
      <RunStatus p={progress} name={(ids: string[]) => t('engage.bulk.chunk', { n: f.int(ids.length) })} onStop={() => (stop.current.aborted = true)} />

      {batches.length > 0 && (
        <section className="card stack-s" aria-labelledby="mod-hist-h">
          <h2 id="mod-hist-h">{t('engage.bulk.history')}</h2>
          <p className="small muted">{t('engage.bulk.historyHelp')}</p>
          <ul className="list">
            {batches.map((b) => (
              <li key={b.at} className="list-item row-between">
                <span className="small grow" style={{ minWidth: 0 }}>
                  <span className="bold">{t(`engage.bulk.action.${b.to}` as MessageKey)}</span> · {t('engage.bulk.commentsN', { n: f.int(b.ids.length) })} · {formatDate(b.at)}
                  {b.texts[0] && (
                    <span className="muted truncate" dir="auto" style={{ display: 'block' }}>
                      {b.texts[0]}
                    </span>
                  )}
                </span>
                {b.undone ? (
                  <span className="badge">{t('engage.bulk.undoneBadge')}</span>
                ) : (
                  <ConfirmButton
                    size="s"
                    danger={false}
                    label={t('common.undo')}
                    question={t('engage.bulk.undoConfirm', { n: f.int(b.ids.length), units: f.int(moderationCost(b.ids.length)) })}
                    confirmLabel={t('engage.bulk.undoGo')}
                    onConfirm={() => undoBatch(b)}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected.size > 0 && !pending && (
        <div className="engage-bar" role="region" aria-label={t('engage.bulk.bar')}>
          <span className="engage-bar-count">{t('engage.bulk.selected', { n: f.int(selected.size) })}</span>
          <Cost units={moderationCost(selected.size)} label={t('engage.bulk.costEach', { n: f.int(moderationCost(selected.size)) })} />
          <span className="grow" />
          {view !== 'heldForReview' && (
            <Button onClick={() => setPending({ to: 'heldForReview', ids: selectedThreads.map((x) => x.id) })}>{t('engage.bulk.action.heldForReview')}</Button>
          )}
          {view !== 'published' && <Button onClick={() => setPending({ to: 'published', ids: selectedThreads.map((x) => x.id) })}>{t('engage.bulk.action.published')}</Button>}
          <Button variant="primary" onClick={() => setPending({ to: 'rejected', ids: selectedThreads.map((x) => x.id) })}>
            {t('engage.bulk.action.rejected')}
          </Button>
          <IconButton icon="x" label={t('engage.picker.clear')} onClick={() => setSelected(new Set())} />
        </div>
      )}
    </div>
  );
}
