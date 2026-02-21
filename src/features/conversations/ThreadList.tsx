import { Mail, MessageSquare } from 'lucide-react';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import type { ConversationThread } from '../../types/conversations';

interface ThreadListProps {
  threads: ConversationThread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function contactDisplay(thread: ConversationThread): string {
  const c = thread.contact;
  if (c?.name) return c.name;
  if (c?.email) return c.email;
  if (c?.phone) return c.phone;
  return 'Unknown';
}

export function ThreadList({ threads, selectedId, onSelect, loading }: ThreadListProps) {
  if (loading) {
    return (
      <div className="flex flex-col h-full p-3 gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!threads.length) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Text variant="muted">No conversations yet.</Text>
        <Text variant="micro" className="mt-1 text-gray-400">
          Connect email or SMS and sync to see threads here.
        </Text>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {threads.map((t) => {
        const isSelected = t.id === selectedId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={[
              'flex flex-col gap-0.5 p-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors',
              isSelected ? 'bg-[#1e3a5f]/5 border-l-2 border-l-[var(--app-accent)]' : '',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm text-[#1e3a5f] truncate">
                {contactDisplay(t)}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatTime(t.last_message_at)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {t.channel === 'email' ? (
                <Mail className="h-3.5 w-5 text-gray-400 flex-shrink-0" />
              ) : (
                <MessageSquare className="h-3.5 w-5 text-gray-400 flex-shrink-0" />
              )}
              <span className="text-xs text-gray-500 truncate flex-1">
                {t.subject || t.last_snippet || 'No subject'}
              </span>
              {t.unread_count > 0 && (
                <span className="rounded-full bg-[var(--app-accent)] text-white text-[10px] font-semibold min-w-[18px] h-[18px] flex items-center justify-center">
                  {t.unread_count}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
