// Comments: the signed-in channel's inbox (reply with canned responses, moderate, bulk hide), the canned
// responses library, and comment tools (formatter, export, frequent words).
import { useEffect, useRef } from 'react';
import { useCollection } from '../../components/hooks';
import { Avatar, PageHeader, Tabs } from '../../components/ui';
import { useI18n } from '../../i18n';
import { SignInEmpty, useOwnChannel, useUrlTab } from '../bulk/engageKit';
import { CannedReplies } from './CannedReplies';
import { Inbox } from './Inbox';
import { CommentTools } from './Tools';

export { renderCommentMarkup } from './markup';

const TABS = ['inbox', 'replies', 'tools'] as const;
type Tab = (typeof TABS)[number];

export function CommentsView({ tab }: { tab?: string }) {
  const { t } = useI18n();
  const { channel, loaded } = useOwnChannel();
  const replies = useCollection('replies').items;
  const [view, setView] = useUrlTab<Tab>('comments', TABS, tab, 'replies');
  // Without an explicit tab, open the inbox once we know the owner is signed in.
  const explicit = useRef(!!tab || /^#comments\/\w/.test(location.hash));
  useEffect(() => {
    if (loaded && channel && !explicit.current) {
      explicit.current = true;
      setView('inbox');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, channel?.channelId]);

  return (
    <div className="stack-l">
      <PageHeader
        kicker={t('shell.group.engage')}
        title={t('comments.heading')}
        desc={t('engage.comments.desc')}
        art={channel ? <Avatar src={channel.thumbnail} name={channel.title} size="xl" /> : undefined}
      />
      <Tabs
        label={t('comments.heading')}
        value={view}
        onChange={setView}
        items={[
          { id: 'inbox', label: t('engage.comments.tab.inbox'), icon: 'message' },
          { id: 'replies', label: t('engage.comments.tab.replies'), icon: 'list', count: replies.length || undefined },
          { id: 'tools', label: t('engage.comments.tab.tools'), icon: 'edit' },
        ]}
      />
      {view === 'inbox' && (!loaded ? null : channel ? <Inbox key={channel.channelId} channelId={channel.channelId} channelName={channel.title} /> : <SignInEmpty icon="message" why="engage.signIn.comments" />)}
      {view === 'replies' && <CannedReplies />}
      {view === 'tools' && <CommentTools />}
    </div>
  );
}
