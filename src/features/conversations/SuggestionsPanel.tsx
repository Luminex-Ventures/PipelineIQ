import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import type { ConversationMessage, ConversationThread } from '../../types/conversations';

type Tone = 'warm' | 'direct' | 'professional';

const TONE_LABELS: Record<Tone, string> = {
  warm: 'Warm',
  direct: 'Direct',
  professional: 'Professional',
};

interface SuggestionsPanelProps {
  thread: ConversationThread | null;
  messages: ConversationMessage[];
  onInsertDraft: (text: string) => void;
}

function suggestNextAction(
  thread: ConversationThread | null,
  messages: ConversationMessage[]
): string {
  if (!thread) return 'Select a thread to see suggestions.';
  const contact = thread.contact;
  if (contact?.opted_out_sms && thread.channel === 'sms') {
    return 'This contact has opted out of SMS. Do not send further texts.';
  }
  if (contact?.unsubscribed_email && thread.channel === 'email') {
    return 'This contact has unsubscribed from email. Do not send campaign emails.';
  }
  const inbound = messages.filter((m) => m.direction === 'inbound');
  const outbound = messages.filter((m) => m.direction === 'outbound');
  const lastIn = inbound[inbound.length - 1];
  const lastOut = outbound[outbound.length - 1];
  if (!lastIn) return 'No inbound messages yet. Send an intro to start the conversation.';
  if (!lastOut) return 'They reached out. Reply to keep the conversation going.';
  const inTime = lastIn.created_at ? new Date(lastIn.created_at).getTime() : 0;
  const outTime = lastOut.created_at ? new Date(lastOut.created_at).getTime() : 0;
  if (inTime > outTime) return 'They replied. Consider responding within 24 hours.';
  const hoursSinceOut = (Date.now() - outTime) / (60 * 60 * 1000);
  if (hoursSinceOut > 72) return 'No reply in a few days. A gentle follow-up may help.';
  return 'Conversation is in progress. Reply when ready.';
}

function draftTemplate(
  tone: Tone,
  contactName: string,
  channel: 'email' | 'sms'
): string {
  const name = contactName || 'there';
  if (channel === 'sms') {
    if (tone === 'warm') return `Hi ${name}, hope you're doing well! Just following up — let me know if you have any questions.`;
    if (tone === 'direct') return `Hi ${name}, checking in. Any updates on your end?`;
    return `Hi ${name}, following up as discussed. Please reach out when convenient.`;
  }
  if (tone === 'warm') return `Hi ${name},\n\nI hope this finds you well. I wanted to follow up and see if you had any questions.\n\nBest regards`;
  if (tone === 'direct') return `Hi ${name},\n\nChecking in. Let me know if you need anything.\n\nThanks`;
  return `Dear ${name},\n\nI am following up on our recent correspondence. Please do not hesitate to reach out at your convenience.\n\nBest regards`;
}

export function SuggestionsPanel({ thread, messages, onInsertDraft }: SuggestionsPanelProps) {
  const [tone, setTone] = useState<Tone>('professional');
  const suggestion = suggestNextAction(thread, messages);
  const contactName = thread?.contact?.name ?? thread?.contact?.email ?? thread?.contact?.phone ?? '';
  const channel = thread?.channel ?? 'email';
  const draft = draftTemplate(tone, contactName, channel);

  return (
    <div className={['rounded-xl border border-gray-200 bg-gray-50/50 p-4', ui.radius.card].join(' ')}>
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-[var(--app-accent)]" />
        <Text as="h3" variant="micro" className={ui.tone.subtle}>
          LUMA SUGGESTIONS
        </Text>
      </div>
      <p className="text-sm text-[#1e3a5f] mb-3">{suggestion}</p>
      <div className="space-y-2">
        <Text variant="micro" className={ui.tone.subtle}>
          DRAFT MESSAGE
        </Text>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(TONE_LABELS) as Tone[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              className={[
                'px-2.5 py-1 rounded-lg text-sm font-medium transition-colors',
                tone === t
                  ? 'bg-[var(--app-accent)] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {TONE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="mt-2 p-2.5 rounded-lg bg-white border border-gray-100 text-sm text-gray-700 whitespace-pre-wrap min-h-[60px]">
          {draft}
        </div>
        <button
          type="button"
          onClick={() => onInsertDraft(draft)}
          className="w-full py-2 rounded-lg border border-[var(--app-accent)] text-[var(--app-accent)] font-medium text-sm hover:bg-[var(--app-accent)]/5"
        >
          Insert draft
        </button>
      </div>
    </div>
  );
}
