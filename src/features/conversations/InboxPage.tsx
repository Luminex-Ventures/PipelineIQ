import { useState } from 'react';
import { Search, Mail, MessageSquare, Inbox } from 'lucide-react';
import { PageShell } from '../../ui/PageShell';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import {
  useThreads,
  useThread,
  useThreadMessages,
  useSendEmail,
  useSendSms,
  useMarkThreadRead,
} from '../../hooks/useConversations';
import { ThreadList } from './ThreadList';
import { ThreadDetail } from './ThreadDetail';
import type { ThreadChannel } from '../../types/conversations';

type Filter = 'all' | 'email' | 'sms' | 'unread';

export function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [composerBody, setComposerBody] = useState('');

  const channelFilter: ThreadChannel | undefined =
    filter === 'email' ? 'email' : filter === 'sms' ? 'sms' : undefined;
  const unreadOnly = filter === 'unread';

  const { data: threads = [], isLoading: threadsLoading } = useThreads({
    channel: channelFilter,
    unreadOnly,
    search: search.trim() || undefined,
  });
  const { data: thread, isLoading: threadLoading } = useThread(selectedId);
  const { data: messages = [], isLoading: messagesLoading } = useThreadMessages(selectedId);
  const sendEmail = useSendEmail();
  const sendSms = useSendSms();
  const markRead = useMarkThreadRead();

  const handleSendEmail = async (payload: {
    thread_id?: string;
    to?: string;
    subject?: string;
    body: string;
  }) => {
    try {
      await sendEmail.mutateAsync(payload);
      setComposerBody('');
    } catch (e) {
      console.error(e);
    }
  };
  const handleSendSms = async (payload: {
    thread_id?: string;
    to_phone?: string;
    body: string;
  }) => {
    try {
      await sendSms.mutateAsync(payload);
      setComposerBody('');
    } catch (e) {
      console.error(e);
    }
  };

  const header = (
    <PageHeader
      label="Conversations"
      title="Inbox"
      subtitle="Email and SMS in one place. Select a thread to view and reply."
    />
  );

  const filters: { key: Filter; label: string; icon?: typeof Inbox }[] = [
    { key: 'all', label: 'All', icon: Inbox },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'sms', label: 'SMS', icon: MessageSquare },
    { key: 'unread', label: 'Unread' },
  ];

  return (
    <PageShell title={header}>
      <div className="flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
        <div className="flex gap-2 mb-4 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={[
                'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                filter === f.key
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              {f.icon && <f.icon className="h-4 w-4" />}
              {f.label}
            </button>
          ))}
          <div className="flex-1 min-w-[160px] relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search by name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20"
            />
          </div>
        </div>

        <Card padding="none" className="flex-1 min-h-0 flex overflow-hidden">
          <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col">
            <ThreadList
              threads={threads}
              selectedId={selectedId}
              onSelect={setSelectedId}
              loading={threadsLoading}
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <ThreadDetail
              thread={thread ?? null}
              messages={messages}
              loading={threadLoading || messagesLoading}
              composerBody={composerBody}
              onComposerBodyChange={setComposerBody}
              onSendEmail={handleSendEmail}
              onSendSms={handleSendSms}
              sending={sendEmail.isPending || sendSms.isPending}
              onMarkRead={(id) => markRead.mutate(id)}
              onInsertDraft={setComposerBody}
            />
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
