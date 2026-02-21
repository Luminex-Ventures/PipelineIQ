import { useState } from 'react';
import { Send } from 'lucide-react';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import type { ThreadChannel } from '../../types/conversations';

interface ComposerProps {
  channel: ThreadChannel;
  threadId: string | null;
  subject?: string | null;
  body: string;
  onBodyChange: (value: string) => void;
  onSendEmail: (payload: { thread_id?: string; to?: string; subject?: string; body: string }) => void;
  onSendSms: (payload: { thread_id?: string; to_phone?: string; body: string }) => void;
  sending?: boolean;
}

export function Composer({
  channel,
  threadId,
  subject: initialSubject,
  body,
  onBodyChange,
  onSendEmail,
  onSendSms,
  sending,
}: ComposerProps) {
  const [subject, setSubject] = useState(initialSubject ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    if (channel === 'email') {
      onSendEmail({ thread_id: threadId ?? undefined, subject: subject.trim() || undefined, body: trimmed });
    } else {
      onSendSms({ thread_id: threadId ?? undefined, body: trimmed });
    }
    onBodyChange('');
    if (channel === 'email') setSubject(initialSubject ?? '');
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 bg-gray-50/80">
      {channel === 'email' && (
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full mb-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20"
        />
      )}
      <div className="flex gap-2">
        <textarea
          placeholder={channel === 'email' ? 'Type your message…' : 'Type SMS…'}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          rows={3}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20 resize-none"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="self-end p-2.5 rounded-lg bg-[var(--app-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}
