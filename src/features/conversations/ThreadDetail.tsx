import { Mail, MessageSquare } from 'lucide-react';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import type { ConversationThread, ConversationMessage } from '../../types/conversations';
import { Composer } from './Composer';
import { SuggestionsPanel } from './SuggestionsPanel';

interface ThreadDetailProps {
  thread: ConversationThread | null;
  messages: ConversationMessage[];
  loading?: boolean;
  composerBody: string;
  onComposerBodyChange: (value: string) => void;
  onSendEmail: (payload: { thread_id?: string; to?: string; subject?: string; body: string }) => void;
  onSendSms: (payload: { thread_id?: string; to_phone?: string; body: string }) => void;
  sending?: boolean;
  onMarkRead?: (threadId: string) => void;
  onInsertDraft: (text: string) => void;
}

function formatMessageTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

export function ThreadDetail({
  thread,
  messages,
  loading,
  composerBody,
  onComposerBodyChange,
  onSendEmail,
  onSendSms,
  sending,
  onMarkRead,
  onInsertDraft,
}: ThreadDetailProps) {
  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--app-accent)] border-t-transparent animate-spin" />
        <Text variant="muted" className="mt-3">
          Loading…
        </Text>
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <Text variant="muted">Select a conversation</Text>
        <Text variant="micro" className="mt-1 text-gray-400">
          Choose a thread from the list to view messages and reply.
        </Text>
      </div>
    );
  }

  const contactName =
    thread.contact?.name ?? thread.contact?.email ?? thread.contact?.phone ?? 'Unknown';
  const isEmail = thread.channel === 'email';
  if (onMarkRead && thread.unread_count > 0) onMarkRead(thread.id);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
        {isEmail ? (
          <Mail className="h-4 w-4 text-gray-500" />
        ) : (
          <MessageSquare className="h-4 w-4 text-gray-500" />
        )}
        <Text as="h2" variant="h2" className="truncate">
          {contactName}
        </Text>
        <span className="text-xs text-gray-400">
          {thread.subject || (isEmail ? 'Email' : 'SMS')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => {
          const isOut = m.direction === 'outbound';
          return (
            <div
              key={m.id}
              className={['flex', isOut ? 'justify-end' : 'justify-start'].join(' ')}
            >
              <div
                className={[
                  'max-w-[85%] rounded-xl px-3 py-2',
                  isOut
                    ? 'bg-[var(--app-accent)] text-white'
                    : 'bg-gray-100 text-[#1e3a5f]',
                ].join(' ')}
              >
                {isEmail && m.subject && (
                  <p className="text-xs font-semibold opacity-90 mb-1">{m.subject}</p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{m.body_text}</p>
                <p className={['text-[10px] mt-1', isOut ? 'text-white/80' : 'text-gray-500'].join(' ')}>
                  {formatMessageTime(m.sent_at ?? m.received_at ?? m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 border-t border-gray-200">
        <div className="lg:col-span-2">
          <Composer
            channel={thread.channel}
            threadId={thread.id}
            subject={thread.subject}
            body={composerBody}
            onBodyChange={onComposerBodyChange}
            onSendEmail={onSendEmail}
            onSendSms={onSendSms}
            sending={sending}
          />
        </div>
        <div className="p-3 border-t lg:border-t-0 lg:border-l border-gray-200">
          <SuggestionsPanel
            thread={thread}
            messages={messages}
            onInsertDraft={onInsertDraft}
          />
        </div>
      </div>
    </div>
  );
}
